const express = require('express');
const { fork } = require('child_process');
const path = require('path');

class IsolatedBotServer {
  constructor() {
    this.botProcess = null;
    this.app = express();
    this.setupRoutes();
    this.config = null;
    this.botState = {
      connected: false,
      spawned: false,
      position: null,
      health: 20,
      isDead: false
    };
    this.events = [];
    this.isRestarting = false;
  }

  setupRoutes() {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        botConnected: this.botState.connected 
      });
    });

    this.app.get('/status', (req, res) => {
      res.json({
        connected: this.botState.connected,
        spawned: this.botState.spawned,
        position: this.botState.position,
        health: this.botState.health,
        isDead: this.botState.isDead,
        processRunning: this.botProcess !== null && !this.botProcess.killed
      });
    });

    // Get bot state with detailed information
    this.app.get('/state', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      // Request state from bot process and wait for response
      if (this.botProcess && !this.botProcess.killed) {
        // Set up one-time listener for state response
        let responded = false;
        const stateHandler = (msg) => {
          if (msg.type === 'state_response' && !responded) {
            responded = true;
            res.json(msg.state);
          }
        };
        
        this.botProcess.once('message', stateHandler);
        this.sendCommand('get_state');
        
        // Timeout after 2 seconds
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', stateHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'State request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot process not running' });
      }
    });

    // Get inventory
    this.app.get('/inventory', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        const inventoryHandler = (msg) => {
          if (msg.type === 'inventory_response' && !responded) {
            responded = true;
            res.json({ items: msg.items });
          }
        };
        
        this.botProcess.once('message', inventoryHandler);
        this.sendCommand('get_inventory');
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', inventoryHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Inventory request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot process not running' });
      }
    });

    // Get nearby entities
    this.app.get('/entities', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        const entitiesHandler = (msg) => {
          if (msg.type === 'entities_response' && !responded) {
            responded = true;
            res.json({ entities: msg.entities });
          }
        };
        
        this.botProcess.once('message', entitiesHandler);
        this.sendCommand('get_entities');
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', entitiesHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Entities request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot process not running' });
      }
    });

    // Get events with optional since parameter
    this.app.get('/events', (req, res) => {
      const since = parseInt(req.query.since) || 0;
      const filteredEvents = this.events.filter(event => event.timestamp > since);
      res.json({ events: filteredEvents });
    });

    // Get screenshot
    this.app.get('/screenshot', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        const screenshotHandler = (msg) => {
          if (msg.type === 'screenshot_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(500).json({ error: msg.error });
            } else {
              res.json({ screenshot: msg.screenshot });
            }
          }
        };
        
        this.botProcess.once('message', screenshotHandler);
        this.sendCommand('get_screenshot');
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', screenshotHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Screenshot request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 5000);
      } else {
        res.status(503).json({ error: 'Bot process not running' });
      }
    });

    // Get recipes
    this.app.get('/recipes', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item } = req.query;
      
      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        const recipesHandler = (msg) => {
          if (msg.type === 'recipes_response' && !responded) {
            responded = true;
            res.json(msg.data);
          }
        };
        
        this.botProcess.once('message', recipesHandler);
        this.sendCommand('get_recipes', { item });
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', recipesHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Recipes request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot process not running' });
      }
    });

    this.app.post('/respawn', (req, res) => {
      if (this.botProcess && !this.botProcess.killed) {
        this.sendCommand('respawn');
        res.json({ success: true, message: 'Respawn command sent' });
      } else {
        res.status(503).json({ success: false, message: 'Bot process not running' });
      }
    });

    this.app.post('/chat', (req, res) => {
      const { message } = req.body;
      if (this.botProcess && !this.botProcess.killed && message) {
        this.sendCommand('chat', { message });
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, message: 'Invalid request or bot not running' });
      }
    });

    // Enhanced move endpoint with relative movement support
    this.app.post('/move', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z, sprint, relative, direction, blocks } = req.body;
      
      if (this.botProcess && !this.botProcess.killed) {
        // Handle legacy simple movement
        if (direction) {
          this.sendCommand('move', { direction, blocks });
          res.json({ success: true });
        } else {
          // Handle new movement format
          this.sendCommand('move_advanced', { x, y, z, sprint, relative });
          res.json({ success: true });
        }
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Stop movement
    this.app.post('/stop', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        this.sendCommand('stop');
        res.json({ success: true });
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Look endpoint
    this.app.post('/look', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { yaw, pitch, relative, cardinal } = req.body;
      
      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('look', { yaw, pitch, relative, cardinal });
        
        // Wait for response
        const lookHandler = (msg) => {
          if (msg.type === 'look_response' && !responded) {
            responded = true;
            res.json(msg.data);
          }
        };
        
        this.botProcess.once('message', lookHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', lookHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Look request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Dig block
    this.app.post('/dig', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z } = req.body;
      
      if (x === undefined || y === undefined || z === undefined) {
        return res.status(400).json({ error: 'x, y, z coordinates required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('dig', { x, y, z });
        
        const digHandler = (msg) => {
          if (msg.type === 'dig_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(400).json({ error: msg.error });
            } else {
              res.json({ success: true, block: msg.block });
            }
          }
        };
        
        this.botProcess.once('message', digHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', digHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Dig request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 10000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Place block
    this.app.post('/place', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z, blockName } = req.body;
      
      if (x === undefined || y === undefined || z === undefined || !blockName) {
        return res.status(400).json({ error: 'x, y, z coordinates and blockName required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('place', { x, y, z, blockName });
        
        const placeHandler = (msg) => {
          if (msg.type === 'place_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(400).json({ error: msg.error });
            } else {
              res.json({ success: true });
            }
          }
        };
        
        this.botProcess.once('message', placeHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', placeHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Place request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 5000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Attack entity
    this.app.post('/attack', (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { entityId } = req.body;
      
      if (!entityId) {
        return res.status(400).json({ error: 'entityId required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('attack', { entityId });
        
        const attackHandler = (msg) => {
          if (msg.type === 'attack_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(400).json({ error: msg.error });
            } else {
              res.json({ success: true });
            }
          }
        };
        
        this.botProcess.once('message', attackHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', attackHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Attack request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 2000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Craft items
    this.app.post('/craft', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item, count = 1, craftingTable = false } = req.body;
      
      if (!item) {
        return res.status(400).json({ error: 'item name required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('craft', { item, count, craftingTable });
        
        const craftHandler = (msg) => {
          if (msg.type === 'craft_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(400).json({ error: msg.error });
            } else {
              res.json({ success: true, crafted: msg.item, count: msg.count });
            }
          }
        };
        
        this.botProcess.once('message', craftHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', craftHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Craft request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 10000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Equip item
    this.app.post('/equip', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item, destination = 'hand' } = req.body;
      
      if (!item) {
        return res.status(400).json({ error: 'item name required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('equip', { item, destination });
        
        const equipHandler = (msg) => {
          if (msg.type === 'equip_response' && !responded) {
            responded = true;
            if (msg.error) {
              res.status(400).json({ error: msg.error });
            } else {
              res.json({ success: true, equipped: msg.item, destination: msg.destination });
            }
          }
        };
        
        this.botProcess.once('message', equipHandler);
        
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', equipHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Equip request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 5000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Batch commands
    this.app.post('/batch', async (req, res) => {
      if (!this.botState.connected) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { instructions, stopOnError = true } = req.body;
      
      if (!instructions || !Array.isArray(instructions)) {
        return res.status(400).json({ error: 'instructions array required' });
      }

      if (this.botProcess && !this.botProcess.killed) {
        let responded = false;
        this.sendCommand('batch', { instructions, stopOnError });
        
        const batchHandler = (msg) => {
          if (msg.type === 'batch_response' && !responded) {
            responded = true;
            res.json(msg.results);
          }
        };
        
        this.botProcess.once('message', batchHandler);
        
        // Longer timeout for batch operations
        setTimeout(() => {
          if (!responded) {
            responded = true;
            try {
              this.botProcess.removeListener('message', batchHandler);
              if (!res.headersSent) {
                res.status(504).json({ error: 'Batch request timeout' });
              }
            } catch (err) {
              // Ignore errors if response already sent
            }
          }
        }, 30000);
      } else {
        res.status(503).json({ error: 'Bot not running' });
      }
    });

    // Program execution endpoints
    this.app.post('/program/exec', async (req, res) => {
      try {
        const { source, capabilities = [], args = {}, timeout = 900000, seed = 1 } = req.body;
        
        if (!this.botState.connected) {
          return res.status(503).json({
            success: false,
            error: 'Bot is not connected to server'
          });
        }
        
        // Create minimal bot proxy for program execution
        const botProxy = {
          entity: { position: this.botState.position },
          health: this.botState.health,
          isConnected: () => this.botState.connected
        };
        
        const ProgramRunner = require('./program-system/runner');
        const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const runner = new ProgramRunner(botProxy, {
          runId,
          programName: 'temp_' + Date.now(),
          source,
          metadata: { capabilities },
          args,
          timeout,
          capabilities,
          seed
        });
        
        const result = await runner.execute();
        
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/program/add', async (req, res) => {
      try {
        const { name, source } = req.body;
        
        const ProgramRegistry = require('./program-system/registry');
        const ConfigManager = require('./config/ConfigManager');
        const configManager = new ConfigManager();
        const registry = new ProgramRegistry(configManager);
        await registry.initStorage();
        
        await registry.add(name, source);
        
        res.json({ success: true, message: `Program '${name}' added successfully` });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.get('/program/list', async (req, res) => {
      try {
        const ProgramRegistry = require('./program-system/registry');
        const ConfigManager = require('./config/ConfigManager');
        const configManager = new ConfigManager();
        const registry = new ProgramRegistry(configManager);
        await registry.initStorage();
        
        const programs = await registry.list();
        res.json({ success: true, programs });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/program/:name', async (req, res) => {
      try {
        const ProgramRegistry = require('./program-system/registry');
        const ConfigManager = require('./config/ConfigManager');
        const configManager = new ConfigManager();
        const registry = new ProgramRegistry(configManager);
        await registry.initStorage();
        
        await registry.remove(req.params.name);
        res.json({ success: true, message: `Program '${req.params.name}' removed successfully` });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/quit', (req, res) => {
      if (this.botProcess) {
        this.sendCommand('quit');
        setTimeout(() => this.stopBotProcess(), 1000);
        res.json({ success: true });
      } else {
        res.status(503).json({ success: false, message: 'Bot not running' });
      }
    });
  }

  sendCommand(command, data = {}) {
    if (this.botProcess && !this.botProcess.killed) {
      this.botProcess.send({ type: 'command', command, ...data });
    }
  }

  logEvent(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data
    };
    this.events.push(event);
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
    console.log(`[SERVER] Event: ${type}`, data);
  }

  startBotProcess() {
    if (this.botProcess && !this.botProcess.killed) {
      console.log('[SERVER] Bot process already running');
      return;
    }

    console.log('[SERVER] Starting isolated bot process...');
    
    const botProcessPath = path.join(__dirname, 'bot-process.js');
    // Use bun to execute the bot process
    const { spawn } = require('child_process');
    this.botProcess = spawn('bun', [botProcessPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Enable IPC for communication
    });

    // Log stdout and stderr for debugging
    this.botProcess.stdout.on('data', (data) => {
      console.log('[BOT-PROCESS STDOUT]:', data.toString());
    });

    this.botProcess.stderr.on('data', (data) => {
      console.error('[BOT-PROCESS STDERR]:', data.toString());
    });

    this.botProcess.on('message', (msg) => {
      switch (msg.type) {
        case 'ready':
          console.log('[SERVER] Bot process ready, sending start command...');
          this.botProcess.send({ type: 'start', config: this.config });
          break;
          
        case 'spawned':
          this.botState.spawned = true;
          this.botState.connected = true;
          this.botState.position = msg.position;
          this.botState.health = msg.health;
          this.botState.isDead = msg.health === 0;
          this.logEvent('spawn', { position: msg.position, health: msg.health });
          
          if (msg.health === 0) {
            console.log('[SERVER] Bot spawned dead! Will handle respawn in isolated process.');
          }
          break;
          
        case 'died':
          this.botState.isDead = true;
          this.botState.health = 0;
          this.logEvent('death', {});
          break;
          
        case 'respawned':
          this.botState.isDead = false;
          this.botState.health = 20;
          this.botState.position = msg.position;
          this.logEvent('respawn', { position: msg.position });
          break;
          
        case 'chat':
          this.logEvent('chat', { username: msg.username, message: msg.message });
          break;
          
        case 'error':
          this.logEvent('error', { error: msg.error });
          break;
          
        case 'kicked':
          this.logEvent('kicked', { reason: msg.reason });
          this.botState.connected = false;
          this.scheduleRestart();
          break;
          
        case 'ended':
          this.logEvent('disconnected', { reason: msg.reason });
          this.botState.connected = false;
          this.botState.spawned = false;
          this.scheduleRestart();
          break;
          
        case 'crash':
          console.error('[SERVER] Bot process crashed:', msg.error);
          this.logEvent('crash', { error: msg.error, stack: msg.stack });
          this.scheduleRestart();
          break;
      }
    });

    this.botProcess.on('error', (err) => {
      console.error('[SERVER] Failed to start bot process:', err);
      this.logEvent('process_error', { error: err.message });
    });

    this.botProcess.on('exit', (code, signal) => {
      console.log(`[SERVER] Bot process exited with code ${code} and signal ${signal}`);
      this.logEvent('process_exit', { code, signal });
      this.botState.connected = false;
      this.botState.spawned = false;
      this.botProcess = null;
      
      // Auto-restart if not already restarting
      if (!this.isRestarting) {
        this.scheduleRestart();
      }
    });
  }

  scheduleRestart() {
    if (this.isRestarting) {
      return;
    }
    
    this.isRestarting = true;
    console.log('[SERVER] Scheduling bot process restart in 3 seconds...');
    
    setTimeout(() => {
      this.isRestarting = false;
      this.startBotProcess();
    }, 3000);
  }

  stopBotProcess() {
    if (this.botProcess && !this.botProcess.killed) {
      console.log('[SERVER] Stopping bot process...');
      this.botProcess.kill('SIGTERM');
      this.botProcess = null;
    }
  }

  start(botConfig, port = 3000) {
    this.config = botConfig;
    
    this.app.listen(port, () => {
      console.log(`[SERVER] Bot server listening on port ${port}`);
      console.log(`[SERVER] Will connect to Minecraft server: ${botConfig.host}:${botConfig.port}`);
      
      // Start the bot process after server is ready
      this.startBotProcess();
    });

    // Handle server shutdown
    process.on('SIGINT', () => {
      console.log('[SERVER] Shutting down...');
      this.stopBotProcess();
      setTimeout(() => process.exit(0), 1000);
    });
    
    process.on('SIGTERM', () => {
      console.log('[SERVER] Received SIGTERM...');
      this.stopBotProcess();
      setTimeout(() => process.exit(0), 1000);
    });
  }
}

module.exports = IsolatedBotServer;