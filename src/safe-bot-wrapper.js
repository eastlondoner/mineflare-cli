const mineflayer = require('mineflayer');

// Safe bot wrapper that prevents crashes when bot spawns already dead
class SafeBotWrapper {
  constructor(options) {
    this.options = options;
    this.bot = null;
    this.isInitializing = true;
    this.deathEventQueue = [];
    this.spawnCompleted = false;
  }

  createBot() {
    return new Promise((resolve, reject) => {
      try {
        // Create bot with a modified connection handler
        this.bot = mineflayer.createBot(this.options);
        
        // Immediately set up critical patches before any events can fire
        this.patchBotInternals();
        
        // Set up a one-time spawn handler
        const spawnHandler = () => {
          console.log('[SafeBot] Spawn event received');
          this.spawnCompleted = true;
          this.isInitializing = false;
          
          // Check if bot spawned dead
          if (this.bot.health === 0) {
            console.log('[SafeBot] Bot spawned dead, triggering immediate respawn');
            // Send respawn packet immediately
            setTimeout(() => {
              if (this.bot && this.bot._client && !this.bot._client.ended) {
                this.bot._client.write('client_command', { action: 1 }); // 1 = respawn
                console.log('[SafeBot] Respawn packet sent');
              }
            }, 100);
          }
          
          // Process any queued death events after initialization
          setTimeout(() => {
            while (this.deathEventQueue.length > 0) {
              const handler = this.deathEventQueue.shift();
              handler();
            }
          }, 1000);
          
          resolve(this.bot);
        };
        
        this.bot.once('spawn', spawnHandler);
        
        // Set up error handler to catch initialization errors
        this.bot.once('error', (err) => {
          if (this.isInitializing) {
            console.error('[SafeBot] Error during initialization:', err);
            reject(err);
          }
        });
        
        // Fallback timeout in case spawn never happens
        setTimeout(() => {
          if (this.isInitializing) {
            console.log('[SafeBot] Initialization timeout, resolving anyway');
            this.isInitializing = false;
            resolve(this.bot);
          }
        }, 5000);
        
      } catch (error) {
        console.error('[SafeBot] Failed to create bot:', error);
        reject(error);
      }
    });
  }
  
  patchBotInternals() {
    if (!this.bot) return;
    
    // Patch any object that might have removeAllListeners
    const patchObject = (obj, name) => {
      if (!obj) return;
      
      // Ensure _events is initialized
      if (typeof obj === 'object' && !obj._events) {
        obj._events = Object.create(null);
        obj._eventsCount = 0;
      }
      
      // Patch removeAllListeners if it exists
      if (typeof obj.removeAllListeners === 'function') {
        const original = obj.removeAllListeners;
        obj.removeAllListeners = function(event) {
          try {
            if (!this._events) {
              this._events = Object.create(null);
              this._eventsCount = 0;
            }
            return original.call(this, event);
          } catch (err) {
            console.log(`[SafeBot] Caught error in ${name}.removeAllListeners:`, err.message);
            return this;
          }
        };
      }
    };
    
    // Patch various bot components
    patchObject(this.bot, 'bot');
    patchObject(this.bot._client, '_client');
    patchObject(this.bot.physics, 'physics');
    patchObject(this.bot.entities, 'entities');
    
    // Override the bot's death event handler registration
    const originalOn = this.bot.on;
    const originalOnce = this.bot.once;
    const self = this;
    
    this.bot.on = function(event, handler) {
      if (event === 'death' && self.isInitializing) {
        // Queue death handlers during initialization
        const wrappedHandler = () => {
          if (!self.isInitializing) {
            handler();
          } else {
            self.deathEventQueue.push(handler);
          }
        };
        return originalOn.call(this, event, wrappedHandler);
      }
      return originalOn.call(this, event, handler);
    };
    
    this.bot.once = function(event, handler) {
      if (event === 'death' && self.isInitializing) {
        // Queue death handlers during initialization
        const wrappedHandler = () => {
          if (!self.isInitializing) {
            handler();
          } else {
            self.deathEventQueue.push(handler);
          }
        };
        return originalOnce.call(this, event, wrappedHandler);
      }
      return originalOnce.call(this, event, handler);
    };
  }
}

module.exports = SafeBotWrapper;