#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const { CursorAgent } = require('@cursor-ai/january');
const configManager = require('./config/ConfigManager');

const program = new Command();

// Get API base URL from configuration
const config = configManager.get();
const API_BASE = config.api.baseUrl;

const api = axios.create({
  baseURL: API_BASE,
  timeout: config.server.timeout,
  // Disable proxy to avoid url.parse() deprecation warning (DEP0169)
  // from proxy-from-env dependency
  proxy: false
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

const AGENT_SYSTEM_PROMPT = `You are a Minecraft bot batch job generator. Your task is to convert natural language instructions into a JSON batch job format that controls a Minecraft bot.

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

program
  .command('agent <prompt>')
  .description('Use AI to generate and execute a batch job from natural language')
  .option('--dry-run', 'Only generate the batch job, do not execute')
  .option('--no-stop', 'Continue on error when executing')
  .option('-v, --verbose', 'Show agent thinking process')
  .action(async (prompt, options) => {
    try {
      if (!process.env.CURSOR_API_KEY) {
        console.error('Error: CURSOR_API_KEY environment variable is required');
        console.error('Set it with: export CURSOR_API_KEY=your_api_key');
        process.exit(1);
      }

      const agent = new CursorAgent({
        apiKey: process.env.CURSOR_API_KEY,
        model: 'claude-4.5-sonnet',
        workingLocation: {
          type: 'local',
          localDirectory: process.cwd(),
        },
      });

      console.log('🤖 Generating batch job for:', prompt);
      
      const fullPrompt = `${AGENT_SYSTEM_PROMPT}

User request: ${prompt}

Generate the batch job JSON array now:`;

      const { stream } = agent.submit({ message: fullPrompt });
      
      let fullResponse = '';
      for await (const update of stream) {
        if (update.type === 'text' && update.text) {
          fullResponse += update.text;
          if (options.verbose) {
            process.stdout.write(update.text);
          }
        }
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

program.parse();
