const program = defineProgram({
  name: 'square-walk',
  version: '1.0.0',
  capabilities: ['move', 'pathfind'],
  
  async run(ctx) {
    const { bot, actions, log, control } = ctx;
    
    const state = await bot.getState();
    const start = state.position;
    log.info('Starting at ' + start.x + ', ' + start.z);
    
    // Walk a 5-block square
    const corners = [
      new Vec3(start.x + 5, start.y, start.z),
      new Vec3(start.x + 5, start.y, start.z + 5),
      new Vec3(start.x, start.y, start.z + 5),
      new Vec3(start.x, start.y, start.z)
    ];
    
    for (const corner of corners) {
      log.info('Moving to ' + corner.x + ', ' + corner.z);
      await actions.navigate.goto(corner, { timeoutMs: 15000 });
      await sleep(500);
    }
    
    return control.success({ message: 'Square complete' });
  }
});

program
