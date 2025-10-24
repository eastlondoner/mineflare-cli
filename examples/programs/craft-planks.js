// Program to craft wooden planks from logs
// SDK component (defineProgram) is available globally from mineflareSDK

const program = defineProgram({
  name: 'craft-planks',
  version: '1.0.0',
  capabilities: ['craft', 'inventory'],
  defaults: {
    amount: 4
  },
  
  async run(ctx) {
    const { args, actions, log, control } = ctx;
    
    log.info('Starting crafting program');
    
    // Check inventory for logs
    const inventory = await actions.inventory.get();
    const logs = inventory.filter(item => item.name.includes('log'));
    
    if (logs.length === 0) {
      return control.fail('No logs found in inventory', {
        inventory: inventory
      });
    }
    
    const logType = logs[0].name;
    const logCount = logs[0].count;
    log.info(`Found ${logCount} ${logType} in inventory`);
    
    // Determine plank type based on log type
    const plankType = logType.replace('_log', '_planks').replace('log', 'oak_planks');
    
    // Calculate how many planks we can make (1 log = 4 planks)
    const craftCount = Math.min(Math.floor(args.amount / 4), logCount);
    
    if (craftCount === 0) {
      return control.fail('Not enough logs to craft requested amount', {
        requested: args.amount,
        available: logCount * 4
      });
    }
    
    log.info(`Crafting ${craftCount * 4} planks from ${craftCount} logs`);
    
    // Craft the planks
    try {
      await actions.craft.craft(plankType, craftCount);
      
      // Check inventory after crafting
      const newInventory = await actions.inventory.get();
      const planks = newInventory.filter(item => item.name.includes('planks'));
      const totalPlanks = planks.reduce((sum, item) => sum + item.count, 0);
      
      log.info(`Successfully crafted planks. Total planks in inventory: ${totalPlanks}`);
      
      return control.success({
        message: 'Crafting completed',
        crafted: plankType,
        amount: craftCount * 4,
        totalPlanks: totalPlanks
      });
    } catch (error) {
      return control.fail('Failed to craft planks', {
        error: error.message
      });
    }
  }
});

// Export the program
program