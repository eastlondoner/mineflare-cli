/**
 * Search Pattern Utilities for Mineflare SDK
 * Provides deterministic search algorithms and patterns
 */

const { Vec3, ProgramError, ErrorCode } = require('./types');
const { SeededRandom } = require('./helpers');
const { followPath } = require('./movement');

/**
 * Enhanced expanding square search with better API
 * @param {Object} context - Bot context
 * @param {Object} options - Search options
 * @param {number} [options.radius=20] - Maximum search radius
 * @param {Function} options.predicate - Function to test each position
 * @param {number} [options.stepSize=1] - Distance between search positions
 * @param {number} [options.startRadius=0] - Starting ring radius
 * @param {Function} [options.onRing] - Called when starting a new ring
 * @param {Function} [options.onPosition] - Called at each position
 * @param {number} [options.seed=1] - Random seed for deterministic behavior
 * @returns {Promise<{ok: boolean, value?: any, error?: string, stats?: Object}>}
 * 
 * @example
 * // Search for diamonds in expanding pattern
 * const result = await expandSquare(ctx, {
 *   radius: 50,
 *   predicate: async (pos) => {
 *     const blocks = await ctx.world.scan.blocks({
 *       kinds: ['diamond_ore'],
 *       radius: 3,
 *       max: 1
 *     });
 *     return blocks.length > 0 ? { found: true, blocks } : false;
 *   },
 *   onRing: (ring) => console.log(`Searching ring ${ring}`),
 *   onPosition: (pos, index) => console.log(`Position ${index}: ${pos}`)
 * });
 */
async function expandSquare(context, options) {
  const {
    radius = 20,
    predicate,
    stepSize = 1,
    startRadius = 0,
    onRing = () => {},
    onPosition = () => {},
    seed = 1
  } = options;
  
  if (!predicate) {
    return {
      ok: false,
      error: 'Predicate function is required'
    };
  }
  
  const startState = await context.bot.getState();
  const center = startState.position;
  const positions = generateExpandingSquarePositions(center, radius, stepSize, startRadius);
  
  let currentRing = startRadius;
  let positionsVisited = 0;
  let totalDistance = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    
    // Calculate ring number
    const ring = calculateRing(center, position, stepSize);
    if (ring > currentRing) {
      await onRing(ring);
      currentRing = ring;
    }
    
    // Navigate to position
    try {
      const beforeMove = await context.bot.getState();
      await context.actions.navigate.goto(position, {
        timeoutMs: 30000
      });
      const afterMove = await context.bot.getState();
      totalDistance += beforeMove.position.distanceTo(afterMove.position);
    } catch (error) {
      console.warn(`Failed to reach position ${i}: ${error.message}`);
      continue;
    }
    
    positionsVisited++;
    await onPosition(position, i);
    
    // Test predicate
    const result = await predicate(position);
    if (result && (result === true || result.found || result.ok)) {
      return {
        ok: true,
        value: {
          position,
          result: result === true ? { found: true } : result,
          ring: currentRing
        },
        stats: {
          positionsVisited,
          totalDistance,
          timeElapsed: Date.now() - startTime,
          efficiency: positionsVisited / positions.length
        }
      };
    }
  }
  
  return {
    ok: false,
    error: `No match found within radius ${radius}`,
    stats: {
      positionsVisited,
      totalDistance,
      timeElapsed: Date.now() - startTime,
      efficiency: positionsVisited / positions.length
    }
  };
}

/**
 * Bug2 boundary-following algorithm for obstacle navigation
 * @param {Object} context - Bot context
 * @param {Vec3} goal - Goal position
 * @param {Object} options - Algorithm options
 * @param {number} [options.maxIterations=1000] - Maximum iterations
 * @param {Function} [options.isObstacle] - Function to check if position is obstacle
 * @param {string} [options.followDirection='right'] - Direction to follow boundaries
 * @param {number} [options.stepSize=1] - Step size for movement
 * @returns {Promise<{ok: boolean, value?: Array<Vec3>, error?: string, stats?: Object}>}
 * 
 * @example
 * // Navigate around obstacles to reach goal
 * const result = await bug2(ctx, new Vec3(100, 64, 100), {
 *   isObstacle: async (pos) => {
 *     const block = await ctx.world.getBlockAt(pos);
 *     return block && block.name !== 'air';
 *   },
 *   followDirection: 'right'
 * });
 * if (result.ok) {
 *   await followPath(ctx, result.value);
 * }
 */
