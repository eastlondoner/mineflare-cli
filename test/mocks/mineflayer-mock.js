/**
 * Mock implementation of mineflare bot for testing
 */
class MockBot {
  constructor() {
    this.username = 'test_bot';
    this.health = 20;
    this.food = 20;
    this.position = { x: 0, y: 64, z: 0 };
    this.entity = {
      position: { x: 0, y: 64, z: 0 },
      yaw: 0,
      pitch: 0,
      velocity: { x: 0, y: 0, z: 0 }
    };
    this.inventory = {
      slots: new Array(46).fill(null),
      items: () => [],
      count: () => 0,
      equipItem: async () => {},
      findInventoryItem: () => null
    };
    this.players = {};
    this.entities = {};
    this.time = { day: 0, time: 0 };
    this.experience = { level: 0, points: 0, progress: 0 };
    this._isAlive = true;
    this._chatHistory = [];
    this._eventHandlers = {};
    this.pathfinder = {
      setGoal: () => {},
      stop: () => {},
      isMoving: () => false
    };
    this.recipes = [];
    this.blockAt = () => null;
  }

  // Event handling
  on(event, handler) {
    if (!this._eventHandlers[event]) {
      this._eventHandlers[event] = [];
    }
    this._eventHandlers[event].push(handler);
  }

  once(event, handler) {
    const wrappedHandler = (...args) => {
      handler(...args);
      this.removeListener(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }

  removeListener(event, handler) {
    if (this._eventHandlers[event]) {
      this._eventHandlers[event] = this._eventHandlers[event].filter(h => h !== handler);
    }
  }

  emit(event, ...args) {
    if (this._eventHandlers[event]) {
      this._eventHandlers[event].forEach(handler => handler(...args));
    }
  }

  // Movement methods
  setControlState(control, state) {
    // Mock implementation
    return true;
  }

  lookAt(position) {
    // Mock implementation
    return true;
  }

  look(yaw, pitch) {
    this.entity.yaw = yaw;
    this.entity.pitch = pitch;
  }

  // Chat methods
  chat(message) {
    this._chatHistory.push({ type: 'sent', message, timestamp: Date.now() });
    this.emit('chat', this.username, message);
  }

  whisper(username, message) {
    this._chatHistory.push({ type: 'whisper', to: username, message, timestamp: Date.now() });
  }

  // Combat methods
  attack(entity) {
    // Mock implementation
    return true;
  }

  // Block manipulation
  dig(block, forceLook) {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emit('diggingCompleted', block);
        resolve();
      }, 100);
    });
  }

  placeBlock(referenceBlock, faceVector) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 50);
    });
  }

  // Crafting
  craft(recipe, count, craftingTable) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }

  recipesFor(itemId, metadata, minResultCount, craftingTable) {
    return this.recipes.filter(r => r.result.id === itemId);
  }

  recipesAll(itemType, metadata, craftingTable) {
    return this.recipes;
  }

  // Inventory management
  equip(item, destination) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 50);
    });
  }

  unequip(destination) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 50);
    });
  }

  tossStack(item, callback) {
    if (callback) callback();
  }

  // Utility methods
  quit() {
    this._isAlive = false;
    this.emit('end');
  }

  end(reason) {
    this.quit();
  }

  canSeeBlock(block) {
    return true;
  }

  findBlock(options) {
    return null;
  }

  findBlocks(options) {
    return [];
  }

  // Test utility methods
  simulateChat(username, message) {
    this._chatHistory.push({ type: 'received', from: username, message, timestamp: Date.now() });
    this.emit('chat', username, message);
  }

  simulateHealth(health) {
    this.health = health;
    this.emit('health');
  }

  simulateSpawn() {
    this.emit('spawn');
  }

  simulateDeath() {
    this._isAlive = false;
    this.emit('death');
  }

  simulateError(error) {
    this.emit('error', error);
  }

  getChatHistory() {
    return this._chatHistory;
  }
}

/**
 * Mock mineflare module
 */
const mineflareMock = {
  createBot: (options) => {
    const bot = new MockBot();
    bot.username = options.username || 'test_bot';
    
    // Simulate connection
    setTimeout(() => {
      bot.emit('spawn');
    }, 10);
    
    return bot;
  },
  
  MockBot
};

module.exports = mineflareMock;