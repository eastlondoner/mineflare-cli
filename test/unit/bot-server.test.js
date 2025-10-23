/**
 * Unit tests for MinecraftBotServer
 */
const { describe, it, expect, beforeEach, afterEach, jest, mock } = require('bun:test');
const MinecraftBotServer = require('../../src/bot-server.js');
const { MockBot } = require('../mocks/mineflayer-mock.js');
const express = require('express');
const request = require('supertest');

// Create a mock bot instance and mock createBot function
let mockBot;
const mockCreateBot = jest.fn();

// Mock mineflayer module to return our mock bot
mock.module('mineflayer', () => ({
  createBot: mockCreateBot
}));

// Mock prismarine-viewer
mock.module('prismarine-viewer', () => ({
  mineflare: jest.fn(() => ({
    close: jest.fn()
  }))
}));

// Mock canvas
mock.module('canvas', () => ({
  createCanvas: () => ({
    getContext: () => ({
      fillStyle: '',
      fillRect: jest.fn(),
      fillText: jest.fn(),
      font: '',
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      strokeStyle: '',
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      lineWidth: 0
    }),
    toBuffer: () => Buffer.from('test-screenshot-data')
  })
}));

// Mock vec3
mock.module('vec3', () => {
  return class Vec3 {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  };
});

