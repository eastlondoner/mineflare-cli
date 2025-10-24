#!/usr/bin/env bun

const { Command } = require('commander');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const configManager = require('./config/ConfigManager');
const Table = require('cli-table3');

const program = new Command();

// Get API base URL from config
const config = configManager.get();
const API_BASE = config.api.baseUrl;

const api = axios.create({
  baseURL: API_BASE,
  timeout: config.server.timeout,
  // Disable proxy to avoid url.parse() deprecation warning (DEP0169)
  // from proxy-from-env dependency
  proxy: false
});

// Helper function to display configuration in table format
function displayConfigTable(config, schema) {
  const table = new Table({
    head: ['Section', 'Field', 'Value', 'Description'],
    colWidths: [15, 20, 30, 45]
  });
  
  for (const [section, fields] of Object.entries(config)) {
    for (const [field, value] of Object.entries(fields)) {
      const desc = schema[section]?.[field]?.description || '';
      table.push([
        section,
        field,
        JSON.stringify(value),
        desc
      ]);
    }
  }
  
  return table.toString();
}

// Use build-time VERSION constant, fallback to package.json for development
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : require('../package.json').version;

program
  .name('mineflare')
  .description('Minecraft bot controller with HTTP API')
  .version(VERSION);

// Server commands
const serverCmd = program
  .command('server')
  .description('Manage the bot server');

serverCmd
  .command('start')
  .description('Start the bot server')
  .option('-d, --daemon', 'Run as background daemon')
  .option('--profile <name>', 'Use specific configuration profile')
  .option('-f, --force', 'Force start even if another instance is detected')
  .action(async (options) => {
    // Switch to profile if specified
    if (options.profile) {
      try {
        configManager.setActiveProfile(options.profile);
        console.log(`Using profile: ${options.profile}`);
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    }
    
    // Get configuration and set environment variables for backward compatibility
    const serverConfig = configManager.get();
    
    // Check if server is already running
    const pidFile = path.join(process.cwd(), 'mineflare.pid');
    
    // Check for existing daemon process
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      try {
        // Check if process is still running
        process.kill(pid, 0);
        
        if (!options.force) {
          console.error(`✗ Mineflare server is already running (PID: ${pid})`);
          console.error(`  Use 'mineflare server stop' to stop it first`);
          console.error(`  Or use --force flag to override`);
          process.exit(1);
        } else {
          console.log(`Warning: Overriding existing instance (PID: ${pid})`);
          try {
            process.kill(pid);
            fs.unlinkSync(pidFile);
            console.log(`  Stopped previous instance`);
          } catch (e) {
            console.log(`  Could not stop previous instance: ${e.message}`);
          }
        }
      } catch (e) {
        // Process is not running, clean up stale PID file
        console.log('Cleaning up stale PID file...');
        fs.unlinkSync(pidFile);
      }
    }
    
    // Check if port is already in use
    const net = require('net');
    const checkPort = (port) => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            resolve(false);
          } else {
            resolve(true);
          }
        });
        server.once('listening', () => {
          server.close();
          resolve(true);
        });
        server.listen(port);
      });
    };
    
    const portAvailable = await checkPort(serverConfig.server.port);
    if (!portAvailable && !options.force) {
      console.error(`✗ Port ${serverConfig.server.port} is already in use`);
      console.error(`  Another Mineflare instance or different application may be running`);
      console.error(`  Use 'mineflare server status' to check`);
      console.error(`  Or use --force flag to attempt to start anyway`);
      process.exit(1);
    }
    
    process.env.MINEFLARE_SERVER_PORT = serverConfig.server.port;
    process.env.MC_HOST = serverConfig.minecraft.host;
    process.env.MC_PORT = serverConfig.minecraft.port;
    process.env.MC_USERNAME = serverConfig.minecraft.username;
    process.env.MC_VERSION = serverConfig.minecraft.version;
    process.env.MC_AUTH = serverConfig.minecraft.auth;
    process.env.ENABLE_VIEWER = serverConfig.viewer.enabled;
    process.env.VIEWER_PORT = serverConfig.viewer.port;

    if (options.daemon) {
      const { spawn } = require('child_process');
      const serverPath = path.join(__dirname, 'server.js');
      
      console.log('Starting bot server as daemon...');
      
      // Use bun to run the server script
      const bunPath = 'bun';
      const child = spawn(bunPath, [serverPath], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          MINEFLARE_SERVER_PORT: serverConfig.server.port.toString(),
          MC_HOST: serverConfig.minecraft.host,
          MC_PORT: serverConfig.minecraft.port.toString(),
          MC_USERNAME: serverConfig.minecraft.username,
          MC_VERSION: serverConfig.minecraft.version,
          MC_AUTH: serverConfig.minecraft.auth,
          ENABLE_VIEWER: serverConfig.viewer.enabled.toString(),
          VIEWER_PORT: serverConfig.viewer.port.toString()
        }
      });
      
      child.unref();
      
      fs.writeFileSync(pidFile, child.pid.toString());
      
      console.log(`✓ Bot server started as daemon (PID: ${child.pid})`);
      console.log(`  PID saved to: ${pidFile}`);
      console.log(`  Server running at: http://localhost:${serverConfig.server.port}`);
      process.exit(0);
    } else {
      console.log('Starting bot server...');
      console.log('Configuration:');
      console.log(`  Profile: ${configManager.getActiveProfile()}`);
      console.log(`  Server: http://localhost:${serverConfig.server.port}`);
      console.log(`  Minecraft: ${serverConfig.minecraft.host}:${serverConfig.minecraft.port}`);
      console.log(`  Username: ${serverConfig.minecraft.username}`);
      console.log(`  Viewer: ${serverConfig.viewer.enabled ? `http://localhost:${serverConfig.viewer.port}` : 'disabled'}`);
      
      // Save PID even for non-daemon mode to prevent multiple instances
      fs.writeFileSync(pidFile, process.pid.toString());
      
      // Clean up PID file on exit
      const cleanup = () => {
        if (fs.existsSync(pidFile)) {
          const savedPid = parseInt(fs.readFileSync(pidFile, 'utf8'));
          if (savedPid === process.pid) {
            fs.unlinkSync(pidFile);
            console.log('\nCleaned up PID file');
          }
        }
      };
      
      process.on('exit', cleanup);
      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, shutting down...');
        cleanup();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, shutting down...');
        cleanup();
        process.exit(0);
      });
      
      require('./server');
    }
  });

