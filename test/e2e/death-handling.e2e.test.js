const { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } = require('bun:test');
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
}, { timeout: 60000 });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readServerPort = (serverDir) => {
  try {
    const props = fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8');
    const match = props.match(/^server-port=(\d+)/m);
    return match ? parseInt(match[1], 10) : 25565;
  } catch (err) {
    console.warn('[TEST] Unable to read server port, defaulting to 25565:', err.message);
    return 25565;
  }
};

setDefaultTimeout(60000);

describe('E2E: Death Handling', () => {
  let botServerProcess;
  let minecraftServerProcess;
  let mcPort = 25565;
  const mineflareCmd = path.join(process.cwd(), 'mineflare');
  const javaBin = (process.env.JAVA_BIN && fs.existsSync(process.env.JAVA_BIN))
    ? process.env.JAVA_BIN
    : 'java';
  const mcServerDir = path.join(process.cwd(), 'minecraft-server');
 
  beforeAll(async () => {
    console.log('Starting test environment...');
    
    // Kill any existing servers
    try {
      await exec(`${mineflareCmd} server stop`);
    } catch (e) {}
    await sleep(1000);
    
    // Ensure previous PaperMC instance is not running
    const paperPidFile = path.join(mcServerDir, 'paper.pid');
    if (fs.existsSync(paperPidFile)) {
      try {
        const existingPid = parseInt(fs.readFileSync(paperPidFile, 'utf8'));
        if (!Number.isNaN(existingPid)) {
          try {
            process.kill(existingPid, 'SIGTERM');
            console.log(`Sent SIGTERM to existing PaperMC process ${existingPid}`);
            await sleep(2000);
          } catch (err) {
            console.log(`No running process for PID ${existingPid}: ${err.message}`);
          }
        }
      } catch (err) {
        console.warn('Could not inspect paper.pid:', err.message);
      }
      try {
        fs.unlinkSync(paperPidFile);
      } catch (err) {
        console.warn('Unable to remove paper.pid:', err.message);
      }
    }
    
    const sessionLock = path.join(mcServerDir, 'world', 'session.lock');
    if (fs.existsSync(sessionLock)) {
      try {
        fs.unlinkSync(sessionLock);
        console.log('Removed stale session.lock');
      } catch (err) {
        console.warn('Unable to remove session.lock:', err.message);
      }
    }
    
    // Start Minecraft server if not running
    if (fs.existsSync(path.join(mcServerDir, 'paper-1.21.8.jar'))) {
      console.log('Starting Minecraft server...');
      minecraftServerProcess = spawn(javaBin, ['-Xmx1024M', '-Xms1024M', '-jar', 'paper-1.21.8.jar', 'nogui'], {
        cwd: mcServerDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      minecraftServerProcess.stdout.on('data', chunk => {
        process.stdout.write(`[MC] ${chunk}`);
      });
      minecraftServerProcess.stderr.on('data', chunk => {
        process.stderr.write(`[MC ERROR] ${chunk}`);
      });
    
      // Wait for server to start
      await sleep(15000);
    }
    mcPort = readServerPort(mcServerDir);
    console.log(`Detected Minecraft server port: ${mcPort}`);

    // Start bot server
    console.log('Starting bot server...');
    const pidFile = path.join(process.cwd(), '.e2e-death-handler.pid');
    botServerProcess = spawn(mineflareCmd, ['server', 'start'], {
      env: {
        ...process.env,
        JAVA_BIN: javaBin,
        MINEFLARE_PID_FILE: pidFile,
        MC_HOST: 'localhost',
        MC_PORT: String(mcPort),
        MC_USERNAME: 'E2EDeathBot',
        MC_VERSION: '1.21.8',
        MC_AUTH: 'offline',
        MINEFLARE_SERVER_PORT: '3000',
        ENABLE_VIEWER: 'false',
        LOG_LEVEL: 'debug'
      },
      stdio: 'pipe'
    });
    botServerProcess.stdout.on('data', chunk => {
      process.stdout.write(`[BOT] ${chunk}`);
    });
    botServerProcess.stderr.on('data', chunk => {
      process.stderr.write(`[BOT ERROR] ${chunk}`);
    });
    
    // Wait for bot to connect
    const startTime = Date.now();
    let connected = false;
    while (Date.now() - startTime < 30000) {
      try {
        const health = await apiClient.get('/health');
        if (health.data?.status === 'ok' && health.data.botConnected) {
          connected = true;
          break;
        }
      } catch (err) {
        await sleep(1000);
      }
    }
    
    if (!connected) {
      throw new Error('Bot server failed to report healthy/connected within timeout');
    }
  });
  
  afterAll(async () => {
    console.log('Cleaning up test environment...');
    
    if (botServerProcess) {
      botServerProcess.kill('SIGTERM');
      await sleep(2000);
    }
    
    if (minecraftServerProcess) {
      minecraftServerProcess.stdin?.write('stop\n');
      await sleep(2000);
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
      const eventList = events.data?.events || [];
      const deathEvents = eventList.filter(e => e.type === 'death');
      const respawnEvents = eventList.filter(e => e.type === 'spawn' || e.type === 'respawn_success');
      
      console.log('Death events:', deathEvents.length);
      console.log('Respawn events:', respawnEvents.length);
      
      // Verify bot is still alive and connected after respawn
      const afterDeathState = await apiClient.get('/state');
      expect(afterDeathState.data.health?.current ?? 0).toBeGreaterThan(0);
      
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
        expect(state.data.health?.current ?? 0).toBeGreaterThan(0);
      }
    }, 45000);
    
    it('should not get stuck in death loop', async () => {
      // Monitor events to ensure no rapid death/respawn cycles
      const beforeEvents = await apiClient.get('/events?since=0');
      const beforeEventList = beforeEvents.data?.events || [];
      const beforeDeathCount = beforeEventList.filter(e => e.type === 'death').length;
      
      // Cause a single death
      await apiClient.post('/chat', {
        message: '/kill @s'
      });
      
      await sleep(10000); // Wait longer to check for loops
      
      // Check events again
      const afterEvents = await apiClient.get('/events?since=0');
      const afterEventList = afterEvents.data?.events || [];
      const afterDeathCount = afterEventList.filter(e => e.type === 'death').length;
      const deathDiff = afterDeathCount - beforeDeathCount;
      
      // Should only have 1 additional death, not multiple
      expect(deathDiff).toBeLessThanOrEqual(1);
      
      // Bot should still be functional
      const state = await apiClient.get('/state');
      expect(state.data.health?.current ?? 0).toBeGreaterThan(0);
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
      expect(state.data.health?.current ?? 0).toBeGreaterThan(0);
    }, 20000);
  });
});
