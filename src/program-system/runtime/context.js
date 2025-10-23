const { Vec3, BotState, ProgramError, ErrorCode } = require('../sdk/types');
const OperationBudget = require('./budget');

// Import new SDK utilities
const flowUtils = require('../sdk/flow');
const movementUtils = require('../sdk/movement');
const safetyUtils = require('../sdk/safety');
const watcherUtils = require('../sdk/watchers');
const searchUtils = require('../sdk/search');
const geometryUtils = require('../sdk/geometry');

class ContextBuilder {
  constructor(botServer, capabilities, args, options = {}) {
    this.botServer = botServer;
    this.capabilities = new Set(capabilities);
    this.args = args;
    this.budget = new OperationBudget(capabilities);
    this.seed = options.seed || 1;
    this.cancelToken = {
      isCancelled: false,
      callbacks: []
    };
    this.logs = [];
  }
  
  build() {
    const ctx = {
      args: this.args,
      capabilities: [...this.capabilities],
      bot: this.buildBotAPI(),
      world: this.buildWorldAPI(),
      actions: this.buildActionsAPI(),
      events: this.buildEventsAPI(),
      control: this.buildControlAPI(),
      log: this.buildLoggerAPI(),
      clock: this.buildClockAPI(),
      
      // Add new SDK utilities
      flow: this.buildFlowAPI(),
      move: this.buildMovementAPI(),
      safety: this.buildSafetyAPI(),
      watch: this.buildWatcherAPI(),
      search: this.buildSearchAPI(),
      geometry: this.buildGeometryAPI()
    };
    
    return ctx;
  }
  
  buildBotAPI() {
    return {
      getState: async () => {
        if (!this.botServer.bot) {
          throw new ProgramError(
            ErrorCode.BOT_DISCONNECTED,
            'Bot is not connected'
          );
        }
        
        const entity = this.botServer.bot.entity;
        return new BotState({
          position: entity.position,
          yaw: entity.yaw,
          pitch: entity.pitch,
          health: this.botServer.bot.health,
          food: this.botServer.bot.food,
          oxygen: this.botServer.bot.oxygen,
          onGround: entity.onGround,
          inWater: entity.isInWater,
          inLava: entity.isInLava
        });
      }
    };
  }
  
  buildWorldAPI() {
    const world = {};
    
    // Block scanning
    world.scan = {
      blocks: async ({ kinds, radius, max = 100 }) => {
        if (!this.botServer.bot) {
          throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
        }
        
        const results = [];
        const position = this.botServer.bot.entity.position;
        const radiusSq = radius * radius;
        
        // Scan blocks around the bot
        for (let x = -radius; x <= radius; x++) {
          for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
              if (x*x + y*y + z*z > radiusSq) continue;
              
              const pos = position.offset(x, y, z);
              const block = this.botServer.bot.blockAt(pos);
              
              if (block && kinds.includes(block.name)) {
                results.push({
                  position: new Vec3(pos.x, pos.y, pos.z),
                  name: block.name,
                  hardness: block.hardness
                });
                
                if (results.length >= max) {
                  return results;
                }
              }
            }
          }
        }
        
        return results;
      },
      
