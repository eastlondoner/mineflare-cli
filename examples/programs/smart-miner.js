// Smart mining with resource monitoring and automatic safety - super concise!
// SDK components are available globally - use them directly

const program = defineProgram({
  name: 'smart-miner',
  version: '2.0.0',
  capabilities: ['move', 'pathfind', 'dig', 'place', 'inventory', 'craft'],
  defaults: {
    targetOre: 'diamond_ore',
    maxDepth: 20,
    timeout: 300000 // 5 minutes
  },
  
  async run(ctx) {
    const { world, nav, interact, safety, watch, flow, geometry, log, control } = ctx;
    
    // Use withTimeout for the entire operation
    const miningOp = await flow.withTimeout(async () => {
      // Search for ore in expanding pattern
      const oreFound = await ctx.search.spiral({
        radius: 50,
        at: async (pos) => {
          const ores = await world.scanBlocks({
            kinds: [ctx.args.targetOre, 'iron_ore', 'coal_ore'],
            radius: 16,
            max: 5
          });
          
          if (ores.length > 0) {
            // Sort by value (diamonds > iron > coal) and distance
            const sorted = geometry.nearestFirst(
              await ctx.bot.getState().then(s => s.position),
              ores.map(o => o.pos)
            );
            return ok({ ore: ores[0], positions: sorted });
          }
          return fail('no ore');
        }
      });
      
      if (!oreFound.ok) return fail('No ore found');
      
      const oreData = oreFound.value.value;
      log.info(`Found ${oreData.ore.name}!`, { count: oreData.positions.length });
      
      // Mine all found ore with safety checks
      for (const pos of oreData.positions) {
        // Navigate with automatic hole escape
        const navResult = await flow.retryBudget(
          async () => {
            const r = await nav.goto(pos, { avoidHoles: true, maxDrop: 3 });
            if (!r.ok && r.error.includes('stuck')) {
              await safety.escapeHole({ maxPlace: 8, maxBreak: 16, timeoutMs: 5000 });
            }
            return r;
          },
          { tries: 2, delayMs: 500 }
        );
        
        if (!navResult.ok) continue;
        
        // Mine with monitoring
        const mineTask = interact.mine({ pos, expectName: oreData.ore.name });
        const vitalTask = safety.monitorVitals({ minHealth: 10, minFood: 10 });
        
        // Run mining and monitoring in parallel
        const [mineResult] = await Promise.all([mineTask, vitalTask]);
        
        if (mineResult.ok) {
          log.info(`Mined block at ${pos.x}, ${pos.y}, ${pos.z}`);
        }
        
        // Wait for inventory to update
        await watch.until(
          async () => {
            const inv = await ctx.inv.list();
            return inv.some(i => i.name.includes('ore'));
          },
          { timeoutMs: 2000 }
        );
      }
      
      return ok({
        oreType: oreData.ore.name,
        blocksMined: oreData.positions.length
      });
      
    }, ctx.args.timeout);
    
    if (!miningOp.ok) {
      return control.fail(`Mining operation failed: ${miningOp.error}`);
    }
    
    // Create safe zone before finishing
    await safety.createSafeZone({ radius: 3, lightLevel: 10 });
    
    return control.success({
      message: 'Mining complete',
      result: miningOp.value
    });
  }
});

// Export the program (last expression is returned)
program