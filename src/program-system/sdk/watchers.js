/**
 * Watcher Utilities for Mineflare SDK
 * Provides utilities for waiting and monitoring conditions
 */

const { ProgramError, ErrorCode } = require('./types');
const { withTimeout } = require('./flow');

/**
 * Wait until a predicate condition becomes true
 * @param {Function} predicate - Async function that returns boolean
 * @param {Object} options - Wait options
 * @param {number} [options.checkInterval=1000] - How often to check (ms)
 * @param {number} [options.timeoutMs=30000] - Maximum wait time
 * @param {Function} [options.onCheck] - Called on each check with (attempt, elapsed)
 * @param {string} [options.description] - Description for timeout errors
 * @returns {Promise<{ok: boolean, value?: any, error?: string, attempts?: number, elapsed?: number}>}
 * 
 * @example
 * // Wait for day time
 * const result = await until(
 *   async () => {
 *     const time = await ctx.world.time();
 *     return time.isDay;
 *   },
 *   {
 *     checkInterval: 2000,
 *     timeoutMs: 60000,
 *     description: 'Waiting for day',
 *     onCheck: (attempt, elapsed) => console.log(`Check ${attempt}: ${elapsed}ms`)
 *   }
 * );
 * 
 * // Wait for specific block at position
 * const result = await until(
 *   async () => {
 *     const block = await ctx.world.getBlockAt(position);
 *     return block && block.name === 'diamond_ore';
 *   },
 *   { timeoutMs: 10000 }
 * );
 */
async function until(predicate, options = {}) {
  const {
    checkInterval = 1000,
    timeoutMs = 30000,
    onCheck = () => {},
    description = 'Condition'
  } = options;
  
  const startTime = Date.now();
  let attempts = 0;
  
  // Wrap the checking loop in a timeout
  const checkLoop = async () => {
    while (true) {
      attempts++;
      const elapsed = Date.now() - startTime;
      
      // Call the check callback
      onCheck(attempts, elapsed);
      
      // Check the predicate
      try {
        const result = await predicate();
        
        if (result === true || (result && result.ok)) {
          return {
            ok: true,
            value: result,
            attempts,
            elapsed
          };
        }
      } catch (error) {
        // Log but continue checking
        console.warn(`Predicate check error: ${error.message}`);
      }
      
      // Wait before next check
      await sleep(checkInterval);
    }
  };
  
  // Use withTimeout to enforce the timeout
  const result = await withTimeout(checkLoop, timeoutMs, description);
  
  if (!result.ok) {
    return {
      ...result,
      attempts,
      elapsed: Date.now() - startTime
    };
  }
  
  return result.value;
}

/**
 * Wait for a specific block to appear within scan radius
 * @param {Object} context - Bot context
 * @param {string|Array<string>} blockTypes - Block type(s) to watch for
 * @param {Object} options - Watch options
 * @param {number} [options.radius=10] - Scan radius
 * @param {number} [options.checkInterval=2000] - How often to scan
 * @param {number} [options.timeoutMs=60000] - Maximum wait time
 * @param {Function} [options.onFound] - Called when block is found
 * @returns {Promise<{ok: boolean, value?: {position: Vec3, name: string}, error?: string}>}
 * 
 * @example
 * // Wait for any ore to appear nearby
 * const result = await blockAppears(ctx, ['diamond_ore', 'iron_ore'], {
 *   radius: 20,
 *   onFound: (block) => console.log(`Found ${block.name} at ${block.position}`)
 * });
 * 
 * // Wait for tree growth
 * const result = await blockAppears(ctx, 'oak_log', {
 *   radius: 5,
 *   timeoutMs: 120000  // Trees can take time
 * });
 */
