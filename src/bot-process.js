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
          const timeout = params.timeout || 30000;
          const goal = params.precise
            ? new goals.GoalBlock(target.x, target.y, target.z)
            : new goals.GoalNear(target.x, target.y, target.z, tolerance);

          const start = Date.now();
          let timeoutHandle;
          let pathFound = false;

          console.log(`[BOT-PATHFIND] Starting goto (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}), timeout=${timeout}ms`);

          // Track path updates
          let emptyPathCount = 0;
          
          // Add pathfinding event listeners for debugging
          const onPathUpdate = (path) => {
            const nodeCount = path?.length || 0;
            if (!pathFound) {
              pathFound = true;
              console.log(`[BOT-PATHFIND] Path calculated in ${Date.now() - start}ms, ${nodeCount} nodes`);
            }
            
            // Track consecutive empty paths
            if (nodeCount === 0) {
              emptyPathCount++;
              console.log(`[BOT-PATHFIND] Empty path #${emptyPathCount}`);
            } else {
              emptyPathCount = 0;
            }
          };
          bot.on('path_update', onPathUpdate);

          try {
            await Promise.race([
              bot.pathfinder.goto(goal),
              new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  console.log(`[BOT-PATHFIND] TIMEOUT! elapsed=${Date.now() - start}ms, pathFound=${pathFound}, emptyPaths=${emptyPathCount}`);
                  reject(new Error('Pathfinding timeout'));
                }, timeout);
              })
            ]);
            console.log(`[BOT-PATHFIND] Completed in ${Date.now() - start}ms`);
          } catch (err) {
            console.log(`[BOT-PATHFIND] Error after ${Date.now() - start}ms: ${err.message}`);
            throw err;
          } finally {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
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
            duration_ms: Date.now() - start
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
