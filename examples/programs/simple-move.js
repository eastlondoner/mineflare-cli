// Simple movement program
// SDK components are available globally - use them directly

const program = defineProgram({
  name: 'simple-move',
  version: '1.0.0',
  capabilities: ['move'],
  defaults: {
    dx: 5,
    dy: 0,
    dz: 5
  },
  
  async run(ctx) {
    const { args, actions, bot, log, control } = ctx;
    
    // Get current position
    const startPos = await bot.getState();
    log.info(`Current position: ${startPos.position.x}, ${startPos.position.y}, ${startPos.position.z}`);
    
    // Determine target position (absolute or relative)
    const target = typeof args.x === 'number' && typeof args.y === 'number' && typeof args.z === 'number'
      ? new Vec3(args.x, args.y, args.z)
      : new Vec3(
          startPos.position.x + (args.dx ?? 0),
          startPos.position.y + (args.dy ?? 0),
          startPos.position.z + (args.dz ?? 0)
        );
    log.info(`Moving to: ${target.x}, ${target.y}, ${target.z}`);
    
    // Move to target
    let moveResult;
    try {
      moveResult = await actions.navigate.goto(target, {
        timeoutMs: 60000
      });
    } catch (error) {
      return control.fail('Failed to reach target', {
        error: error.message,
        target
      });
    }
    
    if (moveResult && moveResult.arrived === false) {
      return control.fail('Failed to reach target', {
        target,
        reason: moveResult.reason || 'unknown'
      });
    }
    
    // Get final position
    const endPos = await bot.getState();
    log.info(`Arrived at: ${endPos.position.x}, ${endPos.position.y}, ${endPos.position.z}`);
    
    return control.success({
      message: 'Movement completed',
      startPosition: startPos.position,
      targetPosition: target,
      finalPosition: endPos.position,
      navigation: moveResult
    });
  }
});

// Export the program (last expression is returned)
program
