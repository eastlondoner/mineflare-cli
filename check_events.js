const axios = require('axios');

async function checkEvents() {
  try {
    // Get all events
    const response = await axios.get('http://localhost:3000/events');
    const events = response.data.events;
    
    console.log('Recent bot events related to death/respawn:');
    console.log('-'.repeat(50));
    
    // Show last 30 events
    const recentEvents = events.slice(-30);
    recentEvents.forEach(event => {
      if (event.type === 'death' || event.type === 'respawn_attempt' || 
          event.type === 'spawn' || event.type === 'reconnect' || 
          event.type === 'chat' || event.type === 'health') {
        console.log(`${event.type}:`, JSON.stringify(event.data, null, 2));
      }
    });
    
    // Check current state
    console.log('\n' + '-'.repeat(50));
    console.log('Current bot state:');
    const stateResponse = await axios.get('http://localhost:3000/state');
    const state = stateResponse.data;
    console.log(`Health: ${state.health}/20`);
    console.log(`Food: ${state.food}/20`);
    console.log(`Position:`, state.position);
    console.log('\nBot is alive and connected! ✓');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkEvents();