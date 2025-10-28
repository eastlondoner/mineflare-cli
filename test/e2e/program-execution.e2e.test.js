const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const axios = require('axios');
const { prepareTestArea, withRcon, sendCommandWithRetry } = require('./utils/rcon');

describe('E2E: Program Execution', () => {
  let serverProcess;
  const serverPort = 3400 + Math.floor(Math.random() * 1000);
  let apiClient;
  const testProgramsDir = path.join(__dirname, 'fixtures', 'test-programs');
  const suffixSeed = (process.env.E2E_BOT_SUFFIX || process.env.JEST_WORKER_ID || '').replace(/[^a-zA-Z0-9]/g, '').slice(-3);
  const randomPart = Math.random().toString(36).slice(2, 8);
  const botUsername = `E2E${suffixSeed}${randomPart}`.slice(0, 16);
  const readProgramSource = (filename) => fs.readFile(path.join(testProgramsDir, filename), 'utf8');

  let areaIndex = 0;

  const allocateArea = () => areaIndex++;
  const stageArea = async (overrides = {}) => {
    await prepareTestArea({ username: botUsername, areaIndex: allocateArea(), ...overrides });
  };
  const ensureBotConnected = async () => {
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await apiClient.get('/status');
        if (status.data.connected) return;
      } catch (error) {
        // Ignore and retry
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Bot did not connect within expected time');
  };
  const prepareBotForTest = async (overrides = {}) => {
    await ensureBotConnected();
    await stageArea(overrides);
    await ensureBotConnected();
  };

  beforeAll(async () => {
    // Create test programs directory
    await fs.mkdir(testProgramsDir, { recursive: true });

    // Create test program files
    await createTestPrograms();

    // Start bot server
    serverProcess = await startBotServer();

    // Setup API client
    // Disable proxy to avoid url.parse() deprecation warning (DEP0169)
    apiClient = axios.create({
      baseURL: `http://localhost:${serverPort}`,
      timeout: 60000,
      proxy: false  // Add this to prevent deprecation warning
    });

    // Wait for server to be ready
    await waitForServer();

    await ensureBotConnected();
  });

  afterAll(async () => {
    // Clean up test programs
    await fs.rm(testProgramsDir, { recursive: true, force: true });

    // Stop server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  async function createTestPrograms() {
    // Simple movement program
    await fs.writeFile(
      path.join(testProgramsDir, 'simple-move.js'),
      `
module.exports = async function(ctx) {
  const { Vec3, ok, fail } = ctx;

  const state = await ctx.bot.getState();
  console.log('Current position:', state.position);

  const result = await ctx.move.moveCardinal('north', 1);

  if (result.ok) {
    return ok('Moved north successfully');
  } else {
    return fail('Movement failed: ' + result.error);
  }
};
      `
    );

    // Program with safety checks
    await fs.writeFile(
      path.join(testProgramsDir, 'safe-explore.js'),
      `
module.exports = async function(ctx) {
  const { ok, fail } = ctx;

  // Monitor vitals while exploring
  const result = await ctx.safety.monitorVitals({
    minHealth: 10,
    minFood: 5,
    action: async () => {
      // Try to explore safely
      for (let i = 0; i < 5; i++) {
        const stepResult = await ctx.safety.safeStep(
          new ctx.Vec3(1, 0, 0),
          { checkLava: true, checkFall: true }
        );

        if (!stepResult.ok) {
          return stepResult;
        }

        await ctx.flow.sleep(1000);
      }

      return { ok: true, value: 'Exploration complete' };
    }
  });

  return result.ok
    ? ok(result.value)
    : fail('Exploration failed: ' + result.error);
};
      `
    );

    // Program using flow control
    await fs.writeFile(
      path.join(testProgramsDir, 'flow-control.js'),
      `
module.exports = async function(ctx) {
  const { ok, fail } = ctx;

  // Try an operation with timeout and retries
  const result = await ctx.flow.retryBudget(
    async () => {
      return await ctx.flow.withTimeout(
        async () => {
          const state = await ctx.bot.getState();
          if (state.health < 20) {
            return { ok: true, value: 'Health checked' };
          }
          return { ok: false, error: 'Health too low' };
        },
        5000,
        'Health check'
      );
    },
    {
      maxAttempts: 3,
      baseDelayMs: 1000
    }
  );

  return result.ok ? ok(result.value) : fail(result.error);
};
      `
    );

    // Program with capabilities check
    await fs.writeFile(
      path.join(testProgramsDir, 'capabilities-test.js'),
      `
const { defineProgram } = require('@mineflare/sdk');

module.exports = defineProgram({
  name: 'Capabilities Test',
  version: '1.0.0',
  capabilities: ['move', 'dig', 'place'],
  defaults: { testValue: 42 },
  execute: async (ctx) => {
    const { ok, fail } = ctx;

    // Check we have the right capabilities
    if (!ctx.capabilities.includes('move')) {
      return fail('Missing move capability');
    }

    if (!ctx.capabilities.includes('dig')) {
      return fail('Missing dig capability');
    }

    // Check args were merged with defaults
    if (ctx.args.testValue !== 42 && !ctx.args.overrideValue) {
      return fail('Default args not applied');
    }

    return ok('Capabilities verified');
  }
});
      `
    );

    // Program with search patterns
    await fs.writeFile(
      path.join(testProgramsDir, 'search-pattern.js'),
      `
module.exports = async function(ctx) {
  const { ok, fail } = ctx;

  // Search in expanding square pattern
  const result = await ctx.search.expandSquare({
    radius: 10,
    predicate: async (pos) => {
      // Look for diamond ore
      const blocks = await ctx.world.scan.blocks({
        kinds: ['diamond_ore'],
        radius: 3,
        max: 1
      });

      if (blocks.length > 0) {
        return { found: true, block: blocks[0] };
      }

      return false;
    },
    onRing: (ring) => {
      console.log('Searching ring', ring);
    }
  });

  if (result.ok) {
    return ok('Found diamond at: ' + JSON.stringify(result.value.position));
  } else {
    return fail('No diamonds found in area');
  }
};
      `
    );
  }

  async function startBotServer() {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '..', '..', 'src', 'server.js');

      const server = spawn('bun', [serverPath], {
        env: {
          ...process.env,
          MINEFLARE_SERVER_PORT: serverPort,
          MC_HOST: 'localhost',
          MC_PORT: 25565,
          MC_USERNAME: botUsername,
          MC_AUTH: 'offline',
          LOG_LEVEL: 'error' // Reduce noise in tests
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      server.on('error', reject);

      server.stdout.on('data', (data) => {
        const output = data.toString();
        if (
          output.includes('Server running') ||
          output.includes('Bot server listening')
        ) {
          resolve(server);
        }
      });

      server.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        reject(new Error('Server failed to start'));
      }, 10000);
    });
  }

  async function waitForServer(retries = 30) {
    for (let i = 0; i < retries; i++) {
      try {
        await apiClient.get('/health');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Server did not become ready');
  }

  describe('Program Registry', () => {
    it('should add a program to registry', async () => {
      const simpleMoveSource = await readProgramSource('simple-move.js');
      const response = await apiClient.post('/program/add', {
        name: 'test-movement',
        source: simpleMoveSource,
        capabilities: ['move']
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.program.name).toBe('test-movement');
    });

    it('should list registered programs', async () => {
      // Add a program first
      const simpleMoveSource = await readProgramSource('simple-move.js');
      await apiClient.post('/program/add', {
        name: 'test-list',
        source: simpleMoveSource,
        capabilities: ['move']
      });

      const response = await apiClient.get('/program/list');

      expect(response.status).toBe(200);
      expect(response.data.programs).toBeInstanceOf(Array);
      expect(response.data.programs.some(p => p.name === 'test-list')).toBe(true);
    });

    it('should remove a program from registry', async () => {
      // Add a program
      const simpleMoveSource = await readProgramSource('simple-move.js');
      await apiClient.post('/program/add', {
        name: 'test-remove',
        source: simpleMoveSource,
        capabilities: ['move']
      });

      // Remove it
      const response = await apiClient.delete('/program/remove/test-remove');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify it's gone
      const listResponse = await apiClient.get('/program/list');
      expect(listResponse.data.programs.some(p => p.name === 'test-remove')).toBe(false);
    });
  });

  describe('Example Programs', () => {
    it(
      'should complete find-and-craft-table end to end',
      async () => {
        await ensureBotConnected();

        let state;
        try {
          const response = await apiClient.get('/state');
          state = response.data;
        } catch {
          // If state endpoint fails, continue with defaults
          state = null;
        }

        const baseX = Math.floor(state?.position?.x ?? 0);
        const baseY = Math.floor(state?.position?.y ?? 70);
        const baseZ = Math.floor(state?.position?.z ?? 0);

        const treeX = baseX + 4;
        const treeY = baseY;
        const treeZ = baseZ;

        await withRcon(async (rcon) => {
          const commands = [
            'time set day',
            'weather clear',
            `fill ${treeX - 1} ${treeY - 1} ${treeZ - 1} ${treeX + 1} ${treeY - 1} ${treeZ + 1} minecraft:stone`,
            `setblock ${treeX} ${treeY} ${treeZ} minecraft:oak_log`,
            `setblock ${treeX} ${treeY + 1} ${treeZ} minecraft:oak_log`,
            `setblock ${treeX} ${treeY + 2} ${treeZ} minecraft:oak_leaves`,
            `setblock ${treeX + 1} ${treeY + 2} ${treeZ} minecraft:oak_leaves`,
            `setblock ${treeX - 1} ${treeY + 2} ${treeZ} minecraft:oak_leaves`,
            `setblock ${treeX} ${treeY + 2} ${treeZ + 1} minecraft:oak_leaves`,
            `setblock ${treeX} ${treeY + 2} ${treeZ - 1} minecraft:oak_leaves`,
            `setblock ${treeX} ${treeY + 3} ${treeZ} minecraft:oak_leaves`
          ];

          for (const command of commands) {
            await sendCommandWithRetry(rcon, command);
          }
        });

        await ensureBotConnected();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await ensureBotConnected();

        const findCraftSource = await fs.readFile(
          path.join(__dirname, '..', '..', 'examples', 'programs', 'find-and-craft-table.js'),
          'utf8'
        );

        const response = await apiClient.post('/program/exec', {
          source: findCraftSource,
          capabilities: ['move', 'pathfind', 'dig', 'craft', 'inventory'],
          timeout: 90000
        });

        expect(response.status).toBe(200);
        if (!response.data.success) {
          console.log('find-and-craft failure', response.data);
        }
        expect(response.data.success).toBe(true);
        expect(response.data.result).toEqual(
          expect.objectContaining({
            woodType: expect.stringMatching(/_log$/),
            position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
          })
        );
      },
      120000
    );
  });

  describe('Program Execution', () => {
    it('should execute a simple program', async () => {
      await prepareBotForTest();
      const simpleMoveSource = await readProgramSource('simple-move.js');
      const response = await apiClient.post('/program/exec', {
        source: simpleMoveSource,
        capabilities: ['move', 'pathfind'],
        timeout: 10000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.result).toBeDefined();
    }, 15000);

    it('should execute program with flow control', async () => {
      await prepareBotForTest();
      const flowControlSource = await readProgramSource('flow-control.js');
      const response = await apiClient.post('/program/exec', {
        source: flowControlSource,
        capabilities: ['move'],
        timeout: 15000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    }, 20000);

    it('should respect capability restrictions', async () => {
      await prepareBotForTest();
      // Try to execute without required capabilities
      const capabilitiesSource = await readProgramSource('capabilities-test.js');
      const response = await apiClient.post('/program/exec', {
        source: capabilitiesSource,
        capabilities: ['move'], // Missing 'dig' and 'place'
        timeout: 5000
      });

      // Program should detect missing capabilities
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('Missing dig capability');
    });

    it('should pass arguments to program', async () => {
      await prepareBotForTest();
      const capabilitiesSource = await readProgramSource('capabilities-test.js');
      const response = await apiClient.post('/program/exec', {
        source: capabilitiesSource,
        capabilities: ['move', 'dig', 'place'],
        args: { overrideValue: 100 },
        timeout: 5000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.result).toBe('Capabilities verified');
    });

    it('should handle program timeouts', async () => {
      await prepareBotForTest();
      // Create a program that runs too long
      const timeoutProgram = path.join(testProgramsDir, 'timeout-test.js');
      await fs.writeFile(
        timeoutProgram,
        `
module.exports = async function(ctx) {
  // Infinite loop
  while (true) {
    await ctx.flow.sleep(100);
  }
};
        `
      );
      const timeoutSource = await fs.readFile(timeoutProgram, 'utf8');

      const response = await apiClient.post('/program/exec', {
        source: timeoutSource,
        capabilities: ['move'],
        timeout: 2000 // 2 second timeout
      });

      expect(response.status).toBe(500);
      expect(response.data.error).toContain('timeout');
    });
  });

  describe('Program Safety Features', () => {
    it('should execute safety monitoring', async () => {
      await prepareBotForTest();
      const safeExploreSource = await readProgramSource('safe-explore.js');
      const response = await apiClient.post('/program/exec', {
        source: safeExploreSource,
        capabilities: ['move', 'pathfind'],
        timeout: 20000
      });

      // Program should complete (may succeed or fail based on world state)
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
    }, 25000);
  });

  describe('Deterministic Execution', () => {
    it('should produce same results with same seed', async () => {
      await prepareBotForTest();
      // Create a deterministic program
      const deterministicProgram = path.join(testProgramsDir, 'deterministic.js');
      await fs.writeFile(
        deterministicProgram,
        `
module.exports = async function(ctx) {
  const { SeededRandom, ok } = ctx;

  const random = new SeededRandom(ctx.args.seed || 42);
  const values = [];

  for (let i = 0; i < 5; i++) {
    values.push(random.next());
  }

  return ok(values.join(','));
};
        `
      );
      const deterministicSource = await fs.readFile(deterministicProgram, 'utf8');

      // Execute with same seed twice
      const response1 = await apiClient.post('/program/exec', {
        source: deterministicSource,
        capabilities: [],
        args: { seed: 12345 },
        timeout: 5000
      });

      const response2 = await apiClient.post('/program/exec', {
        source: deterministicSource,
        capabilities: [],
        args: { seed: 12345 },
        timeout: 5000
      });

      expect(response1.data.result).toBe(response2.data.result);

      // Different seed should produce different results
      const response3 = await apiClient.post('/program/exec', {
        source: deterministicSource,
        capabilities: [],
        args: { seed: 54321 },
        timeout: 5000
      });

      expect(response3.data.result).not.toBe(response1.data.result);
    });
  });

  describe('Resource Budgets', () => {
    it('should enforce operation limits', async () => {
      await prepareBotForTest();
      // Create a program that exceeds limits
      const budgetProgram = path.join(testProgramsDir, 'budget-test.js');
      await fs.writeFile(
        budgetProgram,
        `
module.exports = async function(ctx) {
  const { fail } = ctx;

  try {
    // Try to move 100 times rapidly (exceeds per-minute limit of 60)
    for (let i = 0; i < 100; i++) {
      await ctx.actions.navigate.goto({ x: i, y: 64, z: 0 });
    }

    return fail('Should have hit rate limit');
  } catch (error) {
    if (error.code === 'RESOURCE_LIMIT') {
      return ctx.ok('Rate limit enforced correctly');
    }
    throw error;
  }
};
        `
      );
      const budgetSource = await fs.readFile(budgetProgram, 'utf8');

      const response = await apiClient.post('/program/exec', {
        source: budgetSource,
        capabilities: ['move', 'pathfind'],
        timeout: 10000
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toContain('Rate limit enforced');
    });
  });

  describe('Program History', () => {
    it('should track execution history', async () => {
      await prepareBotForTest();
      // Execute a program
      const simpleMoveSource = await readProgramSource('simple-move.js');
      await apiClient.post('/program/exec', {
        source: simpleMoveSource,
        capabilities: ['move'],
        timeout: 5000
      });

      // Get history
      const response = await apiClient.get('/program/history?limit=10');

      expect(response.status).toBe(200);
      expect(response.data.history).toBeInstanceOf(Array);
      expect(response.data.history.length).toBeGreaterThan(0);

      const lastExecution = response.data.history[0];
      expect(lastExecution).toHaveProperty('runId');
      expect(lastExecution).toHaveProperty('programName');
      expect(lastExecution).toHaveProperty('status');
      expect(lastExecution).toHaveProperty('startTime');
    });
  });
});
