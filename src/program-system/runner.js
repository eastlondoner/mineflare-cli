const { ProgramStatus, ProgramError, ErrorCode } = require('./sdk/types');
const { mergeWithDefaults } = require('./sdk/helpers');
const ProgramSandbox = require('./runtime/sandbox');
const ContextBuilder = require('./runtime/context');

class ProgramRunner {
  constructor(botServer, options) {
    this.botServer = botServer;
    this.runId = options.runId;
    this.programName = options.programName;
    this.source = options.source;
    this.metadata = options.metadata;
    this.args = options.args;
    this.timeout = options.timeout || 900000; // 15 minutes default
    this.capabilities = options.capabilities || [];
    this.seed = options.seed || 1;
    
    this.status = ProgramStatus.PENDING;
    this.startTime = null;
    this.endTime = null;
    this.result = null;
    this.error = null;
    
    this.sandbox = null;
    this.contextBuilder = null;
  }
  
  async execute() {
    if (this.status !== ProgramStatus.PENDING) {
      throw new ProgramError(
        ErrorCode.OPERATION_FAILED,
        'Program has already been executed'
      );
    }
    
    this.status = ProgramStatus.RUNNING;
    this.startTime = Date.now();
    
    try {
      // Inspect program metadata to obtain declared capabilities and defaults
      const inspectedMetadata = ProgramSandbox.inspectProgram(this.source);
      
      // Prefer declared program name unless explicitly overridden
      if (!this.programName || this.programName.startsWith('temp_')) {
        this.programName = inspectedMetadata.name || this.programName;
      }
      
      // Merge metadata with inspected values (inspected values take precedence)
      const existingMetadata = this.metadata || {};
      this.metadata = {
        ...existingMetadata,
        ...inspectedMetadata,
        defaults: {
          ...(inspectedMetadata.defaults || {}),
          ...(existingMetadata.defaults || {})
        }
      };
      
      const requiredCaps = new Set(inspectedMetadata.capabilities || []);
      let capabilitySet = new Set(this.capabilities || []);
      
      if (capabilitySet.size === 0 && requiredCaps.size > 0) {
        capabilitySet = new Set(requiredCaps);
      }
      
      for (const cap of requiredCaps) {
        if (!capabilitySet.has(cap)) {
          throw new ProgramError(
            ErrorCode.CAPABILITY,
            `Program requires capability '${cap}' but it was not granted`
          );
        }
      }
      
      this.capabilities = [...capabilitySet];
      
      // Check bot connection using unified method
      if (!this.botServer || !this.botServer.isConnected()) {
        throw new ProgramError(
          ErrorCode.BOT_DISCONNECTED,
          'Bot is not connected to server'
        );
      }
      
      // Merge args with defaults
      const mergedArgs = mergeWithDefaults(
        this.args,
        this.metadata.defaults || {}
      );
      this.args = mergedArgs;
      
      // Create sandbox
      this.sandbox = new ProgramSandbox(this.capabilities, this.timeout);
      
      // Capture bot's starting position and yaw for volume constraints
      let volumeOrigin = null;
      let volumeOriginYaw = 0;
      
      try {
        const botState = await this.botServer.getState();
        if (botState && botState.position) {
          volumeOrigin = {
            x: botState.position.x,
            y: botState.position.y,
            z: botState.position.z
          };
          volumeOriginYaw = botState.orientation?.yaw || 0;
        }
      } catch (err) {
        console.warn('[PROGRAM] Could not capture volume origin:', err.message);
      }
      
      // Create context
      this.contextBuilder = new ContextBuilder(
        this.botServer,
        this.capabilities,
        mergedArgs,
        { 
          seed: this.seed,
          allowedVolumes: this.metadata.allowedVolumes || null,
          volumeOrigin,
          volumeOriginYaw
        }
      );
      
      const context = this.contextBuilder.build();
      
      // Log execution start
      console.log(`[PROGRAM] Starting execution of '${this.programName}'`);
      console.log(`[PROGRAM] Run ID: ${this.runId}`);
      console.log(`[PROGRAM] Capabilities: ${this.capabilities.join(', ')}`);
      console.log(`[PROGRAM] Args:`, mergedArgs);
      
      // Execute program in sandbox
      const executionResult = await this.sandbox.execute(this.source, context);
      
      let failureMarker = null;
      let responsePayload = executionResult.result;
      
      // Check for success/failure markers
      if (executionResult.result && executionResult.result.__mfSuccess) {
        this.status = ProgramStatus.SUCCEEDED;
        this.result = executionResult.result.data;
        responsePayload = executionResult.result.data;
      } else if (executionResult.result && executionResult.result.__mfFailure) {
        this.status = ProgramStatus.FAILED;
        this.error = executionResult.result.message;
        this.result = executionResult.result.data;
        responsePayload = executionResult.result.data;
        failureMarker = executionResult.result;
      } else {
        // Normal completion
        this.status = ProgramStatus.SUCCEEDED;
        this.result = executionResult.result;
      }
      
      this.endTime = Date.now();
      
      const duration = this.endTime - this.startTime;
      const usage = this.contextBuilder.getUsage();
      
      if (failureMarker) {
        console.warn(`[PROGRAM] Execution failed: ${failureMarker.message}`);
      } else {
        console.log(`[PROGRAM] Execution completed successfully`);
      }
      console.log(`[PROGRAM] Duration: ${duration}ms`);
      console.log(`[PROGRAM] Resource usage:`, usage);
      
      const response = {
        success: !failureMarker,
        result: responsePayload,
        logs: executionResult.logs,
        usage,
        duration
      };
      
      if (failureMarker) {
        response.error = failureMarker.message;
        if (failureMarker.data !== undefined) {
          response.data = failureMarker.data;
        }
      }
      
      return response;
    } catch (error) {
      this.status = ProgramStatus.FAILED;
      this.endTime = Date.now();
      this.error = error.message;
      
      // Log execution failure
      console.error(`[PROGRAM] Execution failed:`, error.message);
      console.error(`[PROGRAM] Duration: ${this.endTime - this.startTime}ms`);
      
      // Re-throw as ProgramError if not already
      if (error instanceof ProgramError) {
        throw error;
      }
      
      throw new ProgramError(
        ErrorCode.OPERATION_FAILED,
        `Program execution failed: ${error.message}`,
        { originalError: error.toString() }
      );
    }
  }
  
