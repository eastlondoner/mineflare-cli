#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const configManager = require('./config/ConfigManager');

const program = new Command();

// Get API base URL from configuration
const config = configManager.get();
const API_BASE = config.api.baseUrl;

const api = axios.create({
  baseURL: API_BASE,
  timeout: config.server.timeout
});

program
  .name('mc-bot')
  .description('CLI client for Minecraft bot control')
  .version('1.0.0');

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
