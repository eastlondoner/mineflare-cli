/**
 * Real API Client for E2E Tests
 * No mocking - makes actual HTTP requests
 */

class APIClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.timeout = 10000;
  }

  /**
   * Make a real HTTP request
   */
  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type');
      let data = null;
      
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else if (contentType?.includes('text')) {
        data = await response.text();
      } else {
        data = await response.arrayBuffer();
      }
      
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        ok: response.ok
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${options.timeout || this.timeout}ms`);
      }
      
      throw error;
    }
  }

  // Convenience methods
  async get(path, options = {}) {
    return this.request('GET', path, options);
  }

  async post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  async put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  async delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  async patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  /**
   * Test server health
   */
  async checkHealth() {
    try {
      const response = await this.get('/health');
      return response.ok && response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Wait for server to be ready
   */
  async waitForReady(timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await this.checkHealth()) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Server not ready after ${timeout}ms`);
  }

  /**
   * Execute batch commands
   */
  async executeBatch(commands) {
    return this.post('/batch', { commands });
  }

  /**
   * Get bot state
   */
  async getBotState() {
    return this.get('/state');
  }

  /**
   * Send chat message
   */
  async sendChat(message) {
    return this.post('/chat', { message });
  }

  /**
   * Move bot
   */
  async moveBot(x, y, z) {
    return this.post('/move', { x, y, z });
  }

  /**
   * Stop bot
   */
  async stopBot() {
    return this.post('/stop');
  }

  /**
   * Look at coordinates
   */
  async lookAt(x, y, z) {
    return this.post('/look', { x, y, z });
  }

  /**
   * Dig block
   */
  async digBlock(x, y, z) {
    return this.post('/dig', { x, y, z });
  }

  /**
   * Place block
   */
  async placeBlock(x, y, z, blockType) {
    return this.post('/place', { x, y, z, blockType });
  }

  /**
   * Attack entity
   */
  async attackEntity(entityId) {
    return this.post('/attack', { entityId });
  }

  /**
   * Get inventory
   */
  async getInventory() {
    return this.get('/inventory');
  }

  /**
   * Get entities
   */
  async getEntities() {
    return this.get('/entities');
  }

  /**
   * Get events
   */
  async getEvents(limit = 100) {
    return this.get(`/events?limit=${limit}`);
  }

  /**
   * Get recipes
   */
  async getRecipes(item) {
    return this.get(`/recipes${item ? `?item=${item}` : ''}`);
  }

  /**
   * Craft item
   */
  async craftItem(recipe, count = 1) {
    return this.post('/craft', { recipe, count });
  }

  /**
   * Equip item
   */
  async equipItem(item, destination = 'hand') {
    return this.post('/equip', { item, destination });
  }

  /**
   * Take screenshot
   */
  async takeScreenshot() {
    const response = await this.get('/screenshot');
    
    if (response.ok && response.data) {
      // Convert base64 to buffer if needed
      if (typeof response.data === 'string' && response.data.includes('base64,')) {
        const base64Data = response.data.split('base64,')[1];
        return Buffer.from(base64Data, 'base64');
      }
      
      return response.data;
    }
    
    throw new Error('Failed to take screenshot');
  }

  /**
   * Measure response time
   */
  async measureResponseTime(method, path, options = {}) {
    const startTime = Date.now();
    
    try {
      await this.request(method, path, options);
      return Date.now() - startTime;
    } catch (error) {
      return -1;
    }
  }

  /**
   * Test concurrent requests
   */
  async testConcurrency(requests) {
    const results = await Promise.allSettled(
      requests.map(req => this.request(req.method, req.path, req.options))
    );
    
    return {
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results
    };
  }
}

module.exports = APIClient;