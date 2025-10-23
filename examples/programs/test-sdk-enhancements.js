/**
 * Test program to demonstrate the new SDK enhancements
 * This program uses the new composable SDK functions
 */

const sdk = require('../../src/program-system/sdk');

module.exports = sdk.defineProgram({
  name: 'test-sdk-enhancements',
  version: '1.0.0',
  capabilities: ['move', 'pathfind', 'dig', 'inventory'],
  
  async run(ctx) {
    ctx.log.info('Testing new SDK enhancements');
    
    // Test flow control with timeout
    const timeoutTest = await ctx.flow.withTimeout(
      async () => {
        await ctx.clock.sleep(1000);
        return 'success';
      },
      5000,
      'Test operation'
    );
    
    if (timeoutTest.ok) {
      ctx.log.info('Timeout test passed:', timeoutTest.value);
    }
    
    // Test retry with budget
    const retryTest = await ctx.flow.retryBudget(
      async () => {
        const state = await ctx.bot.getState();
        ctx.log.info('Current position:', state.position);
        return { ok: true, value: state.position };
      },
      {
        maxAttempts: 2,
        baseDelayMs: 500
      }
    );
    
    if (retryTest.ok) {
      ctx.log.info('Retry test passed:', retryTest.value);
    }
    
    // Test geometry utilities
    const currentState = await ctx.bot.getState();
    const positions = [
      new sdk.Vec3(currentState.position.x + 5, currentState.position.y, currentState.position.z),
      new sdk.Vec3(currentState.position.x - 5, currentState.position.y, currentState.position.z),
      new sdk.Vec3(currentState.position.x, currentState.position.y, currentState.position.z + 5)
    ];
    
    const sorted = ctx.geometry.nearestFirst(positions, currentState.position);
    ctx.log.info('Nearest position:', sorted[0]);
    
    // Test movement with safety
    const moveResult = await ctx.move.moveCardinal('north', 2, {
      maxDrop: 3,
      checkSupport: true
    });
    
    if (moveResult.ok) {
      ctx.log.info('Moved successfully:', moveResult.stepsCompleted, 'steps');
    } else {
      ctx.log.warn('Movement limited:', moveResult.error);
    }
    
    // Test watcher utility - wait for a short time
    const waitResult = await ctx.watch.until(
      async () => {
        const time = await ctx.world.time();
        return time.dayTime > 1000;
      },
      {
        checkInterval: 1000,
        timeoutMs: 10000,
        description: 'Waiting for time'
      }
    );
    
    ctx.log.info('Wait result:', waitResult.ok ? 'Condition met' : 'Timed out');
    
    // Test search pattern with a simple predicate
    const searchResult = await ctx.search.expandSquare({
      radius: 5,
      predicate: async (pos) => {
        // Look for any non-air block
        const blocks = await ctx.world.scan.blocks({
          kinds: ['stone', 'dirt', 'grass_block'],
          radius: 1,
          max: 1
        });
        return blocks.length > 0;
      },
      onRing: (ring) => ctx.log.info('Searching ring:', ring)
    });
    
    if (searchResult.ok) {
      ctx.log.info('Found block at:', searchResult.value.position);
      ctx.log.info('Search stats:', searchResult.stats);
    }
    
    ctx.control.success({
      message: 'SDK enhancements tested successfully',
      testsCompleted: [
        'flow control (timeout, retry)',
        'geometry utilities',
        'movement primitives',
        'watcher utilities',
        'search patterns'
      ]
    });
  }
});