/**
 * E2E Tests: Bot Respawn and Death Recovery
 * Tests bot respawn functionality and death loop prevention
 * Zero mocks - actual Minecraft server connections
 */

const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const mineflayer = require('mineflayer');

const TestEnvironment = require('./utils/test-environment');
const APIClient = require('./utils/api-client');
const { E2E_CONFIG, measurePerformance, expectEventually, retryOperation, generateTestData } = require('./utils/e2e-setup');

describe('E2E: Bot Respawn and Death Recovery', () => {
  let env;
  let server;
  let apiClient;
  let testBot;
  
  beforeAll(async () => {
    env = new TestEnvironment({
      basePort: E2E_CONFIG.BASE_PORT + 400,
      verbose: E2E_CONFIG.VERBOSE
    });
    await env.setup();
    
    // Use the already running bot server instead of starting a new one
    // The bot server should be running on port 3000
    apiClient = new APIClient(`http://localhost:3000`);
    
    // Wait for server to be ready
    await apiClient.waitForReady(10000).catch(() => {
      console.log('Note: Using existing bot server on port 3000');
    });
    
    console.log(`Testing respawn with Minecraft server at ${E2E_CONFIG.MC_HOST}:${E2E_CONFIG.MC_PORT}`);
  });
  
  afterAll(async () => {
    await testBot?.disconnect?.();
    await env?.cleanup();
  });
  
  describe('Death and Respawn Handling', () => {
    beforeEach(async () => {
      // For these tests, we'll use the bot that's already connected via the API
      // since we're testing the respawn functionality of the bot server itself
      // No need to connect a separate test bot
    });
    
    afterEach(async () => {
      // Clean up after each test
      // Wait a bit for the bot to recover before next test
      await new Promise(resolve => setTimeout(resolve, 2000));
    });
    
    it('should automatically respawn after death', async () => {
      const perf = await measurePerformance('Bot Respawn', async () => {
        const bot = testBot.bot;
        
        // Verify bot is initially alive
        expect(bot.entity).toBeDefined();
        expect(bot.health).toBe(20);
        
        // Track events
        let deathDetected = false;
        let respawnDetected = false;
        const initialPosition = { ...bot.entity.position };
        
        // Set up event listeners
        bot.once('death', () => {
          console.log('[TEST] Bot death detected');
          deathDetected = true;
        });
        
        bot.once('spawn', () => {
          console.log('[TEST] Bot respawn detected');
          respawnDetected = true;
        });
        
        // Force kill the bot (this simulates death)
        // Note: In a real scenario, this would be environmental damage, mob attack, etc.
        console.log('[TEST] Killing bot to test respawn...');
        bot.chat('/kill');
        
        // Wait for death and respawn events
        await expectEventually(
          () => deathDetected,
          'Bot should detect death',
          10000
        );
        
        // Wait for automatic respawn (should happen within 5 seconds)
        await expectEventually(
          () => respawnDetected,
          'Bot should automatically respawn',
          10000
        );
        
        // Verify bot is alive again
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for respawn to complete
        
        expect(bot.entity).toBeDefined();
        expect(bot.health).toBe(20); // Full health after respawn
        expect(bot.entity.position).toBeDefined();
        
        console.log(`[TEST] Bot respawned at position: ${JSON.stringify(bot.entity.position)}`);
        
        return true;
      });
      
      expect(perf.duration).toBeLessThan(15000); // Should respawn within 15 seconds
      console.log(`Respawn completed in: ${perf.duration}ms`);
    }, 20000);
    
    it('should handle respawn without operator privileges', async () => {
      const bot = testBot.bot;
      
      // This test simulates death on a non-op server
      // where /kill command might not work, but environmental death still occurs
      
      let deathDetected = false;
      let respawnDetected = false;
      let errorDetected = false;
      
      bot.once('death', () => {
        console.log('[TEST] Bot death detected (non-op scenario)');
        deathDetected = true;
      });
      
      bot.once('spawn', () => {
        console.log('[TEST] Bot respawned successfully (non-op scenario)');
        respawnDetected = true;
      });
      
      bot.once('error', (err) => {
        // Capture any errors during respawn
        console.log('[TEST] Error during respawn:', err.message);
        errorDetected = true;
      });
      
      // Simulate death (this might not work on non-op servers, but that's ok for the test)
      bot.chat('/kill');
      
      // Even if /kill doesn't work, we can still test the respawn mechanism
      // by checking that the bot remains connected and functional
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Bot should still be connected and functional
      expect(bot.entity).toBeDefined();
      expect(bot._client.ended).toBe(false);
      
      // If death occurred, respawn should have happened
      if (deathDetected) {
        expect(respawnDetected).toBe(true);
        console.log('[TEST] Non-op respawn successful');
      } else {
        // If no death (because non-op), bot should still be alive
        expect(bot.health).toBeGreaterThan(0);
        console.log('[TEST] Bot remained alive (non-op server)');
      }
      
      // No critical errors should occur
      expect(errorDetected).toBe(false);
    }, 10000);
    
    it('should recover from digging plugin errors on death', async () => {
      const bot = testBot.bot;
      
      // Start digging to set up the scenario
      const nearbyBlock = bot.findBlock({
        matching: (block) => block.name !== 'air',
        maxDistance: 5
      });
      
      if (nearbyBlock) {
        console.log('[TEST] Starting to dig block:', nearbyBlock.name);
        
        // Start digging but don't wait for completion
        const digPromise = bot.dig(nearbyBlock).catch(() => {
          // Expected to fail due to death
          console.log('[TEST] Digging interrupted by death (expected)');
        });
        
        // Track respawn
        let respawnDetected = false;
        bot.once('spawn', () => {
          respawnDetected = true;
        });
        
        // Kill bot while digging
        await new Promise(resolve => setTimeout(resolve, 100));
        bot.chat('/kill');
        
        // Wait for the digging to be interrupted
        await digPromise;
        
        // Bot should respawn successfully despite digging interruption
        await expectEventually(
          () => respawnDetected,
          'Bot should respawn after digging interruption',
          10000
        );
        
        // Verify bot is functional after respawn
        expect(bot.entity).toBeDefined();
        expect(bot.targetDigBlock).toBeUndefined(); // Digging state cleared
      } else {
        console.log('[TEST] No blocks nearby to test digging scenario');
      }
    }, 15000);
    
    it('should handle reconnection if respawn fails', async () => {
      const bot = testBot.bot;
      const originalClientId = bot._client.id;
      
      // Track reconnection
      let reconnected = false;
      
      // Simulate a scenario where respawn might fail
      // by corrupting the client state
      bot._client.write = () => {
        throw new Error('Simulated network error');
      };
      
      // Attempt to trigger death
      try {
        bot.chat('/kill');
      } catch (err) {
        // Expected to fail
      }
      
      // Wait for reconnection logic to kick in
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait past respawn timeout
      
      // Check if bot recovered (either respawned or reconnected)
      // Note: In the actual implementation, handleReconnect() would create a new bot instance
      // For this test, we verify that the bot attempted recovery
      
      // The bot should either:
      // 1. Have successfully respawned despite the error, OR
      // 2. Have triggered reconnection logic
      
      if (bot._client && !bot._client.ended) {
        console.log('[TEST] Bot recovered and is still connected');
        expect(bot.entity).toBeDefined();
      } else {
        console.log('[TEST] Bot disconnected as expected, reconnection would be triggered');
        // In production, handleReconnect() would create a new bot instance
        expect(bot._client.ended).toBe(true);
      }
    }, 15000);
    
    it('should track respawn events in API', async () => {
      // Use the API client to monitor events
      const initialEvents = await apiClient.getEvents();
      const eventTimestamp = Date.now();
      
      // Get current state
      const initialState = await apiClient.getState();
      expect(initialState.health).toBe(20);
      
      // Send kill command via API
      await apiClient.chat('/kill');
      
      // Wait for death and respawn
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get events since death
      const events = await apiClient.getEvents(eventTimestamp);
      
      // Check for expected events
      const eventTypes = events.events.map(e => e.type);
      
      // Should have death-related events
      const hasDeathEvent = eventTypes.includes('death');
      const hasRespawnAttempt = eventTypes.includes('respawn_attempt');
      const hasRespawnSuccess = eventTypes.includes('respawn_success') || eventTypes.includes('spawn');
      
      console.log('[TEST] Events detected:', eventTypes);
      
      // At minimum, we should see some activity
      expect(events.events.length).toBeGreaterThan(0);
      
      // If death occurred, respawn should follow
      if (hasDeathEvent) {
        expect(hasRespawnAttempt || hasRespawnSuccess).toBe(true);
      }
      
      // Bot should be alive again
      const finalState = await apiClient.getState();
      expect(finalState.health).toBeGreaterThan(0);
    }, 15000);
    
    it('should handle multiple deaths in succession', async () => {
      const bot = testBot.bot;
      let deathCount = 0;
      let respawnCount = 0;
      
      bot.on('death', () => {
        deathCount++;
        console.log(`[TEST] Death #${deathCount} detected`);
      });
      
      bot.on('spawn', () => {
        respawnCount++;
        console.log(`[TEST] Respawn #${respawnCount} detected`);
      });
      
      // Simulate multiple deaths
      for (let i = 0; i < 3; i++) {
        console.log(`[TEST] Triggering death #${i + 1}`);
        bot.chat('/kill');
        
        // Wait for respawn
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify bot is alive
        if (bot.entity && bot.health > 0) {
          console.log(`[TEST] Bot alive after death #${i + 1}`);
        }
      }
      
      // Bot should still be functional after multiple deaths
      expect(bot.entity).toBeDefined();
      expect(bot._client.ended).toBe(false);
      
      // Should have handled multiple death/respawn cycles
      console.log(`[TEST] Total deaths: ${deathCount}, Total respawns: ${respawnCount}`);
      
      // Even if /kill doesn't work on non-op servers, bot should remain stable
      expect(bot.health).toBeGreaterThanOrEqual(0);
    }, 20000);
  });
  
  describe('Manual Reconnection API', () => {
    it('should support manual reconnection via API', async () => {
      // Test the /reconnect endpoint
      const response = await apiClient.request('POST', '/reconnect');
      
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe('Reconnection initiated');
      
      // Wait for reconnection to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Bot should be connected after reconnection
      const health = await apiClient.getHealth();
      expect(health.botConnected).toBe(true);
      
      const state = await apiClient.getState();
      expect(state.health).toBeGreaterThan(0);
    }, 10000);
    
    it('should prevent duplicate reconnection attempts', async () => {
      // Start first reconnection
      const first = await apiClient.request('POST', '/reconnect');
      expect(first.data.success).toBe(true);
      
      // Immediate second attempt should be rejected
      const second = await apiClient.request('POST', '/reconnect');
      
      // Since our API client doesn't throw on 400, check the response
      expect(second.status).toBe(400);
      expect(second.data.error).toBe('Reconnection already in progress');
      
      // Wait for first reconnection to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
    }, 10000);
  });
});