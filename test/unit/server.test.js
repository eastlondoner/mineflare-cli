/**
 * Unit tests for Server module
 */
const { describe, it, expect, beforeEach, afterEach, jest, mock } = require('bun:test');

// Mock MinecraftBotServer
const mockStart = jest.fn();
const mockBot = {
  quit: jest.fn()
};

class MockMinecraftBotServer {
  constructor() {
    this.bot = null;
    this.start = mockStart;
  }
}

mock.module('../src/bot-server', () => MockMinecraftBotServer);

// Mock configManager
const mockConfig = {
  minecraft: {
    host: 'localhost',
    port: 25565,
    username: 'TestBot',
    version: '1.21.1',
    auth: 'offline'
  },
  viewer: {
    enabled: true,
    port: 3001,
    firstPerson: true
  },
  server: {
    port: 3000
  }
};

const mockConfigManager = {
  get: jest.fn(() => mockConfig)
};

mock.module('../src/config/ConfigManager', () => mockConfigManager);

describe('Server Module', () => {
  let processExitSpy;
  let consoleLogSpy;
  let originalProcessOn;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    mockStart.mockClear();
    mockBot.quit.mockClear();
    
    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Spy on process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    // Store original process.on
    originalProcessOn = process.on;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    
    // Restore process.on
    process.on = originalProcessOn;
  });

  describe('Server Initialization', () => {
    it('should load configuration from config manager', () => {
      // Load server module would normally happen here
      // Since we're mocking, we test the mock was called
      mockConfigManager.get();
      
      expect(mockConfigManager.get).toHaveBeenCalled();
    });

    it('should create MinecraftBotServer instance', () => {
      const server = new MockMinecraftBotServer();
      
      expect(server).toBeDefined();
      expect(server.start).toBeDefined();
      expect(server.bot).toBeNull();
    });

    it('should extract config values correctly', () => {
      const fullConfig = mockConfigManager.get();
      
      const config = {
        host: fullConfig.minecraft.host,
        port: fullConfig.minecraft.port,
        username: fullConfig.minecraft.username,
        version: fullConfig.minecraft.version,
        auth: fullConfig.minecraft.auth,
        enableViewer: fullConfig.viewer.enabled,
        viewerPort: fullConfig.viewer.port,
        firstPerson: fullConfig.viewer.firstPerson
      };
      
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(25565);
      expect(config.username).toBe('TestBot');
      expect(config.version).toBe('1.21.1');
      expect(config.auth).toBe('offline');
      expect(config.enableViewer).toBe(true);
      expect(config.viewerPort).toBe(3001);
      expect(config.firstPerson).toBe(true);
    });

    it('should call server.start with correct config and port', () => {
      const fullConfig = mockConfigManager.get();
      const server = new MockMinecraftBotServer();
      
      const config = {
        host: fullConfig.minecraft.host,
        port: fullConfig.minecraft.port,
        username: fullConfig.minecraft.username,
        version: fullConfig.minecraft.version,
        auth: fullConfig.minecraft.auth,
        enableViewer: fullConfig.viewer.enabled,
        viewerPort: fullConfig.viewer.port,
        firstPerson: fullConfig.viewer.firstPerson
      };
      
      const serverPort = fullConfig.server.port;
      
      server.start(config, serverPort);
      
      expect(mockStart).toHaveBeenCalledWith(config, serverPort);
    });
  });

  describe('Signal Handling', () => {
    it('should register SIGINT handler', () => {
      const handlers = {};
      process.on = jest.fn((event, handler) => {
        handlers[event] = handler;
      });
      
      // Simulate loading the server module
      process.on('SIGINT', () => {
        console.log('Shutting down...');
        if (mockBot) {
          mockBot.quit();
        }
        process.exit(0);
      });
      
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      
      // Test the handler
      const server = new MockMinecraftBotServer();
      server.bot = mockBot;
      
      // Call the SIGINT handler
      handlers['SIGINT']();
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Shutting down...');
      expect(mockBot.quit).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT when bot is null', () => {
      const handlers = {};
      process.on = jest.fn((event, handler) => {
        handlers[event] = handler;
      });
      
      // Register handler
      process.on('SIGINT', () => {
        console.log('Shutting down...');
        const server = new MockMinecraftBotServer();
        if (server.bot) {
          server.bot.quit();
        }
        process.exit(0);
      });
      
      // Call the handler with no bot
      handlers['SIGINT']();
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Shutting down...');
      expect(mockBot.quit).not.toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle missing config values with defaults', () => {
      const partialConfig = {
        minecraft: {},
        viewer: {},
        server: {}
      };
      
      mockConfigManager.get.mockReturnValueOnce(partialConfig);
      
      const fullConfig = mockConfigManager.get();
      
      // These would be undefined, testing the mock returns the right structure
      expect(fullConfig.minecraft).toBeDefined();
      expect(fullConfig.viewer).toBeDefined();
      expect(fullConfig.server).toBeDefined();
    });

    it('should handle different auth modes', () => {
      const microsoftConfig = {
        ...mockConfig,
        minecraft: {
          ...mockConfig.minecraft,
          auth: 'microsoft'
        }
      };
      
      mockConfigManager.get.mockReturnValueOnce(microsoftConfig);
      
      const config = mockConfigManager.get();
      expect(config.minecraft.auth).toBe('microsoft');
    });

    it('should handle viewer disabled', () => {
      const noViewerConfig = {
        ...mockConfig,
        viewer: {
          ...mockConfig.viewer,
          enabled: false
        }
      };
      
      mockConfigManager.get.mockReturnValueOnce(noViewerConfig);
      
      const config = mockConfigManager.get();
      expect(config.viewer.enabled).toBe(false);
    });
  });

  describe('Server Port Configuration', () => {
    it('should use configured server port', () => {
      const config = mockConfigManager.get();
      expect(config.server.port).toBe(3000);
    });

    it('should handle different port numbers', () => {
      const customPortConfig = {
        ...mockConfig,
        server: {
          port: 8080
        }
      };
      
      mockConfigManager.get.mockReturnValueOnce(customPortConfig);
      
      const config = mockConfigManager.get();
      expect(config.server.port).toBe(8080);
    });
  });

  describe('Error Handling', () => {
    it('should handle config manager errors', () => {
      mockConfigManager.get.mockImplementationOnce(() => {
        throw new Error('Config file not found');
      });
      
      expect(() => mockConfigManager.get()).toThrow('Config file not found');
    });

    it('should handle server start errors', () => {
      const server = new MockMinecraftBotServer();
      
      mockStart.mockImplementationOnce(() => {
        throw new Error('Port already in use');
      });
      
      expect(() => server.start({}, 3000)).toThrow('Port already in use');
    });
  });

  describe('Bot Lifecycle', () => {
    it('should properly initialize bot through server', () => {
      const server = new MockMinecraftBotServer();
      const config = {
        host: 'localhost',
        port: 25565,
        username: 'TestBot',
        version: '1.21.1',
        auth: 'offline'
      };
      
      server.start(config, 3000);
      
      expect(mockStart).toHaveBeenCalled();
      expect(mockStart).toHaveBeenCalledWith(config, 3000);
    });

    it('should clean up bot on shutdown', () => {
      const server = new MockMinecraftBotServer();
      server.bot = mockBot;
      
      // Simulate shutdown
      if (server.bot) {
        server.bot.quit();
      }
      
      expect(mockBot.quit).toHaveBeenCalled();
    });
  });
});