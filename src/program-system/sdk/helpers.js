// Helper functions for the SDK

// Result helpers for functional error handling
const ok = (value) => ({ ok: true, value });
const fail = (error) => ({ ok: false, error });

// Helper to define a program with proper structure
function defineProgram(spec) {
  if (!spec.name) {
    throw new Error('Program must have a name');
  }
  
  if (!spec.run || typeof spec.run !== 'function') {
    throw new Error('Program must have a run function');
  }
  
  // Set defaults
  spec.version = spec.version || '1.0.0';
  spec.capabilities = spec.capabilities || [];
  spec.defaults = spec.defaults || {};
  
  return spec;
}

// Helper to parse command line arguments
function parseArgs(argArray) {
  const args = {};
  
  for (const arg of argArray) {
    const [key, value] = arg.split('=');
    if (key && value !== undefined) {
      // Try to parse as JSON first (for objects/arrays)
      try {
        args[key] = JSON.parse(value);
      } catch {
        // Parse as boolean if applicable
        if (value === 'true') args[key] = true;
        else if (value === 'false') args[key] = false;
        // Parse as number if applicable
        else if (!isNaN(value)) args[key] = Number(value);
        // Otherwise keep as string
        else args[key] = value;
      }
    }
  }
  
  return args;
}

// Helper to validate capabilities
function validateCapabilities(requested, allowed) {
  const allowedSet = new Set(allowed);
  const invalid = requested.filter(cap => !allowedSet.has(cap));
  
  if (invalid.length > 0) {
    throw new Error(`Invalid capabilities: ${invalid.join(', ')}`);
  }
  
  return true;
}

// Helper to merge defaults with provided arguments
function mergeWithDefaults(args, defaults) {
  return { ...defaults, ...args };
}

// Helper for deterministic random (seeded)
class SeededRandom {
  constructor(seed = 1) {
    this.seed = seed;
  }
  
  // Simple linear congruential generator
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  // Random integer between min and max (inclusive)
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  // Pick random element from array
  pick(array) {
    if (array.length === 0) return undefined;
    return array[this.int(0, array.length - 1)];
  }
  
  // Shuffle array (Fisher-Yates)
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  ok,
  fail,
  defineProgram,
  sleep,
  parseArgs,
  validateCapabilities,
  mergeWithDefaults,
  SeededRandom
};