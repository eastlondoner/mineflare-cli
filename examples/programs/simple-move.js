// Simple movement program
// SDK components are available globally - use them directly

const program = defineProgram({
  name: 'simple-move',
  version: '1.0.0',
  capabilities: ['move'],
  defaults: {
    x: 10,
    y: 63,
    z: 10
  },
  
  async run(ctx) {
    const { args, actions, bot, log, control } = ctx;
    
    // Get current position
    const startPos = await bot.getState();
    log.info(`Current position: ${startPos.position.x}, ${startPos.position.y}, ${startPos.position.z}`);
    
    // Create target position
    const target = new Vec3(args.x, args.y, args.z);
    log.info(`Moving to: ${target.x}, ${target.y}, ${target.z}`);
    
    // Move to target
    try {
      await actions.navigate.goto(target, {
        timeoutMs: 60000
      });
      
      // Get final position
      const endPos = await bot.getState();
      log.info(`Arrived at: ${endPos.position.x}, ${endPos.position.y}, ${endPos.position.z}`);
      
      return control.success({
        message: 'Movement completed',
        startPosition: startPos.position,
        targetPosition: target,
        finalPosition: endPos.position
      });
    } catch (error) {
      return control.fail('Failed to reach target', {
        error: error.message,
        target: target
      });
    }
  }
});

// Export the program (last expression is returned)
program