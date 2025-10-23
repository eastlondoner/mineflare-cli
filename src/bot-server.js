const mineflayer = require('mineflayer');
const express = require('express');

class MinecraftBotServer {
  constructor() {
    this.bot = null;
    this.events = [];
    this.app = express();
    this.viewer = null;
    
    this.app.use(express.json());
    this.setupRoutes();
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

  setupBot(config) {
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
    });

    this.bot.on('kicked', (reason) => {
      this.logEvent('kicked', { reason });
    });

    this.bot.on('error', (err) => {
      this.logEvent('error', { message: err.message });
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

    this.app.get('/state', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const state = {
        position: this.bot.entity.position,
        health: this.bot.health,
        food: this.bot.food,
        oxygen: this.bot.oxygenLevel,
        yaw: this.bot.entity.yaw,
        pitch: this.bot.entity.pitch,
        onGround: this.bot.entity.onGround,
        gameMode: this.bot.game.gameMode,
        dimension: this.bot.game.dimension
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

    this.app.post('/move', (req, res) => {
      if (!this.bot) {
        return res.status(400).json({ error: 'Bot not connected' });
      }

      const { x, y, z, sprint } = req.body;
      
      if (x !== undefined) this.bot.setControlState('forward', x > 0);
      if (x !== undefined) this.bot.setControlState('back', x < 0);
      if (z !== undefined) this.bot.setControlState('left', z < 0);
      if (z !== undefined) this.bot.setControlState('right', z > 0);
      if (y !== undefined && y > 0) this.bot.setControlState('jump', true);
      if (sprint !== undefined) this.bot.setControlState('sprint', sprint);

      res.json({ success: true });
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

      const { yaw, pitch } = req.body;
      
      if (yaw !== undefined && pitch !== undefined) {
        this.bot.look(yaw, pitch, true);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'yaw and pitch required' });
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
  }

  async executeInstruction(instruction) {
    const { type, params = {} } = instruction;
    
    switch (type) {
      case 'move':
        const { x, y, z, sprint } = params;
        if (x !== undefined) this.bot.setControlState('forward', x > 0);
        if (x !== undefined) this.bot.setControlState('back', x < 0);
        if (z !== undefined) this.bot.setControlState('left', z < 0);
        if (z !== undefined) this.bot.setControlState('right', z > 0);
        if (y !== undefined && y > 0) this.bot.setControlState('jump', true);
        if (sprint !== undefined) this.bot.setControlState('sprint', sprint);
        return { moved: true };
        
      case 'stop':
        this.bot.clearControlStates();
        return { stopped: true };
        
      case 'look':
        const { yaw, pitch } = params;
        if (yaw !== undefined && pitch !== undefined) {
          this.bot.look(yaw, pitch, true);
          return { looked: true };
        }
        throw new Error('yaw and pitch required');
        
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
