/**
 * Global E2E Test Setup
 * Configures the testing environment for zero-mock E2E tests
 */

const TestEnvironment = require('./test-environment');

// Global test configuration
global.E2E_CONFIG = {
  // Minecraft server settings
  MC_HOST: process.env.E2E_MC_HOST || 'localhost',
  MC_PORT: parseInt(process.env.E2E_MC_PORT) || 25565,
  MC_VERSION: process.env.E2E_MC_VERSION || '1.21.1',
  MC_OFFLINE: process.env.E2E_MC_OFFLINE === 'true',
  
  // Test settings
  BASE_PORT: parseInt(process.env.E2E_BASE_PORT) || 3100,
  TIMEOUT: parseInt(process.env.E2E_TIMEOUT) || 30000,
  CLEANUP: process.env.E2E_CLEANUP !== 'false',
  VERBOSE: process.env.E2E_VERBOSE === 'true',
  PARALLEL: process.env.E2E_PARALLEL === 'true',
  
  // Performance thresholds
  MAX_STARTUP_TIME: parseInt(process.env.E2E_MAX_STARTUP_TIME) || 5000,
  MAX_CONNECT_TIME: parseInt(process.env.E2E_MAX_CONNECT_TIME) || 10000,
  MAX_API_RESPONSE: parseInt(process.env.E2E_MAX_API_RESPONSE) || 1000,
  
  // Test data directory
  TEMP_DIR: process.env.E2E_TEMP_DIR || '.e2e-temp'
};

// Set longer timeout for E2E tests
if (typeof jest !== 'undefined' && jest.setTimeout) {
  jest.setTimeout(global.E2E_CONFIG.TIMEOUT);
}

// Global test environment instance
let globalTestEnv = null;

// Setup function to create test environment
global.createTestEnvironment = (options = {}) => {
  return new TestEnvironment({
    basePort: global.E2E_CONFIG.BASE_PORT,
    tempDir: global.E2E_CONFIG.TEMP_DIR,
    cleanupOnExit: global.E2E_CONFIG.CLEANUP,
    verbose: global.E2E_CONFIG.VERBOSE,
    ...options
  });
};

// Global setup
global.setupE2E = async () => {
  console.log('🚀 Starting E2E Test Suite - Zero Mocks');
  console.log('═'.repeat(50));
  console.log('Configuration:');
  console.log(`  Minecraft Server: ${global.E2E_CONFIG.MC_HOST}:${global.E2E_CONFIG.MC_PORT}`);
  console.log(`  Offline Mode: ${global.E2E_CONFIG.MC_OFFLINE}`);
  console.log(`  Base Port: ${global.E2E_CONFIG.BASE_PORT}`);
  console.log(`  Timeout: ${global.E2E_CONFIG.TIMEOUT}ms`);
  console.log(`  Verbose: ${global.E2E_CONFIG.VERBOSE}`);
  console.log('═'.repeat(50));
  
  // Create global test environment
  globalTestEnv = global.createTestEnvironment();
  await globalTestEnv.setup();
};

// Global teardown
global.teardownE2E = async () => {
  console.log('═'.repeat(50));
  console.log('🧹 Cleaning up E2E tests...');
  
  if (globalTestEnv) {
    await globalTestEnv.cleanup();
  }
  
  console.log('✅ E2E tests complete');
};

// Performance tracking utilities
global.measurePerformance = async (name, fn) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  try {
    const result = await fn();
    
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    
    return {
      name,
      duration,
      memory: {
        rss: endMemory.rss - startMemory.rss,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed
      },
      result
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      name,
      duration,
      error: error.message,
      failed: true
    };
  }
};

// Assertion helpers for E2E tests
global.expectEventually = async (condition, timeout = 10000, message = 'Condition not met') => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`${message} (waited ${timeout}ms)`);
};

// Retry helper for flaky operations
global.retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        console.log(`Retry ${i + 1}/${maxRetries} after error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
};

// Test data generators
global.generateTestData = {
  username: () => `TestBot${Date.now()}${Math.floor(Math.random() * 1000)}`,
  
  config: (overrides = {}) => ({
    server: {
      port: global.E2E_CONFIG.BASE_PORT + Math.floor(Math.random() * 100),
      host: '0.0.0.0',
      ...overrides.server
    },
    minecraft: {
      host: global.E2E_CONFIG.MC_HOST,
      port: global.E2E_CONFIG.MC_PORT,
      username: global.generateTestData.username(),
      version: global.E2E_CONFIG.MC_VERSION,
      auth: global.E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft',
      ...overrides.minecraft
    },
    viewer: {
      enabled: false,
      ...overrides.viewer
    },
    logging: {
      level: global.E2E_CONFIG.VERBOSE ? 'debug' : 'info',
      ...overrides.logging
    }
  }),
  
  coordinates: () => ({
    x: Math.floor(Math.random() * 200 - 100),
    y: 64 + Math.floor(Math.random() * 20),
    z: Math.floor(Math.random() * 200 - 100)
  })
};

// Network condition simulators
global.simulateNetworkConditions = {
  latency: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  packetLoss: (probability = 0.1) => {
    if (Math.random() < probability) {
      throw new Error('Simulated packet loss');
    }
  },
  
  timeout: (duration) => {
    return Promise.race([
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Simulated timeout')), duration)
      )
    ]);
  }
};

// Resource monitoring
global.monitorResources = async (operation, label) => {
  const initialMemory = process.memoryUsage();
  const initialCpu = process.cpuUsage();
  
  const result = await operation();
  
  const finalMemory = process.memoryUsage();
  const finalCpu = process.cpuUsage();
  
  const memoryDelta = {
    rss: (finalMemory.rss - initialMemory.rss) / 1024 / 1024,
    heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
    external: (finalMemory.external - initialMemory.external) / 1024 / 1024
  };
  
  const cpuDelta = {
    user: (finalCpu.user - initialCpu.user) / 1000,
    system: (finalCpu.system - initialCpu.system) / 1000
  };
  
  if (global.E2E_CONFIG.VERBOSE) {
    console.log(`[Resource Monitor] ${label}:`);
    console.log(`  Memory: RSS=${memoryDelta.rss.toFixed(2)}MB, Heap=${memoryDelta.heapUsed.toFixed(2)}MB`);
    console.log(`  CPU: User=${cpuDelta.user.toFixed(2)}ms, System=${cpuDelta.system.toFixed(2)}ms`);
  }
  
  return {
    result,
    memory: memoryDelta,
    cpu: cpuDelta
  };
};

// Cleanup handlers
if (global.E2E_CONFIG.CLEANUP) {
  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection in E2E test:', error);
    if (globalTestEnv) {
      globalTestEnv.cleanup().then(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
  
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in E2E test:', error);
    if (globalTestEnv) {
      globalTestEnv.cleanup().then(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

// Export for use in tests
module.exports = {
  E2E_CONFIG: global.E2E_CONFIG,
  createTestEnvironment: global.createTestEnvironment,
  setupE2E: global.setupE2E,
  teardownE2E: global.teardownE2E,
  measurePerformance: global.measurePerformance,
  expectEventually: global.expectEventually,
  retryOperation: global.retryOperation,
  generateTestData: global.generateTestData,
  simulateNetworkConditions: global.simulateNetworkConditions,
  monitorResources: global.monitorResources
};