async function blockAppears(context, blockTypes, options = {}) {
  const {
    radius = 10,
    checkInterval = 2000,
    timeoutMs = 60000,
    onFound = () => {}
  } = options;
  
  // Normalize block types to array
  const types = Array.isArray(blockTypes) ? blockTypes : [blockTypes];
  
  const result = await until(
    async () => {
      // Scan for the blocks
      const blocks = await context.world.scan.blocks({
        kinds: types,
        radius,
        max: 1  // Only need to find one
      });
      
      if (blocks && blocks.length > 0) {
        const block = blocks[0];
        onFound(block);
        return { ok: true, value: block };
      }
      
      return false;
    },
    {
      checkInterval,
      timeoutMs,
      description: `Waiting for ${types.join(' or ')}`
    }
  );
  
  if (result.ok && result.value && result.value.value) {
    return {
      ok: true,
      value: result.value.value
    };
  }
  
  return {
    ok: false,
    error: `No ${types.join(' or ')} appeared within ${radius} blocks after ${timeoutMs}ms`
  };
}

/**
 * Wait for an entity (mob, item, player) to appear
 * @param {Object} context - Bot context  
 * @param {string} entityType - Type of entity to watch for
 * @param {Object} options - Watch options
 * @param {number} [options.radius=20] - Detection radius
 * @param {number} [options.checkInterval=1000] - How often to check
 * @param {number} [options.timeoutMs=30000] - Maximum wait time
 * @param {Function} [options.filter] - Additional filter predicate
 * @returns {Promise<{ok: boolean, value?: Object, error?: string}>}
 * 
 * @example
 * // Wait for a sheep to appear
 * const result = await entityAppears(ctx, 'sheep', {
 *   radius: 30,
 *   filter: (entity) => entity.metadata && entity.metadata.color === 'white'
 * });
 * 
 * // Wait for dropped items
 * const result = await entityAppears(ctx, 'item', {
 *   radius: 10,
 *   filter: (entity) => entity.name.includes('diamond')
 * });
 */
async function entityAppears(context, entityType, options = {}) {
  const {
    radius = 20,
    checkInterval = 1000,
    timeoutMs = 30000,
    filter = () => true
  } = options;
  
  const result = await until(
    async () => {
      // In production, would scan for entities
      // This is a placeholder for the actual entity scanning
      const entities = await scanEntities(context, entityType, radius);
      
      const matching = entities.filter(filter);
      if (matching.length > 0) {
        return { ok: true, value: matching[0] };
      }
      
      return false;
    },
    {
      checkInterval,
      timeoutMs,
      description: `Waiting for ${entityType}`
    }
  );
  
  if (result.ok && result.value && result.value.value) {
    return {
      ok: true,
      value: result.value.value
    };
  }
  
  return {
    ok: false,
    error: `No ${entityType} appeared within ${radius} blocks`
  };
}

/**
 * Wait for inventory to contain specific items
 * @param {Object} context - Bot context
 * @param {Object} requirements - Item requirements {itemName: minCount}
 * @param {Object} options - Watch options
 * @param {number} [options.checkInterval=2000] - How often to check inventory
 * @param {number} [options.timeoutMs=60000] - Maximum wait time
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<{ok: boolean, value?: Object, error?: string}>}
 * 
 * @example
 * // Wait to collect 10 wood
 * const result = await inventoryContains(ctx, {
 *   'oak_log': 10,
 *   'birch_log': 5
 * }, {
 *   onProgress: (current, needed) => {
 *     console.log(`Have ${current.oak_log}/10 oak, ${current.birch_log}/5 birch`);
 *   }
 * });
 */
async function inventoryContains(context, requirements, options = {}) {
  const {
    checkInterval = 2000,
    timeoutMs = 60000,
    onProgress = () => {}
  } = options;
  
  const result = await until(
    async () => {
      if (!context.capabilities.includes('inventory')) {
        throw new ProgramError(
          ErrorCode.CAPABILITY,
          'Inventory capability required'
        );
      }
      
      const inventory = await context.actions.inventory.get();
      const currentCounts = {};
      
      // Count current items
      for (const item of inventory) {
        currentCounts[item.name] = (currentCounts[item.name] || 0) + item.count;
      }
      
      // Check if requirements are met
      let allMet = true;
      for (const [itemName, minCount] of Object.entries(requirements)) {
        const current = currentCounts[itemName] || 0;
        if (current < minCount) {
          allMet = false;
        }
      }
      
      onProgress(currentCounts, requirements);
      
      if (allMet) {
        return { ok: true, value: currentCounts };
      }
      
      return false;
    },
    {
      checkInterval,
      timeoutMs,
      description: 'Waiting for inventory items'
    }
  );
  
  if (result.ok && result.value && result.value.value) {
    return {
      ok: true,
      value: result.value.value
    };
  }
  
  return {
    ok: false,
    error: `Failed to collect required items: ${JSON.stringify(requirements)}`
  };
}

