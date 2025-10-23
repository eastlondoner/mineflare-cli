const MinecraftBotServer = require('./bot-server');

const config = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT) || 8099,
  username: process.env.MC_USERNAME || 'AIBot',
  version: process.env.MC_VERSION || '1.21.8',
  auth: process.env.MC_AUTH || 'offline',
  enableViewer: process.env.ENABLE_VIEWER !== 'false'
};

const serverPort = parseInt(process.env.SERVER_PORT) || 3000;

const server = new MinecraftBotServer();
server.start(config, serverPort);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (server.bot) {
    server.bot.quit();
  }
  process.exit(0);
});
