// Main SDK exports for user programs
const { 
  ok, 
  fail, 
  defineProgram, 
  sleep,
  parseArgs,
  validateCapabilities,
  mergeWithDefaults,
  SeededRandom
} = require('./helpers');

const {
  CAPABILITIES,
  Vec3,
  BlockRef,
  ItemStack,
  BotState,
  ProgramMetadata,
  ProgramStatus,
  ErrorCode,
  ProgramError
} = require('./types');

// Import new SDK utilities
const flowUtils = require('./flow');
const movementUtils = require('./movement');
const safetyUtils = require('./safety');
const watcherUtils = require('./watchers');
const searchUtils = require('./search');
const geometryUtils = require('./geometry');

// Export the complete SDK
module.exports = {
  // Helper functions
  ok,
  fail,
  defineProgram,
  sleep,
  
  // Types and classes
  Vec3,
  BlockRef,
  ItemStack,
  BotState,
  ProgramError,
  
  // Constants
  CAPABILITIES,
  ProgramStatus,
  ErrorCode,
  
  // Utilities
  parseArgs,
  validateCapabilities,
  mergeWithDefaults,
  SeededRandom,
  
  // Metadata helper
  ProgramMetadata,
  
  // Flow control utilities
  flow: flowUtils,
  withTimeout: flowUtils.withTimeout,
  retryBudget: flowUtils.retryBudget,
  transaction: flowUtils.transaction,
  parallel: flowUtils.parallel,
  
  // Movement utilities
  movement: movementUtils,
  step: movementUtils.step,
  moveCardinal: movementUtils.moveCardinal,
  followPath: movementUtils.followPath,
  strafe: movementUtils.strafe,
  jumpTo: movementUtils.jumpTo,
  circleAround: movementUtils.circleAround,
  
  // Safety utilities
  safety: safetyUtils,
  escapeHole: safetyUtils.escapeHole,
  safeStep: safetyUtils.safeStep,
  createSafeZone: safetyUtils.createSafeZone,
  monitorVitals: safetyUtils.monitorVitals,
  retreatToSafety: safetyUtils.retreatToSafety,
  
  // Watcher utilities
  watchers: watcherUtils,
  until: watcherUtils.until,
  blockAppears: watcherUtils.blockAppears,
  entityAppears: watcherUtils.entityAppears,
  inventoryContains: watcherUtils.inventoryContains,
  collectEvents: watcherUtils.collectEvents,
  watchValue: watcherUtils.watchValue,
  
  // Search utilities
  search: searchUtils,
  expandSquare: searchUtils.expandSquare,
  bug2: searchUtils.bug2,
  spiral: searchUtils.spiral,
  randomWalk: searchUtils.randomWalk,
  
  // Geometry utilities
  geometry: geometryUtils,
  nearestFirst: geometryUtils.nearestFirst,
  manhattan: geometryUtils.manhattan,
  chebyshev: geometryUtils.chebyshev,
  euclidean: geometryUtils.euclidean,
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
  getBoundingBox: geometryUtils.getBoundingBox,
  isWithinBounds: geometryUtils.isWithinBounds,
  getLine: geometryUtils.getLine,
  getCircle: geometryUtils.getCircle,
  getDisc: geometryUtils.getDisc,
  clamp: geometryUtils.clamp,
  round: geometryUtils.round,
  floor: geometryUtils.floor
};