/**
 * Test Environment Manager for E2E Tests
 * Handles real environment setup and cleanup with zero mocks
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { promisify } = require('util');

const execAsync = promisify(exec);

class TestEnvironment {
  constructor(options = {}) {
    this.options = {
      basePort: options.basePort || 3000,
      tempDir: options.tempDir || path.join(process.cwd(), '.e2e-temp'),
      cleanupOnExit: options.cleanupOnExit !== false,
      verbose: options.verbose || process.env.E2E_VERBOSE === 'true',
      ...options
    };
    
    this.processes = [];
    this.tempFiles = [];
    this.servers = [];
    this.bots = [];
  }

  /**
   * Set up the test environment
   */
  async setup() {
    this.log('Setting up test environment...');
    
    // Create temp directory
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir, { recursive: true });
    }
    
    // Set up exit handlers
    if (this.options.cleanupOnExit) {
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());
      process.on('exit', () => this.cleanup());
    }
    
    // Check required ports
    await this.checkPortAvailability();
    
    this.log('Test environment ready');
  }

  /**
   * Check if required ports are available
   */
  async checkPortAvailability() {
    const portsToCheck = Array.from({ length: 10 }, (_, i) => this.options.basePort + i);
    
    for (const port of portsToCheck) {
      const available = await this.isPortAvailable(port);
      if (!available) {
        throw new Error(`Port ${port} is not available. Please free it or adjust E2E_BASE_PORT`);
      }
    }
  }

  /**
   * Check if a port is available
   */
  isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      
      server.listen(port);
    });
  }

  /**
   * Start the Mineflare server with real configuration
   */
  async startServer(config = {}) {
    const port = config.port || this.options.basePort;
    const configFile = await this.createConfigFile(config);
    
    this.log(`Starting server on port ${port}...`);
    
    // Start the real server process (no flags = foreground mode)
    const serverProcess = spawn('bun', ['run', 'src/mineflare.js', 'server', 'start'], {
      env: {
        ...process.env,
        MINEFLARE_CONFIG: configFile,
        MINEFLARE_PORT: port.toString(),
        NODE_ENV: 'test'
      },
      stdio: this.options.verbose ? 'inherit' : 'pipe'
    });
    
    this.processes.push(serverProcess);
    
    // Wait for server to be ready
    await this.waitForServer(port);
    
    this.log(`Server started on port ${port}`);
    
    return {
      port,
      process: serverProcess,
      stop: async () => {
        await this.stopProcess(serverProcess);
        const index = this.processes.indexOf(serverProcess);
        if (index > -1) this.processes.splice(index, 1);
      }
    };
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer(port, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          return true;
        }
      } catch (e) {
        // Server not ready yet
      }
      
      await this.sleep(100);
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  /**
   * Connect a real bot to Minecraft server
   */
  async connectBot(options = {}) {
    const mineflayer = require('mineflayer');
    
    this.log(`Connecting bot to ${options.host || 'localhost'}:${options.port || 25565}...`);
    
    const bot = mineflayer.createBot({
      host: options.host || process.env.E2E_MC_HOST || 'localhost',
      port: options.port || parseInt(process.env.E2E_MC_PORT) || 25565,
      username: options.username || `TestBot${Date.now()}`,
      version: options.version || process.env.E2E_MC_VERSION || false,
      auth: options.auth || (process.env.E2E_MC_OFFLINE === 'true' ? 'offline' : 'microsoft')
    });
    
    // Wait for spawn
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bot connection timeout'));
      }, options.timeout || 30000);
      
      bot.once('spawn', () => {
        clearTimeout(timeout);
        this.log('Bot spawned successfully');
        resolve();
      });
      
      bot.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    
    this.bots.push(bot);
    
    return {
      bot,
      disconnect: async () => {
        bot.quit();
        const index = this.bots.indexOf(bot);
        if (index > -1) this.bots.splice(index, 1);
      }
    };
  }

  /**
   * Create a temporary config file
   */
  async createConfigFile(config) {
    const configPath = path.join(this.options.tempDir, `config-${Date.now()}.json`);
    
    const defaultConfig = {
      server: {
        port: this.options.basePort,
        host: '0.0.0.0'
      },
      minecraft: {
        host: process.env.E2E_MC_HOST || 'localhost',
        port: parseInt(process.env.E2E_MC_PORT) || 25565,
        username: `TestBot${Date.now()}`,
        version: process.env.E2E_MC_VERSION || '1.21.1',
        auth: process.env.E2E_MC_OFFLINE === 'true' ? 'offline' : 'microsoft'
      },
      viewer: {
        enabled: false
      },
      logging: {
        level: this.options.verbose ? 'debug' : 'info'
      }
    };
    
    const finalConfig = this.deepMerge(defaultConfig, config);
    fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
    this.tempFiles.push(configPath);
    
    return configPath;
  }

  /**
   * Execute a CLI command and get output
   */
  async executeCommand(command, args = [], options = {}) {
    const fullCommand = `bun run src/mineflare.js ${command} ${args.join(' ')}`;
    
    this.log(`Executing: ${fullCommand}`);
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ...options.env
        },
        timeout: options.timeout || 10000
      });
      
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0
      };
    } catch (error) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.code || 1,
        error
      };
    }
  }

  /**
   * Make a real HTTP request to the API
   */
  async apiRequest(method, path, data = null, options = {}) {
    const url = `http://localhost:${options.port || this.options.basePort}${path}`;
    
    this.log(`${method} ${url}`);
    
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      requestOptions.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, requestOptions);
    const responseData = await response.json().catch(() => null);
    
    return {
      status: response.status,
      data: responseData,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok
    };
  }

  /**
   * Monitor resource usage
   */
  async getResourceUsage() {
    const { stdout } = await execAsync('ps aux | grep -E "bun|node|java" | grep -v grep');
    const lines = stdout.trim().split('\n');
    
    const usage = {
      processes: [],
      totalMemory: 0,
      totalCpu: 0
    };
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 11) {
        const process = {
          pid: parseInt(parts[1]),
          cpu: parseFloat(parts[2]),
          memory: parseFloat(parts[3]),
          command: parts.slice(10).join(' ')
        };
        
        usage.processes.push(process);
        usage.totalCpu += process.cpu;
        usage.totalMemory += process.memory;
      }
    }
    
    return usage;
  }

  /**
   * Stop a process gracefully
   */
  async stopProcess(process) {
    return new Promise((resolve) => {
      if (!process || process.killed) {
        resolve();
        return;
      }
      
      process.on('exit', resolve);
      process.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
        resolve();
      }, 5000);
    });
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    this.log('Cleaning up test environment...');
    
    // Disconnect all bots
    for (const bot of this.bots) {
      try {
        bot.quit();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this.bots = [];
    
    // Stop all processes
    for (const process of this.processes) {
      await this.stopProcess(process);
    }
    this.processes = [];
    
    // Remove temp files
    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this.tempFiles = [];
    
    // Remove temp directory if empty
    try {
      if (fs.existsSync(this.options.tempDir)) {
        const files = fs.readdirSync(this.options.tempDir);
        if (files.length === 0) {
          fs.rmdirSync(this.options.tempDir);
        }
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    
    this.log('Cleanup complete');
  }

  /**
   * Utility: Deep merge objects
   */
  deepMerge(target, source) {
    const output = Object.assign({}, target);
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  /**
   * Utility: Check if value is object
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility: Log message
   */
  log(message) {
    if (this.options.verbose) {
      console.log(`[E2E] ${message}`);
    }
  }

  /**
   * Wait for a condition to be true
   */
  async waitForCondition(condition, timeout = 10000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(interval);
    }
    
    throw new Error('Condition not met within timeout');
  }

  /**
   * Create a test Minecraft server (using Docker or local)
   */
  async createMinecraftServer(options = {}) {
    const useDocker = options.docker !== false && await this.isDockerAvailable();
    
    if (useDocker) {
      return await this.createDockerMinecraftServer(options);
    } else {
      return await this.createLocalMinecraftServer(options);
    }
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable() {
    try {
      await execAsync('docker --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a Docker-based Minecraft server
   */
  async createDockerMinecraftServer(options = {}) {
    const containerName = `mc-test-${Date.now()}`;
    const port = options.port || 25565;
    
    this.log(`Starting Docker Minecraft server on port ${port}...`);
    
    // Start container
    await execAsync(`docker run -d --name ${containerName} -p ${port}:25565 -e EULA=TRUE -e ONLINE_MODE=FALSE itzg/minecraft-server:latest`);
    
    // Wait for server to be ready
    await this.waitForMinecraftServer(port);
    
    return {
      type: 'docker',
      container: containerName,
      port,
      stop: async () => {
        await execAsync(`docker stop ${containerName}`);
        await execAsync(`docker rm ${containerName}`);
      }
    };
  }

  /**
   * Create a local Minecraft server
   */
  async createLocalMinecraftServer(options = {}) {
    // This would require having a local Minecraft server JAR
    // For now, we'll assume it exists or skip
    this.log('Local Minecraft server setup not implemented - using existing server');
    
    return {
      type: 'existing',
      port: options.port || parseInt(process.env.E2E_MC_PORT) || 25565,
      stop: async () => {
        // No-op for existing server
      }
    };
  }

  /**
   * Wait for Minecraft server to be ready
   */
  async waitForMinecraftServer(port, timeout = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        // Try to connect with a test bot
        const testBot = require('mineflayer').createBot({
          host: 'localhost',
          port,
          username: 'TestProbe',
          auth: 'offline',
          hideErrors: true
        });
        
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
          
          testBot.once('spawn', () => {
            clearTimeout(timer);
            testBot.quit();
            resolve();
          });
          
          testBot.once('error', () => {
            clearTimeout(timer);
            reject();
          });
        });
        
        return true;
      } catch {
        // Server not ready yet
      }
      
      await this.sleep(1000);
    }
    
    throw new Error(`Minecraft server failed to start within ${timeout}ms`);
  }
}

module.exports = TestEnvironment;