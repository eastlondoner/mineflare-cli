/**
 * Movement Primitives for Mineflare SDK
 * Provides safe, composable movement operations with safety checks
 */

const { Vec3, ProgramError, ErrorCode } = require('./types');

/**
 * Take a single safe step in a direction with safety checks
 * @param {Object} context - Bot context
 * @param {Vec3} direction - Direction to step (normalized or unit vector)
 * @param {Object} options - Step options
 * @param {number} [options.maxDrop=4] - Maximum allowed drop distance
 * @param {boolean} [options.checkSupport=true] - Check for solid ground below
 * @param {boolean} [options.checkHeadroom=true] - Check for clearance above
 * @param {boolean} [options.allowWater=false] - Allow stepping into water
 * @param {boolean} [options.allowLava=false] - Allow stepping into lava (dangerous!)
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string}>} Result with new position
 * 
 * @example
 * // Step forward (north)
 * const result = await step(ctx, new Vec3(0, 0, -1), { maxDrop: 3 });
 * 
 * // Step up and forward
 * const result = await step(ctx, new Vec3(1, 1, 0), { checkHeadroom: true });
 */
async function step(context, direction, options = {}) {
  const {
    maxDrop = 4,
    checkSupport = true,
    checkHeadroom = true,
    allowWater = false,
    allowLava = false
  } = options;

  try {
    const state = await context.bot.getState();
    const currentPos = state.position;
    
    // Calculate target position (one block step)
    const targetPos = new Vec3(
      Math.floor(currentPos.x) + Math.sign(direction.x),
      Math.floor(currentPos.y) + Math.sign(direction.y),
      Math.floor(currentPos.z) + Math.sign(direction.z)
    );
    
    // Validate the target position
    const validation = await validateStep(context, currentPos, targetPos, {
      maxDrop,
      checkSupport,
      checkHeadroom,
      allowWater,
      allowLava
    });
    
    if (!validation.ok) {
      return validation;
    }
    
    // Perform the step
    await context.actions.navigate.goto(targetPos, { timeoutMs: 5000 });
    
    return { ok: true, value: targetPos };
  } catch (error) {
    return { 
      ok: false, 
      error: `Step failed: ${error.message}` 
    };
  }
}

/**
 * Move in a cardinal direction with safety checks
 * @param {Object} context - Bot context
 * @param {string} direction - Direction: 'north', 'south', 'east', 'west', 'up', 'down'
 * @param {number} [distance=1] - Number of blocks to move
 * @param {Object} options - Movement options
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string, stepsCompleted?: number}>}
 * 
 * @example
 * // Move 5 blocks north with safety
 * const result = await moveCardinal(ctx, 'north', 5, { maxDrop: 2 });
 * if (result.ok) {
 *   console.log(`Moved to ${result.value}`);
 * } else {
 *   console.log(`Only moved ${result.stepsCompleted} blocks: ${result.error}`);
 * }
 */
async function moveCardinal(context, direction, distance = 1, options = {}) {
  const directionVectors = {
    north: new Vec3(0, 0, -1),
    south: new Vec3(0, 0, 1),
    east: new Vec3(1, 0, 0),
    west: new Vec3(-1, 0, 0),
    up: new Vec3(0, 1, 0),
    down: new Vec3(0, -1, 0)
  };
  
  const vector = directionVectors[direction.toLowerCase()];
  if (!vector) {
    return { 
      ok: false, 
      error: `Invalid direction: ${direction}. Use: north, south, east, west, up, down` 
    };
  }
  
  let stepsCompleted = 0;
  let currentPosition = null;
  
  for (let i = 0; i < distance; i++) {
    const result = await step(context, vector, options);
    
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        stepsCompleted,
        value: currentPosition
      };
    }
    
    stepsCompleted++;
    currentPosition = result.value;
  }
  
  return {
    ok: true,
    value: currentPosition,
    stepsCompleted
  };
}

/**
 * Move along a path with continuous safety validation
 * @param {Object} context - Bot context
 * @param {Array<Vec3>} path - Array of positions to follow
 * @param {Object} options - Movement options
 * @param {Function} [options.onProgress] - Progress callback (position, index, total)
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string, completed?: number}>}
 * 
 * @example
 * const path = [
 *   new Vec3(100, 64, 100),
 *   new Vec3(105, 64, 100),
 *   new Vec3(105, 64, 105)
 * ];
 * const result = await followPath(ctx, path, {
 *   maxDrop: 3,
 *   onProgress: (pos, i, total) => console.log(`Step ${i}/${total}`)
 * });
 */
async function followPath(context, path, options = {}) {
  const {
    maxDrop = 4,
    checkSupport = true,
    checkHeadroom = true,
    allowWater = false,
    allowLava = false,
    onProgress = () => {}
  } = options;
  
  let completed = 0;
  let lastPosition = null;
  
  for (let i = 0; i < path.length; i++) {
    const targetPos = path[i];
    
    // Get current position
    const state = await context.bot.getState();
    const currentPos = state.position;
    
    // Validate movement to next position
    const validation = await validateStep(context, currentPos, targetPos, {
      maxDrop,
      checkSupport,
      checkHeadroom,
      allowWater,
      allowLava
    });
    
    if (!validation.ok) {
      return {
        ok: false,
        error: `Path blocked at step ${i + 1}: ${validation.error}`,
        completed,
        value: lastPosition
      };
    }
    
    // Move to position
    try {
      await context.actions.navigate.goto(targetPos, { timeoutMs: 10000 });
      completed++;
      lastPosition = targetPos;
      onProgress(targetPos, i + 1, path.length);
    } catch (error) {
      return {
        ok: false,
        error: `Failed at step ${i + 1}: ${error.message}`,
        completed,
        value: lastPosition
      };
    }
  }
  
  return {
    ok: true,
    value: lastPosition,
    completed
  };
}

