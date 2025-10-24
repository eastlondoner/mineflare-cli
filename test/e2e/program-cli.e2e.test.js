const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

describe('E2E: Program CLI Commands', () => {
  let serverProcess;
  const serverPort = 3457;
  const testDir = path.join(__dirname, 'fixtures', 'cli-test-programs');
  const cliPath = path.join(__dirname, '..', '..', 'mineflare');
  
  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test programs
    await createTestPrograms();
    
    // Build the CLI executable if needed
    try {
      execSync('bun build', { cwd: path.join(__dirname, '..', '..') });
    } catch (error) {
      console.log('Build not needed or already exists');
    }
    
    // Start server daemon
    await startServerDaemon();
    
    // Wait for server to be ready
    await waitForServer();
  }, 30000);
  
  afterAll(async () => {
    // Stop server daemon
    try {
      execSync(`${cliPath} server stop`);
    } catch (error) {
      console.log('Server stop error:', error.message);
    }
    
    // Clean up test files
    await fs.rm(testDir, { recursive: true, force: true });
    
    // Clean up PID file
    try {
      await fs.unlink('mineflare.pid');
    } catch (error) {
      // Ignore if doesn't exist
    }
  });
  
  async function createTestPrograms() {
    // Hello world program
    await fs.writeFile(
      path.join(testDir, 'hello.js'),
      `
module.exports = async function(ctx) {
  console.log('Hello from program!');
  await ctx.actions.chat?.('Hello, Minecraft!').catch(() => {});
  return ctx.ok('Hello executed');
};
      `
    );
    
    // Program with arguments
    await fs.writeFile(
      path.join(testDir, 'greet.js'),
      `
module.exports = async function(ctx) {
  const name = ctx.args.name || 'World';
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return ctx.ok(message);
};
      `
    );
    
    // Mining program
    await fs.writeFile(
      path.join(testDir, 'miner.js'),
      `
const { defineProgram } = require('@mineflare/sdk');

module.exports = defineProgram({
  name: 'Smart Miner',
  version: '1.0.0',
  capabilities: ['move', 'dig', 'pathfind'],
  defaults: { radius: 10 },
  execute: async (ctx) => {
    const radius = ctx.args.radius || 10;
    console.log(\`Mining in radius \${radius}\`);
    
    // Simulate mining
    for (let i = 0; i < 3; i++) {
      console.log(\`Mining block \${i + 1}\`);
      await ctx.flow.sleep(500);
    }
    
    return ctx.ok(\`Mined area with radius \${radius}\`);
  }
});
      `
    );
  }
  
  async function startServerDaemon() {
    return new Promise((resolve, reject) => {
      exec(
        `${cliPath} server start --daemon`,
        {
          env: {
            ...process.env,
            MINEFLARE_SERVER_PORT: serverPort,
            MC_HOST: 'localhost',
            MC_PORT: 25565,
            MC_USERNAME: 'CLITestBot',
            MC_AUTH: 'offline'
          }
        },
        (error, stdout, stderr) => {
          if (error && !stdout.includes('server started')) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }
  
  async function waitForServer(retries = 30) {
    // Disable proxy to avoid url.parse() deprecation warning (DEP0169)
    const client = axios.create({
      baseURL: `http://localhost:${serverPort}`,
      timeout: 1000,
      proxy: false  // Add this to prevent deprecation warning
    });
    
    for (let i = 0; i < retries; i++) {
      try {
        await client.get('/health');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Server did not become ready');
  }
  
  function exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        ...options,
        env: {
          ...process.env,
          API_BASE: `http://localhost:${serverPort}`,
          ...options.env
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }
  
  describe('Program exec command', () => {
    it('should execute a program file directly', async () => {
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'hello.js')}`
      );
      
      expect(stdout).toContain('Hello executed');
    });
    
    it('should execute with custom capabilities', async () => {
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'miner.js')} --capabilities move,dig,pathfind`
      );
      
      expect(stdout).toContain('Mined area');
    });
    
    it('should execute with arguments', async () => {
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'greet.js')} --args '{"name":"Alice"}'`
      );
      
      expect(stdout).toContain('Hello, Alice!');
    });
    
    it('should execute with timeout', async () => {
      // Create a long-running program
      await fs.writeFile(
        path.join(testDir, 'long.js'),
        `
module.exports = async function(ctx) {
  await ctx.flow.sleep(10000);
  return ctx.ok('Should not complete');
};
        `
      );
      
      try {
        await exec(
          `${cliPath} program exec ${path.join(testDir, 'long.js')} --timeout 1000`
        );
        fail('Should have timed out');
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
    });
    
    it('should support dry-run mode', async () => {
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'miner.js')} --dry-run`
      );
      
      expect(stdout).toContain('Dry-run');
      expect(stdout).toContain('simulated');
    });
  });
  
  describe('Program registry commands', () => {
    it('should add program to registry', async () => {
      const { stdout } = await exec(
        `${cliPath} program add ${path.join(testDir, 'miner.js')} --name test-miner`
      );
      
      expect(stdout).toContain('Program added');
      expect(stdout).toContain('test-miner');
    });
    
    it('should list registered programs', async () => {
      // Add a program first
      await exec(
        `${cliPath} program add ${path.join(testDir, 'hello.js')} --name hello-prog`
      );
      
      const { stdout } = await exec(`${cliPath} program ls`);
      
      expect(stdout).toContain('hello-prog');
      expect(stdout).toContain('1.0.0'); // Default version
    });
    
    it('should run registered program', async () => {
      // Add program
      await exec(
        `${cliPath} program add ${path.join(testDir, 'greet.js')} --name greeter`
      );
      
      // Run it
      const { stdout } = await exec(
        `${cliPath} program run greeter --args '{"name":"Bob"}'`
      );
      
      expect(stdout).toContain('Hello, Bob!');
    });
    
    it('should remove program from registry', async () => {
      // Add program
      await exec(
        `${cliPath} program add ${path.join(testDir, 'hello.js')} --name temp-prog`
      );
      
      // Remove it
      const { stdout } = await exec(`${cliPath} program rm temp-prog`);
      
      expect(stdout).toContain('removed');
      
      // Verify it's gone
      const { stdout: listOutput } = await exec(`${cliPath} program ls`);
      expect(listOutput).not.toContain('temp-prog');
    });
  });
  
  describe('Program execution management', () => {
    it('should show execution history', async () => {
      // Execute some programs
      await exec(
        `${cliPath} program exec ${path.join(testDir, 'hello.js')}`
      );
      
      await exec(
        `${cliPath} program exec ${path.join(testDir, 'greet.js')}`
      );
      
      // Get history
      const { stdout } = await exec(`${cliPath} program history`);
      
      expect(stdout).toContain('Execution History');
      // Should show recent executions
    });
    
    it('should show history with limit', async () => {
      const { stdout } = await exec(`${cliPath} program history --limit 2`);
      
      // Check that output is limited
      const lines = stdout.split('\n');
      const historyLines = lines.filter(line => line.includes('│'));
      expect(historyLines.length).toBeLessThanOrEqual(10); // Header + 2 entries + borders
    });
    
    it('should handle program execution with seed', async () => {
      // Create deterministic program
      await fs.writeFile(
        path.join(testDir, 'random.js'),
        `
module.exports = async function(ctx) {
  const random = new ctx.SeededRandom(ctx.seed || 1);
  const value = random.next();
  return ctx.ok(\`Random value: \${value}\`);
};
        `
      );
      
      // Execute with same seed twice
      const { stdout: out1 } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'random.js')} --seed 42`
      );
      
      const { stdout: out2 } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'random.js')} --seed 42`
      );
      
      // Extract values
      const value1 = out1.match(/Random value: ([\d.]+)/)?.[1];
      const value2 = out2.match(/Random value: ([\d.]+)/)?.[1];
      
      expect(value1).toBe(value2); // Same seed should produce same result
      
      // Different seed should produce different result
      const { stdout: out3 } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'random.js')} --seed 123`
      );
      
      const value3 = out3.match(/Random value: ([\d.]+)/)?.[1];
      expect(value3).not.toBe(value1);
    });
  });
  
  describe('Error handling', () => {
    it('should handle missing program file', async () => {
      try {
        await exec(`${cliPath} program exec /nonexistent/program.js`);
        fail('Should have failed');
      } catch (error) {
        expect(error.message).toContain('not found');
      }
    });
    
    it('should handle invalid program syntax', async () => {
      await fs.writeFile(
        path.join(testDir, 'invalid.js'),
        `
