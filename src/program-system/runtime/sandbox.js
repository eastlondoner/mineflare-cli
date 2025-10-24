const vm = require('vm');
const { ProgramError, ErrorCode } = require('../sdk/types');

class ProgramSandbox {
  constructor(capabilities = [], timeout = 900000) {
    this.capabilities = new Set(capabilities);
    this.timeout = timeout;
    this.isRunning = false;
    this.abortController = null;
    
    // Create a clean context with only safe globals
    this.contextObject = {
      // Safe built-ins
      console: this.createSafeConsole(),
      Promise,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      
      // Math without Math.random()
      Math: this.createSafeMath(),
      
      // Error types
      Error,
      TypeError,
      ReferenceError,
      SyntaxError,
      
      // No dangerous globals:
      // - No Date or Date.now()
      // - No setTimeout/setInterval/setImmediate
      // - No process, global, globalThis
      // - No require, import, eval
      // - No fetch, XMLHttpRequest
    };
    
    // Create the VM context
    this.context = vm.createContext(this.contextObject, {
      name: 'mineflare-program',
      origin: 'https://mineflare.local',
      codeGeneration: {
        strings: false,  // No eval() or new Function()
        wasm: false     // No WebAssembly
      }
    });
  }
  
  createSafeConsole() {
    // Create a console that captures output
    const logs = [];
    const maxLogs = 1000;
    
    const logFn = (level) => (...args) => {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      logs.push({
        level,
        message,
        timestamp: Date.now()
      });
      
      // Prevent log flooding
      if (logs.length > maxLogs) {
        logs.shift();
      }
      
      // Also log to real console for debugging
      console.log(`[PROGRAM ${level.toUpperCase()}]`, message);
    };
    
    return {
      log: logFn('info'),
      info: logFn('info'),
      warn: logFn('warn'),
      error: logFn('error'),
      debug: logFn('debug'),
      _getLogs: () => logs
    };
  }
  
  createSafeMath() {
    // Math object without Math.random()
    const safeMath = {};
    
    // Copy all Math properties except random
    for (const key of Object.getOwnPropertyNames(Math)) {
      if (key !== 'random') {
        const descriptor = Object.getOwnPropertyDescriptor(Math, key);
        Object.defineProperty(safeMath, key, descriptor);
      }
    }
    
    return safeMath;
  }
  
