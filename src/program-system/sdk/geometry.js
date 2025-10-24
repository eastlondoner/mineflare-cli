/**
 * Geometry Utilities for Mineflare SDK
 * Provides vector operations and spatial calculations
 */

const { Vec3 } = require('./types');
const { SeededRandom } = require('./helpers');

/**
 * Sort positions by nearest-first order from a reference point
 * @param {Array<Vec3>} positions - Array of positions to sort
 * @param {Vec3} reference - Reference point for distance calculation
 * @param {Object} options - Sort options
 * @param {string} [options.metric='euclidean'] - Distance metric ('euclidean', 'manhattan', 'chebyshev')
 * @param {boolean} [options.tieBreaker=true] - Use deterministic tie-breaking
 * @returns {Array<Vec3>} Sorted array of positions
 * 
 * @example
 * const blocks = await ctx.world.scan.blocks({ kinds: ['wood'], radius: 10 });
 * const sorted = nearestFirst(blocks.map(b => b.position), bot.position);
 * 
 * // Use Manhattan distance for grid-based pathfinding
 * const sorted = nearestFirst(positions, center, { metric: 'manhattan' });
 */
function nearestFirst(positions, reference, options = {}) {
  const {
    metric = 'euclidean',
    tieBreaker = true
  } = options;
  
  // Calculate distances
  const withDistances = positions.map(pos => ({
    position: pos,
    distance: calculateDistance(pos, reference, metric)
  }));
  
  // Sort by distance with deterministic tie-breaking
  withDistances.sort((a, b) => {
    const diff = a.distance - b.distance;
    
    if (diff !== 0) {
      return diff;
    }
    
    // Tie-breaker: sort by x, then y, then z
    if (tieBreaker) {
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      return a.position.z - b.position.z;
    }
    
    return 0;
  });
  
  return withDistances.map(item => item.position);
}

/**
 * Calculate Manhattan distance between two points
 * @param {Vec3} from - Start position
 * @param {Vec3} to - End position
 * @returns {number} Manhattan distance
 * 
 * @example
 * const dist = manhattan(bot.position, target);
 * console.log(`Target is ${dist} blocks away (Manhattan)`);
 */
function manhattan(from, to) {
  return Math.abs(from.x - to.x) + 
         Math.abs(from.y - to.y) + 
         Math.abs(from.z - to.z);
}

/**
 * Calculate Chebyshev distance (chessboard distance)
 * @param {Vec3} from - Start position
 * @param {Vec3} to - End position
 * @returns {number} Chebyshev distance
 * 
 * @example
 * const dist = chebyshev(bot.position, target);
 * console.log(`Target is ${dist} blocks away (Chebyshev)`);
 */
function chebyshev(from, to) {
  return Math.max(
    Math.abs(from.x - to.x),
    Math.abs(from.y - to.y),
    Math.abs(from.z - to.z)
  );
}

/**
 * Calculate Euclidean distance between two points
 * @param {Vec3} from - Start position
 * @param {Vec3} to - End position
 * @returns {number} Euclidean distance
 * 
 * @example
 * const dist = euclidean(bot.position, target);
 */