module.exports = async function(ctx) {
  const x = {
  // Missing closing brace
`;
      );
      
      try {
        await exec(`${cliPath} program exec ${path.join(testDir, 'invalid.js')}`);
        fail('Should have failed');
      } catch (error) {
        expect(error.message).toContain('Unexpected');
      }
    });
    
    it('should handle server not running', async () => {
      // Stop the server
      await exec(`${cliPath} server stop`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await exec(`${cliPath} program exec ${path.join(testDir, 'hello.js')}`);
        fail('Should have failed');
      } catch (error) {
        expect(error.message).toContain('not running');
      }
      
      // Restart server for other tests
      await startServerDaemon();
      await waitForServer();
    });
  });
  
  describe('Profile support', () => {
    it('should execute program with specific profile', async () => {
      // Create a test profile config
      const configPath = path.join(process.cwd(), '.mineflare', 'config.json');
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      
      const config = {
        activeProfile: 'default',
        profiles: {
          default: {
            programs: {
              defaultCapabilities: ['move'],
              defaultTimeout: 30000
            }
          },
          test: {
            programs: {
              defaultCapabilities: ['move', 'dig'],
              defaultTimeout: 60000
            }
          }
        }
      };
      
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Execute with test profile
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'hello.js')} --profile test`
      );
      
      expect(stdout).toContain('Hello executed');
    });
  });
  
  describe('Complex program scenarios', () => {
    it('should handle program with SDK utilities', async () => {
      await fs.writeFile(
        path.join(testDir, 'sdk-test.js'),
        `
module.exports = async function(ctx) {
  const { Vec3, geometry, flow } = ctx;
  
  // Test geometry utilities
  const positions = [
    new Vec3(10, 0, 0),
    new Vec3(5, 0, 0),
    new Vec3(20, 0, 0)
  ];
  
  const sorted = geometry.nearestFirst(positions, new Vec3(0, 0, 0));
  console.log('Nearest position:', sorted[0]);
  
  // Test flow utilities
  const result = await flow.withTimeout(
    async () => {
      await flow.sleep(100);
      return 'completed';
    },
    1000,
    'Test operation'
  );
  
  return ctx.ok(\`SDK test: \${result.value}\`);
};
        `
      );
      
      const { stdout } = await exec(
        `${cliPath} program exec ${path.join(testDir, 'sdk-test.js')}`
      );
      
      expect(stdout).toContain('SDK test: completed');
      expect(stdout).toContain('Nearest position');
    });
  });
});