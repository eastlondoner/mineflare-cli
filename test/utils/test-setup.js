/**
 * Global test setup for all tests
 * This file is preloaded by Bun before running tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };
}

// Global test utilities
global.testUtils = {
  // Add any global test utilities here
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Clean up function to be called after tests
  cleanup: () => {
    // Clean up any test artifacts
    const fs = require('fs');
    const path = require('path');
    const testTempDirs = fs.readdirSync(process.cwd())
      .filter(dir => dir.startsWith('.test-temp-'));
    
    testTempDirs.forEach(dir => {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    });
  }
};

// Clean up after all tests
if (typeof afterAll !== 'undefined') {
  afterAll(() => {
    global.testUtils.cleanup();
  });
}