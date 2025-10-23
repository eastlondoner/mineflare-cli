// Simple hello world program to test basic functionality
const { defineProgram, ok, fail } = globalThis.mineflareSDK;

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

// Export the program
program;