async function bug2(context, goal, options = {}) {
  const {
    maxIterations = 1000,
    isObstacle = defaultIsObstacle,
    followDirection = 'right',
    stepSize = 1
  } = options;
  
  const startState = await context.bot.getState();
  const start = startState.position;
  const path = [start];
  
  let current = start;
  let iterations = 0;
  let mode = 'direct';  // 'direct' or 'follow'
  let mLine = calculateMLine(start, goal);
  let closestDistToGoal = current.distanceTo(goal);
  let leavePoint = null;
  
  while (iterations < maxIterations && !isAtGoal(current, goal)) {
    iterations++;
    
    if (mode === 'direct') {
      // Try to move directly toward goal
      const next = stepToward(current, goal, stepSize);
      
      if (await isObstacle(next)) {
        // Hit obstacle, switch to boundary following
        mode = 'follow';
        leavePoint = null;
        continue;
      }
      
      current = next;
      path.push(current);
    } else {
      // Follow boundary
      const boundaryStep = await followBoundary(
        context,
        current,
        followDirection,
        isObstacle,
        stepSize
      );
      
      if (!boundaryStep) {
        return {
          ok: false,
          error: 'Cannot follow boundary further',
          value: path
        };
      }
      
      current = boundaryStep;
      path.push(current);
      
      // Check if we can leave the boundary
      const distToGoal = current.distanceTo(goal);
      if (isOnMLine(current, mLine) && distToGoal < closestDistToGoal) {
        // Found a better leave point
        mode = 'direct';
        closestDistToGoal = distToGoal;
      }
    }
  }
  
  if (isAtGoal(current, goal)) {
    return {
      ok: true,
      value: optimizePath(path),
      stats: {
        iterations,
        pathLength: path.length,
        directDistance: start.distanceTo(goal),
        actualDistance: calculatePathDistance(path)
      }
    };
  }
  
  return {
    ok: false,
    error: `Failed to reach goal after ${iterations} iterations`,
    value: path
  };
}

/**
 * Spiral search pattern
 * @param {Object} context - Bot context
 * @param {Object} options - Spiral options
 * @param {number} [options.maxRadius=30] - Maximum spiral radius
 * @param {Function} options.predicate - Test function for each position
 * @param {number} [options.spacing=2] - Spacing between spiral arms
 * @param {boolean} [options.clockwise=true] - Spiral direction
 * @returns {Promise<{ok: boolean, value?: any, error?: string}>}
 * 
 * @example
 * const result = await spiral(ctx, {
 *   maxRadius: 20,
 *   spacing: 3,
 *   predicate: async (pos) => {
 *     const block = await ctx.world.getBlockAt(pos);
 *     return block && block.name === 'spawner';
 *   }
 * });
 */
async function spiral(context, options) {
  const {
    maxRadius = 30,
    predicate,
    spacing = 2,
    clockwise = true
  } = options;
  
  if (!predicate) {
    return {
      ok: false,
      error: 'Predicate function is required'
    };
  }
  
  const startState = await context.bot.getState();
  const center = startState.position;
  const positions = generateSpiralPositions(center, maxRadius, spacing, clockwise);
  
  for (const position of positions) {
    try {
      await context.actions.navigate.goto(position, {
        timeoutMs: 10000
      });
      
      const result = await predicate(position);
      if (result && (result === true || result.found || result.ok)) {
        return {
          ok: true,
          value: {
            position,
            result: result === true ? { found: true } : result
          }
        };
      }
    } catch (error) {
      console.warn(`Spiral search position unreachable: ${error.message}`);
    }
  }
  
  return {
    ok: false,
    error: `Spiral search completed without finding target`
  };
}

/**
 * Random walk search (Monte Carlo)
 * @param {Object} context - Bot context
 * @param {Object} options - Random walk options
 * @param {number} [options.steps=100] - Number of random steps
 * @param {Function} options.predicate - Test function
 * @param {number} [options.stepSize=5] - Size of each random step
 * @param {number} [options.seed=1] - Random seed
 * @param {number} [options.maxRadius=50] - Maximum distance from start
 * @returns {Promise<{ok: boolean, value?: any, error?: string}>}
 * 
 * @example
 * const result = await randomWalk(ctx, {
 *   steps: 200,
 *   stepSize: 3,
 *   predicate: async (pos) => {
 *     const biome = await ctx.world.getBiome(pos);
 *     return biome === 'jungle';
 *   }
 * });
 */
async function randomWalk(context, options) {
  const {
    steps = 100,
    predicate,
    stepSize = 5,
    seed = 1,
    maxRadius = 50
  } = options;
  
  const random = new SeededRandom(seed);
  const startState = await context.bot.getState();
  const startPos = startState.position;
  const visited = new Set();
  
  for (let i = 0; i < steps; i++) {
    // Generate random direction
    const angle = random.next() * 2 * Math.PI;
    const distance = random.int(1, stepSize);
    
    const dx = Math.round(distance * Math.cos(angle));
    const dz = Math.round(distance * Math.sin(angle));
    
    const currentState = await context.bot.getState();
    const targetPos = new Vec3(
      currentState.position.x + dx,
      currentState.position.y,
      currentState.position.z + dz
    );
    
    // Check if within max radius
    if (targetPos.distanceTo(startPos) > maxRadius) {
      continue;
    }
    
    // Check if already visited
    const posKey = `${Math.floor(targetPos.x)},${Math.floor(targetPos.z)}`;
    if (visited.has(posKey)) {
      continue;
    }
    visited.add(posKey);
    
    try {
      await context.actions.navigate.goto(targetPos, {
        timeoutMs: 10000
      });
      
      const result = await predicate(targetPos);
      if (result && (result === true || result.found || result.ok)) {
        return {
          ok: true,
          value: {
            position: targetPos,
            result: result === true ? { found: true } : result,
            stepsToken: i + 1
          }
        };
      }
    } catch (error) {
      // Position unreachable, try another
      continue;
    }
  }
  
  return {
    ok: false,
    error: `Random walk completed ${steps} steps without success`
  };
}

