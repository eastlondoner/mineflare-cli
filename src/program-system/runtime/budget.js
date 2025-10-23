const { ProgramError, ErrorCode } = require('../sdk/types');

class OperationBudget {
  constructor(capabilities = []) {
    // Define limits per operation type
    this.limits = {
      // Per-minute limits
      perMinute: {
        move: 60,
        dig: 20,
        place: 20,
        craft: 10,
        attack: 30,
        screenshot: 5,
        inventory: 30
      },
      // Total limits for entire program execution
      total: {
        move: 1000,
        dig: 500,
        place: 500,
        craft: 100,
        attack: 300,
        screenshot: 50,
        inventory: 500
      }
    };
    
    // Track usage
    this.usage = {
      total: {},
      minuteWindow: []
    };
    
    // Only track operations for enabled capabilities
    this.enabledCapabilities = new Set(capabilities);
    
    // Initialize usage counters
    for (const cap of capabilities) {
      this.usage.total[cap] = 0;
    }
  }
  
  check(operation, count = 1) {
    // If capability is not enabled, deny
    if (!this.enabledCapabilities.has(operation)) {
      throw new ProgramError(
        ErrorCode.CAPABILITY,
        `Operation '${operation}' requires the '${operation}' capability`
      );
    }
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old entries from minute window
    this.usage.minuteWindow = this.usage.minuteWindow.filter(
      entry => entry.timestamp > oneMinuteAgo
    );
    
    // Check per-minute limit
    const recentOps = this.usage.minuteWindow.filter(
      entry => entry.operation === operation
    );
    
    const recentCount = recentOps.reduce((sum, entry) => sum + entry.count, 0);
    
    if (this.limits.perMinute[operation]) {
      if (recentCount + count > this.limits.perMinute[operation]) {
        throw new ProgramError(
          ErrorCode.RESOURCE_LIMIT,
          `Rate limit exceeded for '${operation}': ${recentCount + count} operations in last minute (limit: ${this.limits.perMinute[operation]})`
        );
      }
    }
    
    // Check total limit
    if (!this.usage.total[operation]) {
      this.usage.total[operation] = 0;
    }
    
    if (this.limits.total[operation]) {
      if (this.usage.total[operation] + count > this.limits.total[operation]) {
        throw new ProgramError(
          ErrorCode.RESOURCE_LIMIT,
          `Total limit exceeded for '${operation}': ${this.usage.total[operation] + count} operations (limit: ${this.limits.total[operation]})`
        );
      }
    }
    
    // Record usage
    this.usage.total[operation] += count;
    this.usage.minuteWindow.push({
      timestamp: now,
      operation,
      count
    });
    
    return true;
  }
  
  getUsage() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old entries
    this.usage.minuteWindow = this.usage.minuteWindow.filter(
      entry => entry.timestamp > oneMinuteAgo
    );
    
    // Calculate per-minute usage
    const perMinute = {};
    for (const cap of this.enabledCapabilities) {
      const recent = this.usage.minuteWindow.filter(
        entry => entry.operation === cap
      );
      perMinute[cap] = recent.reduce((sum, entry) => sum + entry.count, 0);
    }
    
    return {
      total: { ...this.usage.total },
      perMinute,
      limits: this.limits
    };
  }
  
  reset() {
    this.usage = {
      total: {},
      minuteWindow: []
    };
    
    for (const cap of this.enabledCapabilities) {
      this.usage.total[cap] = 0;
    }
  }
  
  // Set custom limits for specific operations
  setLimits(operation, perMinute = null, total = null) {
    if (perMinute !== null) {
      this.limits.perMinute[operation] = perMinute;
    }
    if (total !== null) {
      this.limits.total[operation] = total;
    }
  }
  
  // Get remaining budget for an operation
  getRemaining(operation) {
    if (!this.enabledCapabilities.has(operation)) {
      return { perMinute: 0, total: 0 };
    }
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate recent usage
    const recent = this.usage.minuteWindow
      .filter(entry => entry.timestamp > oneMinuteAgo && entry.operation === operation)
      .reduce((sum, entry) => sum + entry.count, 0);
    
    const totalUsed = this.usage.total[operation] || 0;
    
    return {
      perMinute: (this.limits.perMinute[operation] || Infinity) - recent,
      total: (this.limits.total[operation] || Infinity) - totalUsed
    };
  }
}

module.exports = OperationBudget;