describe('MinecraftBotServer', () => {
  let server;
  let mockBot;

  beforeEach(() => {
    // Clear mocks
    mockCreateBot.mockClear();
    
    // Create fresh server instance
    server = new MinecraftBotServer();
    
    // Create fresh mock bot
    mockBot = new MockBot();
    
    // Add missing onGround property to entity and distanceTo method
    mockBot.entity.onGround = true;
    mockBot.entity.position.distanceTo = jest.fn((other) => {
      const dx = mockBot.entity.position.x - other.x;
      const dy = mockBot.entity.position.y - other.y;
      const dz = mockBot.entity.position.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    });
    
    // Set up registry
    mockBot.registry = {
      itemsByName: {
        'stone': { id: 1 },
        'dirt': { id: 3 },
        'wood': { id: 17 }
      },
      blocksByName: {
        'crafting_table': { id: 58 }
      }
    };
    
    // Set up game properties
    mockBot.game = {
      gameMode: 'survival',
      dimension: 'overworld'
    };
    mockBot.oxygenLevel = 20;
    
    // Mock all methods with jest.fn()
    mockBot.setControlState = jest.fn();
    mockBot.look = jest.fn();
    mockBot.chat = jest.fn();
    mockBot.dig = jest.fn().mockResolvedValue(true);
    mockBot.recipesFor = jest.fn().mockReturnValue([{
      result: { count: 1 },
      requiresTable: false,
      inShape: [],
      outShape: [],
      ingredients: []
    }]);
    mockBot.recipesAll = jest.fn().mockReturnValue([]);
    mockBot.findBlock = jest.fn().mockReturnValue(null);
    mockBot.findBlocks = jest.fn().mockReturnValue([]);
    mockBot.craft = jest.fn().mockResolvedValue(true);
    mockBot.equip = jest.fn().mockResolvedValue(true);
    mockBot.placeBlock = jest.fn().mockResolvedValue(true);
    mockBot.clearControlStates = jest.fn();
    mockBot.attack = jest.fn();
    
    // Mock player property
    mockBot.player = { username: 'test_bot' };
    
    // Make mockCreateBot return our mockBot
    mockCreateBot.mockReturnValue(mockBot);
  });

  afterEach(() => {
    // Clean up
    if (server.viewer?.close) {
      server.viewer.close();
    }
  });

  describe('Constructor', () => {
    it('should initialize with null bot', () => {
      expect(server.bot).toBeNull();
    });

    it('should initialize empty events array', () => {
      expect(server.events).toEqual([]);
    });

    it('should create express app', () => {
      expect(server.app).toBeDefined();
      expect(server.app.use).toBeDefined();
    });

    it('should set up routes on initialization', () => {
      // Check if routes are set up by verifying route methods exist
      expect(server.app.get).toBeDefined();
      expect(server.app.post).toBeDefined();
      expect(server.app.use).toBeDefined();
    });
  });

  describe('logEvent', () => {
    it('should add event to events array', () => {
      server.logEvent('test', { data: 'test' });
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('test');
      expect(server.events[0].data).toEqual({ data: 'test' });
      expect(server.events[0].timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should log event to console', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      server.logEvent('test', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[EVENT] test:', { data: 'test' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('setupBot', () => {
    it('should create bot with default config', () => {
      server.setupBot({});
      
      expect(mockCreateBot).toHaveBeenCalledWith({
        host: 'localhost',
        port: 25565,
        username: 'Bot',
        version: false,
        auth: 'offline'
      });
      expect(server.bot).toBe(mockBot);
    });

    it('should create bot with custom config', () => {
      server.setupBot({
        host: 'test.server.com',
        port: 12345,
        username: 'TestBot',
        version: '1.19',
        auth: 'microsoft'
      });
      
      expect(mockCreateBot).toHaveBeenCalledWith({
        host: 'test.server.com',
        port: 12345,
        username: 'TestBot',
        version: '1.19',
        auth: 'microsoft'
      });
    });

    it('should register spawn event handler', () => {
      server.setupBot({});
      
      // Trigger spawn event
      mockBot.emit('spawn');
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('spawn');
    });

    it('should register chat event handler', () => {
      server.setupBot({});
      
      // Trigger chat event
      mockBot.emit('chat', 'player1', 'Hello!');
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('chat');
      expect(server.events[0].data).toEqual({ 
        username: 'player1', 
        message: 'Hello!' 
      });
    });

    it('should register health event handler', () => {
      server.setupBot({});
      
      // Trigger health event
      mockBot.emit('health');
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('health');
      expect(server.events[0].data).toEqual({ 
        health: mockBot.health, 
        food: mockBot.food 
      });
    });

    it('should register death event handler', () => {
      server.setupBot({});
      
      // Trigger death event
      mockBot.emit('death');
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('death');
    });

    it('should register kicked event handler', () => {
      server.setupBot({});
      
      // Trigger kicked event
      mockBot.emit('kicked', 'Banned');
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('kicked');
      expect(server.events[0].data).toEqual({ reason: 'Banned' });
    });

    it('should register error event handler', () => {
      server.setupBot({});
      
      // Trigger error event
      mockBot.emit('error', new Error('Connection failed'));
      
      expect(server.events.length).toBe(1);
      expect(server.events[0].type).toBe('error');
      expect(server.events[0].data).toEqual({ message: 'Connection failed' });
    });
  });

  describe('API Routes', () => {
    describe('GET /health', () => {
      it('should return health status with bot not connected', async () => {
        const response = await request(server.app)
          .get('/health')
          .expect(200);
        
        expect(response.body).toEqual({
          status: 'ok',
          botConnected: false
        });
      });

      it('should return health status with bot connected', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .get('/health')
          .expect(200);
        
        expect(response.body).toEqual({
          status: 'ok',
          botConnected: true
        });
      });
    });

    describe('GET /state', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .get('/state')
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return bot state when connected', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .get('/state')
          .expect(200);
        
        expect(response.body).toHaveProperty('position');
        expect(response.body).toHaveProperty('health');
        expect(response.body).toHaveProperty('food');
        expect(response.body).toHaveProperty('oxygen');
        expect(response.body).toHaveProperty('yaw');
        expect(response.body).toHaveProperty('pitch');
        expect(response.body).toHaveProperty('onGround');
        expect(response.body).toHaveProperty('gameMode');
        expect(response.body).toHaveProperty('dimension');
      });
    });

    describe('GET /inventory', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .get('/inventory')
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return inventory when bot connected', async () => {
        server.bot = mockBot;
        mockBot.inventory.items = () => [
          { name: 'stone', count: 64, slot: 0, displayName: 'Stone' },
          { name: 'dirt', count: 32, slot: 1, displayName: 'Dirt' }
        ];
        
        const response = await request(server.app)
          .get('/inventory')
          .expect(200);
        
        expect(response.body.items).toHaveLength(2);
        expect(response.body.items[0]).toEqual({
          name: 'stone',
          count: 64,
          slot: 0,
          displayName: 'Stone'
        });
      });
    });

    describe('GET /entities', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .get('/entities')
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return entities when bot connected', async () => {
        server.bot = mockBot;
        mockBot.entities = {
          1: {
            type: 'player',
            name: 'Player1',
            position: { x: 10, y: 64, z: 10, distanceTo: () => 10 },
            metadata: { 8: 20 }
          },
          2: {
            type: 'mob',
            displayName: 'Zombie',
            position: { x: 5, y: 64, z: 5, distanceTo: () => 5 },
            metadata: { 8: 15 }
          },
          3: {
            type: 'item',
            name: 'item_drop',
            position: { x: 0, y: 64, z: 0, distanceTo: () => 0 }
          }
        };
        
        const response = await request(server.app)
          .get('/entities')
          .expect(200);
        
        // Should filter out non-player/mob entities
        expect(response.body.entities).toHaveLength(2);
        expect(response.body.entities[0].type).toBe('player');
        expect(response.body.entities[1].type).toBe('mob');
      });
    });

    describe('GET /events', () => {
      it('should return all events when no since parameter', async () => {
        server.events = [
          { timestamp: 1000, type: 'event1', data: {} },
          { timestamp: 2000, type: 'event2', data: {} }
        ];
        
        const response = await request(server.app)
          .get('/events')
          .expect(200);
        
        expect(response.body.events).toHaveLength(2);
      });

      it('should return filtered events when since parameter provided', async () => {
        server.events = [
          { timestamp: 1000, type: 'event1', data: {} },
          { timestamp: 2000, type: 'event2', data: {} },
          { timestamp: 3000, type: 'event3', data: {} }
        ];
        
        const response = await request(server.app)
          .get('/events?since=1500')
          .expect(200);
        
        expect(response.body.events).toHaveLength(2);
        expect(response.body.events[0].type).toBe('event2');
        expect(response.body.events[1].type).toBe('event3');
      });
    });

    describe('GET /screenshot', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .get('/screenshot')
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return screenshot when bot connected', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .get('/screenshot')
          .expect(200);
        
        expect(response.body).toHaveProperty('screenshot');
        expect(response.body.screenshot).toBeTruthy();
      });
    });

    describe('POST /chat', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/chat')
          .send({ message: 'Hello' })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when message not provided', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/chat')
          .send({})
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Message required' });
      });

      it('should send chat message when valid', async () => {
        server.bot = mockBot;
        const chatSpy = jest.spyOn(mockBot, 'chat');
        
        const response = await request(server.app)
          .post('/chat')
          .send({ message: 'Hello world!' })
          .expect(200);
        
        expect(response.body).toEqual({ success: true });
        expect(chatSpy).toHaveBeenCalledWith('Hello world!');
      });
    });

    describe('POST /move', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/move')
          .send({ x: 1, y: 0, z: 0 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should set movement controls when valid', async () => {
        server.bot = mockBot;
        const controlSpy = jest.spyOn(mockBot, 'setControlState');
        
        const response = await request(server.app)
          .post('/move')
          .send({ x: 1, y: 1, z: -1, sprint: true })
          .expect(200);
        
        expect(response.body).toEqual({ success: true });
        expect(controlSpy).toHaveBeenCalledWith('forward', true);
        expect(controlSpy).toHaveBeenCalledWith('jump', true);
        expect(controlSpy).toHaveBeenCalledWith('left', true);
        expect(controlSpy).toHaveBeenCalledWith('sprint', true);
      });
    });

    describe('POST /stop', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/stop')
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should clear control states when bot connected', async () => {
        server.bot = mockBot;
        const clearSpy = jest.spyOn(mockBot, 'clearControlStates');
        
        const response = await request(server.app)
          .post('/stop')
          .expect(200);
        
        expect(response.body).toEqual({ success: true });
        expect(clearSpy).toHaveBeenCalled();
      });
    });

    describe('POST /look', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/look')
          .send({ yaw: 0, pitch: 0 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when yaw or pitch missing', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/look')
          .send({ yaw: 0 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'yaw and pitch required' });
      });

      it('should set look direction when valid', async () => {
        server.bot = mockBot;
        const lookSpy = jest.spyOn(mockBot, 'look');
        
        const response = await request(server.app)
          .post('/look')
          .send({ yaw: 1.57, pitch: 0.5 })
          .expect(200);
        
        expect(response.body).toEqual({ success: true });
        expect(lookSpy).toHaveBeenCalledWith(1.57, 0.5, true);
      });
    });

    describe('POST /dig', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/dig')
          .send({ x: 0, y: 64, z: 0 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when coordinates missing', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/dig')
          .send({ x: 0, y: 64 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'x, y, z coordinates required' });
      });

      it('should dig block when valid', async () => {
        server.bot = mockBot;
        const mockBlock = { name: 'stone' };
        mockBot.blockAt = jest.fn().mockReturnValue(mockBlock);
        
        const response = await request(server.app)
          .post('/dig')
          .send({ x: 0, y: 64, z: 0 })
          .expect(200);
        
        expect(response.body).toEqual({ success: true, block: 'stone' });
        expect(mockBot.dig).toHaveBeenCalledWith(mockBlock);
      });

      it('should return error when no block at position', async () => {
        server.bot = mockBot;
        mockBot.blockAt = jest.fn().mockReturnValue(null);
        
        const response = await request(server.app)
          .post('/dig')
          .send({ x: 0, y: 64, z: 0 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'No block at position' });
      });
    });

    describe('POST /attack', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/attack')
          .send({ entityId: 1 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when entityId missing', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/attack')
          .send({})
          .expect(400);
        
        expect(response.body).toEqual({ error: 'entityId required' });
      });

      it('should attack entity when valid', async () => {
        server.bot = mockBot;
        const mockEntity = { type: 'mob', name: 'zombie' };
        mockBot.entities = { 123: mockEntity };
        
        const response = await request(server.app)
          .post('/attack')
          .send({ entityId: 123 })
          .expect(200);
        
        expect(response.body).toEqual({ success: true });
        expect(mockBot.attack).toHaveBeenCalledWith(mockEntity);
      });

      it('should return error when entity not found', async () => {
        server.bot = mockBot;
        mockBot.entities = {};
        
        const response = await request(server.app)
          .post('/attack')
          .send({ entityId: 999 })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Entity not found' });
      });
    });

    describe('POST /craft', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/craft')
          .send({ item: 'stick' })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when item not provided', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/craft')
          .send({})
          .expect(400);
        
        expect(response.body).toEqual({ error: 'item name required' });
      });

      it('should craft item when valid', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/craft')
          .send({ item: 'stone', count: 2 })
          .expect(200);
        
        expect(response.body).toEqual({ 
          success: true, 
          crafted: 'stone',
          count: 2
        });
        expect(mockBot.craft).toHaveBeenCalled();
      });

      it('should return error for unknown item', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/craft')
          .send({ item: 'unknown_item' })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Unknown item: unknown_item' });
      });
    });

    describe('POST /equip', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/equip')
          .send({ item: 'sword' })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when item not provided', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/equip')
          .send({})
          .expect(400);
        
        expect(response.body).toEqual({ error: 'item name required' });
      });

      it('should equip item when valid', async () => {
        server.bot = mockBot;
        const mockItem = { name: 'sword' };
        mockBot.inventory.items = () => [mockItem];
        
        const response = await request(server.app)
          .post('/equip')
          .send({ item: 'sword' })
          .expect(200);
        
        expect(response.body).toEqual({ 
          success: true, 
          equipped: 'sword',
          destination: 'hand'
        });
        expect(mockBot.equip).toHaveBeenCalledWith(mockItem, 'hand');
      });

      it('should return error when item not in inventory', async () => {
        server.bot = mockBot;
        mockBot.inventory.items = () => [];
        
        const response = await request(server.app)
          .post('/equip')
          .send({ item: 'sword' })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'No sword in inventory' });
      });
    });

    describe('POST /batch', () => {
      it('should return error when bot not connected', async () => {
        const response = await request(server.app)
          .post('/batch')
          .send({ instructions: [] })
          .expect(400);
        
        expect(response.body).toEqual({ error: 'Bot not connected' });
      });

      it('should return error when instructions not provided', async () => {
        server.bot = mockBot;
        
        const response = await request(server.app)
          .post('/batch')
          .send({})
          .expect(400);
        
        expect(response.body).toEqual({ error: 'instructions array required' });
      });

      it('should execute batch instructions successfully', async () => {
        server.bot = mockBot;
        
        const instructions = [
          { type: 'chat', params: { message: 'Hello' } },
          { type: 'stop' },
          { type: 'wait', params: { duration: 100 } }
        ];
        
        const response = await request(server.app)
          .post('/batch')
          .send({ instructions })
          .expect(200);
        
        expect(response.body.completed).toBe(3);
        expect(response.body.total).toBe(3);
        expect(response.body.stopped).toBe(false);
        expect(response.body.results).toHaveLength(3);
        expect(response.body.results[0].success).toBe(true);
      });

      it('should stop on error when stopOnError is true', async () => {
        server.bot = mockBot;
        
        const instructions = [
          { type: 'chat', params: { message: 'Hello' } },
          { type: 'unknown_command' },
          { type: 'stop' }
        ];
        
        const response = await request(server.app)
          .post('/batch')
          .send({ instructions, stopOnError: true })
          .expect(200);
        
        expect(response.body.completed).toBe(2);
        expect(response.body.total).toBe(3);
        expect(response.body.stopped).toBe(true);
        expect(response.body.results).toHaveLength(2);
        expect(response.body.results[1].success).toBe(false);
        expect(response.body.results[1].error).toContain('Unknown instruction type');
      });

      it('should continue on error when stopOnError is false', async () => {
        server.bot = mockBot;
        
        const instructions = [
          { type: 'chat', params: { message: 'Hello' } },
          { type: 'unknown_command' },
          { type: 'stop' }
        ];
        
        const response = await request(server.app)
          .post('/batch')
          .send({ instructions, stopOnError: false })
          .expect(200);
        
        expect(response.body.completed).toBe(3);
        expect(response.body.total).toBe(3);
        expect(response.body.stopped).toBe(false);
        expect(response.body.results).toHaveLength(3);
        expect(response.body.results[1].success).toBe(false);
        expect(response.body.results[2].success).toBe(true);
      });
    });
  });

  describe('executeInstruction', () => {
    beforeEach(() => {
      server.bot = mockBot;
    });

    it('should execute move instruction', async () => {
      const result = await server.executeInstruction({
        type: 'move',
        params: { x: 1, y: 0, z: -1, sprint: true }
      });
      
      expect(result).toEqual({ moved: true });
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('left', true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('sprint', true);
    });

    it('should execute stop instruction', async () => {
      const result = await server.executeInstruction({
        type: 'stop'
      });
      
      expect(result).toEqual({ stopped: true });
      expect(mockBot.clearControlStates).toHaveBeenCalled();
    });

    it('should execute look instruction', async () => {
      const result = await server.executeInstruction({
        type: 'look',
        params: { yaw: 1.57, pitch: 0 }
      });
      
      expect(result).toEqual({ looked: true });
      expect(mockBot.look).toHaveBeenCalledWith(1.57, 0, true);
    });

    it('should execute chat instruction', async () => {
      const result = await server.executeInstruction({
        type: 'chat',
        params: { message: 'Test message' }
      });
      
      expect(result).toEqual({ sent: true });
      expect(mockBot.chat).toHaveBeenCalledWith('Test message');
    });

    it('should execute wait instruction', async () => {
      const startTime = Date.now();
      
      const result = await server.executeInstruction({
        type: 'wait',
        params: { duration: 100 }
      });
      
      const endTime = Date.now();
      
      expect(result).toEqual({ waited: 100 });
      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
    });

    it('should throw error for unknown instruction type', async () => {
      await expect(
        server.executeInstruction({ type: 'unknown_type' })
      ).rejects.toThrow('Unknown instruction type: unknown_type');
    });

    it('should throw error for chat without message', async () => {
      await expect(
        server.executeInstruction({ type: 'chat', params: {} })
      ).rejects.toThrow('message required');
    });

    it('should throw error for look without yaw/pitch', async () => {
      await expect(
        server.executeInstruction({ type: 'look', params: { yaw: 1.57 } })
      ).rejects.toThrow('yaw and pitch required');
    });
  });

  describe('captureScreenshot', () => {
    it('should throw error when bot not connected', async () => {
      await expect(server.captureScreenshot()).rejects.toThrow('Bot not connected');
    });

    it('should generate screenshot when bot connected', async () => {
      server.bot = mockBot;
      
      const screenshot = await server.captureScreenshot();
      
      expect(screenshot).toBeTruthy();
      expect(typeof screenshot).toBe('string');
    });
  });
});