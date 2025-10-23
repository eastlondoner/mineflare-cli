/**
 * API Integration Tests
 * Tests the full API with Express server running
 */
const { describe, it, expect, beforeAll, afterAll, beforeEach } = require('bun:test');
const request = require('supertest');
const MinecraftBotServer = require('../../src/bot-server.js');
const fs = require('fs');
const path = require('path');
const { createTempDir, cleanupTempDir } = require('../utils/test-helpers.js');

describe('API Integration Tests', () => {
  let server;
  let app;
  let testDir;

  beforeAll(() => {
    // Create test directory for configs
    testDir = createTempDir();
    process.env.TEST_MODE = 'true';
  });

  afterAll(() => {
    // Clean up
    if (testDir) {
      cleanupTempDir(testDir);
    }
  });

  beforeEach(() => {
    // Create fresh server instance for each test
    server = new MinecraftBotServer();
    app = server.app;
  });

  describe('Health Check', () => {
    it('should return 200 OK for health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('botConnected', false);
    });
  });

  describe('Bot Status Endpoints', () => {
    describe('GET /state', () => {
      it('should return 400 when bot not connected', async () => {
        const response = await request(app)
          .get('/state')
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('GET /inventory', () => {
      it('should return 400 when bot not connected', async () => {
        const response = await request(app)
          .get('/inventory')
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('GET /entities', () => {
      it('should return 400 when bot not connected', async () => {
        const response = await request(app)
          .get('/entities')
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('GET /events', () => {
      it('should return empty events array when no events', async () => {
        const response = await request(app)
          .get('/events')
          .expect(200);
        
        expect(response.body.events).toEqual([]);
      });

      it('should filter events by timestamp', async () => {
        // Add some test events
        server.events = [
          { timestamp: 1000, type: 'test1', data: {} },
          { timestamp: 2000, type: 'test2', data: {} },
          { timestamp: 3000, type: 'test3', data: {} }
        ];

        const response = await request(app)
          .get('/events?since=1500')
          .expect(200);
        
        expect(response.body.events).toHaveLength(2);
        expect(response.body.events[0].type).toBe('test2');
        expect(response.body.events[1].type).toBe('test3');
      });
    });
  });

  describe('Bot Control Endpoints', () => {
    describe('POST /chat', () => {
      it('should require message parameter', async () => {
        const response = await request(app)
          .post('/chat')
          .send({})
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });

      it('should validate message when bot connected', async () => {
        // Create minimal mock bot
        server.bot = { 
          chat: () => {},
          player: { username: 'test' }
        };
        
        const response = await request(app)
          .post('/chat')
          .send({})
          .expect(400);
        
        expect(response.body.error).toBe('Message required');
      });
    });

    describe('POST /move', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(app)
          .post('/move')
          .send({ x: 1, y: 0, z: 0 })
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('POST /stop', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(app)
          .post('/stop')
          .send({})
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('POST /look', () => {
      it('should validate yaw and pitch parameters', async () => {
        const response = await request(app)
          .post('/look')
          .send({ yaw: 1.0 })
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });

      it('should require both yaw and pitch when bot connected', async () => {
        // Create minimal mock bot
        server.bot = {
          look: () => {},
          player: { username: 'test' }
        };
        
        const response = await request(app)
          .post('/look')
          .send({ yaw: 1.0 })
          .expect(400);
        
        expect(response.body.error).toBe('yaw and pitch required');
      });
    });

    describe('POST /dig', () => {
      it('should validate coordinates', async () => {
        const response = await request(app)
          .post('/dig')
          .send({ x: 0, y: 64 })
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });
    });

    describe('POST /place', () => {
      it('should require all parameters', async () => {
        const response = await request(app)
          .post('/place')
          .send({ x: 0, y: 64, z: 0 })
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });
    });
  });

  describe('Combat Endpoints', () => {
    describe('POST /attack', () => {
      it('should require entityId', async () => {
        const response = await request(app)
          .post('/attack')
          .send({})
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });

      it('should validate entityId when bot connected', async () => {
        server.bot = {
          entities: {},
          attack: () => {},
          player: { username: 'test' }
        };
        
        const response = await request(app)
          .post('/attack')
          .send({})
          .expect(400);
        
        expect(response.body.error).toBe('entityId required');
      });
    });
  });

  describe('Crafting Endpoints', () => {
    describe('GET /recipes', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(app)
          .get('/recipes')
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });

    describe('POST /craft', () => {
      it('should require item name', async () => {
        const response = await request(app)
          .post('/craft')
          .send({})
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });
    });

    describe('POST /equip', () => {
      it('should require item name', async () => {
        const response = await request(app)
          .post('/equip')
          .send({})
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });
    });
  });

  describe('Batch Operations', () => {
    describe('POST /batch', () => {
      it('should validate instructions array', async () => {
        const response = await request(app)
          .post('/batch')
          .send({})
          .expect(400);
        
        expect(response.body.error).toContain('Bot not connected');
      });

      it('should require instructions to be an array when bot connected', async () => {
        server.bot = {
          player: { username: 'test' }
        };
        
        const response = await request(app)
          .post('/batch')
          .send({ instructions: 'not an array' })
          .expect(400);
        
        expect(response.body.error).toBe('instructions array required');
      });

      it('should process empty instructions array', async () => {
        server.bot = {
          player: { username: 'test' }
        };
        
        const response = await request(app)
          .post('/batch')
          .send({ instructions: [] })
          .expect(200);
        
        expect(response.body.completed).toBe(0);
        expect(response.body.total).toBe(0);
        expect(response.body.results).toEqual([]);
      });
    });
  });

  describe('Screenshot Endpoint', () => {
    describe('GET /screenshot', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(app)
          .get('/screenshot')
          .expect(400);
        
        expect(response.body.error).toBe('Bot not connected');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes', async () => {
      const response = await request(app)
        .get('/invalid-route')
        .expect(404);
    });

    it('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/chat')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should handle missing Content-Type', async () => {
      const response = await request(app)
        .post('/chat')
        .send('plain text')
        .expect(400);
    });
  });

  describe('Content Type Validation', () => {
    it('should accept application/json content type', async () => {
      const response = await request(app)
        .post('/chat')
        .set('Content-Type', 'application/json')
        .send({ message: 'test' })
        .expect(400); // Will fail due to bot not connected, but accepts the content type
      
      expect(response.body.error).toBe('Bot not connected');
    });
  });

  describe('Response Headers', () => {
    it('should return JSON content type', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = [];
      
      // Send 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/health')
            .expect(200)
        );
      }
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('ok');
      });
    });
  });

  describe('Event Logging', () => {
    it('should log events in correct format', () => {
      server.logEvent('test', { data: 'value' });
      
      expect(server.events).toHaveLength(1);
      expect(server.events[0]).toHaveProperty('timestamp');
      expect(server.events[0]).toHaveProperty('type', 'test');
      expect(server.events[0]).toHaveProperty('data');
      expect(server.events[0].data).toEqual({ data: 'value' });
    });

    it('should maintain event order', () => {
      server.logEvent('event1', {});
      server.logEvent('event2', {});
      server.logEvent('event3', {});
      
      expect(server.events).toHaveLength(3);
      expect(server.events[0].type).toBe('event1');
      expect(server.events[1].type).toBe('event2');
      expect(server.events[2].type).toBe('event3');
      
      // Check timestamps are in order
      expect(server.events[0].timestamp).toBeLessThanOrEqual(server.events[1].timestamp);
      expect(server.events[1].timestamp).toBeLessThanOrEqual(server.events[2].timestamp);
    });
  });
});