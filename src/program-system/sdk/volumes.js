/**
 * Volume Utilities for Mineflare SDK
 * Provides volume constraint checking for world-modifying actions.
 * 
 * Volumes are defined relative to a reference origin (bot's starting position)
 * and yaw (bot's facing direction at program start).
 * 
 * ## Volume Types
 * 
 * ### localBox (recommended for most use cases)
 * Defines a box using forward/right/up offsets relative to bot's facing direction.
 * ```javascript
 * { type: 'localBox', min: { forward: -3, right: -5, up: -2 }, max: { forward: 20, right: 5, up: 10 } }
 * ```
 * - forward: positive = direction bot is facing, negative = behind
 * - right: positive = bot's right side, negative = left
 * - up: positive = above bot, negative = below
 * 
 * ### sphere
 * Defines a sphere using spherical coordinates for center.
 * ```javascript
 * { type: 'sphere', center: { angle: 0, pitch: 0, distance: 10 }, radius: 15 }
 * ```
 * - angle: degrees in horizontal plane (0 = forward, positive = right)
 * - pitch: degrees in vertical plane (0 = horizontal, positive = up)
 * - distance: blocks from origin to sphere center
 * 
 * ### cube
 * Defines an axis-aligned box using two corners in spherical coordinates.
 * ```javascript
 * { type: 'cube', corners: [
 *   { angle: -30, pitch: -20, distance: 5 },
 *   { angle: 30, pitch: 30, distance: 25 }
 * ]}
 * ```
 */

const { Vec3 } = require('./types');

/**
 * Convert spherical coordinates to Cartesian world coordinates
 * @param {Vec3} origin - Reference origin position (bot's starting position)
 * @param {number} yaw - Reference yaw in radians (bot's facing direction)
 * @param {Object} spherical - Spherical coordinates
 * @param {number} spherical.angle - Horizontal angle in degrees (0 = forward, positive = right)
 * @param {number} spherical.pitch - Vertical angle in degrees (0 = horizontal, positive = up)
 * @param {number} spherical.distance - Distance from origin in blocks
 * @returns {Vec3} World position
 * 
 * @example
 * const worldPos = sphericalToCartesian(
 *   botStartPos,
 *   botStartYaw,
 *   { angle: 45, pitch: 0, distance: 10 }
 * );
 */
function sphericalToCartesian(origin, yaw, spherical) {
  const { angle, pitch, distance } = spherical;
  
  // Convert degrees to radians
  const angleRad = angle * Math.PI / 180;
  const pitchRad = pitch * Math.PI / 180;
  
  // Calculate the direction vector
  // In Minecraft: yaw 0 = south (+Z), yaw increases counterclockwise when viewed from above
  // We want angle 0 = bot's facing direction, positive = right (clockwise)
  // So we add the angle to the yaw (negated because Minecraft yaw is counterclockwise)
  const totalYaw = yaw - angleRad;
  
  // Horizontal distance (projection onto XZ plane)
  const horizontalDist = distance * Math.cos(pitchRad);
  
  // Calculate world offsets
  // In Minecraft coordinate system:
  // -sin(yaw) gives X direction, cos(yaw) gives Z direction
  const dx = -Math.sin(totalYaw) * horizontalDist;
  const dy = distance * Math.sin(pitchRad);
  const dz = Math.cos(totalYaw) * horizontalDist;
  
  return new Vec3(
    origin.x + dx,
    origin.y + dy,
    origin.z + dz
  );
}

/**
 * Convert local box coordinates (forward/right/up) to world coordinates
 * @param {Vec3} origin - Reference origin position (bot's starting position)
 * @param {number} yaw - Reference yaw in radians (bot's facing direction)
 * @param {Object} local - Local coordinates
 * @param {number} local.forward - Blocks forward (positive) or backward (negative)
 * @param {number} local.right - Blocks right (positive) or left (negative)
 * @param {number} local.up - Blocks up (positive) or down (negative)
 * @returns {Vec3} World position
 * 
 * @example
 * const worldPos = localToCartesian(botStartPos, botStartYaw, { forward: 10, right: 5, up: 0 });
 */
function localToCartesian(origin, yaw, local) {
  const { forward = 0, right = 0, up = 0 } = local;
  
  // In Minecraft coordinate system:
  // -sin(yaw) gives X direction for forward movement
  // cos(yaw) gives Z direction for forward movement
  // For right movement, we rotate 90 degrees (add PI/2 to yaw)
  const forwardX = -Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = -Math.sin(yaw - Math.PI / 2);  // 90 degrees right
  const rightZ = Math.cos(yaw - Math.PI / 2);
  
  const dx = forward * forwardX + right * rightX;
  const dy = up;
  const dz = forward * forwardZ + right * rightZ;
  
  return new Vec3(
    origin.x + dx,
    origin.y + dy,
    origin.z + dz
  );
}

