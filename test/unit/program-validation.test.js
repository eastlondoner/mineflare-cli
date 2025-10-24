/**
 * Unit tests for program validation logic
 */

const ProgramSandbox = require('../../src/program-system/runtime/sandbox');

describe('Program Validation', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = new ProgramSandbox();
  });

  describe('defineProgram pattern', () => {
    it('should validate a simple program with defineProgram', () => {
      const source = `
        const program = defineProgram({
          name: 'test-program',
          version: '1.0.0',
          capabilities: ['move'],
          defaults: { speed: 10 },
          async run(ctx) {
            return ctx.control.success({ message: 'done' });
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      console.log('Validation result:', result);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('test-program');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.capabilities).toEqual(['move']);
      expect(result.metadata.defaults).toEqual({ speed: 10 });
    });

    it('should validate a minimal program with defineProgram', () => {
      const source = `
        const program = defineProgram({
          name: 'minimal',
          async run(ctx) {
            return { ok: true };
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      console.log('Minimal program result:', result);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('minimal');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.capabilities).toEqual([]);
      expect(result.metadata.defaults).toEqual({});
    });

    it('should validate hello-world.js example', () => {
      const source = `
        // Simple hello world program to test basic functionality
        // SDK components are available globally - use them directly
        
        const program = defineProgram({
          name: 'hello-world',
          version: '1.0.0',
          capabilities: [],
          defaults: {
            message: 'Hello from Mineflare!'
          },
          
          async run(ctx) {
            const { args, log, control } = ctx;
            
            // Log the message
            log.info('Starting hello world program');
            log.info(args.message || 'Hello, World!');
            
            // Simple success
            return control.success({
              message: 'Program completed successfully',
              greeting: args.message
            });
          }
        });
        
        // Export the program (last expression is returned)
        program
      `;

      const result = sandbox.validateProgram(source);
      console.log('Hello world validation result:', result);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('hello-world');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.capabilities).toEqual([]);
      expect(result.metadata.defaults).toEqual({ message: 'Hello from Mineflare!' });
    });

    it('should fail validation without a name', () => {
      const source = `
        const program = defineProgram({
          async run(ctx) {
            return { ok: true };
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must have a name');
    });

    it('should fail validation without a run function', () => {
      const source = `
        const program = defineProgram({
          name: 'no-run',
          version: '1.0.0'
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must have a run function');
    });

    it('should handle program with semicolon at the end', () => {
      const source = `
        const program = defineProgram({
          name: 'with-semicolon',
          async run(ctx) {
            return { ok: true };
          }
        });
        program;
      `;

      const result = sandbox.validateProgram(source);
      console.log('With semicolon result:', result);
      
      // This should still work but return undefined
      // We need to handle this case
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('with-semicolon');
    });
  });

  describe('module.exports pattern', () => {
    it('should validate a program using module.exports', () => {
      const source = `
        module.exports = async function(ctx) {
          const { log, control } = ctx;
          log.info('Running module.exports program');
          return control.success({ message: 'done' });
        };
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('unnamed-program');
    });

    it('should validate a program using module.exports with object', () => {
      const source = `
        module.exports = {
          name: 'exported-program',
          version: '2.0.0',
          capabilities: ['dig'],
          async run(ctx) {
            return ctx.control.success({ message: 'done' });
          }
        };
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('exported-program');
      expect(result.metadata.version).toBe('2.0.0');
      expect(result.metadata.capabilities).toEqual(['dig']);
    });
  });

  describe('error handling', () => {
    it('should handle syntax errors gracefully', () => {
      const source = `
        const program = defineProgram({
          name: 'syntax-error',
          async run(ctx) {
            this is not valid javascript
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Syntax error');
    });

    it('should handle runtime errors in defineProgram', () => {
      const source = `
        const x = null;
        const program = defineProgram({
          name: x.foo, // This will throw
          async run(ctx) {
            return { ok: true };
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Syntax error'); // Runtime errors are caught as syntax errors
    });

    it('should reject programs without proper export', () => {
      const source = `
        const program = defineProgram({
          name: 'not-exported',
          async run(ctx) {
            return { ok: true };
          }
        });
        // Forgot to export the program
      `;

      const result = sandbox.validateProgram(source);
      console.log('Not exported result:', result);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('export a program definition');
    });
  });

  describe('edge cases', () => {
    it('should handle empty source', () => {
      const source = '';
      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-only source', () => {
      const source = '   \n   \t   ';
      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
    });

    it('should handle program that returns non-object', () => {
      const source = `
        42
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('export a program definition');
    });

    it('should handle program with complex defaults', () => {
      const source = `
        const program = defineProgram({
          name: 'complex-defaults',
          version: '3.0.0',
          capabilities: ['move', 'dig', 'place'],
          defaults: {
            nested: {
              value: 123,
              array: [1, 2, 3]
            },
            flag: true
          },
          async run(ctx) {
            return ctx.control.success({ defaults: ctx.args });
          }
        });
        program
      `;

      const result = sandbox.validateProgram(source);
      
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('complex-defaults');
      expect(result.metadata.defaults).toEqual({
        nested: {
          value: 123,
          array: [1, 2, 3]
        },
        flag: true
      });
    });
  });
});