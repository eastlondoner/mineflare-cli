// Safe exploration with automatic hole escape - ultra-concise!
const { defineProgram } = globalThis.mineflareSDK;

const program = defineProgram({
  name: 'safe-explorer',
  version: '2.0.0',
  capabilities: ['move', 'pathfind', 'dig', 'place', 'inventory'],
  defaults: {
    exploreRadius: 100,
    maxRetries: 3
  },
  
  async run(ctx) {
    const { move, safety, flow, watch, log, control, geometry } = ctx;
    
    // Define a path to explore
    const waypoints = geometry.getCircle({ x: 0, y: 63, z: 0 }, 50, 8);
    
    for (const target of waypoints) {
      log.info(`Moving to waypoint`, { target });
      
      // Try to reach waypoint with timeout and retry
      const result = await flow.retryBudget(
        async () => {
          const moveResult = await move.safeStep(
            target.x - (await ctx.bot.getState()).position.x,
            target.z - (await ctx.bot.getState()).position.z,
            { maxDrop: 2, timeoutMs: 5000 }
          );
          
          // If stuck, try to escape
          if (!moveResult.ok && moveResult.error.includes('stuck')) {
            const escaped = await safety.escapeHole({
              maxPlace: 16,
              maxBreak: 32,
              timeoutMs: 10000
            });
            if (!escaped.ok) throw new Error('Cannot escape hole');
          }
          
          return moveResult;
        },
        { tries: 3, delayMs: 1000 }
      );
      
      if (!result.ok) {
        log.warn(`Failed to reach waypoint, continuing...`);
      }
      
      // Monitor vitals periodically
      await safety.monitorVitals({ minHealth: 10, minFood: 10 });
    }
    
    return control.success({
      message: 'Exploration complete',
      waypointsVisited: waypoints.length
    });
  }
});

program;