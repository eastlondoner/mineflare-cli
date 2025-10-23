const fs = require('fs');
const path = require('path');

/**
 * Create a temporary test directory
 * @returns {string} Path to the temporary directory
 */
function createTempDir() {
  const tempDir = path.join(process.cwd(), `.test-temp-${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Clean up a temporary test directory
 * @param {string} dirPath - Path to the directory to clean up
 */
function cleanupTempDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Create a test configuration file
 * @param {string} dirPath - Directory to create the config in
 * @param {Object} config - Configuration object
 * @returns {string} Path to the created config file
 */
function createTestConfig(dirPath, config = {}) {
  const configPath = path.join(dirPath, 'config.json');
  const defaultConfig = {
    server: {
      port: 3001,
      timeout: 1000
    },
    bot: {
      username: 'test_bot',
      host: 'localhost',
      port: 25565,
      version: '1.21.1'
    },
    api: {
      baseUrl: 'http://localhost:3001'
    },
    minecraft: {
      serverPath: './minecraft-server'
    }
  };
  
  const mergedConfig = { ...defaultConfig, ...config };
  fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
  return configPath;
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} True if condition was met, false if timeout
 */
async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

/**
 * Create a mock HTTP response for Bun tests
 * @param {number} status - HTTP status code
 * @param {Object} body - Response body
 * @returns {Object} Mock response object
 */
function mockResponse(status = 200, body = {}) {
  const res = {
    _status: status,
    _body: body,
    _headers: {},
    status: function(code) {
      this._status = code;
      return this;
    },
    json: function(data) {
      this._body = data;
      this._headers['Content-Type'] = 'application/json';
      return this;
    },
    send: function(data) {
      this._body = data;
      return this;
    },
    end: function() {
      return this;
    },
    set: function(key, value) {
      this._headers[key] = value;
      return this;
    }
  };
  
  return res;
}

/**
 * Create a mock HTTP request
 * @param {Object} options - Request options
 * @returns {Object} Mock request object
 */
function mockRequest(options = {}) {
  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    method: options.method || 'GET',
    url: options.url || '/'
  };
}

module.exports = {
  createTempDir,
  cleanupTempDir,
  createTestConfig,
  waitForCondition,
  mockResponse,
  mockRequest
};