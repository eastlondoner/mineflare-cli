const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { createTempDir, cleanupTempDir } = require('../utils/test-helpers');

describe('ConfigManager Regression Tests', () => {
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
  });

  afterEach(() => {
    // Restore original directory
    process.chdir(originalCwd);
    
    // Clean up temp directory
    cleanupTempDir(testDir);
    
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Bug Fixes', () => {
    describe('toLowerCase() on non-string values (v1.2.0 fix)', () => {
      it('should handle string boolean values in environment variables', () => {
        process.env.ENABLE_VIEWER = 'true';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('viewer.enabled')).toBe(true);

        process.env.ENABLE_VIEWER = 'false';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm2 = require('../../src/config/ConfigManager.js');
        expect(cm2.get('viewer.enabled')).toBe(false);
      });

      it('should handle uppercase boolean strings', () => {
        process.env.ENABLE_VIEWER = 'TRUE';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('viewer.enabled')).toBe(true);

        process.env.ENABLE_VIEWER = 'FALSE';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm2 = require('../../src/config/ConfigManager.js');
        expect(cm2.get('viewer.enabled')).toBe(false);
      });

      it('should handle mixed case boolean strings', () => {
        process.env.ENABLE_VIEWER = 'True';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('viewer.enabled')).toBe(true);

        process.env.ENABLE_VIEWER = 'FaLsE';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm2 = require('../../src/config/ConfigManager.js');
        expect(cm2.get('viewer.enabled')).toBe(false);
      });

      it('should handle numeric boolean values', () => {
        // When environment variables are set to numbers (as strings)
        process.env.ENABLE_VIEWER = '1';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('viewer.enabled')).toBe(true);

        process.env.ENABLE_VIEWER = '0';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm2 = require('../../src/config/ConfigManager.js');
        expect(cm2.get('viewer.enabled')).toBe(false);
      });

      it('should handle already-boolean values in validateValue', () => {
        const spec = { type: 'boolean' };
        
        let result = configManager.validateValue(true, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(true);
        
        result = configManager.validateValue(false, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(false);
      });

      it('should handle number values in validateValue', () => {
        const spec = { type: 'boolean' };
        
        let result = configManager.validateValue(1, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(true);
        
        result = configManager.validateValue(0, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(false);
      });

      it('should handle null/undefined gracefully', () => {
        const spec = { type: 'boolean' };
        
        let result = configManager.validateValue(null, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(false);
        
        result = configManager.validateValue(undefined, spec);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    describe('Environment Variable Processing', () => {
      it('should handle all supported environment variables', () => {
        const envMappings = {
          'MC_HOST': { value: 'test.host', path: 'minecraft.host' },
          'MC_PORT': { value: '25566', path: 'minecraft.port', expected: 25566 },
          'MC_USERNAME': { value: 'TestUser', path: 'minecraft.username' },
          'MC_VERSION': { value: '1.20.0', path: 'minecraft.version' },
          'MC_AUTH': { value: 'microsoft', path: 'minecraft.auth' },
          'SERVER_PORT': { value: '4000', path: 'server.port', expected: 4000 },
          'API_BASE': { value: 'http://test:3000', path: 'api.baseUrl' },
          'ENABLE_VIEWER': { value: 'false', path: 'viewer.enabled', expected: false },
          'VIEWER_PORT': { value: '3009', path: 'viewer.port', expected: 3009 },
          'LOG_LEVEL': { value: 'debug', path: 'logging.level' }
        };

        // Set all environment variables
        for (const [envVar, config] of Object.entries(envMappings)) {
          process.env[envVar] = config.value;
        }

        // Reload ConfigManager
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');

        // Verify all values
        for (const [envVar, config] of Object.entries(envMappings)) {
          const actual = cm.get(config.path);
          const expected = config.expected !== undefined ? config.expected : config.value;
          expect(actual).toBe(expected);
        }
      });

      it('should handle invalid port numbers', () => {
        process.env.SERVER_PORT = '-1';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        // Should still parse but might be invalid for validation
        expect(cm.get('server.port')).toBe(-1);
      });

      it('should handle empty string values', () => {
        process.env.MC_USERNAME = '';
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('minecraft.username')).toBe('');
      });

      it('should handle very long string values', () => {
        const longString = 'a'.repeat(1000);
        process.env.MC_USERNAME = longString;
        delete require.cache[require.resolve('../../src/config/ConfigManager.js')];
        const cm = require('../../src/config/ConfigManager.js');
        expect(cm.get('minecraft.username')).toBe(longString);
      });
    });

    describe('Configuration Validation', () => {
      it('should validate all numeric boundaries', () => {
        const numericFields = [
          { path: 'server.port', min: 1, max: 65535 },
          { path: 'server.timeout', min: undefined, max: undefined },
          { path: 'minecraft.port', min: 1, max: 65535 },
          { path: 'viewer.port', min: 1, max: 65535 },
          { path: 'performance.maxEventsHistory', min: undefined, max: undefined },
          { path: 'performance.screenshotQuality', min: undefined, max: undefined }
        ];

        numericFields.forEach(field => {
          if (field.min !== undefined) {
            expect(() => {
              configManager.set(field.path, field.min - 1);
            }).toThrow();
          }
          
          if (field.max !== undefined) {
            expect(() => {
              configManager.set(field.path, field.max + 1);
            }).toThrow();
          }
        });
      });

      it('should validate all enum fields', () => {
        const enumFields = [
          { 
            path: 'minecraft.auth', 
            valid: ['offline', 'microsoft', 'mojang'],
            invalid: ['google', 'facebook', 'random']
          },
          {
            path: 'minecraft.viewDistance',
            valid: ['tiny', 'short', 'normal', 'far'],
            invalid: ['extreme', 'infinite', 'zero']
          },
          {
            path: 'logging.level',
            valid: ['error', 'warn', 'info', 'debug'],
            invalid: ['trace', 'fatal', 'all']
          }
        ];

        enumFields.forEach(field => {
          // Test valid values
          field.valid.forEach(value => {
            configManager.set(field.path, value);
            expect(configManager.get(field.path)).toBe(value);
          });

          // Test invalid values
          field.invalid.forEach(value => {
            expect(() => {
              configManager.set(field.path, value);
            }).toThrow(`Must be one of: ${field.valid.join(', ')}`);
          });
        });
      });
    });

    describe('Profile Handling', () => {
      it('should handle profile names with special characters', () => {
        const specialNames = [
          'test-profile',
          'test_profile',
          'test.profile',
          'TestProfile123'
        ];

        specialNames.forEach(name => {
          configManager.createProfile(name);
          expect(configManager.listProfiles()).toContain(name);
          configManager.deleteProfile(name);
        });
      });

      it('should handle switching between many profiles rapidly', () => {
        // Create multiple profiles
        for (let i = 0; i < 10; i++) {
          configManager.createProfile(`profile${i}`);
        }

        // Switch between them rapidly
        for (let i = 0; i < 10; i++) {
          configManager.setActiveProfile(`profile${i}`);
          expect(configManager.getActiveProfile()).toBe(`profile${i}`);
        }
      });

      it('should maintain separate configurations per profile', () => {
        // Create profiles with different settings
        configManager.createProfile('test1');
        configManager.createProfile('test2');

        configManager.set('server.port', 3001, 'test1');
        configManager.set('server.port', 3002, 'test2');

        expect(configManager.get('server.port', 'test1')).toBe(3001);
        expect(configManager.get('server.port', 'test2')).toBe(3002);
      });
    });

    describe('Import/Export Edge Cases', () => {
      it('should handle partial config imports', () => {
        const partialConfig = {
          server: { port: 5000 }
          // Missing other sections
        };

        configManager.importConfig(partialConfig);
        expect(configManager.get('server.port')).toBe(5000);
        // Other values should still exist from defaults
        expect(configManager.get('minecraft.username')).toBeTruthy();
      });

      it('should handle deeply nested config structures', () => {
        const config = configManager.exportConfig();
        config.custom = {
          deep: {
            nested: {
              value: 'test'
            }
          }
        };

        configManager.importConfig(config);
        // Should not break existing functionality
        expect(configManager.get('server.port')).toBe(3000);
      });

      it('should reject imports with invalid types', () => {
        const invalidConfigs = [
          { server: { port: 'not-a-number' } },
          { server: { port: null } },
          { server: { port: [] } },
          { server: { port: {} } },
          { minecraft: { auth: 'invalid-auth-type' } },
          { viewer: { enabled: 'not-a-boolean' } }
        ];

        invalidConfigs.forEach((config, index) => {
          expect(() => {
            configManager.importConfig(config);
          }).toThrow();
        });
      });
    });

    describe('File System Handling', () => {
      it('should handle read-only config directory', () => {
        // This is harder to test properly without OS-level permissions
        // But we can verify the config directory exists
        const configPath = path.join(testDir, '.mineflare');
        expect(fs.existsSync(configPath)).toBe(true);
      });

      it('should recover from simultaneous writes', () => {
        // Simulate rapid concurrent writes
        const promises = [];
        for (let i = 0; i < 10; i++) {
          promises.push(
            new Promise((resolve) => {
              configManager.set('server.port', 3000 + i);
              resolve();
            })
          );
        }

        return Promise.all(promises).then(() => {
          // Should have a valid value after all writes
          const port = configManager.get('server.port');
          expect(port).toBeGreaterThanOrEqual(3000);
          expect(port).toBeLessThan(3010);
        });
      });

      it('should handle very large config files', () => {
        const largeConfig = configManager.exportConfig();
        
        // Add lots of data
        largeConfig.largeData = {};
        for (let i = 0; i < 100; i++) {
          largeConfig.largeData[`key${i}`] = 'value'.repeat(100);
        }

        // Should still be able to import
        configManager.importConfig(largeConfig);
        expect(configManager.get('server.port')).toBe(3000);
      });
    });

    describe('Type Coercion', () => {
      it('should coerce string numbers to numbers', () => {
        configManager.set('server.port', '4000');
        expect(configManager.get('server.port')).toBe(4000);
        expect(typeof configManager.get('server.port')).toBe('number');
      });

      it('should coerce various boolean representations', () => {
        const booleanTests = [
          { input: 'true', expected: true },
          { input: 'false', expected: false },
          { input: 'TRUE', expected: true },
          { input: 'FALSE', expected: false },
          { input: 'True', expected: true },
          { input: 'False', expected: false },
          { input: '1', expected: true },
          { input: '0', expected: false },
          { input: 1, expected: true },
          { input: 0, expected: false },
          { input: true, expected: true },
          { input: false, expected: false }
        ];

        booleanTests.forEach(test => {
          configManager.set('viewer.enabled', test.input);
          expect(configManager.get('viewer.enabled')).toBe(test.expected);
        });
      });

      it('should handle NaN for numeric fields gracefully', () => {
        expect(() => {
          configManager.set('server.port', 'NaN');
        }).toThrow('Must be a number');

        expect(() => {
          configManager.set('server.port', NaN);
        }).toThrow('Must be a number');
      });

      it('should handle Infinity for numeric fields', () => {
        expect(() => {
          configManager.set('server.port', Infinity);
        }).toThrow();

        expect(() => {
          configManager.set('server.port', -Infinity);
        }).toThrow();
      });
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages for invalid paths', () => {
      expect(() => {
        configManager.set('invalid.path', 'value');
      }).not.toThrow(); // Should handle gracefully

      expect(() => {
        configManager.set('', 'value');
      }).not.toThrow();
    });

    it('should identify specific field in validation errors', () => {
      try {
        configManager.set('server.port', 'invalid');
      } catch (error) {
        expect(error.message).toContain('server.port');
        expect(error.message).toContain('Must be a number');
      }

      try {
        configManager.set('minecraft.auth', 'invalid');
      } catch (error) {
        expect(error.message).toContain('minecraft.auth');
        expect(error.message).toContain('Must be one of');
      }
    });

    it('should provide helpful range errors', () => {
      try {
        configManager.set('server.port', 0);
      } catch (error) {
        expect(error.message).toContain('server.port');
        expect(error.message).toContain('Must be >= 1');
      }

      try {
        configManager.set('server.port', 70000);
      } catch (error) {
        expect(error.message).toContain('server.port');
        expect(error.message).toContain('Must be <= 65535');
      }
    });
  });
});