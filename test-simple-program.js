
// Test program that should work when bot is connected
defineProgram({
  name: 'test-simple',
  version: '1.0.0',
  capabilities: [],
  async run(ctx) {
    const { log, control, bot } = ctx;
    log.info('Test program starting...');
    
    // Try to get bot state
    const state = await bot.getState();
    log.info('Bot position: ' + JSON.stringify(state.position));
    
    return control.success({ 
      message: 'Test completed',
      position: state.position
    });
  }
});