  async execute(source, programContext) {
    if (this.isRunning) {
      throw new ProgramError(
        ErrorCode.OPERATION_FAILED,
        'Sandbox is already running a program'
      );
    }
    
    this.isRunning = true;
    this.abortController = new AbortController();
    
    try {
      // Inject the SDK and context into the sandbox
      this.injectSDK();
      this.injectContext(programContext);
      
      // Compile the program
      const script = new vm.Script(source, {
        filename: 'user-program.js',
        produceCachedData: true
      });
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ProgramError(
            ErrorCode.TIMEOUT,
            `Program execution timed out after ${this.timeout}ms`
          ));
        }, this.timeout);
      });
      
      // Create abort promise
      const abortPromise = new Promise((_, reject) => {
        this.abortController.signal.addEventListener('abort', () => {
          reject(new ProgramError(
            ErrorCode.OPERATION_FAILED,
            'Program execution was cancelled'
          ));
        });
      });
      
      // Run the script in the sandbox context
      const executionPromise = new Promise((resolve, reject) => {
        try {
          const result = script.runInContext(this.context, {
            timeout: this.timeout,
            breakOnSigint: false,
            microtaskMode: 'afterEvaluate'
          });
          
          // Check for module.exports pattern
          const exported = this.contextObject.module?.exports;
          const programDef = exported || result;
          
          // If it's a function (old module.exports pattern), execute it
          if (typeof programDef === 'function') {
            Promise.resolve(programDef(programContext))
              .then(resolve)
              .catch(reject);
          } 
          // If the script returns a program definition, run it
          else if (programDef && typeof programDef.run === 'function') {
            programDef.run(programContext)
              .then(resolve)
              .catch(reject);
          } 
          // Otherwise, return the result as-is
          else {
            resolve(result);
          }
        } catch (error) {
          reject(error);
        }
      });
      
      // Race between execution, timeout, and abort
      const result = await Promise.race([
        executionPromise,
        timeoutPromise,
        abortPromise
      ]);
      
      return {
        success: true,
        result,
        logs: this.contextObject.console._getLogs()
      };
    } catch (error) {
      // Transform VM errors into ProgramErrors
      if (error instanceof ProgramError) {
        throw error;
      }
      
      throw new ProgramError(
        ErrorCode.OPERATION_FAILED,
        `Program execution failed: ${error.message}`,
        { originalError: error.toString() }
      );
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }
  
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
  
  injectSDK() {
    // Inject the SDK helpers into the sandbox
    const sdkCode = `
      // Create a controlled timer system
      globalThis.__timers = {
        callbacks: new Map(),
        nextId: 1,
        
        setTimeout: function(callback, delay) {
          const id = this.nextId++;
          this.callbacks.set(id, {
            callback,
            delay,
            type: 'timeout',
            time: Date.now() + delay
          });
          
          // Request host to handle the timer
          if (globalThis.__handleTimer) {
            globalThis.__handleTimer(id, delay, 'timeout');
          }
          
          return id;
        },
        
        clearTimeout: function(id) {
          this.callbacks.delete(id);
        }
      };
      
      // Provide controlled setTimeout for SDK use
      globalThis.setTimeout = globalThis.__timers.setTimeout.bind(globalThis.__timers);
      globalThis.clearTimeout = globalThis.__timers.clearTimeout.bind(globalThis.__timers);
      
      // Define Vec3 class first
      class Vec3 {
        constructor(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
        offset(dx, dy, dz) {
          return new Vec3(this.x + dx, this.y + dy, this.z + dz);
        }
        clone() {
          return new Vec3(this.x, this.y, this.z);
        }
        distanceTo(other) {
          const dx = other.x - this.x;
          const dy = other.y - this.y;
          const dz = other.z - this.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
      }
      
      // Create SDK functions
      const ok = (value) => ({ ok: true, value });
      const fail = (error) => ({ ok: false, error });
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      const defineProgram = (spec) => {
        if (!spec.name) throw new Error('Program must have a name');
        if (!spec.run || typeof spec.run !== 'function') {
          throw new Error('Program must have a run function');
        }
        spec.version = spec.version || '1.0.0';
        spec.capabilities = spec.capabilities || [];
        spec.defaults = spec.defaults || {};
        return spec;
      };
      
      // Create and expose the SDK
      globalThis.mineflareSDK = {
        ok,
        fail,
        defineProgram,
        Vec3,
        sleep
      };
      
      // Make SDK components directly available on globalThis for convenience
      globalThis.ok = ok;
      globalThis.fail = fail;
      globalThis.defineProgram = defineProgram;
      globalThis.Vec3 = Vec3;
      globalThis.sleep = sleep;
      
      // Support for module.exports pattern
      globalThis.module = {
        exports: {}
      };
      globalThis.exports = globalThis.module.exports;
    `;
    
    vm.runInContext(sdkCode, this.context);
    
    // Set up timer handler on the host side
    this.contextObject.__handleTimer = (id, delay, type) => {
      // Use real setTimeout on host side, but execute callback in sandbox
      setTimeout(() => {
        try {
          const timerCode = `
            const timer = globalThis.__timers.callbacks.get(${id});
            if (timer && timer.type === '${type}') {
              globalThis.__timers.callbacks.delete(${id});
              const callback = timer.callback;
              if (typeof callback === 'function') {
                callback();
              }
            }
          `;
          vm.runInContext(timerCode, this.context);
        } catch (error) {
          console.error('Timer execution error:', error);
        }
      }, delay);
    };
  }
  
  injectContext(programContext) {
    // Inject the context object into the sandbox
    // We need to be careful to only expose safe objects
    const contextCode = `
      globalThis.__programContext = ${JSON.stringify({
        args: programContext.args,
        capabilities: programContext.capabilities
      })};
    `;
    
    vm.runInContext(contextCode, this.context);
    
    // Inject the action proxies
    // These will call back to the host environment
    this.contextObject.__actions = programContext.actions;
    this.contextObject.__world = programContext.world;
    this.contextObject.__events = programContext.events;
    this.contextObject.__control = programContext.control;
    this.contextObject.__log = programContext.log;
    this.contextObject.__clock = programContext.clock;
    this.contextObject.__bot = programContext.bot;
  }
  
  validateProgram(source) {
    try {
      // Try to compile the program
      new vm.Script(source, {
        filename: 'validation.js'
      });
      
      // Try to extract metadata
      const testSandbox = new ProgramSandbox([], 5000);
      testSandbox.injectSDK();
      
      const script = new vm.Script(source, {
        filename: 'validation.js'
      });
      
      const result = script.runInContext(testSandbox.context, {
        timeout: 5000
      });
      
      // Check for module.exports pattern
      // Only use module.exports if it's been explicitly set (not empty object)
      const exported = testSandbox.contextObject.module?.exports;
      const hasExports = exported && Object.keys(exported).some(key => 
        !['toString', 'valueOf', 'toLocaleString', 'hasOwnProperty', 'propertyIsEnumerable', 
         'isPrototypeOf', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'].includes(key)
      );
      const programDef = hasExports ? exported : result;
      
      // If it's a function (old module.exports pattern), that's valid
      if (typeof programDef === 'function') {
        return {
          valid: true,
          metadata: {
            name: 'unnamed-program',
            version: '1.0.0',
            capabilities: [],
            defaults: {}
          }
        };
      }
      
      // Check for defineProgram pattern
      if (!programDef || typeof programDef !== 'object') {
        return {
          valid: false,
          error: 'Program must export a program definition using defineProgram() or module.exports'
        };
      }
      
      if (!programDef.name) {
        return {
          valid: false,
          error: 'Program must have a name'
        };
      }
      
      if (typeof programDef.run !== 'function' && typeof programDef !== 'function') {
        return {
          valid: false,
          error: 'Program must have a run function or be a function'
        };
      }
      
      return {
        valid: true,
        metadata: {
          name: programDef.name || 'unnamed-program',
          version: programDef.version || '1.0.0',
          capabilities: programDef.capabilities || [],
          defaults: programDef.defaults || {}
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: `Syntax error: ${error.message}`
      };
    }
  }
}

module.exports = ProgramSandbox;