  cancel() {
    if (this.status !== ProgramStatus.RUNNING) {
      throw new Error('Program is not running');
    }
    
    console.log(`[PROGRAM] Cancelling execution of '${this.programName}' (${this.runId})`);
    
    // Cancel via sandbox
    if (this.sandbox) {
      this.sandbox.abort();
    }
    
    // Cancel via context
    if (this.contextBuilder) {
      this.contextBuilder.cancel();
    }
    
    this.status = ProgramStatus.CANCELLED;
    this.endTime = Date.now();
    
    return { success: true };
  }
  
  getStatus() {
    return {
      runId: this.runId,
      programName: this.programName,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.endTime - this.startTime : null,
      result: this.result,
      error: this.error
    };
  }
}

// Simulator for dry-run mode
class ProgramSimulator {
  constructor(worldSnapshot) {
    this.worldSnapshot = worldSnapshot;
    this.simulatedBot = this.createSimulatedBot();
  }
  
  createSimulatedBot() {
    // Create a mock bot that operates on the snapshot
    return {
      entity: {
        position: this.worldSnapshot.spawn || { x: 0, y: 63, z: 0 },
        yaw: 0,
        pitch: 0,
        onGround: true,
        isInWater: false,
        isInLava: false
      },
      health: 20,
      food: 20,
      oxygen: 20,
      inventory: {
        items: () => this.worldSnapshot.inventory || []
      },
      blockAt: (pos) => {
        // Look up block in snapshot
        const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
        return this.worldSnapshot.blocks?.[key] || { name: 'air' };
      },
      time: {
        timeOfDay: this.worldSnapshot.time || 0
      }
    };
  }
  
  async execute(source, args, capabilities, timeout = 30000) {
    // Create a mock bot server
    const mockBotServer = {
      bot: this.simulatedBot,
      executeInstruction: async (instruction) => {
        // Simulate instruction execution
        console.log(`[SIMULATOR] Executing: ${instruction.type}`, instruction.params);
        
        switch (instruction.type) {
          case 'move':
          case 'goto':
            // Simulate movement
            const target = instruction.params;
            this.simulatedBot.entity.position = {
              x: target.x,
              y: target.y,
              z: target.z
            };
            return { moved: true };
            
          case 'dig':
            // Simulate digging
            const digPos = instruction.params;
            const key = `${Math.floor(digPos.x)},${Math.floor(digPos.y)},${Math.floor(digPos.z)}`;
            if (this.worldSnapshot.blocks?.[key]) {
              delete this.worldSnapshot.blocks[key];
            }
            return { success: true };
            
          case 'place':
            // Simulate placing
            const placePos = instruction.params;
            const placeKey = `${Math.floor(placePos.x)},${Math.floor(placePos.y)},${Math.floor(placePos.z)}`;
            this.worldSnapshot.blocks[placeKey] = {
              name: instruction.params.block
            };
            return { success: true };
            
          case 'craft':
            // Simulate crafting
            return { crafted: instruction.params.item, count: instruction.params.count };
            
          default:
            return { simulated: true };
        }
      }
    };
    
    // Run with mock bot server
    const runner = new ProgramRunner(mockBotServer, {
      runId: 'simulation',
      programName: 'simulation',
      source,
      metadata: { defaults: {} },
      args,
      timeout,
      capabilities,
      seed: 1
    });
    
    const result = await runner.execute();
    
    return {
      ...result,
      worldSnapshot: this.worldSnapshot // Return modified snapshot
    };
  }
}

module.exports = ProgramRunner;
module.exports.ProgramSimulator = ProgramSimulator;
