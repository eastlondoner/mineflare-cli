/**
 * E2E Tests: Server Lifecycle
 * Tests real server startup, shutdown, and process management
 * Zero mocks - all operations are real
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const net = require('net');

const TestEnvironment = require('./utils/test-environment');
const APIClient = require('./utils/api-client');
const { E2E_CONFIG, measurePerformance, expectEventually, retryOperation } = require('./utils/e2e-setup');

const execAsync = promisify(exec);

describe('E2E: Server Lifecycle', () => {
  let env;
  let tempDir;
  
  beforeAll(async () => {
    env = new TestEnvironment({
      basePort: E2E_CONFIG.BASE_PORT,
      verbose: E2E_CONFIG.VERBOSE
    });
    await env.setup();
    
    tempDir = path.join(process.cwd(), '.e2e-server-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });
  
  afterAll(async () => {
    await env?.cleanup();
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('Server Startup', () => {
    it('should start server in foreground mode', async () => {
      const port = E2E_CONFIG.BASE_PORT + 1;
      
      const perf = await measurePerformance('Server Startup', async () => {
        // Start server process
        const serverProcess = spawn('bun', [
          'run',
          'src/mineflare.js',
          'server',
          'start',
          '--foreground'
        ], {
          env: {
            ...process.env,
            MINEFLARE_PORT: port.toString(),
            NODE_ENV: 'test'
          },
          stdio: E2E_CONFIG.VERBOSE ? 'inherit' : 'pipe'
        });
        
        // Wait for server to be ready
        await expectEventually(async () => {
          try {
            const response = await fetch(`http://localhost:${port}/health`);
            return response.ok;
          } catch {
            return false;
          }
        }, 10000, 'Server failed to start');
        
        // Verify server is running
        const client = new APIClient(`http://localhost:${port}`);
        const health = await client.checkHealth();
        expect(health).toBe(true);
        
        // Clean up
        serverProcess.kill('SIGTERM');
        
        return true;
      });
      
      // Verify startup time is within threshold
      expect(perf.duration).toBeLessThan(E2E_CONFIG.MAX_STARTUP_TIME);
      
      console.log(`Server startup time: ${perf.duration}ms`);
    }, 15000);
    
    it('should start server in daemon mode', async () => {
      const port = E2E_CONFIG.BASE_PORT + 2;
      const pidFile = path.join(tempDir, 'server.pid');
      
      // Start server in daemon mode
      const { stdout, stderr } = await execAsync(
        `MINEFLARE_PORT=${port} MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server start --daemon`
      );
      
      // Verify PID file was created
      await expectEventually(() => fs.existsSync(pidFile), 5000, 'PID file not created');
      
      // Read PID
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
      expect(pid).toBeGreaterThan(0);
      
      // Verify process is running
      const { stdout: psOutput } = await execAsync(`ps -p ${pid}`);
      expect(psOutput).toContain(pid.toString());
      
      // Verify server is accessible
      const client = new APIClient(`http://localhost:${port}`);
      await client.waitForReady();
      
      const health = await client.checkHealth();
      expect(health).toBe(true);
      
      // Stop the daemon
      await execAsync(`kill ${pid}`);
      
      // Wait for process to stop
      await expectEventually(async () => {
        try {
          await execAsync(`ps -p ${pid}`);
          return false;
        } catch {
          return true;
        }
      }, 5000, 'Process did not stop');
    }, 20000);
    
    it('should handle port conflicts gracefully', async () => {
      const port = E2E_CONFIG.BASE_PORT + 3;
      
      // Start first server
      const server1 = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Wait for first server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Try to start second server on same port
      const server2 = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Second server should fail
      await new Promise((resolve) => {
        server2.on('exit', (code) => {
          expect(code).not.toBe(0);
          resolve();
        });
      });
      
      // Clean up
      server1.kill('SIGTERM');
    }, 20000);
    
    it('should load configuration from file', async () => {
      const port = E2E_CONFIG.BASE_PORT + 4;
      const configFile = path.join(tempDir, 'test-config.json');
      
      // Create config file
      const config = {
        server: { port },
        minecraft: {
          host: 'test.server.com',
          username: 'ConfigTestBot',
          version: '1.20.1'
        },
        logging: { level: 'debug' }
      };
      
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      
      // Start server with config file
      const serverProcess = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground',
        '--config',
        configFile
      ], {
        env: {
          ...process.env,
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Verify configuration was loaded
      const client = new APIClient(`http://localhost:${port}`);
      const state = await client.getBotState();
      
      // The state should reflect some of the configuration
      expect(state.ok).toBe(true);
      
      // Clean up
      serverProcess.kill('SIGTERM');
      fs.unlinkSync(configFile);
    }, 15000);
  });
  
  describe('Server Shutdown', () => {
    it('should handle SIGTERM gracefully', async () => {
      const port = E2E_CONFIG.BASE_PORT + 5;
      
      // Start server
      const serverProcess = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Send SIGTERM
      const exitPromise = new Promise((resolve) => {
        serverProcess.on('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });
      
      serverProcess.kill('SIGTERM');
      
      const { code, signal } = await exitPromise;
      
      // Should exit cleanly
      expect(code === 0 || signal === 'SIGTERM').toBe(true);
      
      // Server should no longer be accessible
      await expect(fetch(`http://localhost:${port}/health`)).rejects.toThrow();
    }, 15000);
    
    it('should handle SIGINT gracefully', async () => {
      const port = E2E_CONFIG.BASE_PORT + 6;
      
      // Start server
      const serverProcess = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Send SIGINT (Ctrl+C)
      const exitPromise = new Promise((resolve) => {
        serverProcess.on('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });
      
      serverProcess.kill('SIGINT');
      
      const { code, signal } = await exitPromise;
      
      // Should exit cleanly
      expect(code === 0 || signal === 'SIGINT').toBe(true);
      
      // Server should no longer be accessible
      await expect(fetch(`http://localhost:${port}/health`)).rejects.toThrow();
    }, 15000);
    
    it('should stop daemon server with stop command', async () => {
      const port = E2E_CONFIG.BASE_PORT + 7;
      const pidFile = path.join(tempDir, 'daemon-stop.pid');
      
      // Start server in daemon mode
      await execAsync(
        `MINEFLARE_PORT=${port} MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server start --daemon`
      );
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Stop using stop command
      const { stdout } = await execAsync(
        `MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server stop`
      );
      
      // Verify server stopped
      await expectEventually(async () => {
        try {
          await fetch(`http://localhost:${port}/health`);
          return false;
        } catch {
          return true;
        }
      }, 5000, 'Server did not stop');
      
      // PID file should be removed
      expect(fs.existsSync(pidFile)).toBe(false);
    }, 20000);
  });
  
  describe('Server Status', () => {
    it('should report status of running server', async () => {
      const port = E2E_CONFIG.BASE_PORT + 8;
      const pidFile = path.join(tempDir, 'status-test.pid');
      
      // Start server
      await execAsync(
        `MINEFLARE_PORT=${port} MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server start --daemon`
      );
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Check status
      const { stdout } = await execAsync(
        `MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server status`
      );
      
      expect(stdout).toContain('running');
      
      // Stop server
      await execAsync(`MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server stop`);
      
      // Check status after stop
      const { stdout: statusAfterStop } = await execAsync(
        `MINEFLARE_PID_FILE=${pidFile} bun run src/mineflare.js server status`
      ).catch(e => e);
      
      expect(statusAfterStop).toContain('not running');
    }, 20000);
  });
  
  describe('Multiple Server Instances', () => {
    it('should run multiple servers on different ports', async () => {
      const ports = [
        E2E_CONFIG.BASE_PORT + 10,
        E2E_CONFIG.BASE_PORT + 11,
        E2E_CONFIG.BASE_PORT + 12
      ];
      
      const servers = [];
      
      // Start multiple servers
      for (const port of ports) {
        const serverProcess = spawn('bun', [
          'run',
          'src/mineflare.js',
          'server',
          'start',
          '--foreground'
        ], {
          env: {
            ...process.env,
            MINEFLARE_PORT: port.toString(),
            NODE_ENV: 'test'
          },
          stdio: 'pipe'
        });
        
        servers.push({ port, process: serverProcess });
      }
      
      // Wait for all servers to start
      await Promise.all(ports.map(port => 
        expectEventually(async () => {
          try {
            const response = await fetch(`http://localhost:${port}/health`);
            return response.ok;
          } catch {
            return false;
          }
        }, 10000)
      ));
      
      // Verify all servers are accessible
      for (const port of ports) {
        const client = new APIClient(`http://localhost:${port}`);
        const health = await client.checkHealth();
        expect(health).toBe(true);
      }
      
      // Clean up all servers
      for (const server of servers) {
        server.process.kill('SIGTERM');
      }
    }, 30000);
  });
  
  describe('Recovery and Resilience', () => {
    it('should recover from unexpected shutdown', async () => {
      const port = E2E_CONFIG.BASE_PORT + 13;
      
      // Start server
      const serverProcess = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Wait for server to start
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Force kill the server (simulate crash)
      serverProcess.kill('SIGKILL');
      
      // Wait for process to die
      await new Promise(resolve => serverProcess.on('exit', resolve));
      
      // Start new server on same port (should work)
      const newServerProcess = spawn('bun', [
        'run',
        'src/mineflare.js',
        'server',
        'start',
        '--foreground'
      ], {
        env: {
          ...process.env,
          MINEFLARE_PORT: port.toString(),
          NODE_ENV: 'test'
        },
        stdio: 'pipe'
      });
      
      // Should be able to start on same port
      await expectEventually(async () => {
        try {
          const response = await fetch(`http://localhost:${port}/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, 10000);
      
      // Clean up
      newServerProcess.kill('SIGTERM');
    }, 25000);
    
    it('should handle rapid start/stop cycles', async () => {
      const port = E2E_CONFIG.BASE_PORT + 14;
      const cycles = 3;
      
      for (let i = 0; i < cycles; i++) {
        // Start server
        const serverProcess = spawn('bun', [
          'run',
          'src/mineflare.js',
          'server',
          'start',
          '--foreground'
        ], {
          env: {
            ...process.env,
            MINEFLARE_PORT: port.toString(),
            NODE_ENV: 'test'
          },
          stdio: 'pipe'
        });
        
        // Wait for server to start
        await expectEventually(async () => {
          try {
            const response = await fetch(`http://localhost:${port}/health`);
            return response.ok;
          } catch {
            return false;
          }
        }, 10000);
        
        // Quick check
        const client = new APIClient(`http://localhost:${port}`);
        const health = await client.checkHealth();
        expect(health).toBe(true);
        
        // Stop server
        serverProcess.kill('SIGTERM');
        
        // Wait for process to exit
        await new Promise(resolve => serverProcess.on('exit', resolve));
        
        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`Completed ${cycles} start/stop cycles successfully`);
    }, 45000);
  });
});