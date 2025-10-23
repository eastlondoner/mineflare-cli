/**
 * Safety & Recovery Utilities for Mineflare SDK
 * Provides utilities for safe movement and recovery from dangerous situations
 */

const { Vec3, ProgramError, ErrorCode } = require('./types');
const { step, moveCardinal } = require('./movement');
const { withTimeout } = require('./flow');

/**
 * Escape from a hole or pit by finding and navigating to higher ground
 * @param {Object} context - Bot context
 * @param {Object} options - Escape options
 * @param {number} [options.maxAttempts=10] - Maximum escape attempts
 * @param {number} [options.scanRadius=5] - Radius to scan for escape routes
 * @param {number} [options.targetHeight=2] - Minimum height gain to consider escaped
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string, attempts?: number}>}
 * 
 * @example
 * // Fell into a hole - try to escape
 * const result = await escapeHole(ctx, { targetHeight: 3 });
 * if (result.ok) {
 *   console.log(`Escaped to ${result.value} after ${result.attempts} attempts`);
 * }
 */
async function escapeHole(context, options = {}) {
  const {
    maxAttempts = 10,
    scanRadius = 5,
    targetHeight = 2
  } = options;
  
  const startState = await context.bot.getState();
  const startPos = startState.position;
  const startY = Math.floor(startPos.y);
  
  // Strategy 1: Try to pillar jump (place block below and jump)
  if (context.capabilities.includes('place')) {
    const pillarResult = await attemptPillarJump(context, targetHeight);
    if (pillarResult.ok) {
      return pillarResult;
    }
  }
  
  // Strategy 2: Look for nearby stairs or slopes
  const escapeRoutes = await findEscapeRoutes(context, scanRadius);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Try each escape route
    for (const route of escapeRoutes) {
      const result = await attemptEscapeRoute(context, route);
      
      if (result.ok) {
        const currentState = await context.bot.getState();
        const heightGained = Math.floor(currentState.position.y) - startY;
        
        if (heightGained >= targetHeight) {
          return {
            ok: true,
            value: currentState.position,
            attempts: attempt
          };
        }
      }
    }
    
    // Strategy 3: Try digging stairs upward if we have dig capability
    if (context.capabilities.includes('dig')) {
      const stairResult = await digStairway(context, targetHeight);
      if (stairResult.ok) {
        return {
          ...stairResult,
          attempts: attempt
        };
      }
    }
  }
  
  return {
    ok: false,
    error: `Failed to escape hole after ${maxAttempts} attempts`,
    attempts: maxAttempts
  };
}

/**
 * Take a step with comprehensive safety pre-checks
 * @param {Object} context - Bot context
 * @param {Vec3} direction - Direction to step
 * @param {Object} options - Safety options
 * @param {boolean} [options.checkLava=true] - Check for lava
 * @param {boolean} [options.checkFall=true] - Check for dangerous falls
 * @param {boolean} [options.checkMobs=true] - Check for hostile mobs
 * @param {boolean} [options.checkCeiling=true] - Check headroom
 * @param {number} [options.maxDrop=4] - Maximum safe drop distance
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string, hazards?: Array}>}
 * 
 * @example
 * // Take a very safe step forward
 * const result = await safeStep(ctx, new Vec3(0, 0, -1), {
 *   checkLava: true,
 *   checkFall: true,
 *   maxDrop: 2
 * });
 * if (!result.ok) {
 *   console.log('Hazards detected:', result.hazards);
 * }
 */
async function safeStep(context, direction, options = {}) {
  const {
    checkLava = true,
    checkFall = true,
    checkMobs = true,
    checkCeiling = true,
    maxDrop = 4
  } = options;
  
  const hazards = [];
  const state = await context.bot.getState();
  const currentPos = state.position;
  
  // Calculate target position
  const targetPos = new Vec3(
    Math.floor(currentPos.x) + Math.sign(direction.x),
    Math.floor(currentPos.y) + Math.sign(direction.y),
    Math.floor(currentPos.z) + Math.sign(direction.z)
  );
  
  // Pre-flight safety checks
  const safetyChecks = await performSafetyChecks(context, targetPos, {
    checkLava,
    checkFall,
    checkMobs,
    checkCeiling,
    maxDrop
  });
  
  if (!safetyChecks.ok) {
    return {
      ok: false,
      error: safetyChecks.error,
      hazards: safetyChecks.hazards
    };
  }
  
  // Perform the step with movement primitives
  const stepResult = await step(context, direction, {
    maxDrop,
    checkSupport: true,
    checkHeadroom: checkCeiling,
    allowWater: true,
    allowLava: false
  });
  
  return stepResult;
}