/**
 * Check if a point is inside an axis-aligned bounding box defined by two corners
 * Uses the smallest volume regardless of corner order
 * @param {Vec3} point - Point to check
 * @param {Vec3} corner1 - First corner of the cube
 * @param {Vec3} corner2 - Second corner of the cube
 * @returns {boolean} True if point is inside the cube
 * 
 * @example
 * const inside = isInCube(targetPos, cubeMin, cubeMax);
 */
function isInCube(point, corner1, corner2) {
  const minX = Math.min(corner1.x, corner2.x);
  const maxX = Math.max(corner1.x, corner2.x);
  const minY = Math.min(corner1.y, corner2.y);
  const maxY = Math.max(corner1.y, corner2.y);
  const minZ = Math.min(corner1.z, corner2.z);
  const maxZ = Math.max(corner1.z, corner2.z);
  
  return point.x >= minX && point.x <= maxX &&
         point.y >= minY && point.y <= maxY &&
         point.z >= minZ && point.z <= maxZ;
}

/**
 * Check if a point is inside a sphere
 * @param {Vec3} point - Point to check
 * @param {Vec3} center - Center of the sphere
 * @param {number} radius - Radius of the sphere
 * @returns {boolean} True if point is inside the sphere
 * 
 * @example
 * const inside = isInSphere(targetPos, sphereCenter, 10);
 */
function isInSphere(point, center, radius) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  return distanceSquared <= radius * radius;
}

/**
 * Check if a point is inside a volume definition
 * @param {Vec3} point - World position to check
 * @param {Object} volume - Volume definition
 * @param {string} volume.type - 'cube' or 'sphere'
 * @param {Array} [volume.corners] - For cube: array of two corner specs {angle, pitch, distance}
 * @param {Object} [volume.center] - For sphere: center spec {angle, pitch, distance}
 * @param {number} [volume.radius] - For sphere: radius in blocks
 * @param {Vec3} origin - Reference origin (bot's starting position)
 * @param {number} yaw - Reference yaw in radians (bot's facing direction)
 * @returns {boolean} True if point is inside the volume
 * 
 * @example
 * const inside = isInVolume(
 *   targetPos,
 *   { type: 'sphere', center: { angle: 0, pitch: 0, distance: 20 }, radius: 10 },
 *   botStartPos,
 *   botStartYaw
 * );
 */
function isInVolume(point, volume, origin, yaw) {
  if (volume.type === 'localBox') {
    if (!volume.min || !volume.max) {
      throw new Error('localBox volume must have min and max');
    }
    
    const corner1 = localToCartesian(origin, yaw, volume.min);
    const corner2 = localToCartesian(origin, yaw, volume.max);
    
    return isInCube(point, corner1, corner2);
  }
  
  if (volume.type === 'cube') {
    if (!volume.corners || volume.corners.length !== 2) {
      throw new Error('Cube volume must have exactly 2 corners');
    }
    
    const corner1 = sphericalToCartesian(origin, yaw, volume.corners[0]);
    const corner2 = sphericalToCartesian(origin, yaw, volume.corners[1]);
    
    return isInCube(point, corner1, corner2);
  }
  
  if (volume.type === 'sphere') {
    if (!volume.center || typeof volume.radius !== 'number') {
      throw new Error('Sphere volume must have center and radius');
    }
    
    const center = sphericalToCartesian(origin, yaw, volume.center);
    
    return isInSphere(point, center, volume.radius);
  }
  
  throw new Error(`Unknown volume type: ${volume.type}`);
}

/**
 * Check if a point is inside any of the provided volumes
 * @param {Vec3} point - World position to check
 * @param {Array<Object>} volumes - Array of volume definitions
 * @param {Vec3} origin - Reference origin (bot's starting position)
 * @param {number} yaw - Reference yaw in radians (bot's facing direction)
 * @returns {boolean} True if point is inside at least one volume
 * 
 * @example
 * const allowed = isInAnyVolume(targetPos, program.allowedVolumes, botStartPos, botStartYaw);
 */
