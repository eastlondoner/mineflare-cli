// Ultra simple test program - no bot interaction needed
const program = defineProgram({
  name: 'test-simple',
  version: '1.0.0',
  capabilities: [],
  
  async run(ctx) {
    const { log, control } = ctx;
    
    log.info('Simple test program running!');
    log.info('Context available:', Object.keys(ctx).join(', '));
    
    return control.success({
      message: 'Test completed successfully',
      timestamp: Date.now()
    });
  }
});

// Export the program
program