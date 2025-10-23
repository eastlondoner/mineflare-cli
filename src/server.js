const MinecraftBotServer = require('./bot-server');
const configManager = require('./config/ConfigManager');

// Get configuration from config manager (supports env var overrides)
const fullConfig = configManager.get();

const config = {
  host: fullConfig.minecraft.host,
  port: fullConfig.minecraft.port,
  username: fullConfig.minecraft.username,
  version: fullConfig.minecraft.version,
  auth: fullConfig.minecraft.auth,
  enableViewer: fullConfig.viewer.enabled,
  viewerPort: fullConfig.viewer.port,
  firstPerson: fullConfig.viewer.firstPerson
};

const serverPort = fullConfig.server.port;

const server = new MinecraftBotServer();
server.start(config, serverPort);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (server.bot) {
    server.bot.quit();
  }
  process.exit(0);
});
