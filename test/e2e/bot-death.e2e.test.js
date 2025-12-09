/**
 * E2E Tests: Bot death recovery and reconnection handling
 */

const {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  setDefaultTimeout
} = require('bun:test');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const net = require('net');

setDefaultTimeout(60000);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (condition, timeout = 30000, interval = 500, message = 'Condition not met in time') => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (_) {
      // ignore and retry
    }
    await sleep(interval);
  }
  throw new Error(message);
};

const TEST_CONFIG = {
  MC_HOST: process.env.E2E_MC_HOST || 'localhost',
  MC_PORT: parseInt(process.env.E2E_MC_PORT || '25565', 10),
  MC_USERNAME: process.env.E2E_MC_USERNAME || 'E2EDeathBot',
  BOT_SERVER_PORT: parseInt(process.env.E2E_BOT_SERVER_PORT || '3001', 10),
  API_TIMEOUT: parseInt(process.env.E2E_API_TIMEOUT || '30000', 10),
  DEATH_WAIT: parseInt(process.env.E2E_DEATH_WAIT || '3000', 10)
};

const API_BASE = `http://localhost:${TEST_CONFIG.BOT_SERVER_PORT}`;
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TEST_CONFIG.API_TIMEOUT,
  proxy: false
});

const readServerPort = () => {
  try {
    const props = fs.readFileSync(path.join(mcServerDir, 'server.properties'), 'utf8');
    const match = props.match(/^server-port=(\d+)/m);
    return match ? parseInt(match[1], 10) : TEST_CONFIG.MC_PORT;
  } catch (err) {
    console.warn('[TEST] Unable to read server.properties port, using default:', err.message);
    return TEST_CONFIG.MC_PORT;
  }
};

let activeMcPort = TEST_CONFIG.MC_PORT;

const mcServerDir = path.join(process.cwd(), 'minecraft-server');
const mineflarePidFile = path.join(process.cwd(), '.e2e-bot-death.pid');
const javaCandidates = [
  process.env.JAVA_BIN,
  process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'),
  '/opt/homebrew/opt/openjdk@21/bin/java',
  '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java',
  '/usr/lib/jvm/java-21-openjdk/bin/java',
  'java'
].filter(Boolean);

const javaBin = javaCandidates.find(candidate => {
  try {
    return candidate && fs.existsSync(candidate);
  } catch {
    return false;
  }
}) || 'java';

let minecraftServerProcess = null;
let botServerProcess = null;

const ensureMinecraftStopped = async () => {
  const pidPath = path.join(mcServerDir, 'paper.pid');
  if (fs.existsSync(pidPath)) {
    try {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
      if (!Number.isNaN(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          await sleep(2000);
        } catch {
          // already stopped
        }
      }
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }

  const lockPath = path.join(mcServerDir, 'world', 'session.lock');
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
};

const waitForMinecraftPort = async (port = activeMcPort, timeout = 20000) => {
  await waitFor(() => new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  }), timeout, 500, 'Minecraft server failed to accept connections');
};