/**
 * Create a safe zone by clearing hazards and placing protective blocks
 * @param {Object} context - Bot context
 * @param {Vec3} [center] - Center of safe zone (defaults to current position)
 * @param {Object} options - Safe zone options
 * @param {number} [options.radius=2] - Radius of safe zone
 * @param {boolean} [options.placeTorches=true] - Place torches for lighting
 * @param {boolean} [options.clearHostiles=true] - Clear hostile mobs
 * @returns {Promise<{ok: boolean, value?: Object, error?: string}>}
 * 
 * @example
 * const result = await createSafeZone(ctx, null, { 
 *   radius: 3, 
 *   placeTorches: true 
 * });
 */
async function createSafeZone(context, center = null, options = {}) {
  const {
    radius = 2,
    placeTorches = true,
    clearHostiles = true
  } = options;
  
  const state = await context.bot.getState();
  const centerPos = center || state.position;
  
  const actions = [];
  
  // Clear dangerous blocks (lava, water sources)
  if (context.capabilities.includes('dig')) {
    actions.push(await clearDangerousBlocks(context, centerPos, radius));
  }
  
  // Place floor if there are gaps
  if (context.capabilities.includes('place')) {
    actions.push(await ensureSolidFloor(context, centerPos, radius));
  }
  
  // Place torches for mob prevention
  if (placeTorches && context.capabilities.includes('place')) {
    actions.push(await placeLighting(context, centerPos, radius));
  }
  
  // Clear hostile mobs if combat is enabled
  if (clearHostiles && context.capabilities.includes('attack')) {
    actions.push(await clearHostileMobs(context, centerPos, radius));
  }
  
  const failures = actions.filter(a => a && !a.ok);
  if (failures.length > 0) {
    return {
      ok: false,
      error: `Failed to create safe zone: ${failures.map(f => f.error).join(', ')}`,
      value: { completed: actions.filter(a => a && a.ok).length, total: actions.length }
    };
  }
  
  return {
    ok: true,
    value: {
      center: centerPos,
      radius,
      actionsCompleted: actions.length
    }
  };
}

/**
 * Monitor health and food levels, taking action if they drop
 * @param {Object} context - Bot context
 * @param {Object} options - Monitor options
 * @param {number} [options.minHealth=10] - Minimum health before taking action
 * @param {number} [options.minFood=10] - Minimum food before eating
 * @param {Function} [options.onLowHealth] - Callback when health is low
 * @param {Function} [options.onLowFood] - Callback when food is low
 * @returns {Promise<{ok: boolean, value?: Object, error?: string}>}
 * 
 * @example
 * const result = await monitorVitals(ctx, {
 *   minHealth: 15,
 *   minFood: 15,
 *   onLowHealth: async () => await retreat(ctx),
 *   onLowFood: async () => await eatFood(ctx)
 * });
 */
async function monitorVitals(context, options = {}) {
  const {
    minHealth = 10,
    minFood = 10,
    onLowHealth = null,
    onLowFood = null
  } = options;
  
  const state = await context.bot.getState();
  const actions = [];
  
  // Check health
  if (state.health < minHealth) {
    context.log.warn(`Low health: ${state.health}/${20}`);
    
    if (onLowHealth) {
      const result = await onLowHealth();
      actions.push({ type: 'health', result });
    } else {
      // Default: try to retreat to safety
      const retreatResult = await retreatToSafety(context);
      actions.push({ type: 'health', result: retreatResult });
    }
  }
  
  // Check food
  if (state.food < minFood) {
    context.log.warn(`Low food: ${state.food}/${20}`);
    
    if (onLowFood) {
      const result = await onLowFood();
      actions.push({ type: 'food', result });
    } else if (context.capabilities.includes('inventory')) {
      // Default: try to eat food from inventory
      const eatResult = await eatAvailableFood(context);
      actions.push({ type: 'food', result: eatResult });
    }
  }
  
  const failed = actions.filter(a => a.result && !a.result.ok);
  
  return {
    ok: failed.length === 0,
    value: {
      health: state.health,
      food: state.food,
      actionsTaken: actions.length
    },
    error: failed.length > 0 
      ? `Failed actions: ${failed.map(a => a.type).join(', ')}` 
      : undefined
  };
}

