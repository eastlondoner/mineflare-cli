const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { createTempDir, cleanupTempDir } = require('../utils/test-helpers');

describe('ConfigManager', () => {
  let ConfigManager;
  let configManager;
  let originalCwd;
  let testDir;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary directory for tests
    testDir = createTempDir();
    originalCwd = process.cwd();
    process.chdir(testDir);
    
    // Clear the module cache to get a fresh instance
    delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
    
    // Require fresh ConfigManager
    ConfigManager = require('../../src/config/ConfigManager.js');
    configManager = ConfigManager;
    
    // Reset instance to ensure clean state
    if (configManager.resetInstance) {
      configManager.resetInstance();
    }
  });

  afterEach(() => {
    // Restore original directory
    process.chdir(originalCwd);
    
    // Clean up temp directory
    cleanupTempDir(testDir);
    
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    it('should create config directory if it does not exist', () => {
      const configPath = path.join(testDir, '.mineflare');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should initialize with default profiles', () => {
      const profiles = configManager.listProfiles();
      expect(profiles).toContain('default');
      expect(profiles).toContain('development');
      expect(profiles).toContain('production');
    });

    it('should set default as active profile', () => {
      expect(configManager.getActiveProfile()).toBe('default');
    });

    it('should save configurations to file', () => {
      const configFile = path.join(testDir, '.mineflare', 'config.json');
      expect(fs.existsSync(configFile)).toBe(true);
      
      const content = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(content.activeProfile).toBe('default');
      expect(content.profiles).toHaveProperty('default');
    });
  });

  describe('Get Configuration', () => {
    it('should get entire configuration when no path provided', () => {
      const config = configManager.get();
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('minecraft');
      expect(config).toHaveProperty('viewer');
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('performance');
    });

    it('should get specific config value by path', () => {
      expect(configManager.get('server.port')).toBe(3000);
      expect(configManager.get('minecraft.username')).toBe('AIBot');
      expect(configManager.get('viewer.enabled')).toBe(true);
    });

    it('should return undefined for invalid path', () => {
      expect(configManager.get('invalid.path')).toBeUndefined();
    });

    it('should get config from specific profile', () => {
      const devConfig = configManager.get('logging.level', 'development');
      expect(devConfig).toBe('debug');
      
      const prodConfig = configManager.get('logging.level', 'production');
      expect(prodConfig).toBe('warn');
    });

    it('should apply environment variable overrides', () => {
      process.env.MC_USERNAME = 'TestBot';
      process.env.SERVER_PORT = '4000';
      process.env.ENABLE_VIEWER = 'false';
      
      // Need to recreate ConfigManager to pick up env vars
      delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
      const freshConfigManager = require('../../src/config/ConfigManager.js');
      
      const config = freshConfigManager.get();
      expect(config.minecraft.username).toBe('TestBot');
      expect(config.server.port).toBe(4000);
      expect(config.viewer.enabled).toBe(false);
    });
  });

  describe('Set Configuration', () => {
    it('should set configuration value', () => {
      configManager.set('server.port', 3001);
      expect(configManager.get('server.port')).toBe(3001);
    });

    it('should validate number type and range', () => {
      expect(() => {
        configManager.set('server.port', 'invalid');
      }).toThrow('Configuration Error: Must be a number');
      
      expect(() => {
        configManager.set('server.port', 0);
      }).toThrow('Configuration Error: Must be >= 1');
      
      expect(() => {
        configManager.set('server.port', 70000);
      }).toThrow('Configuration Error: Must be <= 65535');
    });

    it('should validate enum values', () => {
      expect(() => {
        configManager.set('minecraft.auth', 'invalid');
      }).toThrow('Configuration Error: Must be one of: offline, microsoft, mojang');
      
      configManager.set('minecraft.auth', 'microsoft');
      expect(configManager.get('minecraft.auth')).toBe('microsoft');
    });

    it('should validate boolean type', () => {
      configManager.set('viewer.enabled', 'true');
      expect(configManager.get('viewer.enabled')).toBe(true);
      
      configManager.set('viewer.enabled', false);
      expect(configManager.get('viewer.enabled')).toBe(false);
    });

    it('should save changes to file', () => {
      configManager.set('server.port', 3002);
      
      const configFile = path.join(testDir, '.mineflare', 'config.json');
      const content = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(content.profiles.default.server.port).toBe(3002);
    });
  });

  describe('Profile Management', () => {
    it('should list all profiles', () => {
      const profiles = configManager.listProfiles();
      expect(profiles.length).toBe(3);
      expect(profiles).toContain('default');
      expect(profiles).toContain('development');
      expect(profiles).toContain('production');
    });

    it('should create new profile', () => {
      configManager.createProfile('test');
      const profiles = configManager.listProfiles();
      expect(profiles).toContain('test');
    });

    it('should create profile based on another profile', () => {
      configManager.set('server.port', 3003, 'development');
      configManager.createProfile('test', 'development');
      
      const testConfig = configManager.get('server.port', 'test');
      expect(testConfig).toBe(3003);
    });

    it('should throw error when creating duplicate profile', () => {
      expect(() => {
        configManager.createProfile('default');
      }).toThrow(`Profile 'default' already exists`);
    });

    it('should switch active profile', () => {
      configManager.setActiveProfile('development');
      expect(configManager.getActiveProfile()).toBe('development');
    });

    it('should throw error when switching to non-existent profile', () => {
      expect(() => {
        configManager.setActiveProfile('nonexistent');
      }).toThrow(`Profile 'nonexistent' does not exist`);
    });

    it('should delete profile', () => {
      configManager.createProfile('temp');
      configManager.deleteProfile('temp');
      
      const profiles = configManager.listProfiles();
      expect(profiles).not.toContain('temp');
    });

    it('should not allow deleting default profile', () => {
      expect(() => {
        configManager.deleteProfile('default');
      }).toThrow('Cannot delete default profile');
    });

    it('should switch to default when deleting active profile', () => {
      configManager.createProfile('temp');
      configManager.setActiveProfile('temp');
      configManager.deleteProfile('temp');
      
      expect(configManager.getActiveProfile()).toBe('default');
    });
  });

  describe('Schema', () => {
    it('should return configuration schema', () => {
      const schema = configManager.getSchema();
      expect(schema).toHaveProperty('server');
      expect(schema).toHaveProperty('minecraft');
      expect(schema.server.port).toHaveProperty('type', 'number');
      expect(schema.server.port).toHaveProperty('default', 3000);
      expect(schema.server.port).toHaveProperty('min', 1);
      expect(schema.server.port).toHaveProperty('max', 65535);
    });
  });

  describe('Reset', () => {
    it('should reset current profile to defaults', () => {
      configManager.set('server.port', 4000);
      expect(configManager.get('server.port')).toBe(4000);
      
      configManager.reset();
      expect(configManager.get('server.port')).toBe(3000);
    });

    it('should reset specific profile', () => {
      configManager.set('server.port', 4000, 'development');
      configManager.reset('development');
      
      const devPort = configManager.get('server.port', 'development');
      const defaultPort = configManager.get('server.port', 'default');
      expect(devPort).toBe(defaultPort);
    });
  });

  describe('Import/Export', () => {
    it('should export configuration', () => {
      const config = configManager.exportConfig();
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('minecraft');
    });

    it('should export specific profile', () => {
      const devConfig = configManager.exportConfig('development');
      expect(devConfig.logging.level).toBe('debug');
    });

    it('should import configuration', () => {
      const newConfig = configManager.exportConfig();
      newConfig.server.port = 5000;
      newConfig.minecraft.username = 'ImportedBot';
      
      configManager.importConfig(newConfig);
      expect(configManager.get('server.port')).toBe(5000);
      expect(configManager.get('minecraft.username')).toBe('ImportedBot');
    });

    it('should validate imported configuration', () => {
      const invalidConfig = configManager.exportConfig();
      invalidConfig.server.port = 'invalid';
      
      expect(() => {
        configManager.importConfig(invalidConfig);
      }).toThrow('Import Configuration Error: Must be a number');
    });

    it('should import to specific profile', () => {
      // First set a different value in development profile
      configManager.set('server.port', 4500, 'development');
      
      // Export default config and modify it
      const newConfig = configManager.exportConfig('default');
      newConfig.server.port = 6000;
      
      // Import to development profile
      configManager.importConfig(newConfig, 'development');
      expect(configManager.get('server.port', 'development')).toBe(6000);
      
      // Default should remain unchanged
      const defaultPort = configManager.get('server.port', 'default');
      expect(defaultPort).toBe(3000);
    });
  });

  describe('Defaults', () => {
    it('should return default values', () => {
      const defaults = configManager.getDefaults();
      expect(defaults.server.port).toBe(3000);
      expect(defaults.minecraft.username).toBe('AIBot');
      expect(defaults.viewer.enabled).toBe(true);
      expect(defaults.logging.level).toBe('info');
    });
  });

  describe('Validation', () => {
    it('should validate number values', () => {
      const spec = { type: 'number', min: 1, max: 100 };
      
      let result = configManager.validateValue(50, spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
      
      result = configManager.validateValue('50', spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
      
      result = configManager.validateValue('invalid', spec);
      expect(result.valid).toBe(false);
      
      result = configManager.validateValue(0, spec);
      expect(result.valid).toBe(false);
      
      result = configManager.validateValue(101, spec);
      expect(result.valid).toBe(false);
    });

    it('should validate boolean values', () => {
      const spec = { type: 'boolean' };
      
      let result = configManager.validateValue(true, spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(true);
      
      result = configManager.validateValue('true', spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(true);
      
      result = configManager.validateValue('false', spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should validate string enum values', () => {
      const spec = { type: 'string', enum: ['a', 'b', 'c'] };
      
      let result = configManager.validateValue('a', spec);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('a');
      
      result = configManager.validateValue('d', spec);
      expect(result.valid).toBe(false);
    });
  });

  describe('Config File Loading', () => {
    it('should load existing config file', () => {
      // Create a custom config file
      const configPath = path.join(testDir, '.mineflare');
      const configFile = path.join(configPath, 'config.json');
      
      const customConfig = {
        activeProfile: 'custom',
        profiles: {
          custom: {
            server: { port: 7000, timeout: 10000 },
            minecraft: {
              host: 'custom.server',
              port: 25566,
              username: 'CustomBot',
              version: '1.20.0',
              auth: 'offline',
              viewDistance: 'far'
            },
            viewer: { enabled: false, port: 3008, firstPerson: true },
            api: { baseUrl: 'http://localhost:7000' },
            logging: { level: 'debug', file: true, filePath: './custom.log' },
            performance: { maxEventsHistory: 5000, screenshotQuality: 90 }
          }
        }
      };
      
      fs.writeFileSync(configFile, JSON.stringify(customConfig, null, 2));
      
      // Reload ConfigManager
      delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
      const freshConfigManager = require('../../src/config/ConfigManager.js');
      
      expect(freshConfigManager.getActiveProfile()).toBe('custom');
      expect(freshConfigManager.get('server.port')).toBe(7000);
      expect(freshConfigManager.get('minecraft.username')).toBe('CustomBot');
    });

    it('should handle corrupted config file gracefully', () => {
      const configPath = path.join(testDir, '.mineflare');
      const configFile = path.join(configPath, 'config.json');
      
      // Write invalid JSON
      fs.writeFileSync(configFile, '{ invalid json }');
      
      // Should initialize with defaults without throwing
      delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
      const freshConfigManager = require('../../src/config/ConfigManager.js');
      
      expect(freshConfigManager.getActiveProfile()).toBe('default');
      expect(freshConfigManager.listProfiles()).toContain('default');
    });
  });
});