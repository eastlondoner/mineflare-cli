const axios = require('axios');

const API_URL = 'http://localhost:3000';

async function testRespawn() {
  console.log('Testing bot respawn functionality...\n');
  
  try {
    // Check initial health
    let response = await axios.get(`${API_URL}/state`);
    console.log(`Initial health: ${response.data.health}/20`);
    
    // Subscribe to events
    let lastEventTime = Date.now();
    
    // Send kill command through chat 
    // Note: This simulates death even on non-op servers where /kill might not work
    // The bot will still die if killed by mobs or other means
    console.log('\nSending kill command to bot (testing respawn without op privileges)...');
    await axios.post(`${API_URL}/chat`, { message: '/kill' });
    
    // Wait for death and respawn events
    console.log('Waiting for death and respawn events...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check events for death and respawn
    response = await axios.get(`${API_URL}/events?since=${lastEventTime}`);
    const events = response.data.events;
    
    console.log('\nEvents received:');
    events.forEach(event => {
      if (event.type === 'death' || event.type === 'respawn_attempt' || event.type === 'respawn_success' || 
          event.type === 'respawn_error' || event.type === 'spawn' || event.type === 'reconnect') {
        console.log(`- ${event.type}: ${JSON.stringify(event.data)}`);
      }
    });
    
    // Check final health after respawn
    await new Promise(resolve => setTimeout(resolve, 2000));
    response = await axios.get(`${API_URL}/state`);
    console.log(`\nFinal health after respawn: ${response.data.health}/20`);
    
    if (response.data.health === 20) {
      console.log('\n✓ SUCCESS: Bot respawned with full health!');
    } else {
      console.log('\n✗ WARNING: Bot health not at maximum after respawn');
    }
    
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log(`\n✗ ERROR: ${error.response.data.error}`);
      console.log('Bot may have disconnected. Trying reconnection...');
      
      // Try manual reconnection
      try {
        await axios.post(`${API_URL}/reconnect`);
        console.log('Reconnection initiated, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if bot is back
        const response = await axios.get(`${API_URL}/state`);
        console.log(`Bot reconnected! Health: ${response.data.health}/20`);
      } catch (reconnectError) {
        console.error('Reconnection failed:', reconnectError.message);
      }
    } else {
      console.error('Test failed:', error.message);
    }
  }
}

testRespawn();