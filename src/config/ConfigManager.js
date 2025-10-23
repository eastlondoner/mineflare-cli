const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.activeProfile = 'default';
    this.configPath = path.join(process.cwd(), '.mineflare');
    this.configFile = path.join(this.configPath, 'config.json');
    
    // Default configuration schema
    this.schema = {
      server: {
        port: { type: 'number', default: 3000, min: 1, max: 65535, description: 'HTTP API server port' },
        timeout: { type: 'number', default: 30000, min: 1000, description: 'API request timeout in ms' }
      },
      minecraft: {
        host: { type: 'string', default: 'localhost', description: 'Minecraft server hostname' },
        port: { type: 'number', default: 25565, min: 1, max: 65535, description: 'Minecraft server port' },
        username: { type: 'string', default: 'AIBot', description: 'Bot username' },
        version: { type: 'string', default: '1.21.8', description: 'Minecraft version' },
        auth: { type: 'string', default: 'offline', enum: ['offline', 'microsoft', 'mojang'], description: 'Authentication type' },
        viewDistance: { type: 'string', default: 'normal', enum: ['tiny', 'short', 'normal', 'far'], description: 'View distance' }
      },
      viewer: {
        enabled: { type: 'boolean', default: true, description: 'Enable web-based viewer' },
        port: { type: 'number', default: 3007, min: 1, max: 65535, description: 'Viewer port' },
        firstPerson: { type: 'boolean', default: false, description: 'First person view mode' }
      },
      api: {
        baseUrl: { type: 'string', default: 'http://localhost:3000', description: 'API base URL for CLI' }
      },
      logging: {
        level: { type: 'string', default: 'info', enum: ['debug', 'info', 'warn', 'error'], description: 'Logging level' },
        file: { type: 'boolean', default: false, description: 'Enable file logging' },
        filePath: { type: 'string', default: './logs/bot.log', description: 'Log file path' }
      },
      performance: {
        maxEventsHistory: { type: 'number', default: 10000, min: 100, description: 'Maximum events to keep in history' },
        screenshotQuality: { type: 'number', default: 85, min: 1, max: 100, description: 'Screenshot JPEG quality' }
      }
    };
    
    this.ensureConfigDirectory();
    this.loadConfigurations();
  }
  
  ensureConfigDirectory() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
  }
  
  loadConfigurations() {
    if (fs.existsSync(this.configFile)) {
      try {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const parsed = JSON.parse(data);
        
        // Load profiles
        for (const [profile, config] of Object.entries(parsed.profiles || {})) {
          this.configs.set(profile, config);
        }
        
        // Set active profile
        if (parsed.activeProfile) {
          this.activeProfile = parsed.activeProfile;
        }
        
        // Ensure default profile exists
        if (!this.configs.has('default')) {
          this.configs.set('default', this.getDefaults());
        }
      } catch (error) {
        console.error('Error loading config file:', error);
        this.initializeDefaults();
      }
    } else {
      this.initializeDefaults();
    }
  }
  
  initializeDefaults() {
    this.configs.set('default', this.getDefaults());
    this.configs.set('development', {
      ...this.getDefaults(),
      logging: { ...this.getDefaults().logging, level: 'debug' }
    });
    this.configs.set('production', {
      ...this.getDefaults(),
      logging: { ...this.getDefaults().logging, level: 'warn', file: true }
    });
    this.saveConfigurations();
  }
  
  getDefaults() {
    const defaults = {};
    for (const [section, fields] of Object.entries(this.schema)) {
      defaults[section] = {};
      for (const [field, spec] of Object.entries(fields)) {
        defaults[section][field] = spec.default;
      }
    }
    return defaults;
  }
  
  saveConfigurations() {
    const data = {
      activeProfile: this.activeProfile,
      profiles: Object.fromEntries(this.configs)
    };
    
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving config file:', error);
    }
  }
  
  // Get configuration with environment variable override support
  get(path = null, profile = null) {
    const targetProfile = profile || this.activeProfile;
    let config = this.configs.get(targetProfile) || this.getDefaults();
    
    // Deep clone to avoid mutations
    config = JSON.parse(JSON.stringify(config));
    
    // Apply environment variable overrides
    config = this.applyEnvironmentOverrides(config);
    
    if (!path) {
      return config;
    }
    
    // Navigate to requested path
    const parts = path.split('.');
    let value = config;
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    return value;
  }
  
  applyEnvironmentOverrides(config) {
    // Map of environment variables to config paths
    const envMappings = {
      'MC_HOST': 'minecraft.host',
      'MC_PORT': 'minecraft.port',
      'MC_USERNAME': 'minecraft.username',
      'MC_VERSION': 'minecraft.version',
      'MC_AUTH': 'minecraft.auth',
      'SERVER_PORT': 'server.port',
      'API_BASE': 'api.baseUrl',
      'ENABLE_VIEWER': 'viewer.enabled',
      'VIEWER_PORT': 'viewer.port',
      'LOG_LEVEL': 'logging.level'
    };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      if (process.env[envVar] !== undefined) {
        const parts = configPath.split('.');
        let target = config;
        
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        
        const lastPart = parts[parts.length - 1];
        let value = process.env[envVar];
        
        // Convert types based on schema
        const section = parts[0];
        const field = parts[1];
        const spec = this.schema[section]?.[field];
        
        if (spec) {
          try {
            if (spec.type === 'number') {
              value = parseInt(value);
              if (isNaN(value)) {
                console.warn(`Warning: Invalid number value for ${configPath} from ${envVar}: "${process.env[envVar]}"`);
              }
            } else if (spec.type === 'boolean') {
              // Check if value is a string before calling toLowerCase()
              if (typeof value === 'string') {
                const lowerValue = value.toLowerCase();
                // Support '1' and '0' as boolean values
                if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on') {
                  value = true;
                } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no' || lowerValue === 'off') {
                  value = false;
                } else {
                  value = Boolean(value);
                }
              } else {
                value = Boolean(value);
              }
            }
          } catch (error) {
            console.warn(`Warning: Failed to parse ${envVar} for ${configPath}: ${error.message}`);
          }
        }
        
        target[lastPart] = value;
      }
    }
    
    return config;
  }
  
  set(path, value, profile = null) {
    const targetProfile = profile || this.activeProfile;
    let config = this.configs.get(targetProfile) || this.getDefaults();
    
    // Validate the value
    const parts = path.split('.');
    if (parts.length === 2) {
      const [section, field] = parts;
      const spec = this.schema[section]?.[field];
      
      if (spec) {
        const validation = this.validateValue(value, spec, path);
        if (!validation.valid) {
          throw new Error(`Configuration Error: ${validation.error}`);
        }
        value = validation.value;
      }
    }
    
    // Set the value
    let target = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
    
    this.configs.set(targetProfile, config);
    this.saveConfigurations();
  }
  
  validateValue(value, spec, fieldName = null) {
    let parsedValue = value;
    const field = fieldName ? ` for '${fieldName}'` : '';
    
    // Type conversion
    if (spec.type === 'number') {
      parsedValue = Number(value);
      if (isNaN(parsedValue)) {
        return { 
          valid: false, 
          error: `Must be a number${field}. Received: "${value}" (type: ${typeof value})` 
        };
      }
      if (!isFinite(parsedValue)) {
        return { 
          valid: false, 
          error: `Must be a finite number${field}. Received: ${parsedValue}` 
        };
      }
      if (spec.min !== undefined && parsedValue < spec.min) {
        return { 
          valid: false, 
          error: `Must be >= ${spec.min}${field}. Received: ${parsedValue}` 
        };
      }
      if (spec.max !== undefined && parsedValue > spec.max) {
        return { 
          valid: false, 
          error: `Must be <= ${spec.max}${field}. Received: ${parsedValue}` 
        };
      }
    } else if (spec.type === 'boolean') {
      if (typeof value === 'string') {
        // Handle string boolean values with better parsing
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on') {
          parsedValue = true;
        } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no' || lowerValue === 'off') {
          parsedValue = false;
        } else {
          // Still convert to boolean for other strings
          parsedValue = Boolean(value);
        }
      } else {
        parsedValue = Boolean(value);
      }
    } else if (spec.type === 'string') {
      parsedValue = String(value);
      if (spec.enum && !spec.enum.includes(parsedValue)) {
        return { 
          valid: false, 
          error: `Must be one of: ${spec.enum.join(', ')}${field}. Received: "${parsedValue}"` 
        };
      }
    }
    
    return { valid: true, value: parsedValue };
  }
  
  listProfiles() {
    return Array.from(this.configs.keys());
  }
  
  getActiveProfile() {
    return this.activeProfile;
  }
  
  setActiveProfile(profile) {
    if (!this.configs.has(profile)) {
      throw new Error(`Profile '${profile}' does not exist`);
    }
    this.activeProfile = profile;
    this.saveConfigurations();
  }
  
  createProfile(name, baseProfile = 'default') {
    if (this.configs.has(name)) {
      throw new Error(`Profile '${name}' already exists`);
    }
    
    const baseConfig = this.configs.get(baseProfile) || this.getDefaults();
    this.configs.set(name, JSON.parse(JSON.stringify(baseConfig)));
    this.saveConfigurations();
  }
  
  deleteProfile(name) {
    if (name === 'default') {
      throw new Error('Cannot delete default profile');
    }
    if (!this.configs.has(name)) {
      throw new Error(`Profile '${name}' does not exist`);
    }
    if (this.activeProfile === name) {
      this.activeProfile = 'default';
    }
    this.configs.delete(name);
    this.saveConfigurations();
  }
  
  getSchema() {
    return this.schema;
  }
  
  reset(profile = null) {
    const targetProfile = profile || this.activeProfile;
    if (targetProfile === 'default' || profile === null) {
      this.configs.set(targetProfile, this.getDefaults());
    } else {
      // Reset to default values for non-default profiles
      this.configs.set(targetProfile, JSON.parse(JSON.stringify(this.configs.get('default'))));
    }
    this.saveConfigurations();
  }
  
  // Reset the entire instance to initial state (for testing)
  resetInstance() {
    this.configs.clear();
    this.activeProfile = 'default';
    this.loadConfigurations();
  }
  
  exportConfig(profile = null) {
    const targetProfile = profile || this.activeProfile;
    const config = this.configs.get(targetProfile) || this.getDefaults();
    // Deep clone to avoid mutations
    return JSON.parse(JSON.stringify(config));
  }
  
  importConfig(configData, profile = null) {
    const targetProfile = profile || this.activeProfile;
    
    // Validate the imported config against schema
    for (const [section, fields] of Object.entries(configData)) {
      if (!this.schema[section]) continue;
      
      for (const [field, value] of Object.entries(fields)) {
        const spec = this.schema[section][field];
        if (spec) {
          const validation = this.validateValue(value, spec, `${section}.${field}`);
          if (!validation.valid) {
            throw new Error(`Import Configuration Error: ${validation.error}`);
          }
          configData[section][field] = validation.value;
        }
      }
    }
    
    this.configs.set(targetProfile, configData);
    this.saveConfigurations();
  }
}

// Export singleton instance
module.exports = new ConfigManager();