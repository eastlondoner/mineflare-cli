// Type definitions for the Mineflare SDK
// These define the shape of the context and APIs available to user programs

// Capability types - what actions a program can perform
const CAPABILITIES = [
  'move',      // Movement and navigation
  'look',      // Camera control
  'dig',       // Block breaking
  'place',     // Block placement
  'attack',    // Combat actions
  'inventory', // Inventory access
  'craft',     // Crafting recipes
  'pathfind',  // Advanced pathfinding
  'events',    // Event subscriptions
  'time',      // Time queries
  'screenshot' // Take screenshots
];

// Vector3 type for positions
class Vec3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  
  offset(dx, dy, dz) {
    return new Vec3(this.x + dx, this.y + dy, this.z + dz);
  }
  
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
  
  distanceTo(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const dz = other.z - this.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

// Block reference type
class BlockRef {
  constructor(position, name, hardness = null) {
    this.position = position;
    this.name = name;
    this.hardness = hardness;
  }
}

// Item stack type
class ItemStack {
  constructor(id, name, count, metadata = null) {
    this.id = id;
    this.name = name;
    this.count = count;
    this.metadata = metadata;
  }
}

// Bot state type
class BotState {
  constructor(data) {
    this.position = new Vec3(data.position.x, data.position.y, data.position.z);
    this.yaw = data.yaw;
    this.pitch = data.pitch;
    this.health = data.health;
    this.food = data.food;
    this.oxygen = data.oxygen;
    this.onGround = data.onGround;
    this.inWater = data.inWater;
    this.inLava = data.inLava;
  }
}

// Program metadata
class ProgramMetadata {
  constructor(name, version, capabilities = [], defaults = {}) {
    this.name = name;
    this.version = version;
    this.capabilities = capabilities;
    this.defaults = defaults;
    this.created = Date.now();
  }
}

// Program status enum
const ProgramStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Error codes for typed errors
const ErrorCode = {
  TIMEOUT: 'E_TIMEOUT',
  CAPABILITY: 'E_CAPABILITY',
  PRECONDITION: 'E_PRECONDITION',
  PATHFIND: 'E_PATHFIND',
  RESOURCE_LIMIT: 'E_RESOURCE_LIMIT',
  INVALID_ARGUMENT: 'E_INVALID_ARGUMENT',
  BOT_DISCONNECTED: 'E_BOT_DISCONNECTED',
  OPERATION_FAILED: 'E_OPERATION_FAILED'
};

// Typed error class
class ProgramError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ProgramError';
  }
}

module.exports = {
  CAPABILITIES,
  Vec3,
  BlockRef,
  ItemStack,
  BotState,
  ProgramMetadata,
  ProgramStatus,
  ErrorCode,
  ProgramError
};