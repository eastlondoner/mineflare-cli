// Program to search for wood in an expanding pattern
// SDK components are available globally - use them directly

const program = defineProgram({
  name: 'search-wood',
  version: '1.0.0',
  capabilities: ['move', 'look', 'dig', 'inventory', 'pathfind'],
  defaults: {
    searchRadius: 64,
    gatherCount: 1
  },
  
  async run(ctx) {
    const { args, actions, world, log, control, bot } = ctx;
    
    log.info('Starting wood search program');
    log.info(`Search radius: ${args.searchRadius} blocks`);
    
    // Get current bot state
    const botState = await bot.getState();
    log.info(`Starting position: ${botState.position.x}, ${botState.position.y}, ${botState.position.z}`);
    
    // Search for wood using expanding square pattern
    const result = await actions.search.expandSquare({
      radius: args.searchRadius,
      predicate: async () => {
        // Scan for wood blocks nearby
        const logs = await world.scan.blocks({
          kinds: [
            'oak_log', 'spruce_log', 'jungle_log', 
            'birch_log', 'acacia_log', 'dark_oak_log',
            'mangrove_log', 'cherry_log'
          ],
          radius: 32,
          max: 1
        });
        
        if (logs.length > 0) {
          log.info(`Found ${logs[0].name} at ${logs[0].position.x}, ${logs[0].position.y}, ${logs[0].position.z}`);
          return ok(logs[0]);
        }
        
        return fail('no logs found at this position');
      },
      ringCallback: async (ring) => {
        log.info(`Completed search ring ${ring}`);
      }
    });
    
    if (!result.ok) {
      return control.fail(`No wood found within ${args.searchRadius} blocks`, {
        positionsVisited: result.positionsVisited
      });
    }
    
    const logBlock = result.value;
    log.info(`Wood found! Moving to ${logBlock.position.x}, ${logBlock.position.y}, ${logBlock.position.z}`);
    
    // Navigate to the wood
    await actions.navigate.goto(logBlock.position, {
      timeoutMs: 30000
    });
    
    // Mine the wood
    log.info(`Mining ${logBlock.name}`);
    await actions.gather.mineBlock({
      position: logBlock.position,
      expect: 'log',
      timeoutMs: 10000
    });
    
    // Check inventory
    const inventory = await actions.inventory.get();
    const woodCount = inventory
      .filter(item => item.name.includes('log'))
      .reduce((sum, item) => sum + item.count, 0);
    
    log.info(`Successfully gathered wood. Total logs in inventory: ${woodCount}`);
    
    return control.success({
      message: 'Wood gathering completed',
      woodType: logBlock.name,
      woodCount: woodCount,
      position: logBlock.position,
      positionsVisited: result.positionsVisited
    });
  }
});

// Export the program
program;