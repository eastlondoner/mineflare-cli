const mineflayer = require('mineflayer');
const express = require('express');

class MinecraftBotServer {
  constructor() {
    this.bot = null;
    this.events = [];
    this.app = express();
    this.viewer = null;
    this.config = null; // Store config for reconnection
    this.isReconnecting = false;
    
    this.app.use(express.json());
    this.setupRoutes();
  }

  isConnected() {
    // Unified bot connection check used by both HTTP handlers and ProgramRunner
    return this.bot && 
           this.bot.entity && 
           this.bot._client && 
           !this.bot._client.ended;
  }

  logEvent(type, data) {
    const event = {
      timestamp: Date.now(),
      type,
      data
    };
    this.events.push(event);
    console.log(`[EVENT] ${type}:`, data);
  }

  handleReconnect() {
    // Prevent multiple reconnection attempts
    if (this.isReconnecting) {
      console.log('[BOT] Reconnection already in progress...');
      return;
    }
    
    this.isReconnecting = true;
    console.log('[BOT] Starting reconnection process...');
    
    // Clean up old bot instance
    if (this.bot) {
      try {
        // Remove all listeners to prevent memory leaks
        this.bot.removeAllListeners();
        
        // End the connection if it exists
        if (this.bot._client && !this.bot._client.ended) {
          this.bot.quit();
        }
      } catch (err) {
        console.log('[BOT] Error cleaning up old bot instance:', err.message);
      }
      this.bot = null;
    }
    
    // Close viewer if it exists
    if (this.viewer) {
      try {
        this.viewer.close();
      } catch (err) {
        console.log('[BOT] Error closing viewer:', err.message);
      }
      this.viewer = null;
    }
    
    // Wait a bit before reconnecting to let server clean up
    setTimeout(() => {
      if (this.config) {
        console.log('[BOT] Attempting to reconnect...');
        this.setupBot(this.config);
        this.isReconnecting = false;
        this.logEvent('reconnect', { timestamp: Date.now() });
      } else {
        console.error('[BOT] Cannot reconnect: no config stored');
        this.isReconnecting = false;
      }
    }, 3000);
  }