function euclidean(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Add two vectors
 * @param {Vec3} a - First vector
 * @param {Vec3} b - Second vector
 * @returns {Vec3} Sum vector
 * 
 * @example
 * const newPos = add(bot.position, new Vec3(1, 0, 0));
 */
function add(a, b) {
  return new Vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

/**
 * Subtract vector b from vector a
 * @param {Vec3} a - First vector
 * @param {Vec3} b - Second vector
 * @returns {Vec3} Difference vector
 * 
 * @example
 * const offset = subtract(target, bot.position);
 */
function subtract(a, b) {
  return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Multiply vector by scalar
 * @param {Vec3} vector - Vector to scale
 * @param {number} scalar - Scale factor
 * @returns {Vec3} Scaled vector
 * 
 * @example
 * const halfwayPoint = scale(direction, 0.5);
 */
function scale(vector, scalar) {
  return new Vec3(
    vector.x * scalar,
    vector.y * scalar,
    vector.z * scalar
  );
}

/**
 * Normalize vector to unit length
 * @param {Vec3} vector - Vector to normalize
 * @returns {Vec3} Normalized vector
 * 
 * @example
 * const direction = normalize(subtract(target, bot.position));
 */
function normalize(vector) {
  const length = Math.sqrt(
    vector.x * vector.x +
    vector.y * vector.y +
    vector.z * vector.z
  );
  
  if (length === 0) {
    return new Vec3(0, 0, 0);
  }
  
  return new Vec3(
    vector.x / length,
    vector.y / length,
    vector.z / length
  );
}

/**
 * Calculate dot product of two vectors
 * @param {Vec3} a - First vector
 * @param {Vec3} b - Second vector
 * @returns {number} Dot product
 * 
 * @example
 * const alignment = dot(normalize(forward), normalize(toTarget));
 */
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Calculate cross product of two vectors
 * @param {Vec3} a - First vector
 * @param {Vec3} b - Second vector
 * @returns {Vec3} Cross product vector
 * 
 * @example
 * const perpendicular = cross(forward, up);
 */
function cross(a, b) {
  return new Vec3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

/**
 * Linear interpolation between two positions
 * @param {Vec3} from - Start position
 * @param {Vec3} to - End position
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Vec3} Interpolated position
 * 
 * @example
 * const midpoint = lerp(start, end, 0.5);
 * const quarterWay = lerp(start, end, 0.25);
 */
function lerp(from, to, t) {
  return new Vec3(
    from.x + (to.x - from.x) * t,
    from.y + (to.y - from.y) * t,
    from.z + (to.z - from.z) * t
  );
}

/**
 * Project vector a onto vector b
 * @param {Vec3} a - Vector to project
 * @param {Vec3} b - Vector to project onto
 * @returns {Vec3} Projected vector
 * 
 * @example
 * const forward = project(velocity, direction);
 */
function project(a, b) {
  const bNorm = normalize(b);
  const scalar = dot(a, bNorm);
  return scale(bNorm, scalar);
}

/**
 * Reflect vector across a normal
 * @param {Vec3} vector - Incident vector
 * @param {Vec3} normal - Surface normal
 * @returns {Vec3} Reflected vector
 * 
 * @example
 * const bounce = reflect(velocity, wallNormal);
 */
function reflect(vector, normal) {
  const n = normalize(normal);
  return subtract(vector, scale(n, 2 * dot(vector, n)));
}

/**
 * Rotate vector around Y axis
 * @param {Vec3} vector - Vector to rotate
 * @param {number} angle - Rotation angle in radians
 * @returns {Vec3} Rotated vector
 * 
 * @example
 * const rotated = rotateY(forward, Math.PI / 2); // 90 degrees
 */
function rotateY(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  return new Vec3(
    vector.x * cos - vector.z * sin,
    vector.y,
    vector.x * sin + vector.z * cos
  );
}

/**
 * Get axis-aligned bounding box for positions
 * @param {Array<Vec3>} positions - Array of positions
 * @returns {{min: Vec3, max: Vec3, center: Vec3, size: Vec3}} Bounding box
 * 
 * @example
 * const bounds = getBoundingBox(blockPositions);
 * console.log(`Area size: ${bounds.size.x}x${bounds.size.y}x${bounds.size.z}`);
 */
function getBoundingBox(positions) {
  if (positions.length === 0) {
    return {
      min: new Vec3(0, 0, 0),
      max: new Vec3(0, 0, 0),
      center: new Vec3(0, 0, 0),
      size: new Vec3(0, 0, 0)
    };
  }
  
  let minX = positions[0].x, maxX = positions[0].x;
  let minY = positions[0].y, maxY = positions[0].y;
  let minZ = positions[0].z, maxZ = positions[0].z;
  
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
    minZ = Math.min(minZ, pos.z);
    maxZ = Math.max(maxZ, pos.z);
  }
  
  const min = new Vec3(minX, minY, minZ);
  const max = new Vec3(maxX, maxY, maxZ);
  const center = new Vec3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );
  const size = new Vec3(
    maxX - minX,
    maxY - minY,
    maxZ - minZ
  );
  
  return { min, max, center, size };
}

/**
 * Check if position is within bounds
 * @param {Vec3} position - Position to check
 * @param {Vec3} min - Minimum bounds
 * @param {Vec3} max - Maximum bounds
 * @returns {boolean} True if within bounds
 * 
 * @example
 * const inArea = isWithinBounds(bot.position, areaMin, areaMax);
 */
function isWithinBounds(position, min, max) {
  return position.x >= min.x && position.x <= max.x &&
         position.y >= min.y && position.y <= max.y &&
         position.z >= min.z && position.z <= max.z;
}

/**
 * Get positions on a line between two points
 * @param {Vec3} from - Start position
 * @param {Vec3} to - End position
 * @param {number} [stepSize=1] - Distance between points
 * @returns {Array<Vec3>} Array of positions along the line
 * 
 * @example
 * const path = getLine(start, end, 0.5);
 */
function getLine(from, to, stepSize = 1) {
  const distance = from.distanceTo(to);
  const steps = Math.ceil(distance / stepSize);
  const positions = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    positions.push(lerp(from, to, t));
  }
  
  return positions;
}

/**
 * Get positions in a circle
 * @param {Vec3} center - Center of circle
 * @param {number} radius - Circle radius
 * @param {Object|number} options - Circle options or number of points
 * @param {number} [options.points=8] - Number of points
 * @param {number} [options.y] - Y level (defaults to center.y)
 * @returns {Array<Vec3>} Array of positions on circle
 * 
 * @example
 * const circle = getCircle(center, 5, { points: 16 });
 * const circle = getCircle(center, 5, 16); // Also accepts number of points directly
 */
function getCircle(center, radius, options = {}) {
  // Handle backwards compatibility - if options is a number, treat it as points
  if (typeof options === 'number') {
    options = { points: options };
  }
  
  const {
    points = 8,
    y = center.y
  } = options;
  
  const positions = [];
  const angleStep = (2 * Math.PI) / points;
  
  for (let i = 0; i < points; i++) {
    const angle = i * angleStep;
    positions.push(new Vec3(
      center.x + radius * Math.cos(angle),
      y,
      center.z + radius * Math.sin(angle)
    ));
  }
  
  return positions;
}

/**
 * Get positions in a filled circle (disc)
 * @param {Vec3} center - Center of disc
 * @param {number} radius - Disc radius
 * @param {Object} options - Disc options
 * @param {number} [options.spacing=1] - Spacing between positions
 * @returns {Array<Vec3>} Array of positions in disc
 * 
 * @example
 * const disc = getDisc(center, 10, { spacing: 2 });
 */
function getDisc(center, radius, options = {}) {
  const {
    spacing = 1
  } = options;
  
  const positions = [];
  
  for (let x = -radius; x <= radius; x += spacing) {
    for (let z = -radius; z <= radius; z += spacing) {
      if (x * x + z * z <= radius * radius) {
        positions.push(new Vec3(
          center.x + x,
          center.y,
          center.z + z
        ));
      }
    }
  }
  
  return positions;
}

/**
 * Clamp a value or vector to range
 * @param {number|Vec3} value - Value or vector to clamp
 * @param {number|Vec3} min - Minimum value(s)
 * @param {number|Vec3} max - Maximum value(s)
 * @returns {number|Vec3} Clamped value or vector
 * 
 * @example
 * const bounded = clamp(position, worldMin, worldMax);
 * const boundedValue = clamp(5, 0, 10);
 */
function clamp(value, min, max) {
  // Handle scalar clamp
  if (typeof value === 'number') {
    return Math.max(min, Math.min(max, value));
  }
  
  // Handle vector clamp
  return new Vec3(
    Math.max(min.x, Math.min(max.x, value.x)),
    Math.max(min.y, Math.min(max.y, value.y)),
    Math.max(min.z, Math.min(max.z, value.z))
  );
}

/**
 * Round vector components to integers
 * @param {Vec3} vector - Vector to round
 * @returns {Vec3} Rounded vector
 * 
 * @example
 * const blockPos = round(exactPosition);
 */
function round(vector) {
  return new Vec3(
    Math.round(vector.x),
    Math.round(vector.y),
    Math.round(vector.z)
  );
}

/**
 * Floor vector components to integers
 * @param {Vec3} vector - Vector to floor
 * @returns {Vec3} Floored vector
 * 
 * @example
 * const blockPos = floor(exactPosition);
 */
function floor(vector) {
  return new Vec3(
    Math.floor(vector.x),
    Math.floor(vector.y),
    Math.floor(vector.z)
  );
}

// Helper function to calculate distance with different metrics
function calculateDistance(from, to, metric) {
  switch (metric) {
    case 'manhattan':
      return manhattan(from, to);
    case 'chebyshev':
      return chebyshev(from, to);
    case 'euclidean':
    default:
      return euclidean(from, to);
  }
}

module.exports = {
  // Sorting
  nearestFirst,
  
  // Distance metrics
  manhattan,
  chebyshev,
  euclidean,
  
  // Vector operations
  add,
  subtract,
  scale,
  normalize,
  dot,
  cross,
  lerp,
  project,
  reflect,
  rotateY,
  
  // Bounds and regions
  getBoundingBox,
  isWithinBounds,
  
  // Shape generators
  getLine,
  getCircle,
  getDisc,
  
  // Utilities
  clamp,
  round,
  floor
};