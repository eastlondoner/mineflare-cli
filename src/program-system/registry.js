const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ProgramMetadata, ProgramStatus, ProgramError, ErrorCode } = require('./sdk/types');
const ProgramSandbox = require('./runtime/sandbox');

class ProgramRegistry {
  constructor(configManager) {
    this.configManager = configManager;
    this.programs = new Map();
    this.runningPrograms = new Map();
    this.programHistory = [];
    
    // Set up program storage directory
    this.programsDir = path.join(process.cwd(), '.mineflare', 'programs');
    this.initStorage();
  }
  
  async initStorage() {
    try {
      await fs.mkdir(this.programsDir, { recursive: true });
      await this.loadPrograms();
    } catch (error) {
      console.error('Failed to initialize program storage:', error);
    }
  }
  
  async loadPrograms() {
    try {
      const entries = await fs.readdir(this.programsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const programName = entry.name;
          const programPath = path.join(this.programsDir, programName);
          
          try {
            // Load source and metadata
            const source = await fs.readFile(
              path.join(programPath, 'source.js'),
              'utf8'
            );
            
            const metadataJson = await fs.readFile(
              path.join(programPath, 'metadata.json'),
              'utf8'
            );
            
            const metadata = JSON.parse(metadataJson);
            
            this.programs.set(programName, {
              source,
              metadata,
              path: programPath
            });
            
            console.log(`Loaded program: ${programName}`);
          } catch (error) {
            console.error(`Failed to load program ${programName}:`, error.message);
          }
        }
      }
      
      console.log(`Loaded ${this.programs.size} programs`);
    } catch (error) {
      console.error('Failed to load programs:', error);
    }
  }
  
  async add(name, source, options = {}) {
    // Validate program name
    if (!name || typeof name !== 'string') {
      throw new Error('Program name is required');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Program name must contain only letters, numbers, hyphens, and underscores');
    }
    
    // Validate the program
    const sandbox = new ProgramSandbox();
    const validation = sandbox.validateProgram(source);
    
    if (!validation.valid) {
      throw new Error(`Invalid program: ${validation.error}`);
    }
    
    // Merge capabilities from validation and options
    const capabilities = options.capabilities || validation.metadata.capabilities;
    
    // Create metadata
    const metadata = new ProgramMetadata(
      name,
      validation.metadata.version,
      capabilities,
      validation.metadata.defaults
    );
    
    // Save to filesystem
    const programPath = path.join(this.programsDir, name);
    await fs.mkdir(programPath, { recursive: true });
    
    await fs.writeFile(
      path.join(programPath, 'source.js'),
      source,
      'utf8'
    );
    
    await fs.writeFile(
      path.join(programPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
    
    // Add to registry
    this.programs.set(name, {
      source,
      metadata,
      path: programPath
    });
    
    return metadata;
  }
  
  async update(name, source, options = {}) {
    if (!this.programs.has(name)) {
      throw new Error(`Program not found: ${name}`);
    }
    
    // Validate the new source
    const sandbox = new ProgramSandbox();
    const validation = sandbox.validateProgram(source);
    
    if (!validation.valid) {
      throw new Error(`Invalid program: ${validation.error}`);
    }
    
    const existing = this.programs.get(name);
    
    // Update metadata
    const metadata = {
      ...existing.metadata,
      version: validation.metadata.version,
      capabilities: options.capabilities || validation.metadata.capabilities,
      defaults: validation.metadata.defaults,
      updated: Date.now()
    };
    
    // Save to filesystem
    await fs.writeFile(
      path.join(existing.path, 'source.js'),
      source,
      'utf8'
    );
    
    await fs.writeFile(
      path.join(existing.path, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
    
    // Update registry
    this.programs.set(name, {
      source,
      metadata,
      path: existing.path
    });
    
    return metadata;
  }
  
  async remove(name) {
    if (!this.programs.has(name)) {
      throw new Error(`Program not found: ${name}`);
    }
    
    // Check if program is running
    for (const [runId, runner] of this.runningPrograms) {
      if (runner.programName === name) {
        throw new Error(`Cannot remove program ${name}: currently running (${runId})`);
      }
    }
    
    const program = this.programs.get(name);
    
    // Remove from filesystem
    await fs.rm(program.path, { recursive: true });
    
    // Remove from registry
    this.programs.delete(name);
    
    return { success: true };
  }
  
  async list() {
    const programs = [];
    
    for (const [name, program] of this.programs) {
      programs.push({
        name,
        version: program.metadata.version,
        capabilities: program.metadata.capabilities,
        created: program.metadata.created,
        updated: program.metadata.updated
      });
    }
    
    return programs;
  }
  
  get(name) {
    const program = this.programs.get(name);
    if (!program) {
      throw new Error(`Program not found: ${name}`);
    }
    return program;
  }
  
  async run(botServer, name, args = {}, options = {}) {
    const program = this.get(name);
    
    // Generate run ID
    const runId = crypto.randomUUID();
    
    // Create program runner
    const ProgramRunner = require('./runner');
    const runner = new ProgramRunner(botServer, {
      runId,
      programName: name,
      source: program.source,
      metadata: program.metadata,
      args,
      timeout: options.timeout || 900000,
      capabilities: options.capabilities || program.metadata.capabilities,
      seed: options.seed
    });
    
    // Track running program
    this.runningPrograms.set(runId, runner);
    
    // Add to history
    const historyEntry = {
      runId,
      programName: name,
      args,
      status: ProgramStatus.PENDING,
      startTime: Date.now(),
      endTime: null,
      result: null,
      error: null
    };
    
    this.programHistory.push(historyEntry);
    
    try {
      // Update status
      historyEntry.status = ProgramStatus.RUNNING;
      
      // Execute program
      const result = await runner.execute();
      
      // Update history
      historyEntry.status = ProgramStatus.SUCCEEDED;
      historyEntry.endTime = Date.now();
      historyEntry.result = result;
      
      return {
        runId,
        status: ProgramStatus.SUCCEEDED,
        result,
        duration: historyEntry.endTime - historyEntry.startTime
      };
    } catch (error) {
      // Update history
      historyEntry.status = ProgramStatus.FAILED;
      historyEntry.endTime = Date.now();
      historyEntry.error = error.message;
      
      throw error;
    } finally {
      // Remove from running programs
      this.runningPrograms.delete(runId);
    }
  }
  
  async cancel(runId) {
    const runner = this.runningPrograms.get(runId);
    if (!runner) {
      throw new Error(`No running program with ID: ${runId}`);
    }
    
    // Cancel the program
    runner.cancel();
    
    // Update history
    const historyEntry = this.programHistory.find(h => h.runId === runId);
    if (historyEntry) {
      historyEntry.status = ProgramStatus.CANCELLED;
      historyEntry.endTime = Date.now();
    }
    
    return { success: true };
  }
  
  getStatus(runId) {
    // Check if currently running
    if (this.runningPrograms.has(runId)) {
      const runner = this.runningPrograms.get(runId);
      return {
        runId,
        programName: runner.programName,
        status: ProgramStatus.RUNNING,
        args: runner.args
      };
    }
    
    // Check history
    const historyEntry = this.programHistory.find(h => h.runId === runId);
    if (historyEntry) {
      return {
        runId: historyEntry.runId,
        programName: historyEntry.programName,
        status: historyEntry.status,
        args: historyEntry.args,
        startTime: historyEntry.startTime,
        endTime: historyEntry.endTime,
        duration: historyEntry.endTime ? historyEntry.endTime - historyEntry.startTime : null,
        result: historyEntry.result,
        error: historyEntry.error
      };
    }
    
    throw new Error(`No program with ID: ${runId}`);
  }
  
  getRunning() {
    const running = [];
    
    for (const [runId, runner] of this.runningPrograms) {
      running.push({
        runId,
        programName: runner.programName,
        args: runner.args,
        startTime: runner.startTime
      });
    }
    
    return running;
  }
  
  getHistory(limit = 100) {
    return this.programHistory
      .slice(-limit)
      .reverse()
      .map(h => ({
        runId: h.runId,
        programName: h.programName,
        status: h.status,
        startTime: h.startTime,
        endTime: h.endTime,
        duration: h.endTime ? h.endTime - h.startTime : null
      }));
  }
}

module.exports = ProgramRegistry;