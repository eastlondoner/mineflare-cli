const { Rcon } = require('rcon-client');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const RCON_HOST = process.env.MC_RCON_HOST || '127.0.0.1';
const RCON_PORT = parseInt(process.env.MC_RCON_PORT || '25575', 10);
const RCON_PASSWORD = process.env.MC_RCON_PASSWORD || 'mineflare';

async function withRcon(callback) {
  const connection = await Rcon.connect({
    host: RCON_HOST,
    port: RCON_PORT,
    password: RCON_PASSWORD
  });
  
  try {
    return await callback(connection);
  } finally {
    connection.end();
  }
}

async function sendCommand(rcon, command) {
  return await rcon.send(command);
}

async function sendCommandWithRetry(rcon, command, { retries = 5, delay = 1000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await sendCommand(rcon, command);
      if (response && response.includes('No entity was found') && command.trim().startsWith('tp ')) {
        throw new Error(response.trim());
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error(`Failed to execute RCON command: ${command}`);
}

async function waitForPlayer(rcon, username, { retries = 10, delay = 1000 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await sendCommandWithRetry(rcon, 'list');
    if (response && response.includes(username)) {
      return true;
    }
    await sleep(delay);
  }
  throw new Error(`Player ${username} is not online`);
}

async function prepareTestArea(options = {}) {
  const {
    username = 'TestBot',
    areaIndex = 0,
    basePosition = { x: 0, y: 70, z: 0 },
    platformSize = 6,
    workspaceHeight = 6,
    giveLogs = true,
    giveSapling = true,
    clearArea = true,
    walls = true,
    platformBlock = 'stone',
    extraCommands = [],
    teleportBot = true
  } = options;
  
  const offsetX = areaIndex * (platformSize * 4 + 20);
  const position = {
    x: basePosition.x + offsetX,
    y: basePosition.y,
    z: basePosition.z
  };
  
  const half = Math.floor(platformSize / 2);
  const minX = Math.floor(position.x - half);
  const maxX = Math.floor(position.x + half);
  const minZ = Math.floor(position.z - half);
  const maxZ = Math.floor(position.z + half);
  const minY = Math.max(1, Math.floor(position.y - 2));
  const maxY = Math.floor(position.y + workspaceHeight);
  
  await withRcon(async (rcon) => {
    const commands = [
      'time set day',
      'weather clear'
    ];
    
    await waitForPlayer(rcon, username, { retries: 20, delay: 500 });
    
    if (clearArea) {
      commands.push(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} minecraft:air`);
    }
    
    // Build platform and walls to keep the bot contained
    commands.push(`fill ${minX} ${Math.floor(position.y - 1)} ${minZ} ${maxX} ${Math.floor(position.y - 1)} ${maxZ} minecraft:${platformBlock}`);
    if (walls) {
      commands.push(`fill ${minX} ${position.y} ${minZ} ${minX} ${position.y + 2} ${maxZ} minecraft:glass`);
      commands.push(`fill ${maxX} ${position.y} ${minZ} ${maxX} ${position.y + 2} ${maxZ} minecraft:glass`);
      commands.push(`fill ${minX} ${position.y} ${minZ} ${maxX} ${position.y + 2} ${minZ} minecraft:glass`);
      commands.push(`fill ${minX} ${position.y} ${maxZ} ${maxX} ${position.y + 2} ${maxZ} minecraft:glass`);
    }
    
    // Place a crafting table and furnace to avoid missing block issues
    commands.push(`setblock ${Math.floor(position.x)} ${position.y} ${Math.floor(position.z)} minecraft:crafting_table`);
    commands.push(`setblock ${Math.floor(position.x + 1)} ${position.y} ${Math.floor(position.z)} minecraft:furnace`);
    
    // Provide resources
    if (giveLogs) {
      commands.push(`give ${username} minecraft:oak_log 32`);
      commands.push(`give ${username} minecraft:stick 16`);
    }
    
    if (giveSapling) {
      commands.push(`give ${username} minecraft:oak_sapling 8`);
      commands.push(`give ${username} minecraft:bone_meal 16`);
    }
    
    // Teleport bot onto the platform
    if (teleportBot) {
      commands.push(`tp ${username} ${position.x} ${position.y + 1} ${position.z}`);
    }
    
    // Run any custom setup commands
    for (const command of extraCommands) {
      const resolved = command
        .replace(/\{\{x\}\}/g, position.x)
        .replace(/\{\{y\}\}/g, position.y)
        .replace(/\{\{z\}\}/g, position.z)
        .replace(/\{\{minX\}\}/g, minX)
        .replace(/\{\{maxX\}\}/g, maxX)
        .replace(/\{\{minZ\}\}/g, minZ)
        .replace(/\{\{maxZ\}\}/g, maxZ)
        .replace(/\{\{minY\}\}/g, minY)
        .replace(/\{\{maxY\}\}/g, maxY);
      commands.push(resolved);
    }
    
    for (const command of commands) {
      await sendCommandWithRetry(rcon, command);
    }
  });
  
  return {
    position,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ }
  };
}

module.exports = {
  prepareTestArea,
  withRcon,
  sendCommandWithRetry
};