  setupBot(config) {
    // Store config for potential reconnection
    this.config = config;
    
    this.bot = mineflayer.createBot({
      host: config.host || 'localhost',
      port: config.port || 25565,
      username: config.username || 'Bot',
      version: config.version || false,
      auth: config.auth || 'offline'
    });

    this.bot.once('spawn', async () => {
      this.logEvent('spawn', { position: this.bot.entity.position });
      
      if (config.enableViewer !== false) {
        try {
          // Dynamically import prismarine-viewer only when needed
          const { mineflayer: mineflayerViewer } = await import('prismarine-viewer');
          const viewerPort = config.viewerPort || 3001;
          const firstPerson = config.firstPerson !== undefined ? config.firstPerson : true;
          this.viewer = mineflayerViewer(this.bot, { port: viewerPort, firstPerson });
          console.log(`Viewer started on port ${viewerPort}`);
        } catch (error) {
          console.error('Failed to load viewer (missing native library dependencies):', error.message);
          console.log('Continuing without viewer support.');
        }
      }
    });

    this.bot.on('chat', (username, message) => {
      this.logEvent('chat', { username, message });
    });

    this.bot.on('health', () => {
      this.logEvent('health', { 
        health: this.bot.health, 
        food: this.bot.food 
      });
    });

    this.bot.on('death', () => {
      this.logEvent('death', { position: this.bot.entity.position });
      
      // Add automatic respawn after death to prevent death loop
      console.log('[BOT] Died, attempting to respawn...');
      
      // Clear any control states immediately
      this.bot.clearControlStates();
      
      // Clear digging state safely
      if (this.bot.targetDigBlock) {
        try {
          this.bot.stopDigging();
        } catch (err) {
          console.log('[BOT] Error stopping digging on death:', err.message);
        }
        this.bot.targetDigBlock = null;
      }
      
      // Set up respawn tracking
      let respawnSuccessful = false;
      const respawnTimeout = setTimeout(() => {
        if (!respawnSuccessful) {
          console.log('[BOT] Respawn timeout - bot stuck, triggering reconnection...');
          this.handleReconnect();
        }
      }, 5000); // 5 second timeout for respawn
      
      // Listen for successful respawn
      const onRespawn = () => {
        respawnSuccessful = true;
        clearTimeout(respawnTimeout);
        console.log('[BOT] Successfully respawned!');
        this.logEvent('respawn_success', { timestamp: Date.now() });
        // Clean up listener
        this.bot.removeListener('spawn', onRespawn);
      };
      
      this.bot.once('spawn', onRespawn);
      
      // Add a small delay then attempt respawn using proper API
      setTimeout(() => {
        try {
          // Check if bot is still connected before trying to respawn
          if (this.bot && this.bot._client && !this.bot._client.ended) {
            // Use proper mineflayer respawn API
            if (typeof this.bot.respawn === 'function') {
              this.bot.respawn();
              console.log('[BOT] Respawn method called');
            } else {
              // Fallback: send client command packet directly
              this.bot._client.write('client_command', { action: 1 }); // 1 = respawn
              console.log('[BOT] Respawn packet sent directly');
            }
            
            this.logEvent('respawn_attempt', { timestamp: Date.now() });
          } else {
            console.log('[BOT] Bot disconnected after death, triggering reconnection...');
            clearTimeout(respawnTimeout);
            this.handleReconnect();
          }
        } catch (error) {
          console.error('[BOT] Error during respawn attempt:', error);
          this.logEvent('respawn_error', { error: error.message });
          clearTimeout(respawnTimeout);
          // If respawn fails, try to reconnect
          this.handleReconnect();
        }
      }, 1000);
    });

    this.bot.on('kicked', (reason) => {
      this.logEvent('kicked', { reason });
    });

    this.bot.on('error', (err) => {
      console.error('[BOT] Error occurred:', err);
      this.logEvent('error', { message: err.message });
      
      // If error occurs right after death, it might be the digging plugin bug
      if (err.message && (err.message.includes('removeAllListeners') || err.message.includes('undefined is not an object'))) {
        console.log('[BOT] Caught digging plugin cleanup error, attempting recovery...');
        this.handleReconnect();
      }
    });

    this.bot.on('entitySpawn', (entity) => {
      if (entity.type === 'player' || entity.type === 'mob') {
        this.logEvent('entitySpawn', { 
          type: entity.type, 
          name: entity.name || entity.displayName,
          position: entity.position 
        });
      }
    });

    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot.entity) {
        this.logEvent('hurt', { 
          health: this.bot.health,
          position: this.bot.entity.position 
        });
      }
    });

    this.bot.on('physicsTick', () => {
      const nearbyBlocks = this.bot.findBlocks({
        matching: (block) => block.name !== 'air',
        maxDistance: 2,
        count: 10
      });
      if (nearbyBlocks.length > 0) {
        this.lastNearbyBlocks = nearbyBlocks;
      }
    });
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', botConnected: this.bot !== null && this.bot.player !== null });
    });

    this.app.post('/reconnect', (req, res) => {
      if (this.isReconnecting) {
        return res.status(400).json({ error: 'Reconnection already in progress' });
      }
      
      console.log('[API] Manual reconnection requested');
      this.handleReconnect();
      res.json({ success: true, message: 'Reconnection initiated' });
    });

    this.app.get('/state', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      // Helper function to get compass direction from yaw
      function getCompassDirection(yaw) {
        // Convert yaw to degrees (0-360)
        let degrees = (yaw * 180 / Math.PI + 180) % 360;
        if (degrees < 0) degrees += 360;
        
        // Determine compass direction
        const directions = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
        const index = Math.round(degrees / 45) % 8;
        return directions[index];
      }
      
      // Helper function to get pitch description
      function getPitchDescription(pitch) {
        const degrees = pitch * 180 / Math.PI;
        if (degrees < -45) return 'looking up';
        if (degrees > 45) return 'looking down';
        if (degrees < -15) return 'looking slightly up';
        if (degrees > 15) return 'looking slightly down';
        return 'looking straight';
      }
      
      // Get block the bot is standing on
      const Vec3 = require('vec3');
      const blockUnder = this.bot.blockAt(this.bot.entity.position.offset(0, -0.5, 0));
      
      const state = {
        position: {
          x: this.bot.entity.position.x,
          y: this.bot.entity.position.y,
          z: this.bot.entity.position.z,
          formatted: `X: ${Math.floor(this.bot.entity.position.x)}, Y: ${Math.floor(this.bot.entity.position.y)}, Z: ${Math.floor(this.bot.entity.position.z)}`
        },
        orientation: {
          yaw: this.bot.entity.yaw,
          pitch: this.bot.entity.pitch,
          compass_direction: getCompassDirection(this.bot.entity.yaw),
          pitch_description: getPitchDescription(this.bot.entity.pitch),
          yaw_degrees: Math.round((this.bot.entity.yaw * 180 / Math.PI + 180) % 360),
          pitch_degrees: Math.round(this.bot.entity.pitch * 180 / Math.PI),
          description: `Facing ${getCompassDirection(this.bot.entity.yaw)}, ${getPitchDescription(this.bot.entity.pitch)}`
        },
        health: {
          current: this.bot.health,
          max: 20,
          percentage: Math.round(this.bot.health / 20 * 100),
          status: this.bot.health >= 15 ? 'Healthy' : this.bot.health >= 10 ? 'Moderate' : this.bot.health >= 5 ? 'Low' : 'Critical'
        },
        food: {
          current: this.bot.food,
          max: 20,
          percentage: Math.round(this.bot.food / 20 * 100),
          status: this.bot.food >= 18 ? 'Full' : this.bot.food >= 14 ? 'Satisfied' : this.bot.food >= 7 ? 'Hungry' : 'Starving'
        },
        oxygen: {
          current: this.bot.oxygenLevel,
          max: 20,
          status: this.bot.oxygenLevel === 20 ? 'Full' : 'Depleting'
        },
        environment: {
          on_ground: this.bot.entity.onGround,
          block_under: blockUnder ? blockUnder.name : 'air',
          game_mode: this.bot.game.gameMode,
          dimension: this.bot.game.dimension,
          is_raining: this.bot.isRaining,
          time_of_day: this.bot.time.isDay ? 'Day' : 'Night',
          light_level: this.bot.blockAt(this.bot.entity.position) ? this.bot.blockAt(this.bot.entity.position).light : 'unknown'
        },
        velocity: {
          x: this.bot.entity.velocity.x,
          y: this.bot.entity.velocity.y,
          z: this.bot.entity.velocity.z,
          speed: Math.sqrt(
            this.bot.entity.velocity.x ** 2 + 
            this.bot.entity.velocity.z ** 2
          ).toFixed(3),
          is_moving: Math.abs(this.bot.entity.velocity.x) > 0.01 || 
                    Math.abs(this.bot.entity.velocity.z) > 0.01 ||
                    Math.abs(this.bot.entity.velocity.y) > 0.01
        }
      };

      res.json(state);
    });

    this.app.get('/inventory', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const items = this.bot.inventory.items().map(item => ({
        name: item.name,
        count: item.count,
        slot: item.slot,
        displayName: item.displayName
      }));

      res.json({ items });
    });

    this.app.get('/entities', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const entities = Object.values(this.bot.entities)
        .filter(e => e.type === 'player' || e.type === 'mob')
        .map(e => ({
          type: e.type,
          name: e.name || e.displayName,
          position: e.position,
          health: e.metadata?.[8],
          distance: this.bot.entity.position.distanceTo(e.position)
        }));

      res.json({ entities });
    });

    this.app.get('/events', (req, res) => {
      const since = parseInt(req.query.since) || 0;
      const filteredEvents = this.events.filter(event => event.timestamp > since);
      res.json({ events: filteredEvents });
    });

    this.app.get('/screenshot', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      try {
        const screenshot = await this.captureScreenshot();
        res.json({ screenshot });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/chat', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message required' });
      }

      this.bot.chat(message);
      res.json({ success: true });
    });

    this.app.post('/move', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z, sprint, relative } = req.body;
      
      // Handle relative movement
      if (relative) {
        const { forward, backward, left, right, up, down } = relative;
        const Vec3 = require('vec3');
        
        // Clear any existing movement states first
        this.bot.clearControlStates();
        
        // Calculate target position based on bot's current orientation
        let targetPosition = this.bot.entity.position.clone();
        
        // Get the bot's looking direction
        const yaw = this.bot.entity.yaw;
        
        // Calculate movement vector based on yaw
        if (forward > 0 || backward > 0) {
          const distance = forward > 0 ? forward : -backward;
          targetPosition.x += -Math.sin(yaw) * distance;
          targetPosition.z += Math.cos(yaw) * distance;
        }
        
        if (left > 0 || right > 0) {
          const distance = right > 0 ? right : -left;
          // Strafe perpendicular to looking direction
          targetPosition.x += Math.cos(yaw) * distance;
          targetPosition.z += Math.sin(yaw) * distance;
        }
        
        if (up > 0 || down > 0) {
          targetPosition.y += up > 0 ? up : -down;
        }
        
        // Enable sprint if requested
        if (sprint) this.bot.setControlState('sprint', true);
        
        // Use pathfinding for accurate movement
        try {
          await this.bot.pathfinder.goto(new require('mineflayer-pathfinder').goals.GoalNear(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z,
            0
          ));
          res.json({ 
            success: true, 
            moved_to: {
              x: Math.floor(targetPosition.x),
              y: Math.floor(targetPosition.y),
              z: Math.floor(targetPosition.z)
            },
            from: {
              x: Math.floor(this.bot.entity.position.x),
              y: Math.floor(this.bot.entity.position.y),
              z: Math.floor(this.bot.entity.position.z)
            }
          });
        } catch (error) {
          // Fallback to simple movement if pathfinding fails
          const timeout = Math.max(1000, Math.abs(forward || backward || left || right || 0) * 250);
          
          // Set control states for movement
          if (forward > 0) this.bot.setControlState('forward', true);
          if (backward > 0) this.bot.setControlState('back', true);
          if (left > 0) this.bot.setControlState('left', true);
          if (right > 0) this.bot.setControlState('right', true);
          if (up > 0) this.bot.setControlState('jump', true);
          
          // Wait for movement then stop
          setTimeout(() => {
            this.bot.clearControlStates();
          }, timeout);
          
          res.json({ 
            success: true, 
            method: 'simple_movement',
            duration_ms: timeout
          });
        }
      } else {
        // Original absolute movement
        if (x !== undefined) this.bot.setControlState('forward', x > 0);
        if (x !== undefined) this.bot.setControlState('back', x < 0);
        if (z !== undefined) this.bot.setControlState('left', z < 0);
        if (z !== undefined) this.bot.setControlState('right', z > 0);
        if (y !== undefined && y > 0) this.bot.setControlState('jump', true);
        if (sprint !== undefined) this.bot.setControlState('sprint', sprint);
        
        res.json({ success: true });
      }
    });

    this.app.post('/stop', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      this.bot.clearControlStates();
      res.json({ success: true });
    });

    this.app.post('/look', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { yaw, pitch, relative, cardinal } = req.body;
      
      // Handle relative turn
      if (relative) {
        const { yaw_delta, pitch_delta } = relative;
        const currentYaw = this.bot.entity.yaw;
        const currentPitch = this.bot.entity.pitch;
        
        // Convert degrees to radians and apply
        const newYaw = currentYaw + (yaw_delta || 0) * Math.PI / 180;
        const newPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, 
          currentPitch + (pitch_delta || 0) * Math.PI / 180));
        
        this.bot.look(newYaw, newPitch, true);
        res.json({ 
          success: true,
          turned: {
            yaw_degrees: yaw_delta || 0,
            pitch_degrees: pitch_delta || 0
          },
          new_orientation: {
            yaw: newYaw,
            pitch: newPitch,
            yaw_degrees: Math.round((newYaw * 180 / Math.PI + 180) % 360),
            pitch_degrees: Math.round(newPitch * 180 / Math.PI)
          }
        });
      }
      // Handle cardinal direction
      else if (cardinal) {
        let targetYaw;
        switch(cardinal.toLowerCase()) {
          case 'north':
            targetYaw = Math.PI;  // Facing negative Z
            break;
          case 'south':
            targetYaw = 0;  // Facing positive Z
            break;
          case 'east':
            targetYaw = -Math.PI/2;  // Facing positive X
            break;
          case 'west':
            targetYaw = Math.PI/2;  // Facing negative X
            break;
          default:
            return res.status(400).json({ error: 'Invalid cardinal direction' });
        }
        
        this.bot.look(targetYaw, 0, true);  // Look straight at horizon
        res.json({ 
          success: true,
          direction: cardinal,
          new_orientation: {
            yaw: targetYaw,
            pitch: 0,
            yaw_degrees: Math.round((targetYaw * 180 / Math.PI + 180) % 360)
          }
        });
      }
      // Handle absolute look
      else if (yaw !== undefined && pitch !== undefined) {
        this.bot.look(yaw, pitch, true);
        res.json({ 
          success: true,
          new_orientation: {
            yaw: yaw,
            pitch: pitch,
            yaw_degrees: Math.round((yaw * 180 / Math.PI + 180) % 360),
            pitch_degrees: Math.round(pitch * 180 / Math.PI)
          }
        });
      } else {
        res.status(400).json({ error: 'Provide yaw/pitch, relative turn, or cardinal direction' });
      }
    });

    this.app.post('/dig', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z } = req.body;
      
      if (x === undefined || y === undefined || z === undefined) {
        return res.status(400).json({ error: 'x, y, z coordinates required' });
      }

      try {
        const block = this.bot.blockAt(new (require('vec3'))(x, y, z));
        if (block) {
          await this.bot.dig(block);
          res.json({ success: true, block: block.name });
        } else {
          res.status(400).json({ error: 'No block at position' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/place', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z, blockName } = req.body;
      
      if (x === undefined || y === undefined || z === undefined || !blockName) {
        return res.status(400).json({ error: 'x, y, z coordinates and blockName required' });
      }

      try {
        const item = this.bot.inventory.items().find(i => i.name === blockName);
        if (!item) {
          return res.status(400).json({ error: `No ${blockName} in inventory` });
        }

        await this.bot.equip(item, 'hand');
        const referenceBlock = this.bot.blockAt(new (require('vec3'))(x, y, z));
        
        if (!referenceBlock || referenceBlock.name === 'air') {
          return res.status(400).json({ 
            error: 'Cannot place block: reference block must be a solid block, not air or empty space' 
          });
        }

        await this.bot.placeBlock(referenceBlock, new (require('vec3'))(0, 1, 0));
        
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/attack', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { entityId } = req.body;
      
      if (!entityId) {
        return res.status(400).json({ error: 'entityId required' });
      }

      const entity = this.bot.entities[entityId];
      if (entity) {
        this.bot.attack(entity);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Entity not found' });
      }
    });

    this.app.get('/recipes', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item } = req.query;
      
      if (item) {
        const recipes = this.bot.recipesFor(parseInt(item) || this.bot.registry.itemsByName[item]?.id);
        res.json({ 
          recipes: recipes ? recipes.map(r => ({
            result: r.result,
            inShape: r.inShape,
            outShape: r.outShape,
            ingredients: r.ingredients
          })) : []
        });
      } else {
        const allRecipes = this.bot.recipesAll();
        res.json({ 
          count: allRecipes.length,
          message: 'Use ?item=<name> to get recipes for specific item'
        });
      }
    });

    this.app.post('/craft', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item, count = 1, craftingTable = false } = req.body;
      
      if (!item) {
        return res.status(400).json({ error: 'item name required' });
      }

      try {
        const itemId = this.bot.registry.itemsByName[item]?.id;
        if (!itemId) {
          return res.status(400).json({ error: `Unknown item: ${item}` });
        }

        const recipes = this.bot.recipesFor(itemId, null, 1, craftingTable);
        if (!recipes || recipes.length === 0) {
          return res.status(400).json({ error: `No recipes available for ${item}` });
        }

        const recipe = recipes[0];

        if (recipe.requiresTable && !craftingTable) {
          const craftingTableBlock = this.bot.findBlock({
            matching: this.bot.registry.blocksByName.crafting_table?.id,
            maxDistance: 6
          });

          if (!craftingTableBlock) {
            return res.status(400).json({ 
              error: 'Recipe requires crafting table but none found nearby' 
            });
          }

          await this.bot.craft(recipe, count, craftingTableBlock);
        } else {
          await this.bot.craft(recipe, count, null);
        }

        res.json({ 
          success: true, 
          crafted: item,
          count: count
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/equip', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { item, destination = 'hand' } = req.body;
      
      if (!item) {
        return res.status(400).json({ error: 'item name required' });
      }

      try {
        const itemToEquip = this.bot.inventory.items().find(i => i.name === item);
        if (!itemToEquip) {
          return res.status(400).json({ error: `No ${item} in inventory` });
        }

        await this.bot.equip(itemToEquip, destination);
        res.json({ success: true, equipped: item, destination });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/batch', async (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { instructions, stopOnError = true } = req.body;
      
      if (!instructions || !Array.isArray(instructions)) {
        return res.status(400).json({ error: 'instructions array required' });
      }

      const results = [];
      
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        const result = {
          index: i,
          instruction: instruction,
          success: false,
          response: null,
          error: null
        };

        try {
          const response = await this.executeInstruction(instruction);
          result.success = true;
          result.response = response;
          this.logEvent('batch_instruction', { 
            index: i, 
            type: instruction.type,
            success: true 
          });
        } catch (error) {
          result.error = error.message;
          this.logEvent('batch_instruction', { 
            index: i, 
            type: instruction.type,
            success: false,
            error: error.message 
          });
          
          if (stopOnError) {
            results.push(result);
            return res.json({
              completed: i + 1,
              total: instructions.length,
              stopped: true,
              results
            });
          }
        }
        
        results.push(result);
        
        // Add delay between instructions to prevent overwhelming the bot
        if (instruction.delay) {
          await new Promise(resolve => setTimeout(resolve, instruction.delay));
        } else if (i < instructions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      res.json({
        completed: instructions.length,
        total: instructions.length,
        stopped: false,
        results
      });
    });

    // Program execution endpoints
    this.app.post('/program/exec', async (req, res) => {
      try {
        const { source, capabilities = [], args = {}, timeout = 900000, seed = 1 } = req.body;
        
        if (!this.isConnected()) {
          return res.status(503).json({
            success: false,
            error: 'Bot is not connected to server'
          });
        }
        
        const ProgramRunner = require('./program-system/runner');
        const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const runner = new ProgramRunner(this, {
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
        const registry = new ProgramRegistry(this.configManager);
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
        const registry = new ProgramRegistry(this.configManager);
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
        const registry = new ProgramRegistry(this.configManager);
        await registry.initStorage();
        
        await registry.remove(req.params.name);
        res.json({ success: true, message: `Program '${req.params.name}' removed successfully` });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });
  }

  async executeInstruction(instruction) {
    const { type, params = {} } = instruction;
    
    switch (type) {
      case 'move': {
        const { x, y, z, sprint, relative } = params;
        
        // Handle relative movement
        if (relative) {
          const { forward, backward, left, right, up, down } = relative;
          const Vec3 = require('vec3');
          
          // Clear any existing movement states first
          this.bot.clearControlStates();
          
          // Calculate target position based on bot's current orientation
          let targetPosition = this.bot.entity.position.clone();
          
          // Get the bot's looking direction
          const yaw = this.bot.entity.yaw;
          
          // Calculate movement vector based on yaw
          if (forward > 0 || backward > 0) {
            const distance = forward > 0 ? forward : -backward;
            targetPosition.x += -Math.sin(yaw) * distance;
            targetPosition.z += Math.cos(yaw) * distance;
          }
          
          if (left > 0 || right > 0) {
            const distance = right > 0 ? right : -left;
            // Strafe perpendicular to looking direction
            targetPosition.x += Math.cos(yaw) * distance;
            targetPosition.z += Math.sin(yaw) * distance;
          }
          
          if (up > 0 || down > 0) {
            targetPosition.y += up > 0 ? up : -down;
          }
          
          // Enable sprint if requested
          if (sprint) this.bot.setControlState('sprint', true);
          
          // Try pathfinding for accurate movement
          try {
            await this.bot.pathfinder.goto(new require('mineflayer-pathfinder').goals.GoalNear(
              targetPosition.x,
              targetPosition.y,
              targetPosition.z,
              0
            ));
            return { 
              moved: true, 
              moved_to: {
                x: Math.floor(targetPosition.x),
                y: Math.floor(targetPosition.y),
                z: Math.floor(targetPosition.z)
              }
            };
          } catch (error) {
            // Fallback to simple movement if pathfinding fails
            const timeout = Math.max(1000, Math.abs(forward || backward || left || right || 0) * 250);
            
            // Set control states for movement
            if (forward > 0) this.bot.setControlState('forward', true);
            if (backward > 0) this.bot.setControlState('back', true);
            if (left > 0) this.bot.setControlState('left', true);
            if (right > 0) this.bot.setControlState('right', true);
            if (up > 0) this.bot.setControlState('jump', true);
            
            // Wait for movement then stop
            await new Promise(resolve => setTimeout(resolve, timeout));
            this.bot.clearControlStates();
            
            return { 
              moved: true, 
              method: 'simple_movement',
              duration_ms: timeout
            };
          }
        } else {
          // Original absolute movement
          if (x !== undefined) this.bot.setControlState('forward', x > 0);
          if (x !== undefined) this.bot.setControlState('back', x < 0);
          if (z !== undefined) this.bot.setControlState('left', z < 0);
          if (z !== undefined) this.bot.setControlState('right', z > 0);
          if (y !== undefined && y > 0) this.bot.setControlState('jump', true);
          if (sprint !== undefined) this.bot.setControlState('sprint', sprint);
          return { moved: true };
        }
      }
        
      case 'stop':
        this.bot.clearControlStates();
        return { stopped: true };
        
      case 'look': {
        const { yaw, pitch, relative, cardinal } = params;
        
        // Handle relative turn
        if (relative) {
          const { yaw_delta, pitch_delta } = relative;
          const currentYaw = this.bot.entity.yaw;
          const currentPitch = this.bot.entity.pitch;
          
          // Convert degrees to radians and apply
          const newYaw = currentYaw + (yaw_delta || 0) * Math.PI / 180;
          const newPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, 
            currentPitch + (pitch_delta || 0) * Math.PI / 180));
          
          this.bot.look(newYaw, newPitch, true);
          return { 
            looked: true,
            turned: {
              yaw_degrees: yaw_delta || 0,
              pitch_degrees: pitch_delta || 0
            }
          };
        }
        // Handle cardinal direction
        else if (cardinal) {
          let targetYaw;
          switch(cardinal.toLowerCase()) {
            case 'north':
              targetYaw = Math.PI;
              break;
            case 'south':
              targetYaw = 0;
              break;
            case 'east':
              targetYaw = -Math.PI/2;
              break;
            case 'west':
              targetYaw = Math.PI/2;
              break;
            default:
              throw new Error('Invalid cardinal direction');
          }
          
          this.bot.look(targetYaw, 0, true);
          return { looked: true, direction: cardinal };
        }
        // Handle absolute look
        else if (yaw !== undefined && pitch !== undefined) {
          this.bot.look(yaw, pitch, true);
          return { looked: true };
        }
        throw new Error('Provide yaw/pitch, relative turn, or cardinal direction');
      }
        
      case 'chat':
        if (!params.message) throw new Error('message required');
        this.bot.chat(params.message);
        return { sent: true };
        
      case 'dig':
        const Vec3 = require('vec3');
        if (params.x === undefined || params.y === undefined || params.z === undefined) {
          throw new Error('x, y, z coordinates required');
        }
        const blockToDig = this.bot.blockAt(new Vec3(params.x, params.y, params.z));
        if (!blockToDig) throw new Error('No block at position');
        await this.bot.dig(blockToDig);
        return { dug: true, block: blockToDig.name };
        
      case 'place':
        if (params.x === undefined || params.y === undefined || params.z === undefined || !params.blockName) {
          throw new Error('x, y, z coordinates and blockName required');
        }
        const itemToPlace = this.bot.inventory.items().find(i => i.name === params.blockName);
        if (!itemToPlace) throw new Error(`No ${params.blockName} in inventory`);
        
        await this.bot.equip(itemToPlace, 'hand');
        const refBlock = this.bot.blockAt(new Vec3(params.x, params.y, params.z));
        if (!refBlock || refBlock.name === 'air') {
          throw new Error('Cannot place block: reference block must be solid');
        }
        await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
        return { placed: true };
        
      case 'craft':
        const { item, count = 1, craftingTable = false } = params;
        if (!item) throw new Error('item name required');
        
        const itemId = this.bot.registry.itemsByName[item]?.id;
        if (!itemId) throw new Error(`Unknown item: ${item}`);
        
        const recipes = this.bot.recipesFor(itemId, null, 1, craftingTable);
        if (!recipes || recipes.length === 0) {
          throw new Error(`No recipes available for ${item}`);
        }
        
        const recipe = recipes[0];
        if (recipe.requiresTable && !craftingTable) {
          const table = this.bot.findBlock({
            matching: this.bot.registry.blocksByName.crafting_table?.id,
            maxDistance: 6
          });
          if (!table) throw new Error('Recipe requires crafting table but none found nearby');
          await this.bot.craft(recipe, count, table);
        } else {
          await this.bot.craft(recipe, count, null);
        }
        return { crafted: item, count };
        
      case 'equip':
        if (!params.item) throw new Error('item name required');
        const itemToEquip = this.bot.inventory.items().find(i => i.name === params.item);
        if (!itemToEquip) throw new Error(`No ${params.item} in inventory`);
        await this.bot.equip(itemToEquip, params.destination || 'hand');
        return { equipped: params.item };
        
      case 'wait':
        const duration = params.duration || 1000;
        await new Promise(resolve => setTimeout(resolve, duration));
        return { waited: duration };
        
      case 'goto':
        if (params.x === undefined || params.y === undefined || params.z === undefined) {
          throw new Error('x, y, z coordinates required');
        }
        const goal = new Vec3(params.x, params.y, params.z);
        const distance = this.bot.entity.position.distanceTo(goal);
        if (distance > 100) {
          throw new Error('Target too far away (max 100 blocks)');
        }
        // Simple movement toward goal
        const dx = params.x - this.bot.entity.position.x;
        const dz = params.z - this.bot.entity.position.z;
        this.bot.setControlState('forward', dx > 0.5 || dz > 0.5);
        await new Promise(resolve => setTimeout(resolve, Math.min(distance * 100, 5000)));
        this.bot.clearControlStates();
        return { moved_toward: goal };
        
      default:
        throw new Error(`Unknown instruction type: ${type}`);
    }
  }

  async captureScreenshot() {
    if (!this.bot) {
      throw new Error('Bot not connected');
    }

    // Dynamically import canvas only when screenshot is requested
    let createCanvas;
    try {
      const canvasModule = await import('canvas');
      createCanvas = canvasModule.createCanvas;
    } catch (error) {
      throw new Error('Canvas module not available (missing native library dependencies): ' + error.message);
    }

    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#000000';
    ctx.font = '20px Arial';
    ctx.fillText('Minecraft Bot View', 20, 40);
    ctx.font = '16px Arial';

    const pos = this.bot.entity.position;
    const yaw = this.bot.entity.yaw;
    const pitch = this.bot.entity.pitch;

    ctx.fillText(`Position: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`, 20, 80);
    ctx.fillText(`Yaw: ${yaw.toFixed(2)}, Pitch: ${pitch.toFixed(2)}`, 20, 110);
    ctx.fillText(`Health: ${this.bot.health}/20, Food: ${this.bot.food}/20`, 20, 140);

    const blockSize = 20;
    const renderRadius = 8;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);

    const Vec3 = require('vec3');

    for (let dx = -renderRadius; dx <= renderRadius; dx++) {
      for (let dz = -renderRadius; dz <= renderRadius; dz++) {
        const worldX = Math.floor(pos.x) + dx;
        const worldZ = Math.floor(pos.z) + dz;
        
        let block = null;
        for (let dy = 0; dy >= -5; dy--) {
          const worldY = Math.floor(pos.y) + dy;
          const testBlock = this.bot.blockAt(new Vec3(worldX, worldY, worldZ));
          if (testBlock && testBlock.name !== 'air') {
            block = testBlock;
            break;
          }
        }
        
        if (block) {
          const screenX = dx * blockSize;
          const screenY = dz * blockSize;
          
          const blockColors = {
            'grass_block': '#7CBD6B',
            'grass': '#7CBD6B',
            'dirt': '#8B6914',
            'stone': '#808080',
            'cobblestone': '#7F7F7F',
            'wood': '#8B4513',
            'oak_log': '#8B4513',
            'oak_planks': '#C19A6B',
            'sand': '#F4A460',
            'gravel': '#888888',
            'water': '#1E90FF',
            'lava': '#FF4500',
            'coal_ore': '#2F2F2F',
            'iron_ore': '#CD853F',
            'gold_ore': '#FFD700',
            'diamond_ore': '#00CED1',
            'bedrock': '#000000',
            'snow': '#FFFFFF',
            'ice': '#B0E0E6',
            'clay': '#A0A0A0'
          };
          
          ctx.fillStyle = blockColors[block.name] || '#666666';
          ctx.fillRect(screenX - blockSize/2, screenY - blockSize/2, blockSize, blockSize);
          ctx.strokeStyle = '#000000';
          ctx.strokeRect(screenX - blockSize/2, screenY - blockSize/2, blockSize, blockSize);
        }
      }
    }

    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    const dirX = Math.sin(yaw) * 20;
    const dirZ = -Math.cos(yaw) * 20;
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dirX, dirZ);
    ctx.stroke();

    ctx.restore();

    const entities = Object.values(this.bot.entities)
      .filter(e => (e.type === 'player' || e.type === 'mob') && e !== this.bot.entity)
      .slice(0, 10);

    let y = height - 150;
    ctx.fillStyle = '#000000';
    ctx.font = '14px Arial';
    ctx.fillText('Nearby Entities:', 20, y);
    y += 20;
    
    entities.forEach(entity => {
      const dist = pos.distanceTo(entity.position);
      const name = entity.name || entity.displayName || entity.type;
      ctx.fillText(`  ${name} - ${dist.toFixed(1)}m`, 20, y);
      y += 18;
    });

    const buffer = canvas.toBuffer('image/png');
    return buffer.toString('base64');
  }

  start(botConfig, port = 3000) {
    this.setupBot(botConfig);
    
    this.app.listen(port, () => {
      console.log(`Bot server listening on port ${port}`);
      console.log(`Connecting to Minecraft server: ${botConfig.host}:${botConfig.port}`);
    });
  }
}

module.exports = MinecraftBotServer;
