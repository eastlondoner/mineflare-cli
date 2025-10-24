// Simple death test script
const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
  proxy: false
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testDeath() {
  try {
    console.log('Testing death handling...');
    
    // Check initial health
    const health1 = await apiClient.get('/health');
    console.log('Bot connected:', health1.data.botConnected);
    
    const state1 = await apiClient.get('/state');
    console.log('Initial health:', state1.data.health);
    console.log('Initial position:', state1.data.position);
    
    // Try to damage the bot - teleport high and let it fall
    console.log('\nAttempting to kill bot by fall damage...');
    await apiClient.post('/chat', {
      message: '/tp @s ~ 150 ~'
    });
    
    console.log('Waiting for teleport...');
    await sleep(2000);
    
    const state2 = await apiClient.get('/state');
    console.log('Position after teleport:', state2.data.position);
    
    // Clear controls to let it fall
    await apiClient.post('/stop');
    console.log('Letting bot fall...');
    await sleep(4000);
    
    // Check if bot died and respawned
    const state3 = await apiClient.get('/state');
    console.log('\nAfter fall:');
    console.log('Health:', state3.data.health);
    console.log('Position:', state3.data.position);
    
    // Get recent events (the response is an object with events array)
    const eventsResponse = await apiClient.get('/events?since=0');
    const events = eventsResponse.data.events || eventsResponse.data || [];
    const recentEvents = Array.isArray(events) ? events.slice(-20) : [];
    
    console.log('\nRecent events (last 20):');
    recentEvents.forEach(e => {
      if (e.type === 'death' || e.type === 'spawn' || e.type === 'respawn_attempt' || e.type === 'respawn_success' || e.type === 'health') {
        console.log(`  ${e.type}:`, e.data);
      }
    });
    
    // Try another method to kill - use /kill command directly
    console.log('\n\nAttempting /kill command...');
    await apiClient.post('/chat', {
      message: '/kill ConfigBot'
    });
    
    await sleep(3000);
    
    const state4 = await apiClient.get('/state');
    console.log('\nAfter /kill command:');
    console.log('Health:', state4.data.health);
    console.log('Position:', state4.data.position);
    
    // Test if bot is still responsive
    console.log('\nTesting bot responsiveness...');
    const moveResult = await apiClient.post('/move', {
      x: state4.data.position.x + 2,
      y: state4.data.position.y,
      z: state4.data.position.z
    });
    console.log('Move result:', moveResult.data.success);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testDeath();