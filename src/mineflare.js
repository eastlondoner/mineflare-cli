#!/usr/bin/env bun

const path = require('path');
const fs = require('fs');

// Load .env file automatically (works with both Node.js and Bun)
function loadEnvFile() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env')
  ];
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            // Only set if not already defined (don't override existing env vars)
            if (process.env[key] === undefined) {
              process.env[key] = value;
            }
          }
        }
        return true;
      } catch (err) {
        // Silently ignore read errors
      }
    }
  }
  return false;
}

// Load env vars before anything else
loadEnvFile();

const { Command } = require('commander');
const axios = require('axios');
const { CursorAgent } = require('@cursor-ai/january');
const configManager = require('./config/ConfigManager');
const Table = require('cli-table3');
const ProgramSandbox = require('./program-system/runtime/sandbox');

function resolvePidFile() {
  const customPath = process.env.MINEFLARE_PID_FILE;
  return path.resolve(customPath ? customPath : path.join(process.cwd(), 'mineflare.pid'));
}

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
    const pidFile = resolvePidFile();
    
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
      
      // Create log file for daemon output
      const logFile = path.join(process.cwd(), 'mineflare.log');
      const logStream = fs.openSync(logFile, 'a');
      
      // Use bun to run the server script
      const bunPath = 'bun';
      const child = spawn(bunPath, [serverPath], {
        detached: true,
        stdio: ['ignore', logStream, logStream],
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
      console.log(`  Logs: ${logFile}`);
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
      const pidFile = resolvePidFile();
    
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
    const pidFile = resolvePidFile();
    
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
      const reason = error.response?.data?.error || error.message;
      console.error('Error: Bot server is not running or unreachable');
      if (reason && !reason.includes('Bot server is not running')) {
        console.error('Reason:', reason);
      }
      process.exit(1);
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
      console.error('Error: Failed to fetch bot state');
      console.error('Reason:', error.response?.data?.error || error.message);
      process.exit(1);
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
      console.error('Error: Failed to fetch inventory');
      console.error('Reason:', error.response?.data?.error || error.message);
      process.exit(1);
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
  .option('--cap <capabilities>', 'Comma-separated list of capabilities')
  .option('--arg <key=value>', 'Program arguments (can be used multiple times)', collect, [])
  .option('--dry-run', 'Simulate execution without connecting to server')
  .option('--world-snapshot <file>', 'World snapshot file for dry-run mode')
  .option('--seed <number>', 'Random seed for deterministic execution', '1')
  .action(async (file, options) => {
    try {
      // Load program source
      const source = fs.readFileSync(file, 'utf8');
      const args = parseArgs(options.arg);
      
      let capabilities = [];
      if (options.cap) {
        capabilities = options.cap.split(',').map(c => c.trim()).filter(Boolean);
      } else {
        try {
          const metadata = ProgramSandbox.inspectProgram(source);
          capabilities = (metadata.capabilities || []).map(c => c.trim()).filter(Boolean);
          
          if (capabilities.length > 0) {
            console.log(`[PROGRAM] Using declared capabilities: ${capabilities.join(', ')}`);
          }
        } catch (error) {
          console.warn(`[PROGRAM] Warning: unable to inspect program capabilities (${error.message}). Proceeding with empty capability list.`);
        }
      }
      
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
        const requestTimeout = parseInt(options.timeout, 10) || config.server.timeout;
        const response = await api.post('/program/exec', {
          source,
          capabilities,
          args,
          timeout: parseInt(options.timeout, 10),
          seed: parseInt(options.seed, 10)
        }, {
          timeout: requestTimeout
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

// Agent command - AI-powered batch job generation (simple)
const AGENT_BATCH_SYSTEM_PROMPT = `You are a Minecraft bot batch job generator. Your task is to convert natural language instructions into a JSON batch job format that controls a Minecraft bot.

## Output Format
You must output ONLY a valid JSON array of instructions. No markdown, no explanation, just the raw JSON array.

## Available Instruction Types

### Movement
- move: { "type": "move", "params": { "x": 1, "z": 0, "sprint": true } }
  - x: forward (1) or backward (-1)
  - z: right (1) or left (-1)
  - y: jump if > 0
  - sprint: boolean
  
- move with relative: { "type": "move", "params": { "relative": { "forward": 10, "left": 3 } } }
  - relative.forward/backward: number of blocks
  - relative.left/right: number of blocks
  
- stop: { "type": "stop" }

- goto: { "type": "goto", "params": { "x": 100, "y": 64, "z": 200 } }

### Looking
- look: { "type": "look", "params": { "yaw": 0, "pitch": 0 } }
- look cardinal: { "type": "look", "params": { "cardinal": "north" } }
  - cardinal options: north, south, east, west
- look relative: { "type": "look", "params": { "relative": { "yaw_delta": 90, "pitch_delta": -15 } } }

### Block Operations
- dig: { "type": "dig", "params": { "x": 10, "y": 64, "z": 10 } }
- place: { "type": "place", "params": { "x": 10, "y": 64, "z": 10, "blockName": "stone" } }

### Crafting & Equipment
- craft: { "type": "craft", "params": { "item": "oak_planks", "count": 4, "craftingTable": false } }
- equip: { "type": "equip", "params": { "item": "diamond_sword", "destination": "hand" } }

### Communication
- chat: { "type": "chat", "params": { "message": "Hello!" } }

### Utility
- wait: { "type": "wait", "params": { "duration": 2000 } } // milliseconds

## Important Notes
- Add "delay" field (in ms) to any instruction to pause after it executes
- For movement over distance, use relative movement with forward/backward/left/right
- Always add wait instructions between complex operations
- Output ONLY the JSON array, nothing else`;

// Helper function to check if an error is an HTTP/2 connection error
function isHttp2ConnectionError(error) {
  const message = error?.message || error?.rawMessage || '';
  return message.includes('NGHTTP2') || 
         message.includes('Stream closed') ||
         message.includes('session') ||
         message.includes('HTTP/2') ||
         message.includes('ERR_HTTP2') ||
         message.includes('h2 is not supported') ||
         message.includes('alpnProtocol');
}

// Helper function to submit to agent with retry logic for HTTP/2 errors
async function submitWithRetry(createAgent, prompt, options = {}, maxRetries = 3) {
  let lastError;
  let agent = createAgent();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { stream } = agent.submit({ message: prompt });
      let fullResponse = '';
      
      for await (const update of stream) {
        if (update.type === 'text-delta' && update.text) {
          fullResponse += update.text;
          if (options.verbose) {
            process.stdout.write(update.text);
          }
        }
      }
      
      return { success: true, response: fullResponse, agent };
    } catch (error) {
      // Extract just the message to avoid Bun printing full stack
      const errorMsg = error?.message || error?.rawMessage || String(error);
      lastError = new Error(errorMsg.substring(0, 200));
      
      if (isHttp2ConnectionError(error)) {
        if (attempt < maxRetries) {
          console.log(`\n⚠️ HTTP/2 connection error, retrying (attempt ${attempt + 1}/${maxRetries})...`);
          // Create a fresh agent to get a new HTTP/2 session
          agent = createAgent();
          // Longer delay before retry to let connection settle
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
      
      // Non-retryable error or max retries reached
      throw lastError;
    }
  }
  
  throw lastError;
}

program
  .command('agent <prompt>')
  .description('Use AI to generate and execute a batch job from natural language')
  .option('--dry-run', 'Only generate the batch job, do not execute')
  .option('--no-stop', 'Continue on error when executing')
  .option('-v, --verbose', 'Show agent thinking process')
  .option('-o, --output <file>', 'Save generated batch job to file')
  .action(async (prompt, options) => {
    try {
      if (!process.env.CURSOR_API_KEY) {
        console.error('Error: CURSOR_API_KEY environment variable is required');
        console.error('Set it with: export CURSOR_API_KEY=your_api_key');
        process.exit(1);
      }

      // Factory function to create fresh CursorAgent instances
      const createAgent = () => new CursorAgent({
        apiKey: process.env.CURSOR_API_KEY,
        model: 'claude-4.5-sonnet',
        workingLocation: {
          type: 'local',
          localDirectory: process.cwd(),
        },
      });

      console.log('🤖 Generating batch job for:', prompt);
      
      const fullPrompt = `${AGENT_BATCH_SYSTEM_PROMPT}

User request: ${prompt}

Generate the batch job JSON array now:`;

      // Submit to agent with retry logic for HTTP/2 errors
      let fullResponse;
      try {
        const result = await submitWithRetry(
          createAgent,
          fullPrompt,
          { verbose: options.verbose },
          3 // max retries
        );
        fullResponse = result.response;
      } catch (error) {
        console.error('Error: Failed to get response from AI agent after retries:', error.message);
        process.exit(1);
      }
      
      if (options.verbose) {
        console.log('\n');
      }

      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = fullResponse.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      // Also try to find just the array if there's extra text
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      let instructions;
      try {
        instructions = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('Error: Failed to parse generated batch job');
        console.error('Raw response:', fullResponse);
        process.exit(1);
      }

      if (!Array.isArray(instructions)) {
        console.error('Error: Generated batch job is not an array');
        process.exit(1);
      }

      console.log('\n📋 Generated batch job:');
      console.log(JSON.stringify(instructions, null, 2));

      // Save to file if requested
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(instructions, null, 2));
        console.log(`\n💾 Saved to: ${options.output}`);
      }

      if (options.dryRun) {
        console.log('\n✅ Dry run complete - batch job not executed');
        return;
      }

      console.log('\n🚀 Executing batch job...');
      const response = await api.post('/batch', {
        instructions,
        stopOnError: options.stop !== false
      });

      console.log('\n✅ Execution result:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Agent-script command - AI-powered script generation with agentic loop
// System prompt written to file to avoid HTTP/2 frame size limits
const AGENT_SCRIPT_SYSTEM_PROMPT = `YOU ARE A CODE GENERATOR. OUTPUT ONLY JAVASCRIPT CODE. NO EXPLANATIONS. NO MARKDOWN. NO TOOL CALLS.

DO NOT use any tools. DO NOT write files. DO NOT explain. JUST OUTPUT THE JAVASCRIPT CODE.

Format:
const program = defineProgram({
  name: 'task-name',
  version: '1.0.0',
  capabilities: ['move', 'pathfind'],
  async run(ctx) {
    const { bot, actions, world, log, control } = ctx;
    const state = await bot.getState();
    // your code
    return control.success({ message: 'Done' });
  }
});
program

AVAILABLE CAPABILITIES: move, dig, place, inventory, craft, pathfind

RULES:
- bot.getState() is ASYNC: const state = await bot.getState()
- Vec3 is GLOBAL: new Vec3(x, y, z)
- sleep is GLOBAL: await sleep(1000)
- End with just: program

APIs:
- await bot.getState() → { position: {x,y,z}, health, food, onGround, inWater }
- await actions.navigate.goto(vec3, { maxSteps: 500 }) - pathfind to location
- await world.scan.blocks({ kinds: ['water', 'stone'], radius: 32, max: 10 }) → [{ position: {x,y,z}, name }] - sorted by distance, nearest first
- await actions.gather.mineBlock({ position: vec3 }) - navigate to and mine a block (handles pathfinding automatically)
- await actions.inventory.get() → [{ name, count }] - get inventory items
- await actions.craft.craft(itemName, count) - craft an item (requires 'craft' capability)
- log.info(msg)
- control.success({ message }) / control.fail(message)

IMPORTANT: Use try/catch when iterating through blocks - if one fails, try the next one.

EXAMPLE - Find and go to water:
const program = defineProgram({
  name: 'find-water',
  version: '1.0.0',
  capabilities: ['move', 'pathfind'],
  async run(ctx) {
    const { bot, actions, world, log, control } = ctx;
    const blocks = await world.scan.blocks({ kinds: ['water'], radius: 64, max: 10 });
    if (blocks.length === 0) return control.fail('No water found');
    const water = blocks[0];
    log.info('Found water at ' + water.position.x + ', ' + water.position.z);
    await actions.navigate.goto(new Vec3(water.position.x + 1, water.position.y, water.position.z), { maxSteps: 500 });
    return control.success({ message: 'Reached water!' });
  }
});
program

EXAMPLE - Wood collection (search wide, filter by reachable height):
const program = defineProgram({
  name: 'collect-wood',
  version: '1.0.0',
  capabilities: ['move', 'pathfind', 'dig'],
  async run(ctx) {
    const { bot, actions, world, log, control } = ctx;
    const state = await bot.getState();
    const botY = Math.floor(state.position.y);
    
    // Search wide area (64 blocks) for ALL log types
    const logs = await world.scan.blocks({ kinds: ['oak_log', 'birch_log', 'spruce_log', 'cherry_log', 'acacia_log', 'dark_oak_log', 'jungle_log', 'mangrove_log'], radius: 64, max: 50 });
    if (logs.length === 0) return control.fail('No trees found');
    
    // Filter to logs within ±2 Y of bot (reachable with simple jump/drop)
    const reachableLogs = logs.filter(l => l.position.y >= botY - 2 && l.position.y <= botY + 2);
    reachableLogs.sort((a, b) => a.position.y - b.position.y);
    log.info('Found ' + logs.length + ' total logs, ' + reachableLogs.length + ' at reachable height');
    
    if (reachableLogs.length === 0) {
      log.info('No logs at current height, walking toward nearest tree...');
      // Walk toward the nearest log to get to same terrain level
      const nearest = logs[0];
      try {
        await actions.navigate.goto(new Vec3(nearest.position.x, botY, nearest.position.z), { maxSteps: 200 });
      } catch (e) { /* ignore nav errors */ }
      return control.fail('No logs at reachable height - try moving closer to trees');
    }
    
    // Try each reachable log
    for (const logBlock of reachableLogs) {
      try {
        log.info('Mining at Y=' + Math.floor(logBlock.position.y));
        await actions.gather.mineBlock({ position: logBlock.position });
        log.info('Successfully mined!');
        return control.success({ message: 'Collected wood!' });
      } catch (err) {
        log.info('Could not reach, trying next...');
      }
    }
    return control.fail('Could not reach any logs');
  }
});
program

NOW OUTPUT ONLY JAVASCRIPT CODE FOR THE TASK:`;

// Path for the context file that the agent will read
const AGENT_CONTEXT_FILE = '.mineflare-agent-context.md';

program
  .command('agent-script <prompt>')
  .description('Use AI agent loop to accomplish tasks via scripts')
  .option('--max-turns <n>', 'Maximum conversation turns', '10')
  .option('-v, --verbose', 'Show agent responses')
  .option('--dry-run', 'Show scripts but do not execute')
  .action(async (prompt, options) => {
    try {
      if (!process.env.CURSOR_API_KEY) {
        console.error('Error: CURSOR_API_KEY environment variable is required');
        console.error('Set it with: export CURSOR_API_KEY=your_api_key');
        process.exit(1);
      }

      // Check if server is running
      try {
        await api.get('/health');
      } catch (error) {
        console.error('Error: Bot server is not running. Start it with: mineflare server start');
        process.exit(1);
      }

      // Factory function to create fresh CursorAgent instances
      const createAgent = () => new CursorAgent({
        apiKey: process.env.CURSOR_API_KEY,
        model: 'claude-4.5-sonnet',
        workingLocation: {
          type: 'local',
          localDirectory: process.cwd(),
        },
      });

      console.log('🤖 Starting agent-script for:', prompt);
      
      const maxTurns = parseInt(options.maxTurns) || 10;
      const contextFilePath = path.join(process.cwd(), AGENT_CONTEXT_FILE);
      const agentLogPath = path.join(process.cwd(), '.mineflare-agent.log');
      
      // Helper to extract essential state (reduces payload size)
      const getCompactState = (state) => {
        if (!state || state.error) return state;
        return {
          position: state.position,
          health: state.health,
          food: state.food,
          gameMode: state.gameMode
        };
      };

      // Helper to get inventory
      const getInventory = async () => {
        try {
          const response = await api.get('/inventory');
          return response.data.items || [];
        } catch (e) {
          return [];
        }
      };

      // Helper to format inventory for context
      const formatInventory = (items) => {
        if (!items || items.length === 0) return 'Empty';
        return items.map(item => `- ${item.name} x${item.count}`).join('\n');
      };

      // Helper to write context to file and return minimal prompt
      const writeContextFile = (content) => {
        fs.writeFileSync(contextFilePath, content, 'utf-8');
      };

      // Helper to append verbose logs to log file
      const appendToLog = (entry) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${entry}\n`;
        fs.appendFileSync(agentLogPath, logLine, 'utf-8');
      };

      // Initialize log file
      fs.writeFileSync(agentLogPath, `=== Agent Session Started: ${new Date().toISOString()} ===\nGoal: ${prompt}\n\n`, 'utf-8');
      console.log(`📝 Verbose logs: ${agentLogPath}`);

      // Get initial bot state and inventory
      let botState;
      let inventory;
      try {
        const stateResponse = await api.get('/state');
        botState = getCompactState(stateResponse.data);
      } catch (e) {
        botState = { error: 'Could not get initial state' };
      }
      inventory = await getInventory();

      // Write full context to file
      const initialContext = `${AGENT_SCRIPT_SYSTEM_PROMPT}

## Current Bot State
Position: ${JSON.stringify(botState.position)}
Health: ${botState.health}
Food: ${botState.food}

## Current Inventory
${formatInventory(inventory)}

## User Goal
${prompt}
`;
      writeContextFile(initialContext);

      // Send minimal prompt - agent reads context from file
      let currentPrompt = `Read the file ${AGENT_CONTEXT_FILE} for instructions and context, then output ONLY the JavaScript code.`;

      for (let turn = 1; turn <= maxTurns; turn++) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📍 Turn ${turn}/${maxTurns}`);
        appendToLog(`--- Turn ${turn}/${maxTurns} ---`);
        
        // Submit to agent with retry logic for HTTP/2 errors
        // Always create fresh agent to avoid HTTP/2 frame size issues from context accumulation
        let fullResponse;
        try {
          const result = await submitWithRetry(
            createAgent, // Always fresh agent - context is persisted via file
            currentPrompt,
            { verbose: options.verbose },
            3 // max retries
          );
          fullResponse = result.response;
          appendToLog(`Prompt: ${currentPrompt.substring(0, 200)}...`);
        } catch (error) {
          console.error('\n❌ Failed to get response from AI agent:', error.message);
          appendToLog(`ERROR: ${error.message}`);
          currentPrompt = `Previous request failed due to connection error. Please try again: ${currentPrompt}`;
          continue;
        }
        
        if (options.verbose) {
          console.log('\n');
        }

        // Extract JavaScript from response
        let scriptSource = fullResponse.trim();
        
        // Remove markdown code fences if present
        const codeMatch = scriptSource.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
        if (codeMatch) {
          scriptSource = codeMatch[1].trim();
        }
        
        // Check if agent says task is complete
        if (scriptSource.toLowerCase().includes('task complete') || 
            scriptSource.toLowerCase().includes('goal accomplished') ||
            scriptSource.toLowerCase().includes('finished successfully')) {
          console.log('\n✅ Agent indicates task is complete');
          break;
        }

        // Validate it looks like a program
        if (!scriptSource.includes('defineProgram') && !scriptSource.includes('program')) {
          console.log('\n⚠️ Response does not appear to be a valid program');
          if (options.verbose) {
            console.log('Response:', scriptSource.substring(0, 500));
          }
          
          // Ask agent to try again
          currentPrompt = `That response was not a valid JavaScript program. Please write a program using defineProgram() to accomplish the task. Remember to output ONLY the JavaScript code.`;
          continue;
        }

        console.log('\n📜 Generated script:');
        // Show abbreviated script unless verbose
        const lines = scriptSource.split('\n');
        if (lines.length > 20 && !options.verbose) {
          console.log(lines.slice(0, 10).join('\n'));
          console.log(`  ... (${lines.length - 20} more lines) ...`);
          console.log(lines.slice(-10).join('\n'));
        } else {
          console.log(scriptSource);
        }

        if (options.dryRun) {
          console.log('\n⏭️ Dry run - skipping execution');
          currentPrompt = `[DRY RUN] The script was not executed. Assume it would have succeeded. What's the next step?`;
          continue;
        }

        // Execute the script
        console.log('\n🚀 Executing script...');
        let execResult;
        try {
          const execResponse = await api.post('/program/exec', {
            source: scriptSource,
            capabilities: ['move', 'dig', 'place', 'inventory', 'craft', 'pathfind'],
            args: {},
            timeout: 120000,
            seed: 1
          }, {
            timeout: 130000
          });
          execResult = execResponse.data;
        } catch (execError) {
          execResult = {
            success: false,
            error: execError.response?.data?.error || execError.message
          };
        }

        // Log verbose execution data to file
        appendToLog(`Script:\n${scriptSource}`);
        appendToLog(`Execution result: ${JSON.stringify(execResult, null, 2)}`);

        // Show result (compact summary to console)
        if (execResult.success) {
          console.log('\n✅ Script executed successfully');
          if (execResult.result) {
            console.log('Result:', JSON.stringify(execResult.result, null, 2));
          }
        } else {
          console.log('\n❌ Script execution failed');
          console.log('Error:', execResult.error);
        }

        // Show abbreviated logs to console, full logs go to file
        if (execResult.logs && execResult.logs.length > 0) {
          const logsToShow = execResult.logs.slice(-5); // Only show last 5 logs
          if (execResult.logs.length > 5) {
            console.log(`\n📋 Logs (last 5 of ${execResult.logs.length}, see ${agentLogPath} for full logs):`);
          } else {
            console.log('\n📋 Logs:');
          }
          logsToShow.forEach(log => {
            console.log(`  [${log.level}] ${log.message}`);
          });
        }

        // Get updated bot state and inventory (compact)
        try {
          const stateResponse = await api.get('/state');
          botState = getCompactState(stateResponse.data);
        } catch (e) {
          botState = { error: 'Could not get state' };
        }
        inventory = await getInventory();

        // Write follow-up context to file
        const resultSummary = execResult.success 
          ? `SUCCESS: ${execResult.result?.message || 'completed'}`
          : `FAILED: ${(execResult.error || 'unknown error').substring(0, 300)}`;
        
        const followUpContext = `## Previous Execution Result
${resultSummary}

## Current Bot State
Position: ${JSON.stringify(botState.position)}
Health: ${botState.health}
Food: ${botState.food}

## Current Inventory
${formatInventory(inventory)}

## Original Goal
${prompt}

## Instructions
Based on the result, either:
1. Write the next JavaScript program (using defineProgram) to continue toward the goal
2. If done, respond with "TASK COMPLETE"

OUTPUT ONLY CODE OR "TASK COMPLETE":
`;
        writeContextFile(followUpContext);
        
        currentPrompt = `Read ${AGENT_CONTEXT_FILE} for the execution result and next instructions.`;

        // Check if we should stop
        if (execResult.success && execResult.result?.message?.toLowerCase().includes('complete')) {
          console.log('\n✅ Task appears complete based on result');
          break;
        }
      }

      console.log(`\n${'─'.repeat(60)}`);
      console.log('🏁 Agent session ended');
      console.log(`📝 Full session log: ${agentLogPath}`);
      appendToLog(`=== Agent Session Ended: ${new Date().toISOString()} ===`);
      
      // Clean up context file (but keep log file for debugging)
      try {
        if (fs.existsSync(contextFilePath)) {
          fs.unlinkSync(contextFilePath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      console.error('Error:', error.message);
      // Clean up context file on error too
      try {
        const contextFilePath = path.join(process.cwd(), AGENT_CONTEXT_FILE);
        if (fs.existsSync(contextFilePath)) {
          fs.unlinkSync(contextFilePath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      process.exit(1);
    }
  });

program.parse();
