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
  ProgramMetadata
};