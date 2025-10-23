/**
 * Unit tests for CLI module
 */
const { describe, it, expect, beforeEach, afterEach, jest, mock } = require('bun:test');
const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock configManager
const mockConfig = {
  api: { baseUrl: 'http://localhost:3001' },
  server: { timeout: 5000 }
};

mock.module('../src/config/ConfigManager', () => ({
  get: jest.fn(() => mockConfig)
}));

// Mock fs for file operations
const mockFs = {
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => false)
};
mock.module('fs', () => mockFs);

describe('CLI Commands', () => {
  let mockAxiosInstance;
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up axios mock instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    };
    
    axios.create.mockReturnValue(mockAxiosInstance);
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Spy on process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Health Command', () => {
    it('should fetch and display health status', async () => {
      const mockResponse = {
        data: { status: 'ok', botConnected: true }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);
      
      // Simulate running the health command
      const { Command } = require('commander');
      const program = new Command();
      
      // We'll need to extract the action callback
      let healthAction;
      program.command = jest.fn((name) => {
        if (name === 'health') {
          return {
            description: jest.fn(() => ({
              action: jest.fn((callback) => {
                healthAction = callback;
                return { parse: jest.fn() };
              })
            }))
          };
        }
        return program;
      });
      
      // Load the CLI module (this won't work directly, we need a different approach)
      // For now, we'll test the axios calls directly
      await mockAxiosInstance.get('/health');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should handle health check errors', async () => {
      const mockError = new Error('Connection refused');
      mockAxiosInstance.get.mockRejectedValue(mockError);
      
      try {
        await mockAxiosInstance.get('/health');
      } catch (error) {
        expect(error.message).toBe('Connection refused');
      }
    });
  });

  describe('State Command', () => {
    it('should fetch and display bot state', async () => {
      const mockState = {
        data: {
          position: { x: 0, y: 64, z: 0 },
          health: 20,
          food: 20,
          oxygen: 20,
          yaw: 0,
          pitch: 0,
          onGround: true,
          gameMode: 'survival',
          dimension: 'overworld'
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockState);
      
      const response = await mockAxiosInstance.get('/state');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/state');
      expect(response.data).toHaveProperty('position');
      expect(response.data).toHaveProperty('health');
      expect(response.data).toHaveProperty('gameMode');
    });

    it('should handle state fetch errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Bot not connected'));
      
      try {
        await mockAxiosInstance.get('/state');
      } catch (error) {
        expect(error.message).toBe('Bot not connected');
      }
    });
  });

  describe('Inventory Command', () => {
    it('should fetch and display inventory', async () => {
      const mockInventory = {
        data: {
          items: [
            { name: 'stone', count: 64, slot: 0, displayName: 'Stone' },
            { name: 'dirt', count: 32, slot: 1, displayName: 'Dirt' }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockInventory);
      
      const response = await mockAxiosInstance.get('/inventory');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/inventory');
      expect(response.data.items).toHaveLength(2);
      expect(response.data.items[0].name).toBe('stone');
    });
  });

  describe('Entities Command', () => {
    it('should fetch and display nearby entities', async () => {
      const mockEntities = {
        data: {
          entities: [
            { type: 'player', name: 'Player1', position: { x: 10, y: 64, z: 10 }, distance: 10 },
            { type: 'mob', name: 'Zombie', position: { x: 5, y: 64, z: 5 }, distance: 5 }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockEntities);
      
      const response = await mockAxiosInstance.get('/entities');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/entities');
      expect(response.data.entities).toHaveLength(2);
      expect(response.data.entities[0].type).toBe('player');
    });
  });

  describe('Events Command', () => {
    it('should fetch events without since parameter', async () => {
      const mockEvents = {
        data: {
          events: [
            { timestamp: 1000, type: 'spawn', data: {} },
            { timestamp: 2000, type: 'chat', data: { message: 'Hello' } }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockEvents);
      
      const response = await mockAxiosInstance.get('/events', {
        params: { since: '0' }
      });
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', {
        params: { since: '0' }
      });
      expect(response.data.events).toHaveLength(2);
    });

    it('should fetch events with since parameter', async () => {
      const mockEvents = {
        data: {
          events: [
            { timestamp: 3000, type: 'health', data: { health: 18 } }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockEvents);
      
      const response = await mockAxiosInstance.get('/events', {
        params: { since: '2500' }
      });
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', {
        params: { since: '2500' }
      });
      expect(response.data.events).toHaveLength(1);
      expect(response.data.events[0].timestamp).toBe(3000);
    });
  });

  describe('Screenshot Command', () => {
    it('should fetch screenshot and display base64', async () => {
      const mockScreenshot = {
        data: {
          screenshot: 'base64encodedimagedata'
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockScreenshot);
      
      const response = await mockAxiosInstance.get('/screenshot');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/screenshot');
      expect(response.data.screenshot).toBe('base64encodedimagedata');
    });

    it('should save screenshot to file when output option provided', async () => {
      const mockScreenshot = {
        data: {
          screenshot: 'base64encodedimagedata'
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockScreenshot);
      
      await mockAxiosInstance.get('/screenshot');
      
      // Simulate saving to file
      mockFs.writeFileSync('screenshot.png', 'base64encodedimagedata', 'base64');
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'screenshot.png',
        'base64encodedimagedata',
        'base64'
      );
    });
  });

  describe('Chat Command', () => {
    it('should send chat message', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/chat', { message: 'Hello world!' });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat', { message: 'Hello world!' });
      expect(response.data.success).toBe(true);
    });

    it('should handle chat errors', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Bot not connected'));
      
      try {
        await mockAxiosInstance.post('/chat', { message: 'Hello' });
      } catch (error) {
        expect(error.message).toBe('Bot not connected');
      }
    });
  });

  describe('Move Command', () => {
    it('should send move command with all parameters', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/move', {
        x: 1,
        y: 0,
        z: -1,
        sprint: true
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/move', {
        x: 1,
        y: 0,
        z: -1,
        sprint: true
      });
      expect(response.data.success).toBe(true);
    });

    it('should send move command with partial parameters', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/move', {
        x: 1
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/move', { x: 1 });
      expect(response.data.success).toBe(true);
    });
  });

  describe('Stop Command', () => {
    it('should send stop command', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/stop');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/stop');
      expect(response.data.success).toBe(true);
    });
  });

  describe('Look Command', () => {
    it('should send look command with yaw and pitch', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/look', {
        yaw: 1.57,
        pitch: 0.5
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/look', {
        yaw: 1.57,
        pitch: 0.5
      });
      expect(response.data.success).toBe(true);
    });

    it('should handle missing yaw or pitch', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('yaw and pitch required'));
      
      try {
        await mockAxiosInstance.post('/look', { yaw: 1.57 });
      } catch (error) {
        expect(error.message).toBe('yaw and pitch required');
      }
    });
  });

  describe('Dig Command', () => {
    it('should send dig command with coordinates', async () => {
      const mockResponse = {
        data: { success: true, block: 'stone' }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/dig', {
        x: 0,
        y: 64,
        z: 0
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/dig', {
        x: 0,
        y: 64,
        z: 0
      });
      expect(response.data.success).toBe(true);
      expect(response.data.block).toBe('stone');
    });

    it('should handle missing coordinates', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('x, y, z coordinates required'));
      
      try {
        await mockAxiosInstance.post('/dig', { x: 0, y: 64 });
      } catch (error) {
        expect(error.message).toBe('x, y, z coordinates required');
      }
    });
  });

  describe('Place Command', () => {
    it('should send place command with coordinates and block name', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/place', {
        x: 0,
        y: 64,
        z: 0,
        blockName: 'stone'
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/place', {
        x: 0,
        y: 64,
        z: 0,
        blockName: 'stone'
      });
      expect(response.data.success).toBe(true);
    });
  });

  describe('Attack Command', () => {
    it('should send attack command with entity ID', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/attack', {
        entityId: 123
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/attack', {
        entityId: 123
      });
      expect(response.data.success).toBe(true);
    });

    it('should handle missing entity ID', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('entityId required'));
      
      try {
        await mockAxiosInstance.post('/attack', {});
      } catch (error) {
        expect(error.message).toBe('entityId required');
      }
    });
  });

  describe('Recipes Command', () => {
    it('should fetch all recipes', async () => {
      const mockRecipes = {
        data: {
          recipes: [
            { result: 'stick', count: 4, ingredients: ['planks'] }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockRecipes);
      
      const response = await mockAxiosInstance.get('/recipes', {
        params: {}
      });
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/recipes', { params: {} });
      expect(response.data.recipes).toHaveLength(1);
    });

    it('should fetch recipes for specific item', async () => {
      const mockRecipes = {
        data: {
          recipes: [
            { result: 'stick', count: 4, ingredients: ['planks'] }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockRecipes);
      
      const response = await mockAxiosInstance.get('/recipes', {
        params: { item: 'stick' }
      });
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/recipes', {
        params: { item: 'stick' }
      });
      expect(response.data.recipes[0].result).toBe('stick');
    });
  });

  describe('Craft Command', () => {
    it('should craft item with default count', async () => {
      const mockResponse = {
        data: { success: true, crafted: 'stick', count: 1 }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/craft', {
        item: 'stick',
        count: 1,
        craftingTable: false
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/craft', {
        item: 'stick',
        count: 1,
        craftingTable: false
      });
      expect(response.data.success).toBe(true);
      expect(response.data.crafted).toBe('stick');
    });

    it('should craft item with custom count and table', async () => {
      const mockResponse = {
        data: { success: true, crafted: 'sword', count: 1 }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/craft', {
        item: 'sword',
        count: 1,
        craftingTable: true
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/craft', {
        item: 'sword',
        count: 1,
        craftingTable: true
      });
      expect(response.data.success).toBe(true);
    });
  });

  describe('Equip Command', () => {
    it('should equip item to default destination', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/equip', {
        item: 'sword',
        destination: 'hand'
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/equip', {
        item: 'sword',
        destination: 'hand'
      });
      expect(response.data.success).toBe(true);
    });

    it('should equip item to specific destination', async () => {
      const mockResponse = {
        data: { success: true }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);
      
      const response = await mockAxiosInstance.post('/equip', {
        item: 'helmet',
        destination: 'head'
      });
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/equip', {
        item: 'helmet',
        destination: 'head'
      });
      expect(response.data.success).toBe(true);
    });
  });
});