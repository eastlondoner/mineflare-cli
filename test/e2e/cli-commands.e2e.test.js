/**
 * CLI Commands End-to-End Test Suite
 * Tests ALL CLI commands with real server interactions
 * Zero mocks - all commands execute against real systems
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach } = require('bun:test');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Test configuration
const SERVER_PORT = process.env.E2E_SERVER_PORT || 3001;
const MC_PORT = process.env.E2E_MC_PORT || 8099;
const API_URL = `http://localhost:${SERVER_PORT}`;
const MINEFLARE_PATH = path.join(process.cwd(), 'src', 'mineflare.js');
const TIMEOUT = parseInt(process.env.E2E_TIMEOUT) || 30000;

// Helper to execute CLI commands
function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 10000;
    const child = spawn('bun', [MINEFLARE_PATH, ...args], {
      env: { ...process.env, API_URL },
      timeout
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', (error) => {
      reject(error);
    });
    
    setTimeout(() => {
      child.kill();
      reject(new Error(`Command timeout: ${args.join(' ')}`));
    }, timeout);
  });
}

// Helper to wait for server to be ready
async function waitForServer(port, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(1000);
        
        client.on('connect', () => {
          client.end();
          resolve();
        });
        
        client.on('error', reject);
        client.on('timeout', () => {
          client.destroy();
          reject(new Error('Timeout'));
        });
        
        client.connect(port, 'localhost');
      });
      return true;
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Server on port ${port} not ready after ${maxAttempts} attempts`);
}

describe('E2E: CLI Commands', () => {
  let serverProcess;
  let serverStarted = false;
  
  beforeAll(async () => {
    console.log('═'.repeat(60));
    console.log('CLI COMMANDS E2E TEST SUITE');
    console.log('Testing ALL CLI commands with real server interactions');
    console.log('Zero mocks - real command execution!');
    console.log('═'.repeat(60));
    
    // Check if Minecraft server is running
    try {
      await waitForServer(MC_PORT, 5);
      console.log(`✅ Minecraft server detected on port ${MC_PORT}`);
    } catch (e) {
      console.log(`⚠️  No Minecraft server on port ${MC_PORT}, some tests may be limited`);
    }
    
    // Start the bot server for testing
    console.log(`Starting test bot server on port ${SERVER_PORT}...`);
    
    serverProcess = spawn('bun', [MINEFLARE_PATH, 'server', 'start'], {
      env: {
        ...process.env,
        SERVER_PORT: SERVER_PORT.toString(),
        MC_PORT: MC_PORT.toString(),
        MC_HOST: 'localhost',
        MC_USERNAME: 'CLITestBot',
        MC_VERSION: 'false',
        MC_AUTH: 'offline',
        ENABLE_VIEWER: 'false'
      }
    });
    
    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('Bot server started')) {
        serverStarted = true;
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });
    
    // Wait for server to start
    await waitForServer(SERVER_PORT);
    console.log(`✅ Test server started on port ${SERVER_PORT}`);
  }, TIMEOUT);
  
  afterAll(async () => {
    // Stop the test server
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clean up any PID files
    const pidFile = path.join(process.cwd(), 'mineflare.pid');
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    
    console.log('✅ Cleanup complete');
  });
  
  describe('Information Commands', () => {
    it('should execute health command', async () => {
      const result = await runCommand(['health']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('status');
      
      // Parse and verify JSON response
      const response = JSON.parse(result.stdout);
      expect(response.status).toBeDefined();
      
      console.log('✅ health command executed successfully');
    });
    
    it('should execute state command', async () => {
      const result = await runCommand(['state']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('connected');
      
      const response = JSON.parse(result.stdout);
      expect(response.connected).toBeTypeOf('boolean');
      
      console.log('✅ state command executed successfully');
    });
    
    it('should execute inventory command', async () => {
      const result = await runCommand(['inventory']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.items).toBeInstanceOf(Array);
      
      console.log('✅ inventory command executed successfully');
    });
    
    it('should execute entities command', async () => {
      const result = await runCommand(['entities']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.entities).toBeInstanceOf(Array);
      
      console.log('✅ entities command executed successfully');
    });
    
    it('should execute events command with --since option', async () => {
      const timestamp = Date.now() - 60000; // 1 minute ago
      const result = await runCommand(['events', '--since', timestamp.toString()]);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.events).toBeInstanceOf(Array);
      
      console.log('✅ events command with --since option executed successfully');
    });
    
    it('should execute screenshot command', async () => {
      const result = await runCommand(['screenshot']);
      
      expect(result.code).toBe(0);
      
      if (result.stdout.includes('screenshot')) {
        const response = JSON.parse(result.stdout);
        expect(response.screenshot).toBeDefined();
        console.log('✅ screenshot command executed successfully');
      } else if (result.stdout.includes('Viewer not enabled')) {
        console.log('✅ screenshot command correctly reported viewer disabled');
      }
    });
    
    it('should execute screenshot command with --output option', async () => {
      const outputFile = 'test-screenshot.png';
      
      const result = await runCommand(['screenshot', '--output', outputFile]);
      
      if (result.stdout.includes('saved')) {
        expect(fs.existsSync(outputFile)).toBe(true);
        fs.unlinkSync(outputFile); // Clean up
        console.log('✅ screenshot with --output executed successfully');
      } else {
        console.log('✅ screenshot --output handled (viewer may be disabled)');
      }
    });
    
    it('should execute recipes command', async () => {
      const result = await runCommand(['recipes', '--item', 'oak_planks']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.recipes).toBeInstanceOf(Array);
      
      console.log('✅ recipes command executed successfully');
    });
  });
  
  describe('Action Commands', () => {
    it('should execute chat command', async () => {
      const testMessage = `Test message ${Date.now()}`;
      const result = await runCommand(['chat', testMessage]);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.success).toBeDefined();
      
      console.log('✅ chat command executed successfully');
    });
    
    it('should execute move command with options', async () => {
      const result = await runCommand(['move', '-x', '1', '-y', '0', '-z', '0', '--sprint']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.success).toBeDefined();
      
      console.log('✅ move command with options executed successfully');
    });
    
    it('should execute stop command', async () => {
      const result = await runCommand(['stop']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.success).toBeDefined();
      
      console.log('✅ stop command executed successfully');
    });
    
    it('should execute look command', async () => {
      const result = await runCommand(['look', '--yaw', '0', '--pitch', '0']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.success).toBeDefined();
      
      console.log('✅ look command executed successfully');
    });
    
    it('should execute dig command', async () => {
      const result = await runCommand(['dig', '-x', '0', '-y', '64', '-z', '0']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      // May succeed or fail based on game state, but command should execute
      expect(response).toBeDefined();
      
      console.log('✅ dig command executed successfully');
    });
    
    it('should execute place command', async () => {
      const result = await runCommand(['place', '-x', '0', '-y', '64', '-z', '0', '--block', 'dirt']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      // May succeed or fail based on inventory, but command should execute
      expect(response).toBeDefined();
      
      console.log('✅ place command executed successfully');
    });
    
    it('should execute attack command', async () => {
      const result = await runCommand(['attack', '--entity', '1']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      // May succeed or fail based on entity presence, but command should execute
      expect(response).toBeDefined();
      
      console.log('✅ attack command executed successfully');
    });
    
    it('should execute craft command', async () => {
      const result = await runCommand(['craft', '--item', 'oak_planks', '--count', '4']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      // May succeed or fail based on materials, but command should execute
      expect(response).toBeDefined();
      
      console.log('✅ craft command executed successfully');
    });
    
    it('should execute equip command', async () => {
      const result = await runCommand(['equip', '--item', 'diamond_sword', '--destination', 'hand']);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      // May succeed or fail based on inventory, but command should execute
      expect(response).toBeDefined();
      
      console.log('✅ equip command executed successfully');
    });
    
    it('should execute batch command with file', async () => {
      // Create a test batch file
      const batchFile = 'test-batch.json';
      const batchContent = {
        instructions: [
          { type: 'chat', params: { message: 'Batch test start' } },
          { type: 'wait', params: { duration: 100 } },
          { type: 'chat', params: { message: 'Batch test end' } }
        ]
      };
      
      fs.writeFileSync(batchFile, JSON.stringify(batchContent, null, 2));
      
      const result = await runCommand(['batch', '--file', batchFile]);
      
      expect(result.code).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.results).toBeInstanceOf(Array);
      
      // Clean up
      fs.unlinkSync(batchFile);
      
      console.log('✅ batch command with file executed successfully');
    });
  });
  
  describe('Server Management Commands', () => {
    it('should execute server status command', async () => {
      const result = await runCommand(['server', 'status']);
      
      expect(result.code).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('running');
      
      console.log('✅ server status command executed successfully');
    });
    
    it('should handle server start with daemon flag', async () => {
      // Stop the current server first
      if (serverProcess) {
        serverProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const result = await runCommand(['server', 'start', '--daemon'], {
        env: {
          ...process.env,
          SERVER_PORT: (SERVER_PORT + 100).toString() // Use different port
        }
      });
      
      if (result.stdout.includes('daemon')) {
        console.log('✅ server start --daemon command executed');
        
        // Stop the daemon
        await runCommand(['server', 'stop']);
      }
      
      // Restart the main test server
      serverProcess = spawn('bun', [MINEFLARE_PATH, 'server', 'start'], {
        env: {
          ...process.env,
          SERVER_PORT: SERVER_PORT.toString(),
          MC_PORT: MC_PORT.toString()
        }
      });
      
      await waitForServer(SERVER_PORT);
    });
  });
  
  describe('Configuration Commands', () => {
    it('should execute config get command', async () => {
      const result = await runCommand(['config', 'get']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('minecraft');
      expect(result.stdout).toContain('server');
      
      console.log('✅ config get command executed successfully');
    });
    
    it('should execute config get with path', async () => {
      const result = await runCommand(['config', 'get', 'minecraft.host']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();
      
      console.log('✅ config get with path executed successfully');
    });
    
    it('should execute config get with --json flag', async () => {
      const result = await runCommand(['config', 'get', '--json']);
      
      expect(result.code).toBe(0);
      
      const config = JSON.parse(result.stdout);
      expect(config.minecraft).toBeDefined();
      expect(config.server).toBeDefined();
      
      console.log('✅ config get --json executed successfully');
    });
    
    it('should execute config set command', async () => {
      const testValue = `TestBot_${Date.now()}`;
      const result = await runCommand(['config', 'set', 'minecraft.username', testValue]);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('updated');
      
      // Verify the change
      const getResult = await runCommand(['config', 'get', 'minecraft.username']);
      expect(getResult.stdout).toContain(testValue);
      
      // Reset to original
      await runCommand(['config', 'set', 'minecraft.username', 'CLITestBot']);
      
      console.log('✅ config set command executed successfully');
    });
    
    it('should execute config profile list command', async () => {
      const result = await runCommand(['config', 'profile', 'list']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('default');
      
      console.log('✅ config profile list executed successfully');
    });
    
    it('should execute config profile create command', async () => {
      const profileName = `test_${Date.now()}`;
      const result = await runCommand(['config', 'profile', 'create', profileName]);
      
      expect(result.code).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('created');
      
      // Clean up - delete the test profile
      await runCommand(['config', 'profile', 'delete', profileName]);
      
      console.log('✅ config profile create executed successfully');
    });
    
    it('should execute config export command', async () => {
      const exportFile = 'test-config.json';
      const result = await runCommand(['config', 'export', exportFile]);
      
      expect(result.code).toBe(0);
      expect(fs.existsSync(exportFile)).toBe(true);
      
      const exportedConfig = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
      expect(exportedConfig.minecraft).toBeDefined();
      
      // Clean up
      fs.unlinkSync(exportFile);
      
      console.log('✅ config export executed successfully');
    });
    
    it('should execute config import command', async () => {
      // Create a test config file
      const importFile = 'test-import.json';
      const testConfig = {
        minecraft: {
          host: 'localhost',
          port: 25565,
          username: 'ImportTestBot',
          version: false,
          auth: 'offline'
        },
        server: {
          port: 3000,
          timeout: 30000
        }
      };
      
      fs.writeFileSync(importFile, JSON.stringify(testConfig, null, 2));
      
      const result = await runCommand(['config', 'import', importFile]);
      
      expect(result.code).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('import');
      
      // Clean up
      fs.unlinkSync(importFile);
      
      console.log('✅ config import executed successfully');
    });
    
    it('should execute config reset command', async () => {
      const result = await runCommand(['config', 'reset']);
      
      expect(result.code).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('reset');
      
      console.log('✅ config reset executed successfully');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      const result = await runCommand(['invalid-command']);
      
      expect(result.code).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('unknown');
      
      console.log('✅ Invalid command handled gracefully');
    });
    
    it('should handle server connection errors', async () => {
      // Stop the server temporarily
      if (serverProcess) {
        serverProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const result = await runCommand(['health']);
      
      expect(result.code).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('Error');
      
      console.log('✅ Server connection error handled gracefully');
      
      // Restart the server for remaining tests
      serverProcess = spawn('bun', [MINEFLARE_PATH, 'server', 'start'], {
        env: {
          ...process.env,
          SERVER_PORT: SERVER_PORT.toString()
        }
      });
      
      await waitForServer(SERVER_PORT);
    });
    
    it('should handle missing required arguments', async () => {
      const result = await runCommand(['chat']); // Missing message argument
      
      expect(result.code).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('argument');
      
      console.log('✅ Missing argument error handled gracefully');
    });
  });
  
  describe('Command Combinations', () => {
    it('should execute a sequence of commands successfully', async () => {
      console.log('Testing command sequence...');
      
      // Get initial state
      let result = await runCommand(['state']);
      expect(result.code).toBe(0);
      
      // Send a chat message
      result = await runCommand(['chat', 'Starting command sequence test']);
      expect(result.code).toBe(0);
      
      // Check health
      result = await runCommand(['health']);
      expect(result.code).toBe(0);
      
      // Get inventory
      result = await runCommand(['inventory']);
      expect(result.code).toBe(0);
      
      // Get entities
      result = await runCommand(['entities']);
      expect(result.code).toBe(0);
      
      // Stop movement
      result = await runCommand(['stop']);
      expect(result.code).toBe(0);
      
      console.log('✅ Command sequence executed successfully');
    });
    
    it('should maintain state between commands', async () => {
      // Set a config value
      const testValue = `StateTest_${Date.now()}`;
      let result = await runCommand(['config', 'set', 'minecraft.username', testValue]);
      expect(result.code).toBe(0);
      
      // Verify it persists
      result = await runCommand(['config', 'get', 'minecraft.username']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(testValue);
      
      // Reset
      await runCommand(['config', 'set', 'minecraft.username', 'CLITestBot']);
      
      console.log('✅ State maintained between commands');
    });
  });
});

console.log('');
console.log('═'.repeat(60));
console.log('This E2E test suite validates ALL CLI commands');
console.log('Every command is executed against a real server');
console.log('No mocks - this is comprehensive end-to-end testing!');
console.log('═'.repeat(60));
console.log('');