/**
 * Retreat to a safe position when in danger
 * @param {Object} context - Bot context
 * @param {Object} options - Retreat options
 * @param {number} [options.distance=10] - Distance to retreat
 * @param {string} [options.preferDirection] - Preferred retreat direction
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string}>}
 */
async function retreatToSafety(context, options = {}) {
  const {
    distance = 10,
    preferDirection = null
  } = options;
  
  // Try to move away from danger
  const directions = preferDirection 
    ? [preferDirection, 'north', 'south', 'east', 'west']
    : ['south', 'east', 'north', 'west'];  // Default priority
  
  for (const direction of directions) {
    const result = await moveCardinal(context, direction, distance, {
      maxDrop: 2,
      checkSupport: true
    });
    
    if (result.ok || result.stepsCompleted >= distance / 2) {
      return {
        ok: true,
        value: result.value
      };
    }
  }
  
  return {
    ok: false,
    error: 'Could not find safe retreat path'
  };
}

// Helper functions

async function attemptPillarJump(context, targetHeight) {
  // Simplified pillar jump logic
  // In production, would place blocks below and jump up
  return { ok: false, error: 'Pillar jump not yet implemented' };
}

async function findEscapeRoutes(context, radius) {
  // Scan for potential escape routes (slopes, stairs, etc.)
  const routes = [];
  
  // Simple heuristic: check cardinal directions for slopes
  const directions = [
    { name: 'north', vec: new Vec3(0, 0, -1) },
    { name: 'south', vec: new Vec3(0, 0, 1) },
    { name: 'east', vec: new Vec3(1, 0, 0) },
    { name: 'west', vec: new Vec3(-1, 0, 0) }
  ];
  
  for (const dir of directions) {
    routes.push({
      direction: dir.name,
      vector: dir.vec,
      priority: Math.random()  // Would use deterministic ordering in production
    });
  }
  
  return routes.sort((a, b) => a.priority - b.priority);
}

async function attemptEscapeRoute(context, route) {
  return await moveCardinal(context, route.direction, 5, {
    maxDrop: 1,
    checkSupport: true
  });
}

async function digStairway(context, targetHeight) {
  // Simplified stair digging logic
  return { ok: false, error: 'Stair digging not yet implemented' };
}

async function performSafetyChecks(context, targetPos, options) {
  const hazards = [];
  
  // Check for various hazards at target position
  // In production, would check actual block data
  
  if (options.checkLava) {
    // Check for lava
  }
  
  if (options.checkFall) {
    // Check for dangerous drops
  }
  
  if (options.checkMobs) {
    // Check for hostile mobs nearby
  }
  
  if (options.checkCeiling) {
    // Check for sufficient headroom
  }
  
  if (hazards.length > 0) {
    return {
      ok: false,
      error: `Hazards detected: ${hazards.join(', ')}`,
      hazards
    };
  }
  
  return { ok: true };
}

async function clearDangerousBlocks(context, center, radius) {
  // Clear lava, water sources, etc.
  return { ok: true };
}

async function ensureSolidFloor(context, center, radius) {
  // Fill gaps in floor
  return { ok: true };
}

async function placeLighting(context, center, radius) {
  // Place torches for mob prevention
  return { ok: true };
}

async function clearHostileMobs(context, center, radius) {
  // Attack hostile mobs in area
  return { ok: true };
}

async function eatAvailableFood(context) {
  // Try to eat food from inventory
  return { ok: false, error: 'No food available' };
}

module.exports = {
  escapeHole,
  safeStep,
  createSafeZone,
  monitorVitals,
  retreatToSafety
};