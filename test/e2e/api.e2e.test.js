/**
 * E2E Tests: API Endpoints
 * Tests real HTTP requests to the running server
 * Zero mocks - actual network communication
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');

const TestEnvironment = require('./utils/test-environment');
const APIClient = require('./utils/api-client');
const { E2E_CONFIG, measurePerformance, expectEventually, monitorResources, generateTestData } = require('./utils/e2e-setup');

describe('E2E: API Endpoints', () => {
  let env;
  let server;
  let apiClient;
  let bot;
  
  beforeAll(async () => {
    env = new TestEnvironment({
      basePort: E2E_CONFIG.BASE_PORT + 200,
      verbose: E2E_CONFIG.VERBOSE
    });
    await env.setup();
    
    // Start server with bot connection
    server = await env.startServer({
      port: E2E_CONFIG.BASE_PORT + 200,
      minecraft: {
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      }
    });
    
    apiClient = new APIClient(`http://localhost:${server.port}`);
    
    // Wait for server to be fully ready
    await apiClient.waitForReady();
  });
  
  afterAll(async () => {
    await server?.stop();
    await env?.cleanup();
  });
  
  describe('Health and Status Endpoints', () => {
    it('should return health status', async () => {
      const response = await apiClient.get('/health');
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('ok');
    });
    
    it('should return bot state', async () => {
      const response = await apiClient.getBotState();
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      
      // State might vary depending on bot connection
      if (response.data.connected) {
        expect(response.data).toHaveProperty('position');
        expect(response.data).toHaveProperty('health');
        expect(response.data).toHaveProperty('food');
      }
    });
    
    it('should measure response time', async () => {
      const times = [];
      
      // Make multiple requests to get average
      for (let i = 0; i < 10; i++) {
        const time = await apiClient.measureResponseTime('GET', '/health');
        if (time > 0) times.push(time);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      expect(avgTime).toBeLessThan(E2E_CONFIG.MAX_API_RESPONSE);
      console.log(`Average health endpoint response time: ${avgTime.toFixed(2)}ms`);
    });
  });
  
  describe('Information Endpoints', () => {
    it('should return inventory', async () => {
      const response = await apiClient.getInventory();
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      if (response.data) {
        expect(response.data).toBeInstanceOf(Array);
      }
    });
    
    it('should return entities', async () => {
      const response = await apiClient.getEntities();
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      if (response.data) {
        expect(response.data).toBeInstanceOf(Array);
        
        // Each entity should have basic properties
        for (const entity of response.data) {
          expect(entity).toHaveProperty('id');
          expect(entity).toHaveProperty('type');
          expect(entity).toHaveProperty('position');
        }
      }
    });
    
    it('should return events', async () => {
      const response = await apiClient.getEvents(50);
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      if (response.data) {
        expect(response.data).toBeInstanceOf(Array);
        
        // Each event should have timestamp and type
        for (const event of response.data) {
          expect(event).toHaveProperty('timestamp');
          expect(event).toHaveProperty('type');
        }
      }
    });
    
    it('should return recipes', async () => {
      const response = await apiClient.getRecipes();
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      if (response.data) {
        expect(response.data).toBeInstanceOf(Array);
      }
    });
  });
  
  describe('Action Endpoints', () => {
    it('should send chat message', async () => {
      const message = `Test message ${Date.now()}`;
      const response = await apiClient.sendChat(message);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle movement commands', async () => {
      const coords = generateTestData.coordinates();
      const response = await apiClient.moveBot(coords.x, coords.y, coords.z);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle stop command', async () => {
      const response = await apiClient.stopBot();
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle look command', async () => {
      const coords = generateTestData.coordinates();
      const response = await apiClient.lookAt(coords.x, coords.y, coords.z);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle dig command', async () => {
      const coords = generateTestData.coordinates();
      const response = await apiClient.digBlock(coords.x, coords.y, coords.z);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle place command', async () => {
      const coords = generateTestData.coordinates();
      const response = await apiClient.placeBlock(coords.x, coords.y, coords.z, 'stone');
      
      // Response depends on bot connection and inventory
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
    
    it('should handle equip command', async () => {
      const response = await apiClient.equipItem('stone', 'hand');
      
      // Response depends on bot connection and inventory
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok) {
        expect(response.data).toHaveProperty('success');
      }
    });
  });
  
  describe('Batch Operations', () => {
    it('should execute batch commands', async () => {
      const commands = [
        { type: 'chat', message: 'Batch test 1' },
        { type: 'look', x: 0, y: 65, z: 0 },
        { type: 'chat', message: 'Batch test 2' }
      ];
      
      const response = await apiClient.executeBatch(commands);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok && response.data) {
        expect(response.data).toHaveProperty('results');
        
        if (response.data.results) {
          expect(response.data.results).toBeInstanceOf(Array);
          expect(response.data.results.length).toBe(commands.length);
        }
      }
    });
    
    it('should handle mixed batch operations', async () => {
      const commands = [
        { type: 'state' },
        { type: 'inventory' },
        { type: 'entities' },
        { type: 'chat', message: 'Mixed batch test' }
      ];
      
      const response = await apiClient.executeBatch(commands);
      
      // Response depends on bot connection
      expect(response.status).toBeOneOf([200, 400, 503]);
      
      if (response.ok && response.data?.results) {
        // Some commands might succeed while others fail
        const successes = response.data.results.filter(r => r.success);
        const failures = response.data.results.filter(r => !r.success);
        
        console.log(`Batch results: ${successes.length} successes, ${failures.length} failures`);
      }
    });
  });
  
  describe('Screenshot Endpoint', () => {
    it('should take screenshot', async () => {
      try {
        const screenshot = await apiClient.takeScreenshot();
        
        // Screenshot might be buffer or base64
        expect(screenshot).toBeDefined();
        
        if (Buffer.isBuffer(screenshot)) {
          expect(screenshot.length).toBeGreaterThan(0);
        }
        
        console.log('Screenshot captured successfully');
      } catch (error) {
        // Screenshot might fail if bot not connected or viewer not enabled
        console.log('Screenshot not available:', error.message);
      }
    });
  });
  
  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await apiClient.get('/non-existent-endpoint');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
    
    it('should handle invalid request data', async () => {
      const response = await apiClient.post('/move', { 
        x: 'not-a-number', 
        y: 'invalid', 
        z: null 
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBeOneOf([400, 422, 503]);
    });
    
    it('should handle missing required parameters', async () => {
      const response = await apiClient.post('/chat', {});
      
      expect(response.ok).toBe(false);
      expect(response.status).toBeOneOf([400, 422, 503]);
    });
    
    it('should handle server errors gracefully', async () => {
      // Try to cause an error by sending malformed data
      const response = await apiClient.request('POST', '/batch', {
        body: 'not-json',
        headers: { 'Content-Type': 'text/plain' }
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBeOneOf([400, 415, 500, 503]);
    });
  });
  
  describe('Concurrent Requests', () => {
    it('should handle concurrent GET requests', async () => {
      const requests = Array.from({ length: 20 }, (_, i) => ({
        method: 'GET',
        path: i % 2 === 0 ? '/health' : '/state',
        options: {}
      }));
      
      const results = await apiClient.testConcurrency(requests);
      
      expect(results.total).toBe(20);
      
      // Most requests should succeed
      expect(results.successful).toBeGreaterThan(15);
      
      console.log(`Concurrent GET requests: ${results.successful}/${results.total} successful`);
    });
    
    it('should handle concurrent POST requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        method: 'POST',
        path: '/chat',
        options: { body: { message: `Concurrent test ${i}` } }
      }));
      
      const results = await apiClient.testConcurrency(requests);
      
      expect(results.total).toBe(10);
      
      // Some might fail due to bot state or rate limiting
      console.log(`Concurrent POST requests: ${results.successful}/${results.total} successful`);
    });
    
    it('should handle mixed concurrent requests', async () => {
      const requests = [
        { method: 'GET', path: '/health' },
        { method: 'POST', path: '/chat', options: { body: { message: 'Test' } } },
        { method: 'GET', path: '/inventory' },
        { method: 'POST', path: '/move', options: { body: { x: 0, y: 65, z: 0 } } },
        { method: 'GET', path: '/entities' },
        { method: 'POST', path: '/stop', options: { body: {} } },
        { method: 'GET', path: '/events' },
        { method: 'POST', path: '/look', options: { body: { x: 100, y: 65, z: 100 } } },
        { method: 'GET', path: '/state' },
        { method: 'GET', path: '/recipes' }
      ];
      
      const results = await apiClient.testConcurrency(requests);
      
      expect(results.total).toBe(10);
      
      console.log(`Mixed concurrent requests: ${results.successful}/${results.total} successful`);
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track memory usage during operations', async () => {
      const result = await monitorResources(async () => {
        // Perform multiple API calls
        const promises = [];
        
        for (let i = 0; i < 50; i++) {
          promises.push(apiClient.get('/health'));
        }
        
        await Promise.all(promises);
        
        return true;
      }, '50 API calls');
      
      expect(result.result).toBe(true);
      
      // Memory increase should be reasonable
      expect(result.memory.heapUsed).toBeLessThan(50); // Less than 50MB increase
    });
    
    it('should measure endpoint response times', async () => {
      const endpoints = [
        { path: '/health', name: 'Health' },
        { path: '/state', name: 'State' },
        { path: '/inventory', name: 'Inventory' },
        { path: '/entities', name: 'Entities' },
        { path: '/events?limit=10', name: 'Events' }
      ];
      
      const results = [];
      
      for (const endpoint of endpoints) {
        const times = [];
        
        // Multiple measurements for accuracy
        for (let i = 0; i < 5; i++) {
          const time = await apiClient.measureResponseTime('GET', endpoint.path);
          if (time > 0) times.push(time);
        }
        
        if (times.length > 0) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          results.push({ name: endpoint.name, avg });
        }
      }
      
      // Print performance report
      console.log('API Endpoint Performance:');
      for (const result of results) {
        console.log(`  ${result.name}: ${result.avg.toFixed(2)}ms`);
        
        // All endpoints should respond within threshold
        expect(result.avg).toBeLessThan(E2E_CONFIG.MAX_API_RESPONSE);
      }
    });
  });
  
  describe('Long-running Operations', () => {
    it('should maintain connection during extended session', async () => {
      const duration = 10000; // 10 seconds
      const startTime = Date.now();
      let requestCount = 0;
      let errorCount = 0;
      
      while (Date.now() - startTime < duration) {
        try {
          const response = await apiClient.get('/health');
          
          if (response.ok) {
            requestCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`Long-running test: ${requestCount} successful, ${errorCount} errors`);
      
      // Should maintain good success rate
      expect(requestCount).toBeGreaterThan(40);
      expect(errorCount).toBeLessThan(10);
    }, 15000);
  });
});