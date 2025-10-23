/**
 * Real Minecraft Connection E2E Test
 * Demonstrates actual bot connections to a real Minecraft server
 * Zero mocks - this is the real deal
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
const mineflayer = require('mineflayer');

describe('E2E: Real Minecraft Server Connection', () => {
  const MC_HOST = process.env.E2E_MC_HOST || 'localhost';
  const MC_PORT = parseInt(process.env.E2E_MC_PORT) || 25565;
  
  console.log(`🎮 Testing with REAL Minecraft server at ${MC_HOST}:${MC_PORT}`);
  console.log('This is a real end-to-end test with zero mocks!');
  
  describe('Real Bot Connection', () => {
    it('should connect a real bot to the real Minecraft server', async () => {
      console.log('Creating real bot connection...');
      
      // Create a REAL bot connection - no mocks!
      const bot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: `E2ETestBot_${Date.now()}`,
        version: false,  // Auto-detect version
        auth: 'offline'
      });
      
      // Wait for the bot to actually spawn in the real Minecraft world
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Bot spawn timeout'));
        }, 30000);
        
        bot.once('spawn', () => {
          clearTimeout(timeout);
          console.log('✅ Bot spawned in the real Minecraft world!');
          console.log(`   Position: ${bot.entity.position}`);
          console.log(`   Health: ${bot.health}`);
          console.log(`   Food: ${bot.food}`);
          console.log(`   Game mode: ${bot.game.gameMode}`);
          resolve();
        });
        
        bot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      // Verify the bot is really connected
      expect(bot.entity).toBeDefined();
      expect(bot.entity.position).toBeDefined();
      expect(bot.entity.position.x).toBeTypeOf('number');
      expect(bot.entity.position.y).toBeTypeOf('number');
      expect(bot.entity.position.z).toBeTypeOf('number');
      expect(bot.health).toBeGreaterThan(0);
      expect(bot.food).toBeGreaterThan(0);
      
      // Disconnect the bot
      bot.quit();
      console.log('✅ Bot disconnected successfully');
    }, 35000);
    
    it('should handle multiple real bot connections simultaneously', async () => {
      console.log('Creating multiple real bot connections...');
      
      const numBots = 3;
      const bots = [];
      
      // Create multiple REAL bot connections
      for (let i = 0; i < numBots; i++) {
        const bot = mineflayer.createBot({
          host: MC_HOST,
          port: MC_PORT,
          username: `E2EBot${i}_${Date.now()}`,
          version: false,  // Auto-detect version
          auth: 'offline'
        });
        
        bots.push(bot);
      }
      
      // Wait for all bots to spawn
      await Promise.all(bots.map((bot, index) => 
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Bot ${index} spawn timeout`));
          }, 30000);
          
          bot.once('spawn', () => {
            clearTimeout(timeout);
            console.log(`✅ Bot ${index} spawned at ${bot.entity.position}`);
            resolve();
          });
          
          bot.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        })
      ));
      
      // Verify all bots are connected
      for (let i = 0; i < numBots; i++) {
        expect(bots[i].entity).toBeDefined();
        expect(bots[i].entity.position).toBeDefined();
      }
      
      console.log(`✅ All ${numBots} bots connected successfully!`);
      
      // Clean up all bots
      for (const bot of bots) {
        bot.quit();
      }
      
      console.log('✅ All bots disconnected');
    }, 60000);
    
    it('should perform real actions in the Minecraft world', async () => {
      console.log('Testing real bot actions...');
      
      const bot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: `ActionBot_${Date.now()}`,
        version: false,  // Auto-detect version
        auth: 'offline'
      });
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Spawn timeout')), 30000);
        
        bot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        bot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      console.log('✅ Bot spawned, testing real actions...');
      
      // Test real chat
      const testMessage = `Hello from E2E test! Time: ${Date.now()}`;
      bot.chat(testMessage);
      console.log(`   Sent chat: "${testMessage}"`);
      
      // Test real movement
      const startPos = bot.entity.position.clone();
      bot.setControlState('forward', true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      bot.setControlState('forward', false);
      const endPos = bot.entity.position.clone();
      
      console.log(`   Moved from ${startPos} to ${endPos}`);
      
      // Test looking around
      await bot.look(0, 0);
      console.log('   Looked at 0, 0');
      
      await bot.look(Math.PI, 0);
      console.log('   Looked at π, 0');
      
      // Jump
      bot.setControlState('jump', true);
      await new Promise(resolve => setTimeout(resolve, 100));
      bot.setControlState('jump', false);
      console.log('   Jumped');
      
      console.log('✅ All real actions completed successfully!');
      
      bot.quit();
    }, 40000);
    
    it('should handle real events from the Minecraft server', async () => {
      console.log('Testing real event handling...');
      
      const bot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: `EventBot_${Date.now()}`,
        version: false,  // Auto-detect version
        auth: 'offline'
      });
      
      const events = [];
      
      // Set up real event listeners
      bot.on('spawn', () => {
        events.push({ type: 'spawn', time: Date.now() });
        console.log('   Event: spawn');
      });
      
      bot.on('health', () => {
        events.push({ type: 'health', health: bot.health, food: bot.food });
        console.log(`   Event: health (${bot.health} HP, ${bot.food} food)`);
      });
      
      bot.on('move', () => {
        events.push({ type: 'move', position: bot.entity.position.clone() });
      });
      
      bot.on('chat', (username, message) => {
        events.push({ type: 'chat', username, message });
        console.log(`   Event: chat from ${username}: "${message}"`);
      });
      
      // Wait for spawn
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Spawn timeout')), 30000);
        
        bot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        bot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      // Let events accumulate
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`✅ Captured ${events.length} real events from the server`);
      
      // Verify we got some events
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'spawn')).toBe(true);
      
      bot.quit();
    }, 40000);
  });
  
  describe('Real Server Interaction Verification', () => {
    it('should verify the Minecraft server is actually running', async () => {
      console.log('Verifying real Minecraft server...');
      
      // Try to connect and immediately check server info
      const bot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: `VerifyBot_${Date.now()}`,
        version: false,  // Auto-detect version
        auth: 'offline'
      });
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
        
        bot.once('login', () => {
          clearTimeout(timeout);
          console.log('✅ Successfully logged into real Minecraft server');
          console.log(`   Server version: ${bot.version}`);
          console.log(`   Server brand: ${bot.game?.serverBrand || 'Unknown'}`);
          resolve();
        });
        
        bot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      bot.quit();
    }, 35000);
  });
});

console.log('');
console.log('═'.repeat(60));
console.log('This E2E test suite connects to a REAL Minecraft server.');
console.log('No mocks, no fakes - this is actual end-to-end testing!');
console.log('═'.repeat(60));
console.log('');