const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const ProgramSandbox = require('../../src/program-system/runtime/sandbox');
const { ProgramError, ErrorCode } = require('../../src/program-system/sdk/types');

describe('Program Sandbox', () => {
  let sandbox;
  
  beforeEach(() => {
    sandbox = new ProgramSandbox(['move', 'dig'], 5000);
  });
  
  describe('Context isolation', () => {
    it('should have safe globals available', () => {
      const context = sandbox.contextObject;
      
      expect(context.console).toBeDefined();
      expect(context.Promise).toBe(Promise);
      expect(context.Array).toBe(Array);
      expect(context.Object).toBe(Object);
      expect(context.String).toBe(String);
      expect(context.Number).toBe(Number);
      expect(context.Boolean).toBe(Boolean);
      expect(context.Map).toBe(Map);
      expect(context.Set).toBe(Set);
      expect(context.JSON).toBe(JSON);
    });
    
    it('should not have dangerous globals', () => {
      const context = sandbox.contextObject;
      
      expect(context.Date).toBeUndefined();
      expect(context.setTimeout).toBeUndefined();
      expect(context.setInterval).toBeUndefined();
      expect(context.setImmediate).toBeUndefined();
      expect(context.process).toBeUndefined();
      expect(context.global).toBeUndefined();
      expect(context.globalThis).toBeUndefined();
      expect(context.require).toBeUndefined();
      expect(context.import).toBeUndefined();
      expect(context.eval).toBeUndefined();
      expect(context.fetch).toBeUndefined();
      expect(context.XMLHttpRequest).toBeUndefined();
    });
    
    it('should have Math without random()', () => {
      const safeMath = sandbox.contextObject.Math;
      
      expect(safeMath.PI).toBe(Math.PI);
      expect(safeMath.sin).toBe(Math.sin);
      expect(safeMath.cos).toBe(Math.cos);
      expect(safeMath.sqrt).toBe(Math.sqrt);
      expect(safeMath.random).toBeUndefined();
    });
  });
  
  describe('Console logging', () => {
    it('should capture console output', () => {
      const safeConsole = sandbox.createSafeConsole();
      
      safeConsole.log('Test message');
      safeConsole.info('Info message');
      safeConsole.warn('Warning');
      safeConsole.error('Error');
      
      const logs = safeConsole._getLogs();
      
      expect(logs).toHaveLength(4);
      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'Test message'
      });
      expect(logs[1]).toMatchObject({
        level: 'info',
        message: 'Info message'
      });
      expect(logs[2]).toMatchObject({
        level: 'warn',
        message: 'Warning'
      });
      expect(logs[3]).toMatchObject({
        level: 'error',
        message: 'Error'
      });
    });
    
    it('should stringify objects in console', () => {
      const safeConsole = sandbox.createSafeConsole();
      
      safeConsole.log({ key: 'value' });
      
      const logs = safeConsole._getLogs();
      expect(logs[0].message).toBe('{"key":"value"}');
    });
    
    it('should limit console logs', () => {
      const safeConsole = sandbox.createSafeConsole();
      
      // Log more than max (1000)
      for (let i = 0; i < 1010; i++) {
        safeConsole.log(`Message ${i}`);
      }
      
      const logs = safeConsole._getLogs();
      expect(logs).toHaveLength(1000);
      expect(logs[0].message).toBe('Message 10'); // First 10 should be removed
    });
  });
  
  describe('Program validation', () => {
    it('should validate valid program', () => {
      const source = `
        module.exports = async function(ctx) {
          const result = await ctx.move.step('north');
          return ctx.ok(result);
        };
      `;
      
      const validation = sandbox.validateProgram(source);
      
      expect(validation.valid).toBe(true);
      expect(validation.metadata).toBeDefined();
    });
    
    it('should detect syntax errors', () => {
      const source = `
        module.exports = async function(ctx) {
          const result = await ctx.move.step('north'
          return ctx.ok(result);
        };
      `;
      
      const validation = sandbox.validateProgram(source);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Unexpected token');
    });
    
    it('should detect non-function exports', () => {
      const source = `
        module.exports = "not a function";
      `;
      
      const validation = sandbox.validateProgram(source);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('must export a function');
    });
    
    it('should extract metadata from defineProgram', () => {
      const source = `
        const { defineProgram } = require('@mineflare/sdk');
        
        module.exports = defineProgram({
          name: 'Test Program',
          version: '1.0.0',
          capabilities: ['move', 'dig'],
          defaults: { radius: 10 },
          execute: async (ctx) => {
            return ctx.ok('done');
          }
        });
      `;
      
      const validation = sandbox.validateProgram(source);
      
      expect(validation.valid).toBe(true);
      expect(validation.metadata).toMatchObject({
        version: '1.0.0',
        capabilities: ['move', 'dig'],
        defaults: { radius: 10 }
      });
    });
  });
  
  describe('Program execution', () => {
    it('should execute simple program', async () => {
      const source = `
        module.exports = async function(ctx) {
          console.log('Program running');
          return { result: 'success' };
        };
      `;
      
      const mockContext = {
        bot: { getState: async () => ({ position: { x: 0, y: 0, z: 0 } }) },
        move: { step: async () => ({ ok: true }) },
        ok: (data) => ({ __mfSuccess: true, data }),
        fail: (msg) => ({ __mfFailure: true, message: msg })
      };
      
      const result = await sandbox.execute(source, mockContext);
      
      expect(result.result).toEqual({ result: 'success' });
      expect(result.logs).toContain('[PROGRAM INFO] Program running');
    });
    
    it('should handle program errors', async () => {
      const source = `
        module.exports = async function(ctx) {
          throw new Error('Program failed');
        };
      `;
      
      const mockContext = {};
      
      await expect(sandbox.execute(source, mockContext))
        .rejects.toThrow('Program failed');
    });
    
    it('should enforce timeout', async () => {
      const fastSandbox = new ProgramSandbox(['move'], 100); // 100ms timeout
      
      const source = `
        module.exports = async function(ctx) {
          // Infinite loop
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        };
      `;
      
      const mockContext = {};
      
      await expect(fastSandbox.execute(source, mockContext))
        .rejects.toThrow(ProgramError);
    }, 10000);
    
    it('should not allow multiple concurrent executions', async () => {
      const source = `
        module.exports = async function(ctx) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'done';
        };
      `;
      
      const mockContext = {};
      
      // Start first execution
      const promise1 = sandbox.execute(source, mockContext);
      
      // Try to start second execution
      await expect(sandbox.execute(source, mockContext))
        .rejects.toThrow('already running a program');
      
      // Wait for first to complete
      await promise1;
    });
    
    it('should inject SDK into context', async () => {
      const source = `
        module.exports = async function(ctx) {
          const { Vec3, ok, fail, sleep } = ctx;
          
          if (!Vec3) throw new Error('Vec3 not available');
          if (!ok) throw new Error('ok not available');
          if (!fail) throw new Error('fail not available');
          if (!sleep) throw new Error('sleep not available');
          
          const pos = new Vec3(1, 2, 3);
          return ok(\`Position: \${pos.x}, \${pos.y}, \${pos.z}\`);
        };
      `;
      
      const mockContext = {
        ok: (data) => ({ __mfSuccess: true, data })
      };
      
      const result = await sandbox.execute(source, mockContext);
      
      expect(result.result.__mfSuccess).toBe(true);
      expect(result.result.data).toBe('Position: 1, 2, 3');
    });
  });
  
  describe('Capability checking', () => {
    it('should check capabilities during execution', () => {
      sandbox = new ProgramSandbox(['move'], 5000);
      
      expect(sandbox.capabilities.has('move')).toBe(true);
      expect(sandbox.capabilities.has('dig')).toBe(false);
      expect(sandbox.capabilities.has('place')).toBe(false);
    });
    
    it('should pass capabilities to executed program', async () => {
      const source = `
        module.exports = async function(ctx) {
          if (!ctx.capabilities.includes('move')) {
            throw new Error('Move capability not found');
          }
          if (ctx.capabilities.includes('dig')) {
            throw new Error('Dig capability should not be present');
          }
          return 'capabilities ok';
        };
      `;
      
      sandbox = new ProgramSandbox(['move'], 5000);
      const mockContext = {
        capabilities: ['move']
      };
      
      const result = await sandbox.execute(source, mockContext);
      
      expect(result.result).toBe('capabilities ok');
    });
  });
  
  describe('Error transformation', () => {
    it('should transform runtime errors to ProgramError', async () => {
      const source = `
        module.exports = async function(ctx) {
          const obj = null;
          return obj.property; // Null reference
        };
      `;
      
      const mockContext = {};
      
      try {
        await sandbox.execute(source, mockContext);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProgramError);
        expect(error.code).toBe(ErrorCode.RUNTIME);
        expect(error.message).toContain('Cannot read');
      }
    });
    
    it('should preserve ProgramError types', async () => {
      const source = `
        module.exports = async function(ctx) {
          const { ProgramError, ErrorCode } = ctx;
          throw new ProgramError(ErrorCode.CAPABILITY, 'Missing capability');
        };
      `;
      
      const mockContext = {
        ProgramError: ProgramError,
        ErrorCode: ErrorCode
      };
      
      try {
        await sandbox.execute(source, mockContext);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProgramError);
        expect(error.code).toBe(ErrorCode.CAPABILITY);
        expect(error.message).toBe('Missing capability');
      }
    });
  });
  
  describe('Abort handling', () => {
    it('should abort running program', async () => {
      const source = `
        module.exports = async function(ctx) {
          for (let i = 0; i < 100; i++) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return 'should not complete';
        };
      `;
      
      const mockContext = {};
      
      // Start execution
      const promise = sandbox.execute(source, mockContext);
      
      // Abort after short delay
      setTimeout(() => sandbox.abort(), 50);
      
      await expect(promise).rejects.toThrow('Program execution aborted');
    });
  });
});