serverCmd
  .command('stop')
  .description('Stop the bot server daemon')
  .action(() => {
    const pidFile = path.join(process.cwd(), 'mineflare.pid');
    
    if (!fs.existsSync(pidFile)) {
      console.error('No daemon running (PID file not found)');
      process.exit(1);
    }
    
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      process.kill(pid);
      fs.unlinkSync(pidFile);
      console.log(`Bot server stopped (PID: ${pid})`);
    } catch (error) {
      console.error('Failed to stop daemon:', error.message);
      process.exit(1);
    }
  });

serverCmd
  .command('status')
  .description('Check server status')
  .action(async () => {
    const pidFile = path.join(process.cwd(), 'mineflare.pid');
    
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      try {
        process.kill(pid, 0);
        console.log(`✓ Server daemon running (PID: ${pid})`);
      } catch {
        console.log(`✗ Server daemon not running (stale PID file)`);
        fs.unlinkSync(pidFile);
      }
    } else {
      console.log('✗ Server daemon not running');
    }
    
    try {
      const response = await api.get('/health');
      console.log(`✓ API responding at ${API_BASE}`);
      console.log(`  Bot connected: ${response.data.botConnected}`);
    } catch {
      console.log(`✗ API not responding at ${API_BASE}`);
    }
  });