      lineOfSight: async ({ target, maxSteps = 100 }) => {
        if (!this.botServer.bot) {
          throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
        }
        
        const start = this.botServer.bot.entity.position;
        const direction = new Vec3(
          target.x - start.x,
          target.y - start.y,
          target.z - start.z
        );
        
        const length = Math.sqrt(
          direction.x * direction.x + 
          direction.y * direction.y + 
          direction.z * direction.z
        );
        
        // Normalize direction
        direction.x /= length;
        direction.y /= length;
        direction.z /= length;
        
        // Step along the ray
        for (let step = 0; step < maxSteps && step < length; step++) {
          const pos = new Vec3(
            start.x + direction.x * step,
            start.y + direction.y * step,
            start.z + direction.z * step
          );
          
          const block = this.botServer.bot.blockAt(pos);
          if (block && block.name !== 'air') {
            return false;
          }
        }
        
        return true;
      }
    };
    
    // World information
    world.seaLevel = () => 63; // Standard sea level in Minecraft
    
    world.time = async () => {
      if (!this.botServer.bot) {
        throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
      }
      
      const time = this.botServer.bot.time.timeOfDay;
      const isDay = time >= 0 && time < 12000;
      
      return {
        dayTime: time,
        isDay
      };
    };
    
    return world;
  }
  
  buildActionsAPI() {
    const actions = {};
    
    // Navigation actions
    if (this.capabilities.has('move') || this.capabilities.has('pathfind')) {
      actions.navigate = {
        goto: async (target, opts = {}) => {
          this.budget.check('move');
          
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          try {
            const result = await this.botServer.executeInstruction({
              type: 'goto',
              params: {
                x: target.x,
                y: target.y,
                z: target.z,
                timeout: opts.timeoutMs || 30000
              }
            });
            
            return result;
          } catch (error) {
            throw new ProgramError(
              ErrorCode.PATHFIND,
              `Failed to navigate to target: ${error.message}`
            );
          }
        },
        
        stop: async () => {
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          return await this.botServer.executeInstruction({
            type: 'stop'
          });
        }
      };
    }
    
    // Mining/gathering actions
    if (this.capabilities.has('dig')) {
      actions.gather = {
        mineBlock: async ({ position, expect, timeoutMs = 10000 }) => {
          this.budget.check('dig');
          
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          try {
            // Check if block matches expectation
            if (expect) {
              const block = this.botServer.bot.blockAt(position);
              if (!block || !block.name.includes(expect)) {
                throw new ProgramError(
                  ErrorCode.PRECONDITION,
                  `Expected block containing '${expect}' but found '${block?.name || 'air'}'`
                );
              }
            }
            
            const result = await this.botServer.executeInstruction({
              type: 'dig',
              params: {
                x: position.x,
                y: position.y,
                z: position.z
              }
            });
            
            return result;
          } catch (error) {
            if (error instanceof ProgramError) throw error;
            
            throw new ProgramError(
              ErrorCode.OPERATION_FAILED,
              `Failed to mine block: ${error.message}`
            );
          }
        }
      };
    }
    
    // Crafting actions
    if (this.capabilities.has('craft')) {
      actions.craft = {
        craft: async (recipe, count = 1) => {
          this.budget.check('craft');
          
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          try {
            const result = await this.botServer.executeInstruction({
              type: 'craft',
              params: {
                item: recipe,
                count: count
              }
            });
            
            return result;
          } catch (error) {
            throw new ProgramError(
              ErrorCode.OPERATION_FAILED,
              `Failed to craft ${recipe}: ${error.message}`
            );
          }
        },
        
        ensureCraftingTable: async () => {
          this.budget.check('craft');
          
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          // Check inventory for crafting table
          const inventory = this.botServer.bot.inventory.items();
          const hasTable = inventory.some(item => item.name === 'crafting_table');
          
          if (!hasTable) {
            // Craft a crafting table
            await this.craft('crafting_table', 1);
          }
          
          // Find a place to put it
          if (this.capabilities.has('place')) {
            const position = this.botServer.bot.entity.position;
            const nearbyPos = new Vec3(
              Math.floor(position.x) + 1,
              Math.floor(position.y),
              Math.floor(position.z)
            );
            
            await this.botServer.executeInstruction({
              type: 'place',
              params: {
                x: nearbyPos.x,
                y: nearbyPos.y,
                z: nearbyPos.z,
                block: 'crafting_table'
              }
            });
          }
          
          return { success: true };
        }
      };
    }
    
    // Inventory actions
    if (this.capabilities.has('inventory')) {
      actions.inventory = {
        get: async () => {
          if (!this.botServer.bot) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }
          
          const items = this.botServer.bot.inventory.items();
          return items.map(item => ({
            id: item.type,
            name: item.name,
            count: item.count,
            metadata: item.metadata
          }));
        },
        
        requireBlocks: async ({ count, allowGather }) => {
          this.budget.check('inventory');
          
          const inventory = await actions.inventory.get();
          const blockCount = inventory
            .filter(item => item.name.includes('_planks') || item.name === 'cobblestone')
            .reduce((sum, item) => sum + item.count, 0);
          
          if (blockCount < count) {
            if (!allowGather) {
              throw new ProgramError(
                ErrorCode.PRECONDITION,
                `Need ${count} blocks but only have ${blockCount}`
              );
            }
            
            // TODO: Implement gathering logic
            throw new ProgramError(
              ErrorCode.OPERATION_FAILED,
              'Automatic gathering not yet implemented'
            );
          }
          
          return { success: true };
        }
      };
    }
    
    // Search actions (high-level patterns)
    if (this.capabilities.has('pathfind')) {
      actions.search = {
        expandSquare: async ({ radius, predicate, ringCallback }) => {
          // This will be implemented in deterministic.js
          const DeterministicSearch = require('../deterministic');
          const search = new DeterministicSearch(this.botServer, this.seed);
          
          return await search.expandSquare({
            radius,
            predicate,
            ringCallback,
            navigate: actions.navigate
          });
        }
      };
    }
    
    return actions;
  }
  
  buildEventsAPI() {
    const eventHandlers = new Map();
    
    return {
      on: (eventName, callback) => {
        if (!this.capabilities.has('events')) {
          throw new ProgramError(
            ErrorCode.CAPABILITY,
            'Events require the "events" capability'
          );
        }
        
        if (!eventHandlers.has(eventName)) {
          eventHandlers.set(eventName, []);
        }
        
        eventHandlers.get(eventName).push(callback);
        
        // Return unsubscribe function
        return () => {
          const handlers = eventHandlers.get(eventName);
          if (handlers) {
            const index = handlers.indexOf(callback);
            if (index >= 0) {
              handlers.splice(index, 1);
            }
          }
        };
      },
      
      emit: (eventName, data) => {
        const handlers = eventHandlers.get(eventName);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(data);
            } catch (error) {
              console.error(`Event handler error for ${eventName}:`, error);
            }
          }
        }
      }
    };
  }
  
  buildControlAPI() {
    return {
      success: (data) => {
        throw { __mfSuccess: true, data };
      },
      
      fail: (message, data) => {
        throw { __mfFailure: true, message, data };
      },
      
      cancelToken: this.cancelToken
    };
  }
  
  buildLoggerAPI() {
    return {
      info: (message, meta) => {
        this.logs.push({
          level: 'info',
          message,
          meta,
          timestamp: Date.now()
        });
        console.log('[PROGRAM INFO]', message, meta || '');
      },
      
      warn: (message, meta) => {
        this.logs.push({
          level: 'warn',
          message,
          meta,
          timestamp: Date.now()
        });
        console.log('[PROGRAM WARN]', message, meta || '');
      },
      
      error: (message, meta) => {
        this.logs.push({
          level: 'error',
          message,
          meta,
          timestamp: Date.now()
        });
        console.log('[PROGRAM ERROR]', message, meta || '');
      }
    };
  }
  
  buildClockAPI() {
    const startTime = Date.now();
    
    return {
      now: () => {
        // Return deterministic time based on program start
        return Date.now() - startTime;
      },
      
      sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    };
  }
  
  buildFlowAPI() {
    // Bind flow utilities with context
    return {
      withTimeout: flowUtils.withTimeout,
      retryBudget: flowUtils.retryBudget,
      transaction: flowUtils.transaction,
      parallel: flowUtils.parallel,
      sleep: flowUtils.sleep
    };
  }
  
  buildMovementAPI() {
    // Bind movement utilities with context
    const self = this;
    return {
      step: (direction, options) => movementUtils.step(self.build(), direction, options),
      moveCardinal: (direction, distance, options) => movementUtils.moveCardinal(self.build(), direction, distance, options),
      followPath: (path, options) => movementUtils.followPath(self.build(), path, options),
      strafe: (direction, distance, options) => movementUtils.strafe(self.build(), direction, distance, options),
      jumpTo: (target, options) => movementUtils.jumpTo(self.build(), target, options),
      circleAround: (center, radius, options) => movementUtils.circleAround(self.build(), center, radius, options)
    };
  }
  
  buildSafetyAPI() {
    // Bind safety utilities with context
    const self = this;
    return {
      escapeHole: (options) => safetyUtils.escapeHole(self.build(), options),
      safeStep: (direction, options) => safetyUtils.safeStep(self.build(), direction, options),
      createSafeZone: (center, options) => safetyUtils.createSafeZone(self.build(), center, options),
      monitorVitals: (options) => safetyUtils.monitorVitals(self.build(), options),
      retreatToSafety: (options) => safetyUtils.retreatToSafety(self.build(), options)
    };
  }
  
  buildWatcherAPI() {
    // Bind watcher utilities with context
    const self = this;
    return {
      until: watcherUtils.until,
      blockAppears: (blockTypes, options) => watcherUtils.blockAppears(self.build(), blockTypes, options),
      entityAppears: (entityType, options) => watcherUtils.entityAppears(self.build(), entityType, options),
      inventoryContains: (requirements, options) => watcherUtils.inventoryContains(self.build(), requirements, options),
      collectEvents: (eventName, options) => watcherUtils.collectEvents(self.build(), eventName, options),
      watchValue: watcherUtils.watchValue
    };
  }
  
  buildSearchAPI() {
    // Bind search utilities with context
    const self = this;
    return {
      expandSquare: (options) => searchUtils.expandSquare(self.build(), options),
      bug2: (goal, options) => searchUtils.bug2(self.build(), goal, options),
      spiral: (options) => searchUtils.spiral(self.build(), options),
      randomWalk: (options) => searchUtils.randomWalk(self.build(), options)
    };
  }
  
  buildGeometryAPI() {
    // Export geometry utilities directly (they don't need context)
    return {
      // Sorting
      nearestFirst: geometryUtils.nearestFirst,
      
      // Distance metrics
      manhattan: geometryUtils.manhattan,
      chebyshev: geometryUtils.chebyshev,
      euclidean: geometryUtils.euclidean,
      
      // Vector operations
      add: geometryUtils.add,
      subtract: geometryUtils.subtract,
      scale: geometryUtils.scale,
      normalize: geometryUtils.normalize,
      dot: geometryUtils.dot,
      cross: geometryUtils.cross,
      lerp: geometryUtils.lerp,
      project: geometryUtils.project,
      reflect: geometryUtils.reflect,
      rotateY: geometryUtils.rotateY,
      
      // Bounds and regions
      getBoundingBox: geometryUtils.getBoundingBox,
      isWithinBounds: geometryUtils.isWithinBounds,
      
      // Shape generators
      getLine: geometryUtils.getLine,
      getCircle: geometryUtils.getCircle,
      getDisc: geometryUtils.getDisc,
      
      // Utilities
      clamp: geometryUtils.clamp,
      round: geometryUtils.round,
      floor: geometryUtils.floor
    };
  }
  
  cancel() {
    this.cancelToken.isCancelled = true;
    for (const callback of this.cancelToken.callbacks) {
      callback();
    }
  }
  
  getLogs() {
    return this.logs;
  }
  
  getUsage() {
    return this.budget.getUsage();
  }
}

module.exports = ContextBuilder;