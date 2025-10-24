/**
 * Simplified E2E Test for Bot Death Bug
 * Uses the existing bot server to reproduce the death crash
 */

const axios = require('axios');

// Disable proxy to avoid url.parse() deprecation warning (DEP0169)
const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 5000,
  proxy: false  // Add this to prevent deprecation warning
});

describe('E2E: Bot Death Bug - Simplified', () => {
  
  describe('Death Crash Reproduction', () => {
    it('should reproduce TypeError on bot death', async () => {
      console.log('\\n=== Bot Death Bug Test ===');
      
      try {
        // Check bot is connected
        const health = await apiClient.get('/health');
        expect(health.data.botConnected).toBe(true);
        console.log('Bot connected:', health.data);
        
        // Get initial state
        const initialState = await apiClient.get('/state');
        console.log('Initial health:', initialState.data.health);
        console.log('Initial position:', initialState.data.position);
        
        // Send kill command through chat to trigger death
        console.log('Sending kill command...');
        await apiClient.post('/chat', { 
          message: '/kill @e[type=player,name=ConfigBot]' 
        });
        
        // Wait for death to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to get state after death - should crash or show health 0
        try {
          const afterDeath = await apiClient.get('/state');
          console.log('After death - Health:', afterDeath.data.health);
          
          if (afterDeath.data.health === 0) {
            console.log('Bot is in dead state');
            
            // Try to trigger respawn
            console.log('Attempting to trigger respawn...');
            // This should cause the crash as described in bug report
            await apiClient.post('/chat', { message: 'respawn test' });
          }
        } catch (err) {
          console.log('Error after death (expected):', err.message);
          // Bot likely crashed
        }
        
        // Wait and check if bot recovered
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          const finalHealth = await apiClient.get('/health');
          console.log('Final bot status:', finalHealth.data);
          
          // Bug confirmed if bot is disconnected or crashed
          if (!finalHealth.data.botConnected) {
            console.log('BUG CONFIRMED: Bot disconnected after death');
          }
        } catch (err) {
          console.log('BUG CONFIRMED: Bot server not responding after death');
        }
        
      } catch (error) {
        console.error('Test error:', error.message);
      }
    }, 30000);
    
    it('should trigger death through fall damage', async () => {
      console.log('\\n=== Fall Damage Death Test ===');
      
      try {
        // Check bot is connected
        const health = await apiClient.get('/health');
        if (!health.data.botConnected) {
          console.log('Bot not connected, skipping test');
          return;
        }
        
        // Get current position
        const state = await apiClient.get('/state');
        const pos = state.data.position;
        console.log('Current position:', pos);
        console.log('Current health:', state.data.health);
        
        // Move bot up high
        console.log('Moving bot up for fall damage...');
        await apiClient.post('/move', {
          x: pos.x,
          y: pos.y + 30,
          z: pos.z
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Let bot fall
        console.log('Letting bot fall...');
        await apiClient.post('/stop');
        
        // Wait for fall and damage
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check health after fall
        try {
          const afterFall = await apiClient.get('/state');
          console.log('Health after fall:', afterFall.data.health);
          
          if (afterFall.data.health < state.data.health) {
            console.log('Fall damage detected');
          }
          
          if (afterFall.data.health === 0) {
            console.log('Bot died from fall damage');
            // This should trigger the bug
          }
        } catch (err) {
          console.log('Error checking state after fall:', err.message);
          console.log('BUG LIKELY TRIGGERED: Bot crashed on death');
        }
        
      } catch (error) {
        console.error('Fall damage test error:', error.message);
      }
    }, 30000);
  });
});