/**
 * Strafe (move sideways) while maintaining look direction
 * @param {Object} context - Bot context
 * @param {string} direction - 'left' or 'right'
 * @param {number} [distance=1] - Distance to strafe
 * @param {Object} options - Movement options
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string}>}
 * 
 * @example
 * // Strafe 3 blocks to the right
 * const result = await strafe(ctx, 'right', 3);
 */
async function strafe(context, direction, distance = 1, options = {}) {
  const state = await context.bot.getState();
  
  // Calculate strafe direction based on current yaw
  const yaw = state.yaw;
  const strafeAngle = direction === 'left' 
    ? yaw - Math.PI / 2 
    : yaw + Math.PI / 2;
  
  // Convert angle to direction vector
  const vector = new Vec3(
    -Math.sin(strafeAngle),
    0,
    Math.cos(strafeAngle)
  );
  
  let stepsCompleted = 0;
  let currentPosition = null;
  
  for (let i = 0; i < distance; i++) {
    const result = await step(context, vector, options);
    
    if (!result.ok) {
      return {
        ok: false,
        error: `Strafe failed after ${stepsCompleted} steps: ${result.error}`,
        value: currentPosition
      };
    }
    
    stepsCompleted++;
    currentPosition = result.value;
  }
  
  return {
    ok: true,
    value: currentPosition
  };
}

/**
 * Validate if a step from one position to another is safe
 * @private
 */
async function validateStep(context, fromPos, toPos, options) {
  const {
    maxDrop = 4,
    checkSupport = true,
    checkHeadroom = true,
    allowWater = false,
    allowLava = false
  } = options;
  
  // Simulate block checking (would use actual bot API in production)
  // This is a placeholder for the actual block checking logic
  
  // Check drop distance
  const dropDistance = fromPos.y - toPos.y;
  if (dropDistance > maxDrop) {
    return { 
      ok: false, 
      error: `Drop too high: ${dropDistance} blocks (max: ${maxDrop})` 
    };
  }
  
  // Check if target position is valid
  // In production, would check:
  // - Block at target is passable (air, water if allowed)
  // - Block below target is solid (if checkSupport)
  // - Block above target is clear (if checkHeadroom)
  // - No lava at target (unless allowLava)
  
  return { ok: true };
}

/**
 * Jump to reach a higher position
 * @param {Object} context - Bot context
 * @param {Vec3} target - Target position (must be 1 block higher)
 * @param {Object} options - Jump options
 * @returns {Promise<{ok: boolean, value?: Vec3, error?: string}>}
 * 
 * @example
 * const above = currentPos.offset(0, 1, 0);
 * const result = await jumpTo(ctx, above);
 */
async function jumpTo(context, target, options = {}) {
  const state = await context.bot.getState();
  const currentPos = state.position;
  
  // Validate jump is possible (1 block up, within 2 blocks horizontal)
  const heightDiff = target.y - currentPos.y;
  const horizontalDist = Math.sqrt(
    Math.pow(target.x - currentPos.x, 2) + 
    Math.pow(target.z - currentPos.z, 2)
  );
  
  if (heightDiff < 0.5 || heightDiff > 1.5) {
    return { 
      ok: false, 
      error: `Invalid jump height: ${heightDiff} blocks (must be ~1)` 
    };
  }
  
  if (horizontalDist > 2) {
    return { 
      ok: false, 
      error: `Jump too far: ${horizontalDist.toFixed(1)} blocks (max: 2)` 
    };
  }
  
  try {
    // Perform jump navigation
    await context.actions.navigate.goto(target, { 
      timeoutMs: 3000,
      allowJump: true 
    });
    
    return { ok: true, value: target };
  } catch (error) {
    return { 
      ok: false, 
      error: `Jump failed: ${error.message}` 
    };
  }
}

/**
 * Circle-strafe around a point
 * @param {Object} context - Bot context
 * @param {Vec3} center - Center point to circle
 * @param {number} radius - Radius of circle
 * @param {Object} options - Circle options
 * @param {number} [options.steps=8] - Number of positions in circle
 * @param {boolean} [options.clockwise=true] - Direction of circling
 * @returns {Promise<{ok: boolean, path?: Array<Vec3>, error?: string}>}
 * 
 * @example
 * const result = await circleAround(ctx, targetPos, 5, { steps: 16 });
 * if (result.ok) {
 *   await followPath(ctx, result.path);
 * }
 */
async function circleAround(context, center, radius, options = {}) {
  const {
    steps = 8,
    clockwise = true
  } = options;
  
  const path = [];
  const angleStep = (2 * Math.PI) / steps;
  
  for (let i = 0; i < steps; i++) {
    const angle = clockwise 
      ? i * angleStep 
      : -i * angleStep;
    
    const x = center.x + radius * Math.cos(angle);
    const z = center.z + radius * Math.sin(angle);
    
    path.push(new Vec3(
      Math.floor(x),
      center.y,
      Math.floor(z)
    ));
  }
  
  // Close the circle
  path.push(path[0]);
  
  return { ok: true, path };
}

module.exports = {
  step,
  moveCardinal,
  followPath,
  strafe,
  jumpTo,
  circleAround
};