/**
 * Watch for events and collect them
 * @param {Object} context - Bot context
 * @param {string} eventName - Event name to watch
 * @param {Object} options - Watch options
 * @param {number} [options.maxEvents=10] - Maximum events to collect
 * @param {number} [options.timeoutMs=30000] - Maximum collection time
 * @param {Function} [options.filter] - Filter predicate for events
 * @returns {Promise<{ok: boolean, value?: Array, error?: string}>}
 * 
 * @example
 * // Collect chat messages
 * const result = await collectEvents(ctx, 'chat', {
 *   maxEvents: 5,
 *   filter: (msg) => msg.username !== 'Bot',
 *   timeoutMs: 20000
 * });
 */
async function collectEvents(context, eventName, options = {}) {
  const {
    maxEvents = 10,
    timeoutMs = 30000,
    filter = () => true
  } = options;
  
  if (!context.capabilities.includes('events')) {
    return {
      ok: false,
      error: 'Events capability required'
    };
  }
  
  const events = [];
  let unsubscribe = null;
  
  const collectPromise = new Promise((resolve) => {
    // Subscribe to events
    unsubscribe = context.events.on(eventName, (data) => {
      if (filter(data)) {
        events.push({
          timestamp: Date.now(),
          data
        });
        
        if (events.length >= maxEvents) {
          resolve();
        }
      }
    });
    
    // Also resolve on timeout
    setTimeout(resolve, timeoutMs);
  });
  
  await collectPromise;
  
  // Cleanup
  if (unsubscribe) {
    unsubscribe();
  }
  
  return {
    ok: true,
    value: events
  };
}

/**
 * Watch a value and trigger when it changes
 * @param {Function} getValue - Function to get the current value
 * @param {Object} options - Watch options
 * @param {Function} [options.onChange] - Called when value changes
 * @param {Function} [options.shouldStop] - Predicate to stop watching
 * @param {number} [options.checkInterval=1000] - Check interval
 * @param {number} [options.timeoutMs=60000] - Maximum watch time
 * @returns {Promise<{ok: boolean, value?: any, error?: string, changes?: Array}>}
 * 
 * @example
 * // Watch health changes
 * const result = await watchValue(
 *   async () => {
 *     const state = await ctx.bot.getState();
 *     return state.health;
 *   },
 *   {
 *     onChange: (newVal, oldVal) => {
 *       if (newVal < oldVal) {
 *         console.log(`Took ${oldVal - newVal} damage!`);
 *       }
 *     },
 *     shouldStop: (health) => health <= 5,
 *     timeoutMs: 120000
 *   }
 * );
 */
async function watchValue(getValue, options = {}) {
  const {
    onChange = () => {},
    shouldStop = () => false,
    checkInterval = 1000,
    timeoutMs = 60000
  } = options;
  
  const changes = [];
  let previousValue = await getValue();
  
  const result = await until(
    async () => {
      const currentValue = await getValue();
      
      // Check if value changed
      if (currentValue !== previousValue) {
        onChange(currentValue, previousValue);
        changes.push({
          timestamp: Date.now(),
          from: previousValue,
          to: currentValue
        });
        previousValue = currentValue;
      }
      
      // Check stop condition
      if (shouldStop(currentValue)) {
        return { ok: true, value: currentValue };
      }
      
      return false;
    },
    {
      checkInterval,
      timeoutMs,
      description: 'Watching value'
    }
  );
  
  return {
    ...result,
    changes
  };
}

// Helper functions

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanEntities(context, entityType, radius) {
  // Placeholder for entity scanning
  // In production, would use bot API to scan for entities
  return [];
}

module.exports = {
  until,
  blockAppears,
  entityAppears,
  inventoryContains,
  collectEvents,
  watchValue
};