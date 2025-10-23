// Find first log and craft table - 12 lines of actual logic!
const { defineProgram, ok, fail } = globalThis.mineflareSDK;

const program = defineProgram({
  name: 'find-and-craft-table',
  version: '2.0.0',
  capabilities: ['move', 'pathfind', 'dig', 'craft', 'inventory'],
  
  async run(ctx) {
    const { world, search, nav, interact, craft, log, control } = ctx;
    
    // Find wood using enhanced expandSquare
    const found = await search.expandSquare({
      radius: 1024,
      at: async () => {
        const logs = await world.scanBlocks({ 
          kinds: ['oak_log', 'spruce_log', 'birch_log'], 
          radius: 32, 
          max: 1 
        });
        return logs.length ? ok(logs[0]) : fail('no logs here');
      },
      onRing: (r) => log.info('Searching ring', { ring: r })
    });
    
    if (!found.ok) return control.fail('No wood found within 1024 blocks');
    
    // Navigate to the log
    const p = found.value.value.pos;
    if (!(await nav.goto(p, { avoidHoles: true, maxDrop: 1 })).ok) 
      return control.fail('Cannot reach wood');
    
    // Mine the log
    if (!(await interact.mine({ pos: p, expectName: found.value.value.name })).ok) 
      return control.fail('Failed to mine log');
    
    // Craft a table
    if (!(await craft.ensureTable()).ok) 
      return control.fail('Failed to craft table');
    
    log.info('Successfully found wood and crafted table!');
    return control.success({ 
      woodType: found.value.value.name, 
      position: p 
    });
  }
});

program;