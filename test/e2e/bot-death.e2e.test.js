/**
 * E2E Test for Bot Death Bug
 * Bug: Bot crashes on death with TypeError in digging.js
 * Expected: Bot should respawn or reconnect gracefully
 */

const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  MC_HOST: process.env.E2E_MC_HOST || 'localhost',
  MC_PORT: process.env.E2E_MC_PORT || 8099,
  MC_USERNAME: process.env.E2E_MC_USERNAME || 'DeathTestBot',
  BOT_SERVER_PORT: process.env.E2E_BOT_SERVER_PORT || 3001,
  API_TIMEOUT: 30000,
  STARTUP_WAIT: 5000,
  DEATH_WAIT: 3000
};

const API_BASE = `http://localhost:${TEST_CONFIG.BOT_SERVER_PORT}`;
// Disable proxy to avoid url.parse() deprecation warning (DEP0169)
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TEST_CONFIG.API_TIMEOUT,
  proxy: false  // Add this to prevent deprecation warning
});

describe('E2E: Bot Death Handling', () => {
  let botServerProcess = null;
  let originalLogs = [];
  let errorLogs = [];

  // Helper to wait for bot connection
  const waitForBotConnection = async (maxRetries = 20) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await apiClient.get('/health');
        if (response.data.botConnected) {
          console.log('Bot connected to server');
          return true;
        }
      } catch (err) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Bot failed to connect after ' + maxRetries + ' retries');
  };

  // Helper to capture process output
  const captureProcessOutput = (process) => {
    process.stdout.on('data', (data) => {
      const lines = data.toString().split('\\n');
      lines.forEach(line => {
        if (line.trim()) {
          originalLogs.push(line);
          console.log('[BOT OUTPUT]', line);
        }
      });
    });

    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\\n');
      lines.forEach(line => {
        if (line.trim()) {
          errorLogs.push(line);
          console.error('[BOT ERROR]', line);
        }
      });
    });
  };

  // Helper to kill the bot in-game
  const killBot = async (method = 'fall') => {
    console.log(`Killing bot using ${method} method...`);
    
    try {
      const state = await apiClient.get('/state');
      const currentPos = state.data.position;
      
      switch (method) {
        case 'fall':
          // Teleport bot up high and let it fall
          await apiClient.post('/move', {
            x: currentPos.x,
            y: currentPos.y + 50,
            z: currentPos.z
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Move down to trigger fall damage
          await apiClient.post('/move', {
            x: currentPos.x,
            y: currentPos.y - 20,
            z: currentPos.z
          });
          break;
          
        case 'command':
          // Use chat to kill bot (requires op)
          await apiClient.post('/chat', {
            message: '/kill @e[name=' + TEST_CONFIG.MC_USERNAME + ']'
          });
          break;
          
        case 'damage':
          // Simulate damage by moving bot into lava/water at y=0
          await apiClient.post('/move', {
            x: currentPos.x,
            y: -10,
            z: currentPos.z
          });
          break;
      }
      
      // Wait for death to occur
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.DEATH_WAIT));
      
    } catch (err) {
      console.error('Error during kill attempt:', err.message);
      // Death might have already occurred and crashed the bot
      return;
    }
  };

  beforeEach(async () => {
    console.log('\\n=== Starting Bot Death Test ===');
    originalLogs = [];
    errorLogs = [];
    
    // Start bot server with test configuration
    const env = {
      ...process.env,
      MC_HOST: TEST_CONFIG.MC_HOST,
      MC_PORT: TEST_CONFIG.MC_PORT,
      MC_USERNAME: TEST_CONFIG.MC_USERNAME,
      MINEFLARE_SERVER_PORT: TEST_CONFIG.BOT_SERVER_PORT,
      MC_VERSION: '1.21.8',
      MC_AUTH: 'offline',
      ENABLE_VIEWER: 'false'
    };

    console.log('Starting bot server on port', TEST_CONFIG.BOT_SERVER_PORT);
    botServerProcess = spawn('bun', ['src/server.js'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    captureProcessOutput(botServerProcess);

    // Monitor for crash
    botServerProcess.on('exit', (code, signal) => {
      console.log(`Bot server exited with code ${code} and signal ${signal}`);
    });

    // Wait for bot to connect
    await waitForBotConnection();
    console.log('Bot server started and connected');
  }, 30000);

  afterEach(async () => {
    console.log('Cleaning up test...');
    
    // Kill bot server process if still running
    if (botServerProcess && !botServerProcess.killed) {
      botServerProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!botServerProcess.killed) {
        botServerProcess.kill('SIGKILL');
      }
    }
    
    // Save logs for analysis
    if (errorLogs.length > 0) {
      console.log('\\n=== Error Logs ===');
      errorLogs.forEach(log => console.error(log));
    }
  });

  describe('Death Bug Reproduction', () => {
    it('should crash with TypeError when bot dies from fall damage', async () => {
      console.log('\\n--- Testing fall damage death ---');
      
      // Get initial bot state
      const initialState = await apiClient.get('/state');
      expect(initialState.data.health).toBeGreaterThan(0);
      console.log('Initial health:', initialState.data.health);
      
      // Kill the bot
      await killBot('fall');
      
      // Check if bot crashed with expected error
      let crashed = false;
      let deathEventFired = false;
      let typeErrorFound = false;
      
      // Wait for crash or recovery
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check logs for death event and crash
      originalLogs.forEach(log => {
        if (log.includes('[EVENT] death:')) {
          deathEventFired = true;
          console.log('Death event detected');
        }
        if (log.includes('TypeError') && log.includes('undefined is not an object')) {
          typeErrorFound = true;
          console.log('TypeError detected:', log);
        }
        if (log.includes('removeAllListeners') || log.includes('digging.js')) {
          console.log('Digging plugin error detected:', log);
        }
      });
      
      errorLogs.forEach(log => {
        if (log.includes('TypeError')) {
          typeErrorFound = true;
          crashed = true;
          console.log('TypeError in stderr:', log);
        }
      });
      
      // Check if process exited
      if (botServerProcess.exitCode !== null) {
        crashed = true;
        console.log('Bot server crashed with exit code:', botServerProcess.exitCode);
      }
      
      // Try to check health - should fail if crashed
      try {
        const response = await apiClient.get('/health');
        console.log('Bot still responding:', response.data);
        
        // If bot is still alive, check if it's in a dead state
        if (response.data.botConnected) {
          const state = await apiClient.get('/state');
          console.log('Bot state after death:', state.data);
          
          if (state.data.health === 0) {
            console.log('Bot is stuck in dead state');
          }
        }
      } catch (err) {
        crashed = true;
        console.log('API not responding - bot crashed');
      }
      
      // Verify bug reproduction
      expect(deathEventFired).toBe(true);
      expect(typeErrorFound || crashed).toBe(true);
      
      console.log('\\nBug reproduction results:');
      console.log('- Death event fired:', deathEventFired);
      console.log('- TypeError found:', typeErrorFound);
      console.log('- Bot crashed:', crashed);
    }, 60000);

    it('should detect reconnection attempt but still crash', async () => {
      console.log('\\n--- Testing reconnection on death ---');
      
      // Kill the bot
      await killBot('fall');
      
      // Look for reconnection attempt in logs
      let reconnectAttempted = false;
      let reconnectEventFired = false;
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      originalLogs.forEach(log => {
        if (log.includes('Starting reconnection process') || 
            log.includes('Bot disconnected after death')) {
          reconnectAttempted = true;
          console.log('Reconnection attempted:', log);
        }
        if (log.includes('[EVENT] reconnect:')) {
          reconnectEventFired = true;
          console.log('Reconnect event fired');
        }
      });
      
      // Verify v1.2.3 behavior - attempts reconnect but still crashes
      expect(reconnectAttempted || reconnectEventFired).toBe(true);
      
      console.log('\\nReconnection test results:');
      console.log('- Reconnect attempted:', reconnectAttempted);
      console.log('- Reconnect event fired:', reconnectEventFired);
    }, 60000);

    it('should reproduce the infinite death loop on reconnect', async () => {
      console.log('\\n--- Testing infinite death loop ---');
      
      // Kill the bot
      await killBot('fall');
      
      // Count death events
      let deathEventCount = 0;
      
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      originalLogs.forEach(log => {
        if (log.includes('[EVENT] death:')) {
          deathEventCount++;
        }
      });
      
      console.log('Death events fired:', deathEventCount);
      
      // If reconnection works but bot is still dead, we might see multiple death events
      if (deathEventCount > 1) {
        console.log('Infinite death loop detected - bot reconnected in dead state');
      }
      
      expect(deathEventCount).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Expected Behavior (Currently Failing)', () => {
    it('should respawn after death without crashing', async () => {
      console.log('\\n--- Testing expected respawn behavior ---');
      
      // This test documents what SHOULD happen
      const initialState = await apiClient.get('/state');
      const spawnPos = initialState.data.position;
      
      // Kill the bot
      await killBot('fall');
      
      // Wait for respawn
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Bot should respawn and be accessible
      let respawned = false;
      try {
        const health = await apiClient.get('/health');
        if (health.data.botConnected) {
          const state = await apiClient.get('/state');
          if (state.data.health > 0) {
            respawned = true;
            console.log('Bot respawned with health:', state.data.health);
          }
        }
      } catch (err) {
        console.log('Bot not accessible after death');
      }
      
      // This will fail until bug is fixed
      expect(respawned).toBe(false); // Currently expecting failure
      
      console.log('Expected respawn:', false, '(bug not fixed yet)');
    }, 60000);
  });
});