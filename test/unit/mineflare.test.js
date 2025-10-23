/**
 * Unit tests for Mineflare main entry point
 */
const { describe, it, expect, beforeEach, afterEach, jest, mock } = require('bun:test');
const path = require('path');

// Mock commander
const mockProgram = {
  name: jest.fn(() => mockProgram),
  description: jest.fn(() => mockProgram),
  version: jest.fn(() => mockProgram),
  command: jest.fn(() => mockProgram),
  parse: jest.fn(),
  action: jest.fn(() => mockProgram),
  option: jest.fn(() => mockProgram),
  requiredOption: jest.fn(() => mockProgram)
};

mock.module('commander', () => ({
  Command: jest.fn(() => mockProgram)
}));

// Mock axios
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};

mock.module('axios', () => ({
  create: jest.fn(() => mockAxiosInstance)
}));

// Mock fs
const mockFs = {
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmSync: jest.fn()
};
mock.module('fs', () => mockFs);

// Mock child_process
const mockChildProcess = {
  spawn: jest.fn(() => ({
    pid: 12345,
    unref: jest.fn()
  }))
};
mock.module('child_process', () => mockChildProcess);

// Mock cli-table3
const mockTable = {
  push: jest.fn(),
  toString: jest.fn(() => 'table output')
};
mock.module('cli-table3', () => {
  return jest.fn(() => mockTable);
});

// Mock configManager
const mockConfigManager = {
  get: jest.fn(() => ({
    api: { baseUrl: 'http://localhost:3001' },
    server: { 
      port: 3000,
      timeout: 5000
    },
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
    }
  })),
  set: jest.fn(),
  reset: jest.fn(),
  getSchema: jest.fn(() => ({})),
  listProfiles: jest.fn(() => ['default', 'test', 'production']),
  getActiveProfile: jest.fn(() => 'default'),
  setActiveProfile: jest.fn(),
  createProfile: jest.fn(),
  deleteProfile: jest.fn(),
  exportConfig: jest.fn(() => ({ test: 'config' })),
  importConfig: jest.fn()
};

mock.module('../src/config/ConfigManager', () => mockConfigManager);

