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
  timeout: config.server.timeout
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

program
  .name('mineflare')
  .description('Minecraft bot controller with HTTP API')
  .version('1.0.0');

// Server commands
const serverCmd = program
  .command('server')
  .description('Manage the bot server');

serverCmd
  .command('start')
  .description('Start the bot server')
  .option('-d, --daemon', 'Run as background daemon')
  .option('--profile <name>', 'Use specific configuration profile')
  .action((options) => {
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
    process.env.SERVER_PORT = serverConfig.server.port;
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
      const child = spawn(process.execPath, [serverPath], {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      
      const pidFile = path.join(process.cwd(), 'mineflare.pid');
      fs.writeFileSync(pidFile, child.pid.toString());
      
      console.log(`Bot server started as daemon (PID: ${child.pid})`);
      console.log(`PID saved to: ${pidFile}`);
      console.log(`Server running at: http://localhost:${serverConfig.server.port}`);
      process.exit(0);
    } else {
      console.log('Starting bot server...');
      console.log('Configuration:');
      console.log(`  Profile: ${configManager.getActiveProfile()}`);
      console.log(`  Server: http://localhost:${serverConfig.server.port}`);
      console.log(`  Minecraft: ${serverConfig.minecraft.host}:${serverConfig.minecraft.port}`);
      console.log(`  Username: ${serverConfig.minecraft.username}`);
      console.log(`  Viewer: ${serverConfig.viewer.enabled ? `http://localhost:${serverConfig.viewer.port}` : 'disabled'}`);
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
  .description('Move bot')
  .option('-x <value>', 'X direction (-1 to 1)', parseFloat)
  .option('-y <value>', 'Y direction (jump if > 0)', parseFloat)
  .option('-z <value>', 'Z direction (-1 to 1)', parseFloat)
  .option('--sprint', 'Enable sprint')
  .action(async (options) => {
    try {
      const response = await api.post('/move', {
        x: options.x,
        y: options.y,
        z: options.z,
        sprint: options.sprint
      });
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
  .requiredOption('--yaw <value>', 'Yaw angle', parseFloat)
  .requiredOption('--pitch <value>', 'Pitch angle', parseFloat)
  .action(async (options) => {
    try {
      const response = await api.post('/look', {
        yaw: options.yaw,
        pitch: options.pitch
      });
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

program.parse();