const startMinecraftServer = async () => {
  if (minecraftServerProcess && minecraftServerProcess.exitCode === null) {
    return;
  }

  await ensureMinecraftStopped();

  const serverPropsPath = path.join(mcServerDir, 'server.properties');
  if (fs.existsSync(serverPropsPath)) {
    try {
      let contents = fs.readFileSync(serverPropsPath, 'utf8');
      if (!contents.includes('server-port=25565')) {
        contents = contents.replace(/server-port=\d+/g, 'server-port=25565');
        fs.writeFileSync(serverPropsPath, contents);
      }
    } catch (err) {
      console.warn('Unable to ensure server.properties port setting:', err.message);
    }
  }

  activeMcPort = readServerPort();
  console.log(`[TEST] Using Minecraft server port ${activeMcPort}`);

  const jarPath = path.join(mcServerDir, 'paper-1.21.8.jar');
  if (!fs.existsSync(jarPath)) {
    throw new Error('Paper jar not found at minecraft-server/paper-1.21.8.jar');
  }

  minecraftServerProcess = spawn(javaBin, ['-Xmx1024M', '-Xms1024M', '-jar', 'paper-1.21.8.jar', 'nogui'], {
    cwd: mcServerDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  minecraftServerProcess.stdout.on('data', (data) => {
    process.stdout.write(`[MC] ${data}`);
  });
  minecraftServerProcess.stderr.on('data', (data) => {
    process.stderr.write(`[MC ERROR] ${data}`);
  });

  await waitForMinecraftPort(activeMcPort);

  // Ensure bot has operator privileges
  minecraftServerProcess.stdin?.write(`op ${TEST_CONFIG.MC_USERNAME}\n`);
  await sleep(1000);
};

const stopMinecraftServer = async () => {
  if (!minecraftServerProcess || minecraftServerProcess.exitCode !== null) {
    minecraftServerProcess = null;
    return;
  }

  try {
    minecraftServerProcess.stdin?.write('stop\n');
    await sleep(2000);
    minecraftServerProcess.kill('SIGTERM');
    await sleep(2000);
  } catch {
    // ignore
  } finally {
    minecraftServerProcess = null;
    await ensureMinecraftStopped();
  }
};

const waitForBotConnection = async () => {
  await waitFor(async () => {
    const health = await apiClient.get('/health');
    return health.data?.botConnected === true;
  }, 30000, 1000, 'Bot failed to connect');
};

const startBotServer = async () => {
  if (botServerProcess && botServerProcess.exitCode === null) {
    return;
  }

  await stopBotServer();

  botServerProcess = spawn('bun', ['run', 'src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MC_HOST: TEST_CONFIG.MC_HOST,
      MC_PORT: String(activeMcPort),
      MC_USERNAME: TEST_CONFIG.MC_USERNAME,
      MC_VERSION: '1.21.8',
      MC_AUTH: 'offline',
      ENABLE_VIEWER: 'false',
      LOG_LEVEL: 'debug',
      MINEFLARE_SERVER_PORT: String(TEST_CONFIG.BOT_SERVER_PORT),
      MINEFLARE_PID_FILE: mineflarePidFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  console.log(`[TEST] Started bot server targeting port ${activeMcPort}`);

  botServerProcess.stdout.on('data', (data) => {
    process.stdout.write(`[BOT] ${data}`);
  });
  botServerProcess.stderr.on('data', (data) => {
    process.stderr.write(`[BOT ERROR] ${data}`);
  });

  botServerProcess.on('exit', (code, signal) => {
    console.log(`[BOT] Server exited with code ${code} signal ${signal}`);
  });

  await waitForBotConnection();
};

const stopBotServer = async () => {
  if (!botServerProcess) return;
  if (botServerProcess.exitCode === null) {
    try {
      botServerProcess.kill('SIGTERM');
      await sleep(1500);
      if (botServerProcess.exitCode === null) {
        botServerProcess.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
  }
  botServerProcess = null;
  if (fs.existsSync(mineflarePidFile)) {
    try {
      fs.unlinkSync(mineflarePidFile);
    } catch {
      // ignore
    }
  }
};

const getState = async () => {
  const response = await apiClient.get('/state');
  return response.data;
};

const getBotHealth = async () => {
  const state = await getState();
  return state?.health?.current ?? 0;
};

const getEventsSince = async (since) => {
  const response = await apiClient.get(`/events?since=${since}`);
  return response.data?.events || [];
};

const killBot = async (method = 'fall') => {
  const state = await getState();
  const pos = state?.position || { x: 0, y: 64, z: 0 };

  switch (method) {
    case 'fall':
      await apiClient.post('/chat', { message: '/tp @s ~ 120 ~' });
      await sleep(1500);
      await apiClient.post('/stop');
      break;
    case 'command':
      await apiClient.post('/chat', { message: '/kill @s' });
      break;
    case 'void':
      await apiClient.post('/move', {
        x: pos.x,
        y: -20,
        z: pos.z
      });
      break;
    default:
      await apiClient.post('/chat', { message: '/kill @s' });
  }

  await sleep(TEST_CONFIG.DEATH_WAIT);
};

describe('E2E: Bot death recovery', () => {
  beforeAll(async () => {
    await startMinecraftServer();
    await startBotServer();
  });

  afterAll(async () => {
    await stopBotServer();
    await stopMinecraftServer();
  });

  beforeEach(async () => {
    await waitForBotConnection();
  });

  it('respawns after fall damage without crashing', async () => {
    const startEvents = Date.now();
    const initialHealth = await getBotHealth();
    expect(initialHealth).toBeGreaterThan(0);

    await killBot('fall');

    const recoveredHealth = await waitFor(async () => {
      const health = await getBotHealth();
      return health > 0 ? health : false;
    }, 20000, 500, 'Bot did not regain health after fall death');

    expect(recoveredHealth).toBeGreaterThan(0);

    const healthResponse = await apiClient.get('/health');
    expect(healthResponse.data.botConnected).toBe(true);

    const events = await waitFor(async () => {
      const list = await getEventsSince(startEvents);
      return list.some(e => e.type === 'respawn' || e.type === 'respawn_success' || e.type === 'spawn')
        ? list
        : false;
    }, 20000, 500, 'Respawn event not observed after death');

    const hasRespawn = events.some(e => e.type === 'respawn' || e.type === 'respawn_success' || e.type === 'spawn');
    if (!hasRespawn) {
      console.log('[TEST] Events after death:', events);
    }
    expect(hasRespawn).toBe(true);
  });

  it('handles consecutive death cycles', async () => {
    for (let i = 0; i < 3; i++) {
      await apiClient.post('/chat', { message: '/kill @s' });
      await sleep(TEST_CONFIG.DEATH_WAIT + 1000);

      const health = await waitFor(async () => {
        const current = await getBotHealth();
        return current > 0 ? current : false;
      }, 20000, 500, 'Bot did not recover after /kill');

      expect(health).toBeGreaterThan(0);
    }
  });
});
