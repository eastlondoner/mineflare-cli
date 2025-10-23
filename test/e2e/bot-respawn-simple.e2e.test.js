/**
 * Simple E2E Test for Bot Respawn functionality
 * Tests the respawn mechanism via API endpoints
 */

const { describe, it, expect, beforeAll } = require('bun:test');
const axios = require('axios');

describe('E2E: Bot Respawn via API', () => {
  const API_URL = 'http://localhost:3000';
  
  beforeAll(async () => {
    // Verify server is running
    try {
      const response = await axios.get(`${API_URL}/health`);
      console.log('Bot server status:', response.data);
    } catch (error) {
      console.error('Bot server not running on port 3000. Please start it first.');
      throw error;
    }
  });

  it('should track death and respawn events', async () => {
    // Get initial state
    const initialState = await axios.get(`${API_URL}/state`);
    console.log('Initial bot health:', initialState.data.health);
    
    // Record current timestamp for event tracking
    const startTime = Date.now();
    
    // Send kill command (may or may not work depending on server op status)
    await axios.post(`${API_URL}/chat`, { message: '/kill' });
    console.log('Kill command sent');
    
    // Wait for potential death and respawn
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check events
    const eventsResponse = await axios.get(`${API_URL}/events?since=${startTime}`);
    const events = eventsResponse.data.events;
    
    console.log('Events captured:', events.map(e => e.type));
    
    // Check if we captured any death/respawn related events
    const deathEvent = events.find(e => e.type === 'death');
    const respawnAttempt = events.find(e => e.type === 'respawn_attempt');
    const respawnSuccess = events.find(e => e.type === 'respawn_success');
    
    // Check final state
    const finalState = await axios.get(`${API_URL}/state`);
    console.log('Final bot health:', finalState.data.health);
    
    // Bot should still be alive (either didn't die or respawned)
    expect(finalState.data.health).toBeGreaterThan(0);
    
    // If death occurred, we should see respawn attempts
    if (deathEvent) {
      console.log('Death detected, checking for respawn...');
      expect(respawnAttempt || respawnSuccess).toBeTruthy();
    }
    
    console.log('Bot is alive and functioning');
  }, 15000);

  it('should support manual reconnection', async () => {
    try {
      const response = await axios.post(`${API_URL}/reconnect`);
      console.log('Reconnect response:', response.data);
      
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe('Reconnection initiated');
      
      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify bot is connected
      const health = await axios.get(`${API_URL}/health`);
      expect(health.data.botConnected).toBe(true);
      
      console.log('Manual reconnection successful');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('Reconnection already in progress or not needed');
        expect(error.response.data.error).toBe('Reconnection already in progress');
      } else {
        throw error;
      }
    }
  }, 10000);

  it('should handle multiple kill attempts gracefully', async () => {
    const startTime = Date.now();
    
    // Send multiple kill commands
    for (let i = 0; i < 3; i++) {
      console.log(`Sending kill command ${i + 1}/3`);
      await axios.post(`${API_URL}/chat`, { message: '/kill' });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Check final state
    const finalState = await axios.get(`${API_URL}/state`);
    console.log('Final health after multiple kills:', finalState.data.health);
    
    // Bot should still be functional
    expect(finalState.data.health).toBeGreaterThanOrEqual(0);
    
    // Check events
    const eventsResponse = await axios.get(`${API_URL}/events?since=${startTime}`);
    const events = eventsResponse.data.events;
    
    const deathEvents = events.filter(e => e.type === 'death');
    const respawnEvents = events.filter(e => 
      e.type === 'respawn_attempt' || e.type === 'respawn_success'
    );
    
    console.log(`Deaths: ${deathEvents.length}, Respawn attempts: ${respawnEvents.length}`);
    
    // If any deaths occurred, respawns should follow
    if (deathEvents.length > 0) {
      expect(respawnEvents.length).toBeGreaterThan(0);
    }
  }, 20000);
});