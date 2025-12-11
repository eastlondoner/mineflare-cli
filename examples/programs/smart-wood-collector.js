// Smart Wood Collector - Uses path analysis to find reachable trees
// Demonstrates the world.analyze.pathTo() API for intelligent block selection

const program = defineProgram({
  name: 'smart-wood-collector',
  version: '1.0.0',
  capabilities: ['move', 'dig', 'inventory', 'pathfind'],
  defaults: {
    searchRadius: 32,
    targetLogs: 4,
    maxDifficulty: 'easy' // trivial, easy, medium, hard
  },
  
  async run(ctx) {
    const { args, actions, world, log, control, bot } = ctx;
    
    log.info('=== Smart Wood Collector ===');
    log.info(`Search radius: ${args.searchRadius} blocks`);
    log.info(`Target logs: ${args.targetLogs}`);
    log.info(`Max difficulty: ${args.maxDifficulty}`);
    
    // Get current bot state
    const botState = await bot.getState();
    log.info(`Starting position: ${Math.floor(botState.position.x)}, ${Math.floor(botState.position.y)}, ${Math.floor(botState.position.z)}`);
    
    // Scan for all wood types
    const woodTypes = [
      'oak_log', 'spruce_log', 'jungle_log', 
      'birch_log', 'acacia_log', 'dark_oak_log',
      'mangrove_log', 'cherry_log'
    ];
    
    log.info('Scanning for trees...');
    const logs = await world.scan.blocks({
      kinds: woodTypes,
      radius: args.searchRadius,
      max: 20 // Scan more to have options
    });
    
    if (logs.length === 0) {
      return control.fail(`No trees found within ${args.searchRadius} blocks`);
    }
    
    log.info(`Found ${logs.length} log blocks. Analyzing reachability...`);
    
    // Difficulty ranking (lower is easier)
    const difficultyRank = {
      'trivial': 0,
      'easy': 1,
      'medium': 2,
      'hard': 3,
      'unreachable': 4
    };
    
    const maxDifficultyRank = difficultyRank[args.maxDifficulty] ?? 1;
    
    // Analyze each log and sort by ease of access
    const analyzedLogs = [];
    
    for (const logBlock of logs) {
      log.info(`Analyzing path to ${logBlock.name} at (${Math.floor(logBlock.position.x)}, ${Math.floor(logBlock.position.y)}, ${Math.floor(logBlock.position.z)})...`);
      
      try {
        const analysis = await world.analyze.pathTo(logBlock.position, { timeoutMs: 5000 });
        
        analyzedLogs.push({
          block: logBlock,
          analysis,
          difficultyRank: difficultyRank[analysis.difficulty] ?? 4
        });
        
        log.info(`  → ${analysis.difficulty} (${analysis.suggestedApproach || 'n/a'})`);
        
        if (analysis.requirements.digging.needed) {
          log.info(`     Needs to mine ${analysis.requirements.digging.blocks.length} blocks`);
        }
        if (analysis.requirements.building.needed) {
          log.info(`     Needs ${analysis.requirements.building.blocksRequired} blocks for bridging`);
        }
      } catch (error) {
        log.info(`  → Error analyzing: ${error.message}`);
      }
    }
    
    // Sort by difficulty (easiest first)
    analyzedLogs.sort((a, b) => {
      // First by difficulty
      if (a.difficultyRank !== b.difficultyRank) {
        return a.difficultyRank - b.difficultyRank;
      }
      // Then by distance
      return a.analysis.distance - b.analysis.distance;
    });
    
    // Filter to only logs within our difficulty tolerance
    const reachableLogs = analyzedLogs.filter(l => l.difficultyRank <= maxDifficultyRank);
    
    if (reachableLogs.length === 0) {
      return control.fail(`No trees reachable within difficulty "${args.maxDifficulty}"`, {
        totalFound: logs.length,
        analyzed: analyzedLogs.length
      });
    }
    
    log.info(`\n${reachableLogs.length} reachable logs found (difficulty <= ${args.maxDifficulty})`);
    
    // Collect logs
    let collected = 0;
    
    for (const { block, analysis } of reachableLogs) {
      if (collected >= args.targetLogs) break;
      
      log.info(`\nCollecting ${block.name} at (${Math.floor(block.position.x)}, ${Math.floor(block.position.y)}, ${Math.floor(block.position.z)})`);
      log.info(`  Approach: ${analysis.suggestedApproach}, Difficulty: ${analysis.difficulty}`);
      
      try {
        // Navigate based on suggested approach
        const navOptions = { maxSteps: 500 };
        
        // If we need to dig, enable it in pathfinding
        if (analysis.suggestedApproach === 'dig' || analysis.suggestedApproach === 'dig_and_build') {
          navOptions.allowDig = true;
          log.info('  Pathfinding with digging enabled');
        }
        
        // Go to a position adjacent to the log
        const targetPos = block.position.offset(1, 0, 0);
        await actions.navigate.goto(targetPos, navOptions);
        
        // Mine the log
        log.info('  Mining...');
        await actions.gather.mineBlock({
          position: block.position,
          expect: 'log',
          timeoutMs: 15000
        });
        
        collected++;
        log.info(`  ✓ Collected! (${collected}/${args.targetLogs})`);
        
        // Small delay for item pickup
        await sleep(500);
        
      } catch (error) {
        log.info(`  ✗ Failed: ${error.message}`);
        // Continue to next log
      }
    }
    
    // Check final inventory
    const inventory = await actions.inventory.get();
    const woodCount = inventory
      .filter(item => item.name.includes('log'))
      .reduce((sum, item) => sum + item.count, 0);
    
    log.info(`\n=== Collection Complete ===`);
    log.info(`Logs collected this run: ${collected}`);
    log.info(`Total logs in inventory: ${woodCount}`);
    
    if (collected > 0) {
      return control.success({
        message: `Collected ${collected} logs`,
        logsCollected: collected,
        totalWoodInInventory: woodCount,
        logsAnalyzed: analyzedLogs.length,
        reachableFound: reachableLogs.length
      });
    } else {
      return control.fail('Failed to collect any logs', {
        logsAnalyzed: analyzedLogs.length,
        reachableFound: reachableLogs.length
      });
    }
  }
});

// Export the program
program


