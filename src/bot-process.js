const mineflayer = require('mineflayer');
const Vec3 = require('vec3');
const { pathfinder: pathfinderPlugin, Movements, goals } = require('mineflayer-pathfinder');
const minecraftData = require('minecraft-data');

// This runs in a separate process to isolate crashes
process.on('message', (msg) => {
  if (msg.type === 'start') {
    const config = msg.config;

    console.log('[BOT-PROCESS] Starting bot in isolated process...');

    const bot = mineflayer.createBot({
      host: config.host || 'localhost',
      port: config.port || 25565,
      username: config.username || 'Bot',
      version: config.version || false,
      auth: config.auth || 'offline'
    });

    bot.loadPlugin(pathfinderPlugin);
    let movementProfile = null;

    const setupMovements = () => {
      try {
        const mcData = minecraftData(bot.version || config.version || '1.21.8');
        movementProfile = new Movements(bot, mcData);
        bot.pathfinder.setMovements(movementProfile);
      } catch (error) {
        console.error('[BOT-PROCESS] Failed to initialize pathfinder movements:', error.message);
      }
    };

    bot.once('spawn', setupMovements);
    bot.on('respawn', setupMovements);

    // Track if we've spawned to prevent early death handling
    let hasSpawned = false;
    let deathHandlerRegistered = false;

    // Patch removeAllListeners to prevent crash
    const originalRemoveAllListeners = bot.removeAllListeners;
    bot.removeAllListeners = function(event) {
      try {
        if (!this._events) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        }
        return originalRemoveAllListeners.call(this, event);
      } catch (err) {
        console.error('[BOT-PROCESS] Error in patched removeAllListeners:', err.message);
        return this;
      }
    }.bind(bot);

    // Handle spawn
    bot.once('spawn', () => {
      console.log('[BOT-PROCESS] Bot spawned');
      hasSpawned = true;
      process.send({ type: 'spawned', position: bot.entity.position, health: bot.health });

      // Check if spawned dead
      if (bot.health === 0) {
        console.log('[BOT-PROCESS] WARNING: Bot spawned already dead!');
        setTimeout(() => {
          if (bot.health === 0) {
            bot.chat('/respawn');
          }
        }, 1000);
      }

      // Register death handler immediately to catch all death events
      if (!deathHandlerRegistered) {
        console.log('[BOT-PROCESS] Registering death handler immediately');
        bot.on('death', () => {
          console.log('[BOT-PROCESS] Bot died');
          process.send({ type: 'died' });

          // Auto-respawn after a short delay
          setTimeout(() => {
            if (bot.health === 0) {
              console.log('[BOT-PROCESS] Sending respawn command');
              bot.chat('/respawn');
            }
          }, 1000);
        });
        deathHandlerRegistered = true;
      }
    });

    // Handle respawn
    bot.on('respawn', () => {
      console.log('[BOT-PROCESS] Bot respawned');
      process.send({ type: 'respawned', position: bot.entity.position });
    });

    // Handle errors
    bot.on('error', (err) => {
      console.error('[BOT-PROCESS] Bot error:', err.message);
      process.send({ type: 'error', error: err.message });
    });

    // Handle kicked
    bot.on('kicked', (reason) => {
      console.log('[BOT-PROCESS] Bot kicked:', reason);
      process.send({ type: 'kicked', reason });
    });

    // Handle end
    bot.on('end', (reason) => {
      console.log('[BOT-PROCESS] Bot connection ended:', reason);
      process.send({ type: 'ended', reason });
    });

    // Handle chat messages
    bot.on('chat', (username, message) => {
      process.send({ type: 'chat', username, message });
    });

    const toSafeNumber = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    // Helper function to create screenshot
    async function captureScreenshot() {
      try {
        // Check if canvas is available
        let createCanvas;
        try {
          const canvasModule = await import('canvas');
          createCanvas = canvasModule.createCanvas;
        } catch (error) {
          throw new Error('Canvas module not available');
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

        const pos = bot.entity.position;
        const yaw = bot.entity.yaw;
        const pitch = bot.entity.pitch;

        ctx.fillText(`Position: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`, 20, 80);
        ctx.fillText(`Yaw: ${yaw.toFixed(2)}, Pitch: ${pitch.toFixed(2)}`, 20, 110);
        ctx.fillText(`Health: ${bot.health}/20, Food: ${bot.food}/20`, 20, 140);

        const buffer = canvas.toBuffer('image/png');
        return buffer.toString('base64');
      } catch (error) {
        throw new Error('Failed to capture screenshot: ' + error.message);
      }
    }

    // Helper function to execute batch instructions
    async function executeInstruction(instruction) {
      const { type, params = {} } = instruction;
      switch (type) {
        case 'move':
          const { x, y, z, sprint, relative } = params;
          if (relative) {
            const { forward, backward, left, right, up, down } = relative;
            bot.clearControlStates();

            let targetPosition = bot.entity.position.clone();
            const yaw = bot.entity.yaw;

            if (forward > 0 || backward > 0) {
              const distance = forward > 0 ? forward : -backward;
              targetPosition.x += -Math.sin(yaw) * distance;
              targetPosition.z += Math.cos(yaw) * distance;
            }

            if (left > 0 || right > 0) {
              const distance = right > 0 ? right : -left;
              targetPosition.x += Math.cos(yaw) * distance;
              targetPosition.z += Math.sin(yaw) * distance;
            }

            if (up > 0 || down > 0) {
              targetPosition.y += up > 0 ? up : -down;
            }

            if (sprint) bot.setControlState('sprint', true);

            const timeout = Math.max(1000, Math.abs(forward || backward || left || right || 0) * 250);
            if (forward > 0) bot.setControlState('forward', true);
            if (backward > 0) bot.setControlState('back', true);
            if (left > 0) bot.setControlState('left', true);
            if (right > 0) bot.setControlState('right', true);
            if (up > 0) bot.setControlState('jump', true);

            await new Promise(resolve => setTimeout(resolve, timeout));
            bot.clearControlStates();

            return { moved: true, duration_ms: timeout };
          } else {
            if (x !== undefined) bot.setControlState('forward', x > 0);
            if (x !== undefined) bot.setControlState('back', x < 0);
            if (z !== undefined) bot.setControlState('left', z < 0);
            if (z !== undefined) bot.setControlState('right', z > 0);
            if (y !== undefined && y > 0) bot.setControlState('jump', true);
            if (sprint !== undefined) bot.setControlState('sprint', sprint);
            return { moved: true };
          }

        case 'stop':
          bot.clearControlStates();
          return { stopped: true };

        case 'look':
          const { yaw: lookYaw, pitch: lookPitch, relative: relLook, cardinal } = params;
          if (relLook) {
            const { yaw_delta, pitch_delta } = relLook;
            const currentYaw = bot.entity.yaw;
            const currentPitch = bot.entity.pitch;
            const newYaw = currentYaw + (yaw_delta || 0) * Math.PI / 180;
            const newPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2,
              currentPitch + (pitch_delta || 0) * Math.PI / 180));
            bot.look(newYaw, newPitch, true);
            return { looked: true, turned: { yaw_degrees: yaw_delta || 0, pitch_degrees: pitch_delta || 0 } };
          } else if (cardinal) {
            let targetYaw;
            switch(cardinal.toLowerCase()) {
              case 'north': targetYaw = Math.PI; break;
              case 'south': targetYaw = 0; break;
              case 'east': targetYaw = -Math.PI/2; break;
              case 'west': targetYaw = Math.PI/2; break;
              default: throw new Error('Invalid cardinal direction');
            }
            bot.look(targetYaw, 0, true);
            return { looked: true, direction: cardinal };
          } else if (lookYaw !== undefined && lookPitch !== undefined) {
            bot.look(lookYaw, lookPitch, true);
            return { looked: true };
          }
          throw new Error('Provide yaw/pitch, relative turn, or cardinal direction');

        case 'chat':
          if (!params.message) throw new Error('message required');
          bot.chat(params.message);
          return { sent: true };

        case 'dig': {
          if (params.x === undefined || params.y === undefined || params.z === undefined) {
            throw new Error('x, y, z coordinates required');
          }
          const blockToDig = bot.blockAt(new Vec3(params.x, params.y, params.z));
          if (!blockToDig) throw new Error('No block at position');
          await bot.dig(blockToDig);
          return { dug: true, block: blockToDig.name };
        }

        case 'place': {
          if (
            params.x === undefined ||
            params.y === undefined ||
            params.z === undefined
          ) {
            throw new Error('x, y, z coordinates are required');
          }

          const blockName = params.blockName || params.block;
          if (!blockName) {
            throw new Error('block name is required');
          }
          const itemToPlace = bot.inventory.items().find(i => i.name === blockName);
          if (!itemToPlace) throw new Error(`No ${blockName} in inventory`);

          await bot.equip(itemToPlace, 'hand');
          const refBlock = bot.blockAt(new Vec3(params.x, params.y, params.z));

          if (!refBlock || refBlock.name === 'air') {
            throw new Error('Cannot place block: reference block must be solid');
          }

          await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
          return { placed: true, block: blockName };
        }

        case 'craft': {
          if (!params.item) throw new Error('item name required');

          const itemId = bot.registry.itemsByName[params.item]?.id;
          if (!itemId) throw new Error(`Unknown item: ${params.item}`);

          const requestedCount = params.count || 1;
          const recipes = bot.recipesFor(itemId, null, requestedCount, params.craftingTable);
          if (!recipes || recipes.length === 0) {
            throw new Error(`No recipes available for ${params.item}`);
          }

          const recipe = recipes[0];
          const resultCount = recipe.result?.count || (Array.isArray(recipe.result?.items) ? recipe.result.items[0]?.count : 1) || 1;
          const craftsNeeded = Math.max(1, Math.ceil(requestedCount / resultCount));
          const producedCount = resultCount * craftsNeeded;

          if (recipe.requiresTable && !params.craftingTable) {
            const craftingTableBlock = bot.findBlock({
              matching: bot.registry.blocksByName.crafting_table?.id,
              maxDistance: 6
            });

            if (!craftingTableBlock) {
              throw new Error('Recipe requires crafting table but none found nearby');
            }

            await bot.craft(recipe, craftsNeeded, craftingTableBlock);
          } else {
            await bot.craft(recipe, craftsNeeded, null);
          }

          return { crafted: params.item, count: producedCount };
        }

        case 'equip': {
          if (!params.item) throw new Error('item name required');
          const itemToEquip = bot.inventory.items().find(i => i.name === params.item);
          if (!itemToEquip) throw new Error(`No ${params.item} in inventory`);
          await bot.equip(itemToEquip, params.destination || 'hand');
          return { equipped: params.item };
        }

        case 'wait':
          const duration = params.duration || 1000;
          await new Promise(resolve => setTimeout(resolve, duration));
          return { waited: duration };

        case 'goto': {
          if (
            params.x === undefined ||
            params.y === undefined ||
            params.z === undefined
          ) {
            throw new Error('x, y, z coordinates required');
          }

          const target = new Vec3(params.x, params.y, params.z);
          const tolerance = params.tolerance ?? 1;
          const maxSteps = params.maxSteps || 500;
          const goal = params.precise
            ? new goals.GoalBlock(target.x, target.y, target.z)
            : new goals.GoalNear(target.x, target.y, target.z, tolerance);

          const start = Date.now();
          let pathFound = false;
          let nodesTraversed = 0;
          let lastPathLength = 0;
          let stepLimitError = null;

          // Ensure pathfinder has adequate think timeout for complex terrain
          bot.pathfinder.thinkTimeout = 30000; // 30 seconds

          console.log(`[BOT-PATHFIND] Starting goto (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}), maxSteps=${maxSteps}`);

          // Track path updates and count nodes traversed
          const onPathUpdate = (path) => {
            const currentLength = path?.length || 0;
            
            if (!pathFound && currentLength > 0) {
              pathFound = true;
              console.log(`[BOT-PATHFIND] Path found in ${Date.now() - start}ms, ${currentLength} nodes`);
            }
            
            // When path shrinks, nodes were traversed
            if (lastPathLength > 0 && currentLength < lastPathLength) {
              nodesTraversed += (lastPathLength - currentLength);
              console.log(`[BOT-PATHFIND] Nodes traversed: ${nodesTraversed}/${maxSteps}`);
            }
            lastPathLength = currentLength;
            
            // Check step limit
            if (nodesTraversed >= maxSteps) {
              stepLimitError = new Error(`Pathfinding exceeded max steps (${maxSteps})`);
              bot.pathfinder.stop();
            }
          };
          bot.on('path_update', onPathUpdate);

          try {
            await bot.pathfinder.goto(goal);
            
            // Check if we stopped due to step limit
            if (stepLimitError) {
              throw stepLimitError;
            }
            
            console.log(`[BOT-PATHFIND] Completed in ${Date.now() - start}ms, ${nodesTraversed} nodes traversed`);
          } catch (err) {
            // If stopped due to step limit, throw that error
            if (stepLimitError) {
              console.log(`[BOT-PATHFIND] Step limit reached after ${Date.now() - start}ms: ${stepLimitError.message}`);
              throw stepLimitError;
            }
            console.log(`[BOT-PATHFIND] Error after ${Date.now() - start}ms: ${err.message}`);
            throw err;
          } finally {
            bot.removeListener('path_update', onPathUpdate);
            bot.pathfinder.setGoal(null);
          }

          const finalPos = bot.entity.position;

          return {
            moved: true,
            arrived: true,
            position: {
              x: finalPos.x,
              y: finalPos.y,
              z: finalPos.z
            },
            duration_ms: Date.now() - start,
            nodesTraversed
          };
        }

        default:
          throw new Error(`Unknown instruction type: ${type}`);
      }
    }

    // Handle commands from parent process
    process.on('message', async (msg) => {
      if (msg.type === 'command') {
        try {
          switch (msg.command) {
            case 'respawn':
              bot.chat('/respawn');
              break;

            case 'quit':
              bot.quit();
              break;

            case 'chat':
              bot.chat(msg.message);
              break;

            case 'move':
              // Simple movement commands
              const { direction, blocks } = msg;
              const movement = {
                forward: () => bot.setControlState('forward', true),
                back: () => bot.setControlState('back', true),
                left: () => bot.setControlState('left', true),
                right: () => bot.setControlState('right', true),
                jump: () => bot.setControlState('jump', true),
                stop: () => bot.clearControlStates()
              };

              if (movement[direction]) {
                movement[direction]();
                setTimeout(() => bot.clearControlStates(), blocks * 200);
              }
              break;

            case 'move_advanced':
              // Advanced movement with relative support
              const { x, y, z, sprint, relative } = msg;

              if (relative) {
                const { forward, backward, left, right, up, down } = relative;
                bot.clearControlStates();

                // Calculate movement based on direction
                const yaw = bot.entity.yaw;

                if (forward > 0) bot.setControlState('forward', true);
                if (backward > 0) bot.setControlState('back', true);
                if (left > 0) bot.setControlState('left', true);
                if (right > 0) bot.setControlState('right', true);
                if (up > 0) bot.setControlState('jump', true);
                if (sprint) bot.setControlState('sprint', true);

                const timeout = Math.max(1000, Math.abs(forward || backward || left || right || 0) * 250);
                setTimeout(() => bot.clearControlStates(), timeout);
              } else {
                if (x !== undefined) bot.setControlState('forward', x > 0);
                if (x !== undefined) bot.setControlState('back', x < 0);
                if (z !== undefined) bot.setControlState('left', z < 0);
                if (z !== undefined) bot.setControlState('right', z > 0);
                if (y !== undefined && y > 0) bot.setControlState('jump', true);
                if (sprint !== undefined) bot.setControlState('sprint', sprint);
              }
              break;

            case 'stop':
              bot.clearControlStates();
              break;

            case 'get_state':
              // Helper functions for state
              function getCompassDirection(yaw) {
                let degrees = (yaw * 180 / Math.PI + 180) % 360;
                if (degrees < 0) degrees += 360;
                const directions = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
                const index = Math.round(degrees / 45) % 8;
                return directions[index];
              }

              function getPitchDescription(pitch) {
                const degrees = pitch * 180 / Math.PI;
                if (degrees < -45) return 'looking up';
                if (degrees > 45) return 'looking down';
                if (degrees < -15) return 'looking slightly up';
                if (degrees > 15) return 'looking slightly down';
                return 'looking straight';
              }

              const blockUnder = bot.blockAt(bot.entity.position.offset(0, -0.5, 0));

              const state = {
                position: {
                  x: bot.entity.position.x,
                  y: bot.entity.position.y,
                  z: bot.entity.position.z,
                  formatted: `X: ${Math.floor(bot.entity.position.x)}, Y: ${Math.floor(bot.entity.position.y)}, Z: ${Math.floor(bot.entity.position.z)}`
                },
                orientation: {
                  yaw: bot.entity.yaw,
                  pitch: bot.entity.pitch,
                  compass_direction: getCompassDirection(bot.entity.yaw),
                  pitch_description: getPitchDescription(bot.entity.pitch),
                  yaw_degrees: Math.round((bot.entity.yaw * 180 / Math.PI + 180) % 360),
                  pitch_degrees: Math.round(bot.entity.pitch * 180 / Math.PI),
                  description: `Facing ${getCompassDirection(bot.entity.yaw)}, ${getPitchDescription(bot.entity.pitch)}`
                },
                health: {
                  current: bot.health,
                  max: 20,
                  percentage: Math.round(bot.health / 20 * 100),
                  status: bot.health >= 15 ? 'Healthy' : bot.health >= 10 ? 'Moderate' : bot.health >= 5 ? 'Low' : 'Critical'
                },
                food: {
                  current: bot.food,
                  max: 20,
                  percentage: Math.round(bot.food / 20 * 100),
                  status: bot.food >= 18 ? 'Full' : bot.food >= 14 ? 'Satisfied' : bot.food >= 7 ? 'Hungry' : 'Starving'
                },
                oxygen: {
                  current: bot.oxygenLevel,
                  max: 20,
                  status: bot.oxygenLevel === 20 ? 'Full' : 'Depleting'
                },
                time: {
                  dayTime: bot.time.timeOfDay,
                  age: bot.time.age,
                  isDay: bot.time.isDay
                },
                environment: {
                  on_ground: bot.entity.onGround,
                  block_under: blockUnder ? blockUnder.name : 'air',
                  game_mode: bot.game.gameMode,
                  dimension: bot.game.dimension,
                  is_raining: bot.isRaining,
                  time_of_day: bot.time.isDay ? 'Day' : 'Night',
                  light_level: bot.blockAt(bot.entity.position) ? bot.blockAt(bot.entity.position).light : 'unknown'
                },
                velocity: {
                  x: bot.entity.velocity.x,
                  y: bot.entity.velocity.y,
                  z: bot.entity.velocity.z,
                  speed: Math.sqrt(bot.entity.velocity.x ** 2 + bot.entity.velocity.z ** 2).toFixed(3),
                  is_moving: Math.abs(bot.entity.velocity.x) > 0.01 || Math.abs(bot.entity.velocity.z) > 0.01 || Math.abs(bot.entity.velocity.y) > 0.01
                }
              };

              process.send({ type: 'state_response', state });
              break;

            case 'get_inventory':
              const items = bot.inventory.items().map(item => ({
                name: item.name,
                count: item.count,
                slot: item.slot,
                displayName: item.displayName
              }));

              process.send({ type: 'inventory_response', items });
              break;

            case 'get_entities':
              const entities = Object.values(bot.entities)
                .filter(e => e.type === 'player' || e.type === 'mob')
                .map(e => ({
                  type: e.type,
                  name: e.name || e.displayName,
                  position: e.position,
                  health: e.metadata?.[8],
                  distance: bot.entity.position.distanceTo(e.position)
                }));

              process.send({ type: 'entities_response', entities });
              break;

            case 'get_screenshot':
              try {
                const screenshot = await captureScreenshot();
                process.send({ type: 'screenshot_response', screenshot });
              } catch (error) {
                process.send({ type: 'screenshot_response', error: error.message });
              }
              break;

            case 'get_recipes':
              const { item } = msg;

              if (item) {
                const recipes = bot.recipesFor(parseInt(item) || bot.registry.itemsByName[item]?.id);
                process.send({
                  type: 'recipes_response',
                  data: {
                    recipes: recipes ? recipes.map(r => ({
                      result: r.result,
                      inShape: r.inShape,
                      outShape: r.outShape,
                      ingredients: r.ingredients
                    })) : []
                  }
                });
              } else {
                const allRecipes = bot.recipesAll();
                process.send({
                  type: 'recipes_response',
                  data: {
                    count: allRecipes.length,
                    message: 'Use ?item=<name> to get recipes for specific item'
                  }
                });
              }
              break;

            case 'look':
              try {
                const { yaw, pitch, relative, cardinal } = msg;

                if (relative) {
                  const { yaw_delta, pitch_delta } = relative;
                  const currentYaw = bot.entity.yaw;
                  const currentPitch = bot.entity.pitch;
                  const newYaw = currentYaw + (yaw_delta || 0) * Math.PI / 180;
                  const newPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2,
                    currentPitch + (pitch_delta || 0) * Math.PI / 180));

                  bot.look(newYaw, newPitch, true);

                  process.send({
                    type: 'look_response',
                    data: {
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
                    }
                  });
                } else if (cardinal) {
                  let targetYaw;
                  switch(cardinal.toLowerCase()) {
                    case 'north': targetYaw = Math.PI; break;
                    case 'south': targetYaw = 0; break;
                    case 'east': targetYaw = -Math.PI/2; break;
                    case 'west': targetYaw = Math.PI/2; break;
                    default:
                      process.send({ type: 'look_response', data: { error: 'Invalid cardinal direction' } });
                      return;
                  }

                  bot.look(targetYaw, 0, true);

                  process.send({
                    type: 'look_response',
                    data: {
                      success: true,
                      direction: cardinal,
                      new_orientation: {
                        yaw: targetYaw,
                        pitch: 0,
                        yaw_degrees: Math.round((targetYaw * 180 / Math.PI + 180) % 360)
                      }
                    }
                  });
                } else if (yaw !== undefined && pitch !== undefined) {
                  bot.look(yaw, pitch, true);

                  process.send({
                    type: 'look_response',
                    data: {
                      success: true,
                      new_orientation: {
                        yaw: yaw,
                        pitch: pitch,
                        yaw_degrees: Math.round((yaw * 180 / Math.PI + 180) % 360),
                        pitch_degrees: Math.round(pitch * 180 / Math.PI)
                      }
                    }
                  });
                } else {
                  process.send({ type: 'look_response', data: { error: 'Provide yaw/pitch, relative turn, or cardinal direction' } });
                }
              } catch (error) {
                process.send({ type: 'look_response', data: { error: error.message } });
              }
              break;

            case 'block_at':
              try {
                const blockPos = new Vec3(
                  toSafeNumber(msg.x, Math.floor(bot.entity.position.x)),
                  toSafeNumber(msg.y, Math.floor(bot.entity.position.y)),
                  toSafeNumber(msg.z, Math.floor(bot.entity.position.z))
                );
                const block = bot.blockAt(blockPos);
                process.send({
                  type: 'block_at_response',
                  block: block ? {
                    name: block.name,
                    hardness: block.hardness,
                    position: {
                      x: block.position.x,
                      y: block.position.y,
                      z: block.position.z
                    }
                  } : null
                });
              } catch (error) {
                process.send({ type: 'block_at_response', error: error.message });
              }
              break;

            case 'scan_blocks':
              try {
                const {
                  center = {},
                  kinds = [],
                  radius = 8,
                  max = 100
                } = msg;

                const radiusLimit = Math.min(Math.max(1, radius), 64);
                const maxResults = Math.min(Math.max(1, max), 512);
                const radiusSq = radiusLimit * radiusLimit;

                const centerVec = new Vec3(
                  toSafeNumber(center.x, Math.floor(bot.entity.position.x)),
                  toSafeNumber(center.y, Math.floor(bot.entity.position.y)),
                  toSafeNumber(center.z, Math.floor(bot.entity.position.z))
                );

                const matched = [];
                // Scan all blocks in the cubic region
                for (let dx = -radiusLimit; dx <= radiusLimit; dx++) {
                  for (let dy = -radiusLimit; dy <= radiusLimit; dy++) {
                    for (let dz = -radiusLimit; dz <= radiusLimit; dz++) {
                      // Check actual spherical distance (squared to avoid sqrt)
                      const distSq = dx * dx + dy * dy + dz * dz;
                      if (distSq > radiusSq) continue;

                      const candidate = centerVec.offset(dx, dy, dz);
                      const block = bot.blockAt(candidate);
                      if (!block || !block.name) continue;

                      if (kinds.length > 0 && !kinds.includes(block.name)) {
                        continue;
                      }

                      matched.push({
                        name: block.name,
                        hardness: block.hardness,
                        distanceSq: distSq,
                        position: {
                          x: candidate.x,
                          y: candidate.y,
                          z: candidate.z
                        }
                      });
                    }
                  }
                }

                // Sort by distance (nearest first) and limit results
                matched.sort((a, b) => a.distanceSq - b.distanceSq);
                const results = matched.slice(0, maxResults).map(block => ({
                  name: block.name,
                  hardness: block.hardness,
                  position: block.position
                }));

                process.send({
                  type: 'scan_blocks_response',
                  blocks: results
                });
              } catch (error) {
                process.send({ type: 'scan_blocks_response', error: error.message });
              }
              break;

            case 'dig':
              try {
                const block = bot.blockAt(new Vec3(msg.x, msg.y, msg.z));
                if (block) {
                  await bot.dig(block);
                  process.send({ type: 'dig_response', block: block.name });
                } else {
                  process.send({ type: 'dig_response', error: 'No block at position' });
                }
              } catch (error) {
                process.send({ type: 'dig_response', error: error.message });
              }
              break;

            case 'place':
              try {
                const desiredBlock = msg.blockName || msg.block;
                if (!desiredBlock) {
                  process.send({ type: 'place_response', error: 'No block specified' });
                  break;
                }
                const itemToPlace = bot.inventory.items().find(i => i.name === desiredBlock);
                if (!itemToPlace) {
                  process.send({ type: 'place_response', error: `No ${desiredBlock} in inventory` });
                  break;
                }

                await bot.equip(itemToPlace, 'hand');
                const refBlock = bot.blockAt(new Vec3(msg.x, msg.y, msg.z));

                if (!refBlock || refBlock.name === 'air') {
                  process.send({ type: 'place_response', error: 'Cannot place block: reference block must be solid' });
                } else {
                  await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
                  process.send({ type: 'place_response' });
                }
              } catch (error) {
                process.send({ type: 'place_response', error: error.message });
              }
              break;

            case 'attack':
              try {
                const entity = bot.entities[msg.entityId];
                if (entity) {
                  bot.attack(entity);
                  process.send({ type: 'attack_response' });
                } else {
                  process.send({ type: 'attack_response', error: 'Entity not found' });
                }
              } catch (error) {
                process.send({ type: 'attack_response', error: error.message });
              }
              break;

            case 'craft':
              try {
                const itemId = bot.registry.itemsByName[msg.item]?.id;
                if (!itemId) {
                  process.send({ type: 'craft_response', error: `Unknown item: ${msg.item}` });
                  break;
                }

                const recipes = bot.recipesFor(itemId, null, 1, msg.craftingTable);
                if (!recipes || recipes.length === 0) {
                  process.send({ type: 'craft_response', error: `No recipes available for ${msg.item}` });
                  break;
                }

                const recipe = recipes[0];

                if (recipe.requiresTable && !msg.craftingTable) {
                  const craftingTableBlock = bot.findBlock({
                    matching: bot.registry.blocksByName.crafting_table?.id,
                    maxDistance: 6
                  });

                  if (!craftingTableBlock) {
                    process.send({ type: 'craft_response', error: 'Recipe requires crafting table but none found nearby' });
                    break;
                  }

                  await bot.craft(recipe, msg.count, craftingTableBlock);
                } else {
                  await bot.craft(recipe, msg.count, null);
                }

                process.send({ type: 'craft_response', item: msg.item, count: msg.count });
              } catch (error) {
                process.send({ type: 'craft_response', error: error.message });
              }
              break;

            case 'equip':
              try {
                const itemToEquip = bot.inventory.items().find(i => i.name === msg.item);
                if (!itemToEquip) {
                  process.send({ type: 'equip_response', error: `No ${msg.item} in inventory` });
                } else {
                  await bot.equip(itemToEquip, msg.destination || 'hand');
                  process.send({ type: 'equip_response', item: msg.item, destination: msg.destination || 'hand' });
                }
              } catch (error) {
                process.send({ type: 'equip_response', error: error.message });
              }
              break;

            case 'batch':
              try {
                const { instructions, stopOnError } = msg;
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
                    const response = await executeInstruction(instruction);
                    result.success = true;
                    result.response = response;
                  } catch (error) {
                    result.error = error.message;

                    if (stopOnError) {
                      results.push(result);
                      process.send({
                        type: 'batch_response',
                        results: {
                          completed: i + 1,
                          total: instructions.length,
                          stopped: true,
                          results
                        }
                      });
                      return;
                    }
                  }

                  results.push(result);

                  // Add delay between instructions
                  if (instruction.delay) {
                    await new Promise(resolve => setTimeout(resolve, instruction.delay));
                  } else if (i < instructions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                }

                process.send({
                  type: 'batch_response',
                  results: {
                    completed: instructions.length,
                    total: instructions.length,
                    stopped: false,
                    results
                  }
                });
              } catch (error) {
                process.send({
                  type: 'batch_response',
                  results: { error: error.message }
                });
              }
              break;

            case 'analyze_path':
              try {
                const { x, y, z, timeout = 5000 } = msg;
                if (x === undefined || y === undefined || z === undefined) {
                  process.send({ type: 'analyze_path_response', error: 'x, y, z coordinates required' });
                  break;
                }

                const targetPos = new Vec3(x, y, z);
                const botPos = bot.entity.position;
                const distance = botPos.distanceTo(targetPos);

                console.log(`[BOT-ANALYZE] Analyzing path to (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);

                const mcData = minecraftData(bot.version);
                const analysis = {
                  reachable: false,
                  triviallyReachable: false,
                  distance: distance,
                  pathLength: null,
                  requirements: {
                    digging: {
                      needed: false,
                      blocks: [],
                      estimatedTime: 0,
                      recommendedTool: null
                    },
                    building: {
                      needed: false,
                      blocksRequired: 0,
                      gaps: []
                    },
                    swimming: false,
                    parkour: false,
                    verticalChange: Math.abs(targetPos.y - botPos.y)
                  },
                  difficulty: 'unreachable',
                  suggestedApproach: null
                };

                // Helper to try pathfinding with specific settings
                const tryPath = async (canDig, canPlace, passName) => {
                  return new Promise((resolve) => {
                    const movements = new Movements(bot, mcData);
                    movements.canDig = canDig;
                    movements.canPlace = canPlace;
                    movements.allowParkour = true;
                    movements.allowSprinting = true;
                    
                    bot.pathfinder.setMovements(movements);
                    
                    const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1);
                    
                    let pathResult = null;
                    let pathLength = 0;
                    let blocksToBreak = [];
                    let emptyPathCount = 0;
                    let resolved = false;
                    
                    const cleanup = () => {
                      if (!resolved) {
                        resolved = true;
                        bot.pathfinder.stop();
                        bot.removeListener('path_update', onPathUpdate);
                        bot.removeListener('goal_reached', onGoalReached);
                        bot.pathfinder.setGoal(null);
                      }
                    };
                    
                    const onGoalReached = () => {
                      if (resolved) return;
                      cleanup();
                      console.log(`[BOT-ANALYZE] ${passName}: goal already reached`);
                      resolve({ success: true, pathLength: 0, blocksToBreak: [] });
                    };
                    
                    const onPathUpdate = (path) => {
                      if (resolved) return;
                      
                      const currentLength = path?.length || 0;
                      
                      if (currentLength > 0) {
                        // Found a valid path!
                        pathLength = currentLength;
                        pathResult = path;
                        
                        // If digging is enabled, check for blocks that would be broken
                        if (canDig) {
                          for (const node of path) {
                            // Check blocks at head and feet height along path
                            const positions = [
                              new Vec3(Math.floor(node.x), Math.floor(node.y), Math.floor(node.z)),
                              new Vec3(Math.floor(node.x), Math.floor(node.y) + 1, Math.floor(node.z))
                            ];
                            for (const pos of positions) {
                              const block = bot.blockAt(pos);
                              if (block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
                                const alreadyAdded = blocksToBreak.some(b => 
                                  b.position.x === pos.x && b.position.y === pos.y && b.position.z === pos.z
                                );
                                if (!alreadyAdded) {
                                  blocksToBreak.push({
                                    position: { x: pos.x, y: pos.y, z: pos.z },
                                    type: block.name,
                                    hardness: block.hardness || 0
                                  });
                                }
                              }
                            }
                          }
                        }
                        
                        cleanup();
                        console.log(`[BOT-ANALYZE] ${passName}: found path, length=${pathLength}, blocksToBreak=${blocksToBreak.length}`);
                        resolve({ success: true, pathLength, blocksToBreak });
                      } else {
                        // Empty path
                        emptyPathCount++;
                        if (emptyPathCount >= 5) {
                          // After 5 empty paths, assume unreachable
                          cleanup();
                          console.log(`[BOT-ANALYZE] ${passName}: unreachable (${emptyPathCount} empty paths)`);
                          resolve({ success: false, pathLength: 0, blocksToBreak: [] });
                        }
                      }
                    };
                    
                    bot.on('path_update', onPathUpdate);
                    bot.on('goal_reached', onGoalReached);
                    
                    // Set a timeout for this attempt
                    const attemptTimeout = setTimeout(() => {
                      if (resolved) return;
                      cleanup();
                      console.log(`[BOT-ANALYZE] ${passName}: timeout after ${timeout}ms`);
                      resolve({ success: false, pathLength: 0, blocksToBreak: [] });
                    }, timeout);
                    
                    // Start pathfinding
                    bot.pathfinder.setGoal(goal);
                  });
                };

                // PASS 1: Trivial path (no modifications)
                console.log('[BOT-ANALYZE] Pass 1: Checking trivial path...');
                const trivialResult = await tryPath(false, false, 'Pass 1 (trivial)');
                
                if (trivialResult.success) {
                  analysis.triviallyReachable = true;
                  analysis.reachable = true;
                  analysis.pathLength = trivialResult.pathLength;
                  analysis.difficulty = 'trivial';
                  analysis.suggestedApproach = 'walk';
                } else {
                  // PASS 2: Path with digging
                  console.log('[BOT-ANALYZE] Pass 2: Checking path with digging...');
                  const digResult = await tryPath(true, false, 'Pass 2 (dig)');
                  
                  if (digResult.success) {
                    analysis.reachable = true;
                    analysis.pathLength = digResult.pathLength;
                    analysis.requirements.digging.needed = digResult.blocksToBreak.length > 0;
                    analysis.requirements.digging.blocks = digResult.blocksToBreak;
                    
                    // Calculate estimated time and recommended tool
                    let totalTime = 0;
                    let hardestBlock = null;
                    for (const block of digResult.blocksToBreak) {
                      // Bare hands time = hardness * 5 seconds (rough estimate)
                      totalTime += (block.hardness || 0.5) * 5000;
                      if (!hardestBlock || block.hardness > hardestBlock.hardness) {
                        hardestBlock = block;
                      }
                    }
                    analysis.requirements.digging.estimatedTime = totalTime;
                    
                    // Recommend tool based on hardest block
                    if (hardestBlock) {
                      if (hardestBlock.type.includes('stone') || hardestBlock.type.includes('ore')) {
                        analysis.requirements.digging.recommendedTool = 'pickaxe';
                      } else if (hardestBlock.type.includes('dirt') || hardestBlock.type.includes('sand') || hardestBlock.type.includes('gravel')) {
                        analysis.requirements.digging.recommendedTool = 'shovel';
                      } else if (hardestBlock.type.includes('log') || hardestBlock.type.includes('plank') || hardestBlock.type.includes('wood')) {
                        analysis.requirements.digging.recommendedTool = 'axe';
                      }
                    }
                    
                    // Determine difficulty
                    if (digResult.blocksToBreak.length === 0) {
                      analysis.difficulty = 'easy';
                    } else if (digResult.blocksToBreak.every(b => b.hardness < 1)) {
                      analysis.difficulty = 'easy';
                    } else if (digResult.blocksToBreak.every(b => b.hardness < 3)) {
                      analysis.difficulty = 'medium';
                    } else {
                      analysis.difficulty = 'hard';
                    }
                    analysis.suggestedApproach = 'dig';
                  } else {
                    // PASS 3: Path with building
                    console.log('[BOT-ANALYZE] Pass 3: Checking path with building...');
                    const buildResult = await tryPath(true, true, 'Pass 3 (build)');
                    
                    if (buildResult.success) {
                      analysis.reachable = true;
                      analysis.pathLength = buildResult.pathLength;
                      analysis.requirements.digging.needed = buildResult.blocksToBreak.length > 0;
                      analysis.requirements.digging.blocks = buildResult.blocksToBreak;
                      analysis.requirements.building.needed = true;
                      // Estimate blocks needed (rough heuristic based on path length and height change)
                      analysis.requirements.building.blocksRequired = Math.max(1, Math.ceil(analysis.requirements.verticalChange / 2));
                      analysis.difficulty = 'hard';
                      analysis.suggestedApproach = analysis.requirements.digging.needed ? 'dig_and_build' : 'build';
                    }
                  }
                }

                // Check for water/swimming
                const waterNearTarget = bot.blockAt(targetPos);
                if (waterNearTarget && (waterNearTarget.name === 'water' || waterNearTarget.name === 'flowing_water')) {
                  analysis.requirements.swimming = true;
                }

                console.log(`[BOT-ANALYZE] Analysis complete: ${analysis.difficulty}, approach=${analysis.suggestedApproach}`);
                process.send({ type: 'analyze_path_response', analysis });
              } catch (error) {
                console.error('[BOT-ANALYZE] Error:', error);
                process.send({ type: 'analyze_path_response', error: error.message });
              }
              break;
          }
        } catch (err) {
          console.error('[BOT-PROCESS] Error handling command:', err);
        }
      }
    });

    // Keep process alive
    process.on('SIGTERM', () => {
      console.log('[BOT-PROCESS] Received SIGTERM, cleaning up...');
      if (bot) {
        bot.quit();
      }
      process.exit(0);
    });

    process.on('uncaughtException', (err) => {
      console.error('[BOT-PROCESS] Uncaught exception:', err);
      process.send({ type: 'crash', error: err.message, stack: err.stack });
      // Don't exit immediately, let the parent decide
    });

    process.on('unhandledRejection', (err) => {
      console.error('[BOT-PROCESS] Unhandled rejection:', err);
      process.send({ type: 'crash', error: err.message });
    });
  }
});

// Signal that the process is ready
process.send({ type: 'ready' });
console.log('[BOT-PROCESS] Bot process ready and waiting for start command...');
