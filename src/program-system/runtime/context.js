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

    // Compatibility shims for legacy programs
    ctx.nav = {
      goto: async (target, opts = {}) => {
        try {
          const result = await ctx.actions.navigate?.goto(target, opts);
          return { ok: true, value: result };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }
    };

    ctx.interact = {
      mine: async ({ pos, expectName }) => {
        try {
          const result = await ctx.actions.gather?.mineBlock({
            position: pos,
            expect: expectName
          });
          return { ok: true, value: result };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }
    };

    ctx.craft = {
      ensureTable: async () => {
        try {
          const result = await ctx.actions.craft?.ensureCraftingTable();
          return { ok: true, value: result };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }
    };

    return ctx;
  }

  buildBotAPI() {
    return {
      getState: async () => {
        if (!this.botServer || !this.botServer.isConnected()) {
          throw new ProgramError(
            ErrorCode.BOT_DISCONNECTED,
            'Bot is not connected'
          );
        }

        const state = await this.botServer.getState();
        const entity = state.position
          ? new Vec3(state.position.x, state.position.y, state.position.z)
          : new Vec3(0, 63, 0);

        return new BotState({
          position: entity,
          yaw: state.orientation?.yaw ?? 0,
          pitch: state.orientation?.pitch ?? 0,
          health: state.health?.current ?? 20,
          food: state.food?.current ?? 20,
          oxygen: state.oxygen?.current ?? 20,
          onGround: state.environment?.on_ground ?? false,
          inWater: state.environment?.in_water ?? false,
          inLava: state.environment?.in_lava ?? false
        });
      }
    };
  }

  buildWorldAPI() {
    const world = {};

    // Block scanning
    world.scan = {
      blocks: async ({ kinds = [], radius = 8, max = 100, center = null } = {}) => {
        if (!this.botServer || !this.botServer.isConnected()) {
          throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
        }

        const currentState = await this.botServer.getState();
        const scanCenter = center || currentState.position || { x: 0, y: 63, z: 0 };

        const blocks = await this.botServer.scanBlocks({
          kinds,
          radius,
          max,
          center: scanCenter
        });

        return blocks.map(block => {
          const posVec = new Vec3(block.position.x, block.position.y, block.position.z);
          return {
            position: posVec,
            pos: posVec,
            name: block.name,
            hardness: block.hardness
          };
        });
      },

      lineOfSight: async ({ target, maxSteps = 100 }) => {
        if (!this.botServer || !this.botServer.isConnected()) {
          throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
        }

        const state = await this.botServer.getState();
        const start = state.position
          ? new Vec3(state.position.x, state.position.y, state.position.z)
          : new Vec3(0, 63, 0);
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

          const block = await this.botServer.blockAt(pos);
          if (block && block.name && block.name !== 'air') {
            return false;
          }
        }

        return true;
      }
    };

    world.scanBlocks = async (options) => world.scan.blocks(options);

    // World information
    world.seaLevel = () => 63; // Standard sea level in Minecraft

    world.time = async () => {
      if (!this.botServer || !this.botServer.isConnected()) {
        throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
      }

      return this.botServer.getTime();
    };

    return world;
  }

  buildActionsAPI() {
    const actions = {};

    // Navigation actions
    if (this.capabilities.has('move') || this.capabilities.has('pathfind')) {
      actions.navigate = {
        goto: async (target, opts = {}) => {
          console.log(`[CTX-NAVIGATE] goto called: target=(${target?.x?.toFixed(1)}, ${target?.y?.toFixed(1)}, ${target?.z?.toFixed(1)}), timeout=${opts.timeoutMs}`);
          this.budget.check('move');

          if (!this.botServer || !this.botServer.isConnected()) {
            console.log('[CTX-NAVIGATE] Bot not connected!');
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }

          try {
            console.log('[CTX-NAVIGATE] Building params...');
            const params = {
              x: target.x,
              y: target.y,
              z: target.z,
              timeout: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000
            };

            const optionMap = {
              tolerance: 'tolerance',
              precise: 'precise',
              maxDrop: 'maxDrop',
              avoidHoles: 'avoidHoles',
              allowDig: 'allowDig',
              allow1by1: 'allow1by1',
              allowParkour: 'allowParkour',
              allowSprinting: 'allowSprinting',
              allowFreeMotion: 'allowFreeMotion',
              maxDistance: 'maxDistance',
              range: 'range'
            };

            for (const [key, paramKey] of Object.entries(optionMap)) {
              if (opts[key] !== undefined) {
                params[paramKey] = opts[key];
              }
            }

            console.log('[CTX-NAVIGATE] Calling executeInstruction...');
            const result = await this.botServer.executeInstruction({
              type: 'goto',
              params
            });
            console.log('[CTX-NAVIGATE] executeInstruction returned:', result?.moved);

            return result;
          } catch (error) {
            throw new ProgramError(
              ErrorCode.PATHFIND,
              `Failed to navigate to target: ${error.message}`
            );
          }
        },

        stop: async () => {
          if (!this.botServer || !this.botServer.isConnected()) {
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
        mineBlock: async ({
          position,
          expect,
          timeoutMs = 10000,
          retries = 3,
          reachDistance = 4.5,
          avoidHoles = true,
          maxDrop = 2
        }) => {
          this.budget.check('dig');

          if (!this.botServer || !this.botServer.isConnected()) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }

          const blockPos = new Vec3(
            Math.floor(position.x),
            Math.floor(position.y),
            Math.floor(position.z)
          );

          const ensureBlockMatches = async () => {
            if (!expect) return;

            const block = await this.botServer.blockAt({
              x: blockPos.x,
              y: blockPos.y,
              z: blockPos.z
            });
            if (!block || !block.name || !block.name.includes(expect)) {
              throw new ProgramError(
                ErrorCode.PRECONDITION,
                `Expected block containing '${expect}' but found '${block?.name || 'air'}'`
              );
            }
          };

          const ensureInRange = async () => {
            if (!actions.navigate || typeof actions.navigate.goto !== 'function') {
              return;
            }

            const state = await this.botServer.getState();
            const botPosition = state?.position
              ? new Vec3(state.position.x, state.position.y, state.position.z)
              : null;

            if (botPosition && botPosition.distanceTo(blockPos) <= reachDistance) {
              return;
            }

            const candidateOffsets = [
              new Vec3(1, 0, 0),
              new Vec3(-1, 0, 0),
              new Vec3(0, 0, 1),
              new Vec3(0, 0, -1),
              new Vec3(1, 1, 0),
              new Vec3(-1, 1, 0),
              new Vec3(0, 1, 1),
              new Vec3(0, 1, -1)
            ];

            let lastError = null;

            for (const offset of candidateOffsets) {
              const target = new Vec3(
                blockPos.x + offset.x,
                blockPos.y + offset.y,
                blockPos.z + offset.z
              );

              try {
                await actions.navigate.goto(target, {
                  tolerance: 1,
                  avoidHoles,
                  maxDrop,
                  timeoutMs: Math.max(5000, Math.min(timeoutMs, 20000))
                });

                const refreshedState = await this.botServer.getState();
                const refreshedPos = refreshedState?.position
                  ? new Vec3(
                      refreshedState.position.x,
                      refreshedState.position.y,
                      refreshedState.position.z
                    )
                  : null;

                if (refreshedPos && refreshedPos.distanceTo(blockPos) <= reachDistance) {
                  return;
                }
              } catch (navError) {
                lastError = navError;
              }
            }

            const reason = lastError?.message || 'no navigable approach found';
            throw new ProgramError(
              ErrorCode.PATHFIND,
              `Failed to reach block at (${blockPos.x}, ${blockPos.y}, ${blockPos.z}): ${reason}`
            );
          };

          await ensureBlockMatches();
          await ensureInRange();

          const attempts = Math.max(1, retries);
          let lastFailure = null;

          for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
              const result = await this.botServer.executeInstruction({
                type: 'dig',
                params: {
                  x: blockPos.x,
                  y: blockPos.y,
                  z: blockPos.z
                }
              });

              try {
                await this.botServer.executeInstruction({
                  type: 'goto',
                  params: {
                    x: blockPos.x + 0.5,
                    y: blockPos.y,
                    z: blockPos.z + 0.5,
                    tolerance: 1,
                    timeout: Math.max(3000, Math.min(timeoutMs, 10000))
                  }
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch {
                // Ignore collection failures; mining succeeded
              }

              return result;
            } catch (error) {
              lastFailure = error;

              if (error instanceof ProgramError) {
                if (error.code === ErrorCode.PRECONDITION) {
                  throw error;
                }

                if (attempt >= attempts) {
                  throw error;
                }
              } else if (attempt >= attempts) {
                throw new ProgramError(
                  ErrorCode.OPERATION_FAILED,
                  `Failed to mine block: ${error.message}`
                );
              }

              // Re-verify block still exists before retrying
              await ensureBlockMatches();
              await ensureInRange();

              // Brief pause before retrying to allow physics to settle
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }

          throw new ProgramError(
            ErrorCode.OPERATION_FAILED,
            `Failed to mine block after ${attempts} attempts: ${lastFailure?.message || 'unknown error'}`
          );
        }
      };
    }

    // Crafting actions
    if (this.capabilities.has('craft')) {
      actions.craft = {
        craft: async (recipe, count = 1) => {
          this.budget.check('craft');

          if (!this.botServer || !this.botServer.isConnected()) {
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

          if (!this.botServer || !this.botServer.isConnected()) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }

          // Check inventory for crafting table
          const fetchInventory = async () => await this.botServer.getInventory();
          let inventory = await fetchInventory();
          const hasTable = inventory.some(item => item.name === 'crafting_table');
          const countPlanks = inv =>
            inv
              .filter(item => item.name.endsWith('_planks'))
              .reduce((sum, item) => sum + item.count, 0);
          let plankCount = countPlanks(inventory);
          const getLogs = inv => inv.filter(item => item.name.endsWith('_log') && item.count > 0);

          if (!hasTable) {
            // Craft planks as needed (waiting briefly for drops to reach inventory)
            let waitAttempts = 0;
            while (plankCount < 4) {
              let availableLogs = getLogs(inventory);

              if (availableLogs.length === 0) {
                if (waitAttempts >= 10) {
                  throw new ProgramError(
                    ErrorCode.PRECONDITION,
                    'Need at least one log to craft a crafting table'
                  );
                }

                waitAttempts += 1;
                await new Promise(resolve => setTimeout(resolve, 200));
                inventory = await fetchInventory();
                plankCount = countPlanks(inventory);
                continue;
              }

              waitAttempts = 0;
              const log = availableLogs[0];
              const plankName = log.name.replace('_log', '_planks');

              // Mineflayer requires plank crafts in multiples of four (one log per craft)
              await actions.craft.craft(plankName, 4);

              inventory = await fetchInventory();
              plankCount = countPlanks(inventory);
            }

            await actions.craft.craft('crafting_table', 1);
          }

          // Find a place to put it
          if (this.capabilities.has('place')) {
            const state = await this.botServer.getState();
            const position = state.position || { x: 0, y: 63, z: 0 };
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
          if (!this.botServer || !this.botServer.isConnected()) {
            throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
          }

          const items = await this.botServer.getInventory();
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