function isInAnyVolume(point, volumes, origin, yaw) {
  if (!volumes || volumes.length === 0) {
    return false;
  }
  
  for (const volume of volumes) {
    if (isInVolume(point, volume, origin, yaw)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate a volume definition
 * @param {Object} volume - Volume definition to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 * 
 * @example
 * const result = validateVolume({ type: 'sphere', center: { angle: 0, pitch: 0, distance: 10 }, radius: 5 });
 * if (!result.valid) console.error(result.error);
 */
function validateVolume(volume) {
  if (!volume || typeof volume !== 'object') {
    return { valid: false, error: 'Volume must be an object' };
  }
  
  if (!volume.type) {
    return { valid: false, error: 'Volume must have a type' };
  }
  
  if (volume.type === 'localBox') {
    if (!volume.min || typeof volume.min !== 'object') {
      return { valid: false, error: 'localBox volume must have a min object with forward, right, up' };
    }
    if (!volume.max || typeof volume.max !== 'object') {
      return { valid: false, error: 'localBox volume must have a max object with forward, right, up' };
    }
    
    // Validate min coordinates (all optional, default to 0)
    for (const coord of ['forward', 'right', 'up']) {
      if (volume.min[coord] !== undefined && typeof volume.min[coord] !== 'number') {
        return { valid: false, error: `localBox min.${coord} must be a number` };
      }
      if (volume.max[coord] !== undefined && typeof volume.max[coord] !== 'number') {
        return { valid: false, error: `localBox max.${coord} must be a number` };
      }
    }
    
    return { valid: true };
  }
  
  if (volume.type === 'cube') {
    if (!Array.isArray(volume.corners) || volume.corners.length !== 2) {
      return { valid: false, error: 'Cube volume must have exactly 2 corners' };
    }
    
    for (let i = 0; i < 2; i++) {
      const corner = volume.corners[i];
      if (typeof corner.angle !== 'number' ||
          typeof corner.pitch !== 'number' ||
          typeof corner.distance !== 'number') {
        return { valid: false, error: `Cube corner ${i + 1} must have angle, pitch, and distance as numbers` };
      }
      if (corner.distance < 0) {
        return { valid: false, error: `Cube corner ${i + 1} distance must be non-negative` };
      }
    }
    
    return { valid: true };
  }
  
  if (volume.type === 'sphere') {
    if (!volume.center || typeof volume.center !== 'object') {
      return { valid: false, error: 'Sphere volume must have a center object' };
    }
    
    if (typeof volume.center.angle !== 'number' ||
        typeof volume.center.pitch !== 'number' ||
        typeof volume.center.distance !== 'number') {
      return { valid: false, error: 'Sphere center must have angle, pitch, and distance as numbers' };
    }
    
    if (volume.center.distance < 0) {
      return { valid: false, error: 'Sphere center distance must be non-negative' };
    }
    
    if (typeof volume.radius !== 'number' || volume.radius <= 0) {
      return { valid: false, error: 'Sphere radius must be a positive number' };
    }
    
    return { valid: true };
  }
  
  return { valid: false, error: `Unknown volume type: ${volume.type}` };
}

/**
 * Validate an array of volume definitions
 * @param {Array<Object>} volumes - Array of volume definitions
 * @returns {{valid: boolean, error?: string}} Validation result
 * 
 * @example
 * const result = validateVolumes(program.allowedVolumes);
 */
function validateVolumes(volumes) {
  if (!Array.isArray(volumes)) {
    return { valid: false, error: 'allowedVolumes must be an array' };
  }
  
  if (volumes.length === 0) {
    return { valid: false, error: 'allowedVolumes must contain at least one volume' };
  }
  
  for (let i = 0; i < volumes.length; i++) {
    const result = validateVolume(volumes[i]);
    if (!result.valid) {
      return { valid: false, error: `Volume ${i + 1}: ${result.error}` };
    }
  }
  
  return { valid: true };
}

/**
 * Get a human-readable description of why a point is outside allowed volumes
 * @param {Vec3} point - World position that was rejected
 * @param {Array<Object>} volumes - Array of volume definitions
 * @param {Vec3} origin - Reference origin
 * @param {number} yaw - Reference yaw in radians
 * @returns {string} Description of the violation
 */
function describeViolation(point, volumes, origin, yaw) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  return `Position (${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}) ` +
         `is ${distance.toFixed(1)} blocks from origin and outside all ${volumes.length} allowed volume(s)`;
}

module.exports = {
  sphericalToCartesian,
  localToCartesian,
  isInCube,
  isInSphere,
  isInVolume,
  isInAnyVolume,
  validateVolume,
  validateVolumes,
  describeViolation
};