// Configuration commands
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('get [path]')
  .description('Get configuration value(s)')
  .option('-p, --profile <name>', 'Use specific profile')
  .option('--json', 'Output as JSON')
  .action((path, options) => {
    try {
      const value = configManager.get(path, options.profile);
      
      if (options.json) {
        console.log(JSON.stringify(value, null, 2));
      } else if (path) {
        console.log(`${path}: ${JSON.stringify(value)}`);
      } else {
        const schema = configManager.getSchema();
        console.log(`\nConfiguration (Profile: ${options.profile || configManager.getActiveProfile()})\n`);
        console.log(displayConfigTable(value, schema));
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

configCmd
  .command('set <path> <value>')
  .description('Set configuration value')
  .option('-p, --profile <name>', 'Use specific profile')
  .action((path, value, options) => {
    try {
      // Try to parse value as JSON first (for objects/arrays)
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      
      configManager.set(path, parsedValue, options.profile);
      console.log('✓', `Set ${path} to ${JSON.stringify(parsedValue)}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

configCmd
  .command('profile <action> [name]')
  .description('Manage configuration profiles (list, switch, create, delete)')
  .option('-b, --base <profile>', 'Base profile for create action', 'default')
  .action((action, name, options) => {
    try {
      switch (action) {
        case 'list':
          const profiles = configManager.listProfiles();
          const active = configManager.getActiveProfile();
          console.log('\nAvailable Profiles:\n');
          profiles.forEach(profile => {
            const marker = profile === active ? '* ' : '  ';
            console.log(marker + profile);
          });
          console.log();
          break;
          
        case 'switch':
          if (!name) {
            console.error('Error:', 'Profile name required');
            process.exit(1);
          }
          configManager.setActiveProfile(name);
          console.log('✓', `Switched to profile: ${name}`);
          break;
          
        case 'create':
          if (!name) {
            console.error('Error:', 'Profile name required');
            process.exit(1);
          }
          configManager.createProfile(name, options.base);
          console.log('✓', `Created profile: ${name}`);
          break;
          
        case 'delete':
          if (!name) {
            console.error('Error:', 'Profile name required');
            process.exit(1);
          }
          configManager.deleteProfile(name);
          console.log('✓', `Deleted profile: ${name}`);
          break;
          
        default:
          console.error('Error:', `Unknown action: ${action}`);
          console.log('Valid actions: list, switch, create, delete');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-p, --profile <name>', 'Reset specific profile')
  .action((options) => {
    try {
      configManager.reset(options.profile);
      console.log('✓', 'Configuration reset to defaults');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

configCmd
  .command('export [file]')
  .description('Export configuration to file')
  .option('-p, --profile <name>', 'Export specific profile')
  .action((file, options) => {
    try {
      const exportConfig = configManager.exportConfig(options.profile);
      const json = JSON.stringify(exportConfig, null, 2);
      
      if (file) {
        fs.writeFileSync(file, json);
        console.log('✓', `Configuration exported to: ${file}`);
      } else {
        console.log(json);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

configCmd
  .command('import <file>')
  .description('Import configuration from file')
  .option('-p, --profile <name>', 'Import to specific profile')
  .action((file, options) => {
    try {
      const json = fs.readFileSync(file, 'utf8');
      const importConfig = JSON.parse(json);
      
      configManager.importConfig(importConfig, options.profile);
      console.log('✓', `Configuration imported from: ${file}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Bot control commands
program
  .command('health')
  .description('Check bot server health')
  .action(async () => {
    try {
      const response = await api.get('/health');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('state')
  .description('Get current bot state')
  .action(async () => {
    try {
      const response = await api.get('/state');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('inventory')
  .description('Get bot inventory')
  .action(async () => {
    try {
      const response = await api.get('/inventory');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('entities')
  .description('Get nearby entities')
  .action(async () => {
    try {
      const response = await api.get('/entities');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('events')
  .description('Get events since timestamp')
  .option('-s, --since <timestamp>', 'Timestamp to fetch events from', '0')
  .action(async (options) => {
    try {
      const response = await api.get('/events', {
        params: { since: options.since }
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('screenshot')
  .description('Get base64 encoded screenshot')
  .option('-o, --output <file>', 'Save screenshot to file')
  .action(async (options) => {
    try {
      const response = await api.get('/screenshot');
      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, response.data.screenshot, 'base64');
        console.log(`Screenshot saved to ${options.output}`);
      } else {
        console.log(JSON.stringify(response.data, null, 2));
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('chat <message>')
  .description('Send chat message')
  .action(async (message) => {
    try {
      const response = await api.post('/chat', { message });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('move')
  .description('Move bot using absolute or relative directions')
  .option('-x <value>', 'X direction (-1 to 1)', parseFloat)
  .option('-y <value>', 'Y direction (jump if > 0)', parseFloat)
  .option('-z <value>', 'Z direction (-1 to 1)', parseFloat)
  .option('--forward <blocks>', 'Move forward N blocks', parseFloat)
  .option('--backward <blocks>', 'Move backward N blocks', parseFloat)
  .option('--left <blocks>', 'Strafe left N blocks', parseFloat)
  .option('--right <blocks>', 'Strafe right N blocks', parseFloat)
  .option('--up <blocks>', 'Jump/fly up N blocks', parseFloat)
  .option('--down <blocks>', 'Move down N blocks', parseFloat)
  .option('--sprint', 'Enable sprint')
  .action(async (options) => {
    try {
      const moveData = {
        sprint: options.sprint
      };
      
      // Check for relative movement
      if (options.forward !== undefined || options.backward !== undefined || 
          options.left !== undefined || options.right !== undefined ||
          options.up !== undefined || options.down !== undefined) {
        moveData.relative = {
          forward: options.forward || 0,
          backward: options.backward || 0,
          left: options.left || 0,
          right: options.right || 0,
          up: options.up || 0,
          down: options.down || 0
        };
      } else {
        // Use absolute movement
        moveData.x = options.x;
        moveData.y = options.y;
        moveData.z = options.z;
      }
      
      const response = await api.post('/move', moveData);
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('stop')
  .description('Stop all bot movement')
  .action(async () => {
    try {
      const response = await api.post('/stop');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('look')
  .description('Make bot look in direction')
  .option('--yaw <value>', 'Yaw angle in radians', parseFloat)
  .option('--pitch <value>', 'Pitch angle in radians', parseFloat)
  .option('--turn-left <degrees>', 'Turn left by N degrees', parseFloat)
  .option('--turn-right <degrees>', 'Turn right by N degrees', parseFloat)
  .option('--look-up <degrees>', 'Look up by N degrees', parseFloat)
  .option('--look-down <degrees>', 'Look down by N degrees', parseFloat)
  .option('--north', 'Look north')
  .option('--south', 'Look south')
  .option('--east', 'Look east')
  .option('--west', 'Look west')
  .action(async (options) => {
    try {
      const lookData = {};
      
      // Check for relative turns
      if (options.turnLeft !== undefined || options.turnRight !== undefined ||
          options.lookUp !== undefined || options.lookDown !== undefined) {
        lookData.relative = {
          yaw_delta: options.turnLeft ? -options.turnLeft : (options.turnRight || 0),
          pitch_delta: options.lookUp ? -options.lookUp : (options.lookDown || 0)
        };
      }
      // Check for cardinal directions
      else if (options.north || options.south || options.east || options.west) {
        if (options.north) lookData.cardinal = 'north';
        if (options.south) lookData.cardinal = 'south';
        if (options.east) lookData.cardinal = 'east';
        if (options.west) lookData.cardinal = 'west';
      }
      // Use absolute angles
      else {
        if (options.yaw === undefined || options.pitch === undefined) {
          console.error('Error: Either provide --yaw and --pitch, or use relative/cardinal options');
          return;
        }
        lookData.yaw = options.yaw;
        lookData.pitch = options.pitch;
      }
      
      const response = await api.post('/look', lookData);
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('dig')
  .description('Dig block at coordinates')
  .requiredOption('-x <value>', 'X coordinate', parseInt)
  .requiredOption('-y <value>', 'Y coordinate', parseInt)
  .requiredOption('-z <value>', 'Z coordinate', parseInt)
  .action(async (options) => {
    try {
      const response = await api.post('/dig', {
        x: options.x,
        y: options.y,
        z: options.z
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('place')
  .description('Place block at coordinates')
  .requiredOption('-x <value>', 'X coordinate', parseInt)
  .requiredOption('-y <value>', 'Y coordinate', parseInt)
  .requiredOption('-z <value>', 'Z coordinate', parseInt)
  .requiredOption('-b, --block <name>', 'Block name')
  .action(async (options) => {
    try {
      const response = await api.post('/place', {
        x: options.x,
        y: options.y,
        z: options.z,
        blockName: options.block
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('attack')
  .description('Attack entity by ID')
  .requiredOption('-e, --entity <id>', 'Entity ID', parseInt)
  .action(async (options) => {
    try {
      const response = await api.post('/attack', {
        entityId: options.entity
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('recipes')
  .description('Get crafting recipes')
  .option('-i, --item <name>', 'Item name to get recipes for')
  .action(async (options) => {
    try {
      const response = await api.get('/recipes', {
        params: { item: options.item }
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('craft')
  .description('Craft an item')
  .requiredOption('-i, --item <name>', 'Item name to craft')
  .option('-c, --count <number>', 'Number to craft', parseInt, 1)
  .option('-t, --table', 'Use crafting table if needed')
  .action(async (options) => {
    try {
      const response = await api.post('/craft', {
        item: options.item,
        count: options.count,
        craftingTable: options.table || false
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('equip')
  .description('Equip an item')
  .requiredOption('-i, --item <name>', 'Item name to equip')
  .option('-d, --destination <slot>', 'Destination (hand, head, torso, legs, feet, off-hand)', 'hand')
  .action(async (options) => {
    try {
      const response = await api.post('/equip', {
        item: options.item,
        destination: options.destination
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('batch')
  .description('Execute a batch of instructions')
  .requiredOption('-f, --file <path>', 'JSON file containing instructions')
  .option('--no-stop', 'Continue on error (default stops on first error)')
  .action(async (options) => {
    try {
      const fs = require('fs');
      const instructionsJson = fs.readFileSync(options.file, 'utf8');
      const instructions = JSON.parse(instructionsJson);
      
      const response = await api.post('/batch', {
        instructions,
        stopOnError: options.stop !== false
      });
      
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

// Program commands for user-submitted JavaScript/TypeScript programs
const programCmd = program
  .command('program')
  .description('Manage and run user programs');

// Helper to parse key=value arguments
function parseArgs(argArray) {
  const args = {};
  if (!argArray) return args;
  
  for (const arg of argArray) {
    const [key, ...valueParts] = arg.split('=');
    const value = valueParts.join('='); // Handle values with = in them
    
    if (key && value !== undefined) {
      // Try to parse as JSON first (for objects/arrays)
      try {
        args[key] = JSON.parse(value);
      } catch {
        // Parse as boolean if applicable
        if (value === 'true') args[key] = true;
        else if (value === 'false') args[key] = false;
        // Parse as number if applicable
        else if (!isNaN(value)) args[key] = Number(value);
        // Otherwise keep as string
        else args[key] = value;
      }
    }
  }
  
  return args;
}

// Collector function for multiple --arg options
function collect(val, memo) {
  memo.push(val);
  return memo;
}

programCmd
  .command('exec <file>')
  .description('Execute a program file immediately')
  .option('--profile <name>', 'Configuration profile to use')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '900000')
  .option('--cap <capabilities>', 'Comma-separated list of capabilities', 'move,dig,place,look,inventory,craft')
  .option('--arg <key=value>', 'Program arguments (can be used multiple times)', collect, [])
  .option('--dry-run', 'Simulate execution without connecting to server')
  .option('--world-snapshot <file>', 'World snapshot file for dry-run mode')
  .option('--seed <number>', 'Random seed for deterministic execution', '1')
  .action(async (file, options) => {
    try {
      // Load program source
      const source = fs.readFileSync(file, 'utf8');
      const args = parseArgs(options.arg);
      const capabilities = options.cap.split(',').map(c => c.trim());
      
      // Check if server is running
      try {
        await api.get('/health');
      } catch (error) {
        console.error('Bot server is not running. Start it with: mineflare server start');
        process.exit(1);
      }
      
      if (options.dryRun) {
        // Dry-run mode with simulation
        const { ProgramSimulator } = require('./program-system/runner');
        
        let worldSnapshot = {};
        if (options.worldSnapshot) {
          worldSnapshot = JSON.parse(fs.readFileSync(options.worldSnapshot, 'utf8'));
        } else {
          // Generate basic snapshot
          worldSnapshot = {
            spawn: { x: 0, y: 63, z: 0 },
            blocks: {},
            inventory: [],
            time: 0
          };
        }
        
        const simulator = new ProgramSimulator(worldSnapshot);
        const result = await simulator.execute(source, args, capabilities, parseInt(options.timeout));
        
        console.log('Simulation completed:');
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Real execution - use the API to execute on the running server
        const response = await api.post('/program/exec', {
          source,
          capabilities,
          args,
          timeout: parseInt(options.timeout),
          seed: parseInt(options.seed)
        });
        
        const result = response.data;
        
        // Display execution results
        if (result.logs && result.logs.length > 0) {
          console.log('[PROGRAM] Execution logs:');
          result.logs.forEach(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            console.log(`  [${timestamp}] [${log.level.toUpperCase()}] ${log.message}`);
            if (log.args && log.args.length > 0) {
              console.log('    Args:', ...log.args);
            }
          });
        }
        
        if (result.success) {
          console.log('[PROGRAM] Execution completed successfully');
          if (result.result) {
            console.log('[PROGRAM] Result:', JSON.stringify(result.result, null, 2));
          }
        } else {
          console.log('[PROGRAM] Execution failed:', result.error);
          if (result.details) {
            console.log('[PROGRAM] Details:', JSON.stringify(result.details, null, 2));
          }
        }
        
        console.log(`[PROGRAM] Duration: ${result.duration}ms`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('add <file>')
  .description('Register a named program for repeated use')
  .requiredOption('--name <name>', 'Program name')
  .option('--cap <capabilities>', 'Required capabilities (comma-separated)')
  .action(async (file, options) => {
    try {
      const source = fs.readFileSync(file, 'utf8');
      
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      const capabilities = options.cap ? options.cap.split(',').map(c => c.trim()) : undefined;
      const metadata = await registry.add(options.name, source, { capabilities });
      
      console.log(`Program '${options.name}' registered successfully`);
      console.log('Version:', metadata.version);
      console.log('Capabilities:', metadata.capabilities.join(', '));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('run <name>')
  .description('Run a registered program')
  .option('--arg <key=value>', 'Program arguments (can be used multiple times)', collect, [])
  .option('--timeout <ms>', 'Execution timeout in milliseconds')
  .option('--seed <number>', 'Random seed for deterministic execution')
  .action(async (name, options) => {
    try {
      // Check if server is running
      try {
        await api.get('/health');
      } catch (error) {
        console.error('Bot server is not running. Start it with: mineflare server start');
        process.exit(1);
      }
      
      const args = parseArgs(options.arg);
      
      const MinecraftBotServer = require('./bot-server');
      const ProgramRegistry = require('./program-system/registry');
      
      // Note: In real usage, we'd get the existing bot server instance
      const botServer = new MinecraftBotServer();
      const registry = new ProgramRegistry(configManager);
      
      const result = await registry.run(botServer, name, args, {
        timeout: options.timeout ? parseInt(options.timeout) : undefined,
        seed: options.seed ? parseInt(options.seed) : undefined
      });
      
      console.log('Program executed successfully:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('ls')
  .description('List all registered programs')
  .action(async () => {
    try {
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      const programs = await registry.list();
      
      if (programs.length === 0) {
        console.log('No programs registered');
        return;
      }
      
      const table = new Table({
        head: ['Name', 'Version', 'Capabilities', 'Created'],
        colWidths: [20, 10, 40, 20]
      });
      
      for (const prog of programs) {
        table.push([
          prog.name,
          prog.version,
          prog.capabilities.join(', '),
          new Date(prog.created).toLocaleString()
        ]);
      }
      
      console.log(table.toString());
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('rm <name>')
  .description('Remove a registered program')
  .action(async (name) => {
    try {
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      await registry.remove(name);
      console.log(`Program '${name}' removed successfully`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('cancel <runId>')
  .description('Cancel a running program')
  .action(async (runId) => {
    try {
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      await registry.cancel(runId);
      console.log(`Program ${runId} cancelled`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('status <runId>')
  .description('Get status of a program execution')
  .action(async (runId) => {
    try {
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      const status = registry.getStatus(runId);
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

programCmd
  .command('history')
  .description('View program execution history')
  .option('--limit <n>', 'Number of entries to show', '20')
  .action(async (options) => {
    try {
      const ProgramRegistry = require('./program-system/registry');
      const registry = new ProgramRegistry(configManager);
      
      const history = registry.getHistory(parseInt(options.limit));
      
      if (history.length === 0) {
        console.log('No program execution history');
        return;
      }
      
      const table = new Table({
        head: ['Run ID', 'Program', 'Status', 'Duration', 'Start Time'],
        colWidths: [38, 20, 12, 12, 25]
      });
      
      for (const entry of history) {
        table.push([
          entry.runId,
          entry.programName,
          entry.status,
          entry.duration ? `${entry.duration}ms` : '-',
          new Date(entry.startTime).toLocaleString()
        ]);
      }
      
      console.log(table.toString());
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();