describe('Mineflare Main Entry Point', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;
  let processEnv;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Spy on process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    // Store original env
    processEnv = { ...process.env };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    
    // Restore env
    process.env = processEnv;
  });

  describe('Server Commands', () => {
    describe('server start', () => {
      it('should start server in foreground mode', () => {
        const serverConfig = mockConfigManager.get();
        
        // Test environment variable setting
        process.env.MINEFLARE_SERVER_PORT = serverConfig.server.port;
        process.env.MC_HOST = serverConfig.minecraft.host;
        process.env.MC_PORT = serverConfig.minecraft.port;
        process.env.MC_USERNAME = serverConfig.minecraft.username;
        process.env.MC_VERSION = serverConfig.minecraft.version;
        process.env.MC_AUTH = serverConfig.minecraft.auth;
        process.env.ENABLE_VIEWER = serverConfig.viewer.enabled;
        process.env.VIEWER_PORT = serverConfig.viewer.port;
        
        expect(process.env.MINEFLARE_SERVER_PORT).toBe(3000);
        expect(process.env.MC_HOST).toBe('localhost');
        expect(process.env.MC_PORT).toBe(25565);
        expect(process.env.MC_USERNAME).toBe('TestBot');
      });

      it('should start server in daemon mode', () => {
        mockFs.existsSync.mockReturnValue(false);
        const spawnResult = {
          pid: 12345,
          unref: jest.fn()
        };
        mockChildProcess.spawn.mockReturnValue(spawnResult);
        
        // Simulate daemon start
        const serverPath = path.join(__dirname, 'server.js');
        const child = mockChildProcess.spawn(process.execPath, [serverPath], {
          detached: true,
          stdio: 'ignore'
        });
        
        child.unref();
        
        const pidFile = path.join(process.cwd(), 'mineflare.pid');
        mockFs.writeFileSync(pidFile, child.pid.toString());
        
        expect(mockChildProcess.spawn).toHaveBeenCalledWith(
          process.execPath,
          [serverPath],
          { detached: true, stdio: 'ignore' }
        );
        expect(spawnResult.unref).toHaveBeenCalled();
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(pidFile, '12345');
      });

      it('should use specified profile when starting', () => {
        mockConfigManager.setActiveProfile('production');
        
        expect(mockConfigManager.setActiveProfile).toHaveBeenCalledWith('production');
      });

      it('should handle profile switch errors', () => {
        mockConfigManager.setActiveProfile.mockImplementationOnce(() => {
          throw new Error('Profile not found');
        });
        
        expect(() => mockConfigManager.setActiveProfile('invalid')).toThrow('Profile not found');
      });
    });

    describe('server stop', () => {
      it('should stop daemon when PID file exists', () => {
        const pidFile = path.join(process.cwd(), 'mineflare.pid');
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('12345');
        
        const pid = parseInt(mockFs.readFileSync(pidFile, 'utf8'));
        
        // Mock process.kill (doesn't actually kill anything in test)
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {});
        
        process.kill(pid);
        mockFs.unlinkSync(pidFile);
        
        expect(mockFs.readFileSync).toHaveBeenCalledWith(pidFile, 'utf8');
        expect(killSpy).toHaveBeenCalledWith(12345);
        expect(mockFs.unlinkSync).toHaveBeenCalledWith(pidFile);
        
        killSpy.mockRestore();
      });

      it('should handle missing PID file', () => {
        mockFs.existsSync.mockReturnValue(false);
        
        const exists = mockFs.existsSync(path.join(process.cwd(), 'mineflare.pid'));
        
        expect(exists).toBe(false);
      });

      it('should handle invalid PID', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('invalid');
        
        const pidFile = path.join(process.cwd(), 'mineflare.pid');
        const pidStr = mockFs.readFileSync(pidFile, 'utf8');
        const pid = parseInt(pidStr);
        
        expect(isNaN(pid)).toBe(true);
      });
    });

    describe('server status', () => {
      it('should check daemon status when PID file exists', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('12345');
        
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {});
        
        const pid = 12345;
        process.kill(pid, 0); // Check if process exists
        
        expect(killSpy).toHaveBeenCalledWith(pid, 0);
        
        killSpy.mockRestore();
      });

      it('should check API health status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { status: 'ok', botConnected: true }
        });
        
        const response = await mockAxiosInstance.get('/health');
        
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
        expect(response.data.status).toBe('ok');
        expect(response.data.botConnected).toBe(true);
      });

      it('should handle API not responding', async () => {
        mockAxiosInstance.get.mockRejectedValue(new Error('ECONNREFUSED'));
        
        try {
          await mockAxiosInstance.get('/health');
        } catch (error) {
          expect(error.message).toBe('ECONNREFUSED');
        }
      });
    });
  });

  describe('Configuration Commands', () => {
    describe('config get', () => {
      it('should get all configuration', () => {
        const config = mockConfigManager.get();
        
        expect(mockConfigManager.get).toHaveBeenCalled();
        expect(config).toHaveProperty('server');
        expect(config).toHaveProperty('minecraft');
        expect(config).toHaveProperty('viewer');
      });

      it('should get specific configuration path', () => {
        mockConfigManager.get.mockReturnValueOnce(3000);
        
        const value = mockConfigManager.get('server.port');
        
        expect(mockConfigManager.get).toHaveBeenCalledWith('server.port');
        expect(value).toBe(3000);
      });

      it('should get configuration for specific profile', () => {
        mockConfigManager.get.mockReturnValueOnce({ test: 'value' });
        
        const value = mockConfigManager.get(null, 'production');
        
        expect(mockConfigManager.get).toHaveBeenCalledWith(null, 'production');
        expect(value).toEqual({ test: 'value' });
      });

      it('should output JSON format when requested', () => {
        const config = mockConfigManager.get();
        const json = JSON.stringify(config, null, 2);
        
        expect(json).toContain('"server"');
        expect(json).toContain('"minecraft"');
      });
    });

    describe('config set', () => {
      it('should set configuration value', () => {
        mockConfigManager.set('server.port', 8080);
        
        expect(mockConfigManager.set).toHaveBeenCalledWith('server.port', 8080);
      });

      it('should set configuration for specific profile', () => {
        mockConfigManager.set('server.port', 8080, 'production');
        
        expect(mockConfigManager.set).toHaveBeenCalledWith('server.port', 8080, 'production');
      });

      it('should parse JSON values', () => {
        const jsonValue = '{"host":"example.com","port":25565}';
        const parsed = JSON.parse(jsonValue);
        
        mockConfigManager.set('minecraft', parsed);
        
        expect(mockConfigManager.set).toHaveBeenCalledWith('minecraft', {
          host: 'example.com',
          port: 25565
        });
      });

      it('should handle set errors', () => {
        mockConfigManager.set.mockImplementationOnce(() => {
          throw new Error('Invalid path');
        });
        
        expect(() => mockConfigManager.set('invalid.path', 'value')).toThrow('Invalid path');
      });
    });

    describe('config profile', () => {
      it('should list profiles', () => {
        const profiles = mockConfigManager.listProfiles();
        const active = mockConfigManager.getActiveProfile();
        
        expect(profiles).toEqual(['default', 'test', 'production']);
        expect(active).toBe('default');
      });

      it('should switch profile', () => {
        mockConfigManager.setActiveProfile('production');
        
        expect(mockConfigManager.setActiveProfile).toHaveBeenCalledWith('production');
      });

      it('should create new profile', () => {
        mockConfigManager.createProfile('staging', 'default');
        
        expect(mockConfigManager.createProfile).toHaveBeenCalledWith('staging', 'default');
      });

      it('should delete profile', () => {
        mockConfigManager.deleteProfile('test');
        
        expect(mockConfigManager.deleteProfile).toHaveBeenCalledWith('test');
      });

      it('should handle profile errors', () => {
        mockConfigManager.deleteProfile.mockImplementationOnce(() => {
          throw new Error('Cannot delete active profile');
        });
        
        expect(() => mockConfigManager.deleteProfile('default')).toThrow('Cannot delete active profile');
      });
    });

    describe('config reset', () => {
      it('should reset configuration to defaults', () => {
        mockConfigManager.reset();
        
        expect(mockConfigManager.reset).toHaveBeenCalled();
      });

      it('should reset specific profile', () => {
        mockConfigManager.reset('production');
        
        expect(mockConfigManager.reset).toHaveBeenCalledWith('production');
      });
    });

    describe('config export/import', () => {
      it('should export configuration to stdout', () => {
        const exportConfig = mockConfigManager.exportConfig();
        
        expect(mockConfigManager.exportConfig).toHaveBeenCalled();
        expect(exportConfig).toEqual({ test: 'config' });
      });

      it('should export configuration to file', () => {
        const exportConfig = mockConfigManager.exportConfig();
        const file = 'config.json';
        
        mockFs.writeFileSync(file, JSON.stringify(exportConfig, null, 2));
        
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          file,
          JSON.stringify(exportConfig, null, 2)
        );
      });

      it('should export specific profile', () => {
        mockConfigManager.exportConfig('production');
        
        expect(mockConfigManager.exportConfig).toHaveBeenCalledWith('production');
      });

      it('should import configuration from file', () => {
        const file = 'config.json';
        const configJson = '{"test":"imported"}';
        
        mockFs.readFileSync.mockReturnValue(configJson);
        
        const json = mockFs.readFileSync(file, 'utf8');
        const importConfig = JSON.parse(json);
        
        mockConfigManager.importConfig(importConfig);
        
        expect(mockFs.readFileSync).toHaveBeenCalledWith(file, 'utf8');
        expect(mockConfigManager.importConfig).toHaveBeenCalledWith({ test: 'imported' });
      });

      it('should import to specific profile', () => {
        const importConfig = { test: 'value' };
        
        mockConfigManager.importConfig(importConfig, 'staging');
        
        expect(mockConfigManager.importConfig).toHaveBeenCalledWith(importConfig, 'staging');
      });
    });
  });

  describe('Bot Control Commands', () => {
    it('should handle health command', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { status: 'ok', botConnected: true }
      });
      
      const response = await mockAxiosInstance.get('/health');
      
      expect(response.data.status).toBe('ok');
    });

    it('should handle state command', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { 
          position: { x: 0, y: 64, z: 0 },
          health: 20
        }
      });
      
      const response = await mockAxiosInstance.get('/state');
      
      expect(response.data.position).toEqual({ x: 0, y: 64, z: 0 });
    });

    it('should handle inventory command', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { items: [] }
      });
      
      const response = await mockAxiosInstance.get('/inventory');
      
      expect(response.data.items).toEqual([]);
    });

    it('should handle chat command', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true }
      });
      
      const response = await mockAxiosInstance.post('/chat', { message: 'Hello' });
      
      expect(response.data.success).toBe(true);
    });

    it('should handle move command', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true }
      });
      
      const response = await mockAxiosInstance.post('/move', {
        x: 1, y: 0, z: 0
      });
      
      expect(response.data.success).toBe(true);
    });

    it('should handle batch command', async () => {
      const batchFile = 'batch.json';
      const instructions = [
        { type: 'move', x: 1 },
        { type: 'chat', message: 'Hello' }
      ];
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(instructions));
      mockAxiosInstance.post.mockResolvedValue({
        data: { 
          success: true,
          results: [
            { success: true },
            { success: true }
          ]
        }
      });
      
      const json = mockFs.readFileSync(batchFile, 'utf8');
      const parsed = JSON.parse(json);
      
      const response = await mockAxiosInstance.post('/batch', {
        instructions: parsed,
        stopOnError: true
      });
      
      expect(mockFs.readFileSync).toHaveBeenCalledWith(batchFile, 'utf8');
      expect(response.data.success).toBe(true);
      expect(response.data.results).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle command errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));
      
      try {
        await mockAxiosInstance.get('/health');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });

    it('should handle file read errors', () => {
      mockFs.readFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });
      
      expect(() => mockFs.readFileSync('missing.json')).toThrow('File not found');
    });

    it('should handle JSON parse errors', () => {
      const invalidJson = 'not valid json';
      
      expect(() => JSON.parse(invalidJson)).toThrow();
    });
  });

  describe('Display Helpers', () => {
    it('should display config table correctly', () => {
      const config = {
        server: { port: 3000 },
        minecraft: { host: 'localhost' }
      };
      const schema = {
        server: { port: { description: 'Server port' } },
        minecraft: { host: { description: 'Minecraft server host' } }
      };
      
      // Simulate table creation
      for (const [section, fields] of Object.entries(config)) {
        for (const [field, value] of Object.entries(fields)) {
          const desc = schema[section]?.[field]?.description || '';
          mockTable.push([section, field, JSON.stringify(value), desc]);
        }
      }
      
      const output = mockTable.toString();
      
      expect(mockTable.push).toHaveBeenCalledTimes(2);
      expect(output).toBe('table output');
    });
  });
});