// Helper functions

function generateExpandingSquarePositions(center, radius, stepSize, startRadius) {
  const positions = [];
  
  for (let ring = startRadius; ring <= radius; ring += stepSize) {
    if (ring === 0) {
      positions.push(new Vec3(center.x, center.y, center.z));
      continue;
    }
    
    // Generate positions for this ring
    // North edge
    for (let x = -ring; x <= ring; x += stepSize) {
      positions.push(new Vec3(
        Math.floor(center.x + x),
        Math.floor(center.y),
        Math.floor(center.z - ring)
      ));
    }
    
    // East edge
    for (let z = -ring + stepSize; z <= ring; z += stepSize) {
      positions.push(new Vec3(
        Math.floor(center.x + ring),
        Math.floor(center.y),
        Math.floor(center.z + z)
      ));
    }
    
    // South edge
    for (let x = ring - stepSize; x >= -ring; x -= stepSize) {
      positions.push(new Vec3(
        Math.floor(center.x + x),
        Math.floor(center.y),
        Math.floor(center.z + ring)
      ));
    }
    
    // West edge
    for (let z = ring - stepSize; z > -ring; z -= stepSize) {
      positions.push(new Vec3(
        Math.floor(center.x - ring),
        Math.floor(center.y),
        Math.floor(center.z + z)
      ));
    }
  }
  
  return positions;
}

function generateSpiralPositions(center, maxRadius, spacing, clockwise) {
  const positions = [];
  let angle = 0;
  let radius = 0;
  
  while (radius <= maxRadius) {
    const x = center.x + radius * Math.cos(angle);
    const z = center.z + radius * Math.sin(angle);
    
    positions.push(new Vec3(
      Math.floor(x),
      Math.floor(center.y),
      Math.floor(z)
    ));
    
    angle += (clockwise ? 1 : -1) * (spacing / Math.max(radius, 1));
    radius += spacing * 0.1;
  }
  
  return positions;
}

function calculateRing(center, position, stepSize) {
  const dx = Math.abs(position.x - center.x);
  const dz = Math.abs(position.z - center.z);
  return Math.floor(Math.max(dx, dz) / stepSize);
}

function defaultIsObstacle(position) {
  // Default implementation - would check actual blocks in production
  return false;
}

function calculateMLine(start, goal) {
  // Calculate line equation from start to goal
  return {
    start,
    goal,
    direction: new Vec3(
      goal.x - start.x,
      goal.y - start.y,
      goal.z - start.z
    )
  };
}

function isOnMLine(position, mLine) {
  // Check if position is approximately on the M-line
  // Simplified - would use proper line distance in production
  const tolerance = 2;
  return true;  // Simplified
}

function isAtGoal(position, goal) {
  return position.distanceTo(goal) < 2;
}

function stepToward(from, to, stepSize) {
  const direction = new Vec3(
    to.x - from.x,
    to.y - from.y,
    to.z - from.z
  );
  
  const length = Math.sqrt(
    direction.x * direction.x +
    direction.y * direction.y +
    direction.z * direction.z
  );
  
  if (length === 0) return from;
  
  return new Vec3(
    from.x + (direction.x / length) * stepSize,
    from.y,
    from.z + (direction.z / length) * stepSize
  );
}

async function followBoundary(context, position, direction, isObstacle, stepSize) {
  // Simplified boundary following
  // In production, would implement proper wall-following algorithm
  const offsets = direction === 'right'
    ? [[1, 0], [0, 1], [-1, 0], [0, -1]]
    : [[-1, 0], [0, -1], [1, 0], [0, 1]];
  
  for (const [dx, dz] of offsets) {
    const next = new Vec3(
      position.x + dx * stepSize,
      position.y,
      position.z + dz * stepSize
    );
    
    if (!await isObstacle(next)) {
      return next;
    }
  }
  
  return null;
}

function optimizePath(path) {
  // Remove redundant waypoints
  if (path.length <= 2) return path;
  
  const optimized = [path[0]];
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = optimized[optimized.length - 1];
    const curr = path[i];
    const next = path[i + 1];
    
    // Check if curr is necessary (not collinear)
    if (!areCollinear(prev, curr, next)) {
      optimized.push(curr);
    }
  }
  
  optimized.push(path[path.length - 1]);
  return optimized;
}

function areCollinear(p1, p2, p3) {
  // Check if three points are collinear
  const tolerance = 0.1;
  const cross = (p2.x - p1.x) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.x - p1.x);
  return Math.abs(cross) < tolerance;
}

function calculatePathDistance(path) {
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += path[i - 1].distanceTo(path[i]);
  }
  return distance;
}

module.exports = {
  expandSquare,
  bug2,
  spiral,
  randomWalk
};