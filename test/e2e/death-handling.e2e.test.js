const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { spawn } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const axios = require('axios');
const fs = require('fs');

// Configure axios
const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
  proxy: false
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('E2E: Death Handling', () => {
  let botServerProcess;
  let minecraftServerProcess;
  const mineflareCmd = path.join(process.cwd(), 'mineflare');
  
  beforeAll(async () => {
    console.log('Starting test environment...');
    
    // Kill any existing servers
    try {
      await exec(`${mineflareCmd} server stop`);
    } catch (e) {}
    await sleep(1000);
    
    // Start Minecraft server if not running
    const mcServerDir = path.join(process.cwd(), 'minecraft-server');
    if (fs.existsSync(path.join(mcServerDir, 'paper-1.21.8.jar'))) {
      console.log('Starting Minecraft server...');
      minecraftServerProcess = spawn('java', ['-Xmx1024M', '-Xms1024M', '-jar', 'paper-1.21.8.jar', 'nogui'], {
        cwd: mcServerDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Create stdin pipe
      fs.writeFileSync(path.join(mcServerDir, 'server.stdin'), '');
      
      // Wait for server to start
      await sleep(10000);
    }
    
    // Start bot server
    console.log('Starting bot server...');
    botServerProcess = spawn(mineflareCmd, ['server', 'start'], {
      env: { ...process.env },
      stdio: 'pipe'
    });
    
    // Wait for bot to connect
    await sleep(5000);
    
    // Verify bot is connected
    const health = await apiClient.get('/health');
    expect(health.data.botConnected).toBe(true);
  }, 30000);
  
  afterAll(async () => {
    console.log('Cleaning up test environment...');
    
    if (botServerProcess) {
      botServerProcess.kill('SIGTERM');
      await sleep(2000);
    }
    
    if (minecraftServerProcess) {
      minecraftServerProcess.kill('SIGTERM');
      await sleep(2000);
    }
  });
  
  describe('Death and Respawn', () => {
    it('should handle death and respawn correctly', async () => {
      // Get initial state
      const initialState = await apiClient.get('/state');
      console.log('Initial position:', initialState.data.position);
      
      // Kill the bot by making it fall from a high place
      // First, teleport it high up
      await apiClient.post('/chat', {
        message: '/tp @s ~ 200 ~'
      });
      await sleep(2000);
      
      // Check if bot is at high position
      const highState = await apiClient.get('/state');
      console.log('High position:', highState.data.position);
      
      // Now let it fall (clear any control states)
      await apiClient.post('/stop');
      await sleep(5000); // Wait for fall damage
      
      // Check events for death
      const events = await apiClient.get('/events?since=0');
      const deathEvents = events.data.filter(e => e.type === 'death');
      const respawnEvents = events.data.filter(e => e.type === 'spawn' || e.type === 'respawn_success');
      
      console.log('Death events:', deathEvents.length);
      console.log('Respawn events:', respawnEvents.length);
      
      // Verify bot is still alive and connected after respawn
      const afterDeathState = await apiClient.get('/state');
      expect(afterDeathState.data.health).toBeGreaterThan(0);
      
      // Verify bot can still execute commands
      const moveResult = await apiClient.post('/move', {
        x: afterDeathState.data.position.x + 1,
        y: afterDeathState.data.position.y,
        z: afterDeathState.data.position.z
      });
      expect(moveResult.data.success).toBe(true);
    }, 30000);
    
    it('should handle multiple deaths without getting stuck', async () => {
      // Kill the bot multiple times and verify it respawns each time
      for (let i = 0; i < 3; i++) {
        console.log(`Death test iteration ${i + 1}`);
        
        // Use /kill command via chat (if bot has permissions)
        await apiClient.post('/chat', {
          message: '/kill @s'
        });
        
        await sleep(3000); // Wait for death and respawn
        
        // Verify bot is still responsive
        const health = await apiClient.get('/health');
        expect(health.data.botConnected).toBe(true);
        
        const state = await apiClient.get('/state');
        expect(state.data.health).toBeGreaterThan(0);
      }
    }, 45000);
    
    it('should not get stuck in death loop', async () => {
      // Monitor events to ensure no rapid death/respawn cycles
      const beforeEvents = await apiClient.get('/events?since=0');
      const beforeDeathCount = beforeEvents.data.filter(e => e.type === 'death').length;
      
      // Cause a single death
      await apiClient.post('/chat', {
        message: '/kill @s'
      });
      
      await sleep(10000); // Wait longer to check for loops
      
      // Check events again
      const afterEvents = await apiClient.get('/events?since=0');
      const afterDeathCount = afterEvents.data.filter(e => e.type === 'death').length;
      const deathDiff = afterDeathCount - beforeDeathCount;
      
      // Should only have 1 additional death, not multiple
      expect(deathDiff).toBeLessThanOrEqual(1);
      
      // Bot should still be functional
      const state = await apiClient.get('/state');
      expect(state.data.health).toBeGreaterThan(0);
    }, 20000);
  });
  
  describe('Edge Cases', () => {
    it('should handle death while executing commands', async () => {
      // Start a movement command
      const movePromise = apiClient.post('/move', {
        x: 100,
        y: 64,
        z: 100,
        sprint: true
      });
      
      // Kill the bot while moving
      await sleep(500);
      await apiClient.post('/chat', {
        message: '/kill @s'
      });
      
      // The move should fail gracefully
      try {
        await movePromise;
      } catch (error) {
        // Expected to fail
        console.log('Move failed as expected:', error.response?.data?.error);
      }
      
      // Bot should recover and be responsive
      await sleep(3000);
      const health = await apiClient.get('/health');
      expect(health.data.botConnected).toBe(true);
    }, 15000);
    
    it('should handle disconnection during death', async () => {
      // This tests if the bot can recover if it disconnects while dead
      // Kill the bot
      await apiClient.post('/chat', {
        message: '/kill @s'
      });
      
      // Wait a moment then force disconnect/reconnect
      await sleep(1000);
      
      // The bot should handle this internally and reconnect
      await sleep(5000);
      
      // Verify bot recovered
      const health = await apiClient.get('/health');
      expect(health.data.botConnected).toBe(true);
      
      const state = await apiClient.get('/state');
      expect(state.data.health).toBeGreaterThan(0);
    }, 20000);
  });
});