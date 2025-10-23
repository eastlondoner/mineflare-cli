// Test program to verify sleep function works in sandbox
const { defineProgram, sleep } = globalThis.mineflareSDK;

const program = defineProgram({
  name: 'test-sleep',
  version: '1.0.0',
  capabilities: [],
  defaults: {
    delay: 1000
  },
  
  async run(ctx) {
    const { args, log, control, clock } = ctx;
    
    log.info('Starting sleep test program');
    
    const startTime = clock.now();
    log.info(`Start time: ${startTime}ms`);
    
    // Test the sleep function
    log.info(`Sleeping for ${args.delay}ms...`);
    await sleep(args.delay);
    
    const endTime = clock.now();
    const elapsed = endTime - startTime;
    log.info(`End time: ${endTime}ms`);
    log.info(`Elapsed time: ${elapsed}ms`);
    
    // Verify sleep worked approximately correctly (within 100ms tolerance)
    const tolerance = 100;
    if (Math.abs(elapsed - args.delay) <= tolerance) {
      return control.success({
        message: 'Sleep test passed',
        requestedDelay: args.delay,
        actualElapsed: elapsed,
        difference: Math.abs(elapsed - args.delay)
      });
    } else {
      return control.fail('Sleep timing was inaccurate', {
        requestedDelay: args.delay,
        actualElapsed: elapsed,
        difference: Math.abs(elapsed - args.delay),
        tolerance: tolerance
      });
    }
  }
});

// Export the program
program;