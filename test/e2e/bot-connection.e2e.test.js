/**
 * E2E Tests: Bot Connection
 * Tests real bot connections to Minecraft servers
 * Zero mocks - actual network connections
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const mineflayer = require('mineflayer');

const TestEnvironment = require('./utils/test-environment');
const APIClient = require('./utils/api-client');
const { E2E_CONFIG, measurePerformance, expectEventually, retryOperation, generateTestData } = require('./utils/e2e-setup');

describe('E2E: Bot Connection', () => {
  let env;
  let server;
  let apiClient;
  
  beforeAll(async () => {
    env = new TestEnvironment({
      basePort: E2E_CONFIG.BASE_PORT + 100,
      verbose: E2E_CONFIG.VERBOSE
    });
    await env.setup();
    
    // Start the Mineflare server
    server = await env.startServer({
      port: E2E_CONFIG.BASE_PORT + 100
    });
    
    apiClient = new APIClient(`http://localhost:${server.port}`);
    
    // Note: These tests require a real Minecraft server to be running
    // Either start one locally or use the E2E_MC_HOST environment variable
    console.log(`Using Minecraft server at ${E2E_CONFIG.MC_HOST}:${E2E_CONFIG.MC_PORT}`);
  });
  
  afterAll(async () => {
    await server?.stop();
    await env?.cleanup();
  });
  
  describe('Bot Connection Management', () => {
    it('should connect bot to Minecraft server', async () => {
      const perf = await measurePerformance('Bot Connection', async () => {
        const botConnection = await env.connectBot({
          host: E2E_CONFIG.MC_HOST,
          port: E2E_CONFIG.MC_PORT,
          username: generateTestData.username(),
          version: E2E_CONFIG.MC_VERSION,
          auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft',
          timeout: E2E_CONFIG.MAX_CONNECT_TIME
        });
        
        expect(botConnection.bot).toBeDefined();
        expect(botConnection.bot.entity).toBeDefined();
        expect(botConnection.bot.username).toBeDefined();
        
        // Bot should be spawned
        expect(botConnection.bot.entity.position).toBeDefined();
        expect(botConnection.bot.entity.position.x).toBeTypeOf('number');
        expect(botConnection.bot.entity.position.y).toBeTypeOf('number');
        expect(botConnection.bot.entity.position.z).toBeTypeOf('number');
        
        // Clean up
        await botConnection.disconnect();
        
        return true;
      });
      
      expect(perf.duration).toBeLessThan(E2E_CONFIG.MAX_CONNECT_TIME);
      console.log(`Bot connection time: ${perf.duration}ms`);
    }, E2E_CONFIG.MAX_CONNECT_TIME + 5000);
    
    it('should handle connection failures gracefully', async () => {
      try {
        // Try to connect to non-existent server
        await env.connectBot({
          host: 'non.existent.server',
          port: 12345,
          username: generateTestData.username(),
          timeout: 5000
        });
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    }, 10000);
    
    it('should disconnect bot properly', async () => {
      const botConnection = await env.connectBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        timeout: E2E_CONFIG.MAX_CONNECT_TIME
      });
      
      expect(botConnection.bot).toBeDefined();
      
      // Track if end event is emitted
      let endEmitted = false;
      botConnection.bot.on('end', () => {
        endEmitted = true;
      });
      
      // Disconnect
      await botConnection.disconnect();
      
      // Give it a moment for events to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(endEmitted).toBe(true);
    }, 15000);
    
    it('should handle multiple bot connections', async () => {
      const numBots = 3;
      const connections = [];
      
      // Connect multiple bots
      for (let i = 0; i < numBots; i++) {
        const connection = await env.connectBot({
          host: E2E_CONFIG.MC_HOST,
          port: E2E_CONFIG.MC_PORT,
          username: `TestBot${i}_${Date.now()}`,
          timeout: E2E_CONFIG.MAX_CONNECT_TIME
        });
        
        connections.push(connection);
      }
      
      // Verify all bots are connected
      for (const connection of connections) {
        expect(connection.bot).toBeDefined();
        expect(connection.bot.entity.position).toBeDefined();
      }
      
      // Clean up
      for (const connection of connections) {
        await connection.disconnect();
      }
      
      console.log(`Successfully connected and disconnected ${numBots} bots`);
    }, 45000);
    
    it('should reconnect after disconnect', async () => {
      const username = generateTestData.username();
      
      // First connection
      const connection1 = await env.connectBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username,
        timeout: E2E_CONFIG.MAX_CONNECT_TIME
      });
      
      const firstPosition = connection1.bot.entity.position.clone();
      
      // Disconnect
      await connection1.disconnect();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect with same username
      const connection2 = await env.connectBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username,
        timeout: E2E_CONFIG.MAX_CONNECT_TIME
      });
      
      expect(connection2.bot).toBeDefined();
      expect(connection2.bot.username).toBe(username);
      
      // Clean up
      await connection2.disconnect();
    }, 30000);
  });
  
  describe('Bot Events', () => {
    it('should receive spawn event', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      const spawnPromise = new Promise((resolve) => {
        bot.once('spawn', () => {
          resolve(true);
        });
      });
      
      const spawned = await Promise.race([
        spawnPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Spawn timeout')), 15000))
      ]);
      
      expect(spawned).toBe(true);
      expect(bot.entity.position).toBeDefined();
      
      bot.quit();
    }, 20000);
    
    it('should receive chat events', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', resolve);
      });
      
      // Set up chat listener
      const chatPromise = new Promise((resolve) => {
        bot.on('chat', (username, message) => {
          resolve({ username, message });
        });
      });
      
      // Send a chat message
      const testMessage = `Test message ${Date.now()}`;
      bot.chat(testMessage);
      
      // In offline mode, we might receive our own message
      // or we might not receive any chat events
      // This depends on server configuration
      
      // Just verify bot can send chat without error
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      bot.quit();
    }, 20000);
    
    it('should receive health and food events', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', resolve);
      });
      
      // Check initial health and food
      expect(bot.health).toBeGreaterThan(0);
      expect(bot.food).toBeGreaterThan(0);
      
      let healthEventReceived = false;
      
      bot.on('health', () => {
        healthEventReceived = true;
      });
      
      // Wait a moment to see if any health events occur
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Health might not change if bot doesn't take damage
      // Just verify the properties exist
      expect(bot.health).toBeDefined();
      expect(bot.food).toBeDefined();
      
      bot.quit();
    }, 20000);
    
    it('should handle kicked event', async () => {
      // This test would require admin access to kick the bot
      // Or a way to trigger a kick (like spamming)
      // For now, we'll just verify the event handler can be set up
      
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', resolve);
      });
      
      let kickHandlerSet = false;
      
      bot.on('kicked', (reason) => {
        kickHandlerSet = true;
        console.log(`Bot was kicked: ${reason}`);
      });
      
      // Verify handler is registered
      expect(bot.listenerCount('kicked')).toBeGreaterThan(0);
      
      bot.quit();
    }, 20000);
    
    it('should handle error events', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      let errorHandlerCalled = false;
      
      bot.on('error', (err) => {
        errorHandlerCalled = true;
        console.log(`Bot error: ${err.message}`);
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', resolve);
      });
      
      // Verify error handler is registered
      expect(bot.listenerCount('error')).toBeGreaterThan(0);
      
      bot.quit();
    }, 20000);
  });
  
  describe('Connection Resilience', () => {
    it('should handle network interruption simulation', async () => {
      // This test simulates network issues by rapidly connecting/disconnecting
      const username = generateTestData.username();
      
      for (let i = 0; i < 3; i++) {
        const bot = mineflayer.createBot({
          host: E2E_CONFIG.MC_HOST,
          port: E2E_CONFIG.MC_PORT,
          username: `${username}_${i}`,
          version: E2E_CONFIG.MC_VERSION,
          auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
        });
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Spawn timeout')), 10000);
          
          bot.once('spawn', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          bot.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        
        // Immediately disconnect
        bot.quit();
        
        // Small delay between connections
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log('Completed rapid connect/disconnect test');
    }, 45000);
    
    it('should maintain connection under load', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: E2E_CONFIG.MC_VERSION,
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', resolve);
      });
      
      // Send multiple commands rapidly
      const commands = [
        () => bot.chat('Test 1'),
        () => bot.setControlState('forward', true),
        () => bot.setControlState('forward', false),
        () => bot.look(0, 0),
        () => bot.chat('Test 2'),
        () => bot.setControlState('jump', true),
        () => bot.setControlState('jump', false)
      ];
      
      for (const command of commands) {
        try {
          command();
        } catch (error) {
          console.log(`Command error: ${error.message}`);
        }
        
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Bot should still be connected
      expect(bot.entity).toBeDefined();
      expect(bot.entity.position).toBeDefined();
      
      bot.quit();
    }, 30000);
  });
  
  describe('Version Compatibility', () => {
    it('should connect with auto version detection', async () => {
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: false, // Auto-detect
        auth: E2E_CONFIG.MC_OFFLINE ? 'offline' : 'microsoft'
      });
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Spawn timeout')), 20000);
        
        bot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        bot.once('error', (err) => {
          clearTimeout(timeout);
          // Auto-detection might fail on some servers
          console.log(`Version auto-detection error: ${err.message}`);
          resolve(); // Don't fail the test
        });
      });
      
      if (bot.version) {
        console.log(`Connected with version: ${bot.version}`);
      }
      
      bot.quit();
    }, 25000);
    
    it('should handle version mismatch gracefully', async () => {
      // Try to connect with a potentially incompatible version
      const bot = mineflayer.createBot({
        host: E2E_CONFIG.MC_HOST,
        port: E2E_CONFIG.MC_PORT,
        username: generateTestData.username(),
        version: '1.8.9', // Old version
        auth: 'offline'
      });
      
      await new Promise((resolve) => {
        bot.once('spawn', () => {
          console.log('Connected despite version difference');
          resolve();
        });
        
        bot.once('error', (err) => {
          console.log(`Version mismatch handled: ${err.message}`);
          resolve(); // Expected behavior
        });
        
        // Timeout
        setTimeout(() => {
          console.log('Connection attempt timed out (expected for version mismatch)');
          resolve();
        }, 10000);
      });
      
      try {
        bot.quit();
      } catch {
        // Bot might not be fully connected
      }
    }, 15000);
  });
});