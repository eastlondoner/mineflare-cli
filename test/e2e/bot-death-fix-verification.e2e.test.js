/**
 * E2E Test to Verify Bot Death Bug Fix
 * Confirms that the death handling implementation correctly handles:
 * 1. Safe digging cleanup without TypeError
 * 2. Automatic respawn after death
 * 3. No death loops
 * 4. Proper error recovery
 */

const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000
});

describe('E2E: Bot Death Fix Verification', () => {
  
  // Helper to wait for condition
  const waitFor = async (condition, timeout = 10000, interval = 500) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await condition()) return true;
      } catch (err) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
  };

  // Helper to get events since timestamp
  const getEventsSince = async (timestamp) => {
    try {
      const response = await apiClient.get(`/events?since=${timestamp}`);
      return response.data.events || [];
    } catch (err) {
      return [];
    }
  };

  describe('Death Handling Verification', () => {
    
    it('should handle bot death without crashing (no TypeError)', async () => {
      console.log('\\n=== Verifying Death Handling Fix ===');
      const testStartTime = Date.now();
      
      // Ensure bot is connected
      const initialHealth = await apiClient.get('/health');
      expect(initialHealth.data.botConnected).toBe(true);
      console.log('Bot connected initially');
      
      // Get initial state
      const initialState = await apiClient.get('/state');
      const startHealth = initialState.data.health;
      const startPos = initialState.data.position;
      console.log(`Initial health: ${startHealth}, position:`, startPos);
      
      // Start digging to ensure digging state is active (to test cleanup)
      console.log('Starting digging to test cleanup on death...');
      try {
        await apiClient.post('/dig', {
          x: Math.floor(startPos.x),
          y: Math.floor(startPos.y - 1),
          z: Math.floor(startPos.z)
        });
      } catch (err) {
        console.log('Dig command sent (may fail if no block)');
      }
      
      // Kill the bot using chat command
      console.log('Sending kill command...');
      await apiClient.post('/chat', { 
        message: `/kill @e[type=player,name=${initialState.data.username || 'ConfigBot'}]` 
      });
      
      // Wait for death event
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get events to check what happened
      const events = await getEventsSince(testStartTime);
      console.log(`Events received: ${events.length}`);
      
      // Look for death and respawn events
      const deathEvent = events.find(e => e.type === 'death');
      const respawnAttempt = events.find(e => e.type === 'respawn_attempt');
      const respawnSuccess = events.find(e => e.type === 'respawn_success');
      const errorEvent = events.find(e => e.type === 'error' && e.data.message && 
        (e.data.message.includes('removeAllListeners') || e.data.message.includes('undefined')));
      
      console.log('Death event found:', !!deathEvent);
      console.log('Respawn attempt found:', !!respawnAttempt);
      console.log('Respawn success found:', !!respawnSuccess);
      console.log('TypeError found:', !!errorEvent);
      
      // Verify no TypeError occurred
      expect(errorEvent).toBeUndefined();
      
      // Verify death was detected
      expect(deathEvent).toBeDefined();
      
      // Wait for respawn
      const respawned = await waitFor(async () => {
        try {
          const state = await apiClient.get('/state');
          return state.data.health > 0;
        } catch {
          return false;
        }
      }, 10000);
      
      // Check final state
      const finalHealth = await apiClient.get('/health');
      console.log('Final bot connection status:', finalHealth.data.botConnected);
      
      // Verify bot is still connected and not crashed
      expect(finalHealth.data.botConnected).toBe(true);
      
      // If respawned, verify health is restored
      if (respawned) {
        const finalState = await apiClient.get('/state');
        console.log('Bot respawned with health:', finalState.data.health);
        expect(finalState.data.health).toBeGreaterThan(0);
      }
      
      console.log('\\n✅ Death handling fix verified - No TypeError, bot still operational');
    }, 30000);

    it('should respawn successfully after death', async () => {
      console.log('\\n=== Testing Automatic Respawn ===');
      const testStartTime = Date.now();
      
      // Get initial state
      const initialState = await apiClient.get('/state');
      console.log('Starting health:', initialState.data.health);
      
      if (initialState.data.health === 0) {
        console.log('Bot already dead, waiting for respawn...');
      } else {
        // Kill the bot
        console.log('Killing bot to test respawn...');
        await apiClient.post('/chat', { 
          message: `/kill @e[type=player,name=${initialState.data.username || 'ConfigBot'}]` 
        });
        
        // Wait for death
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Wait for respawn with timeout
      const respawned = await waitFor(async () => {
        try {
          const state = await apiClient.get('/state');
          return state.data.health > 0;
        } catch {
          return false;
        }
      }, 15000);
      
      expect(respawned).toBe(true);
      
      if (respawned) {
        const newState = await apiClient.get('/state');
        console.log('Respawned with health:', newState.data.health);
        console.log('Respawn position:', newState.data.position);
        
        // Check for respawn success event
        const events = await getEventsSince(testStartTime);
        const respawnEvent = events.find(e => e.type === 'respawn_success');
        
        expect(respawnEvent).toBeDefined();
        console.log('\\n✅ Automatic respawn verified');
      } else {
        console.log('❌ Respawn did not occur within timeout');
      }
    }, 30000);

    it('should not enter death loop after respawning', async () => {
      console.log('\\n=== Testing Death Loop Prevention ===');
      const testStartTime = Date.now();
      
      // Ensure bot is alive first
      const state = await apiClient.get('/state');
      if (state.data.health === 0) {
        console.log('Waiting for bot to respawn first...');
        await waitFor(async () => {
          const s = await apiClient.get('/state');
          return s.data.health > 0;
        }, 10000);
      }
      
      // Kill bot once
      console.log('Killing bot...');
      await apiClient.post('/chat', { 
        message: `/kill @e[type=player,name=${state.data.username || 'ConfigBot'}]` 
      });
      
      // Wait for death and respawn cycle
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Count death events
      const events = await getEventsSince(testStartTime);
      const deathEvents = events.filter(e => e.type === 'death');
      const respawnEvents = events.filter(e => e.type === 'respawn_success');
      
      console.log(`Death events: ${deathEvents.length}`);
      console.log(`Respawn events: ${respawnEvents.length}`);
      
      // Should only have one death, not a loop
      expect(deathEvents.length).toBeLessThanOrEqual(2); // Allow for one retry
      
      // Check bot is still responsive
      const finalHealth = await apiClient.get('/health');
      expect(finalHealth.data.botConnected).toBe(true);
      
      console.log('\\n✅ No death loop detected');
    }, 30000);

    it('should handle fall damage death correctly', async () => {
      console.log('\\n=== Testing Fall Damage Death Handling ===');
      
      // Get current state
      const state = await apiClient.get('/state');
      const pos = state.data.position;
      const startHealth = state.data.health;
      
      if (startHealth === 0) {
        console.log('Bot dead, waiting for respawn...');
        await waitFor(async () => {
          const s = await apiClient.get('/state');
          return s.data.health > 0;
        }, 10000);
      }
      
      console.log('Teleporting bot up for fall damage test...');
      
      // Move bot up high
      await apiClient.post('/move', {
        x: pos.x,
        y: pos.y + 40,
        z: pos.z,
        sprint: false
      });
      
      // Wait for movement
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Stop movement and let fall
      await apiClient.post('/stop');
      console.log('Bot falling...');
      
      // Wait for fall and potential death
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Check state after fall
      const afterFall = await apiClient.get('/state');
      console.log(`Health after fall: ${afterFall.data.health} (was ${startHealth})`);
      
      // If bot died from fall
      if (afterFall.data.health === 0) {
        console.log('Bot died from fall damage, checking respawn...');
        
        // Wait for respawn
        const respawned = await waitFor(async () => {
          try {
            const s = await apiClient.get('/state');
            return s.data.health > 0;
          } catch {
            return false;
          }
        }, 10000);
        
        expect(respawned).toBe(true);
        
        if (respawned) {
          console.log('\\n✅ Fall damage death handled correctly');
        }
      } else if (afterFall.data.health < startHealth) {
        console.log('\\n✅ Bot took fall damage but survived');
      } else {
        console.log('\\n✅ Bot survived fall without damage');
      }
      
      // Verify bot is still connected
      const finalHealth = await apiClient.get('/health');
      expect(finalHealth.data.botConnected).toBe(true);
    }, 30000);
  });
  
  describe('Error Recovery', () => {
    
    it('should recover from digging plugin errors', async () => {
      console.log('\\n=== Testing Digging Plugin Error Recovery ===');
      
      // This test verifies that even if the digging plugin error occurs,
      // the bot recovers gracefully
      
      const state = await apiClient.get('/state');
      const pos = state.data.position;
      
      // Start digging multiple blocks rapidly
      console.log('Starting rapid digging to stress test...');
      const digPromises = [];
      
      for (let i = 0; i < 5; i++) {
        digPromises.push(
          apiClient.post('/dig', {
            x: Math.floor(pos.x + i),
            y: Math.floor(pos.y - 1),
            z: Math.floor(pos.z)
          }).catch(() => {})
        );
      }
      
      // Don't wait for digging to complete
      
      // Kill bot while digging
      console.log('Killing bot during dig operations...');
      await apiClient.post('/chat', { 
        message: `/kill @e[type=player,name=${state.data.username || 'ConfigBot'}]` 
      });
      
      // Wait for potential crash
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check bot is still operational
      try {
        const health = await apiClient.get('/health');
        expect(health.data.botConnected).toBe(true);
        console.log('\\n✅ Bot recovered from digging plugin stress test');
      } catch (err) {
        console.log('❌ Bot crashed during digging plugin stress test');
        throw err;
      }
    }, 30000);
  });
});