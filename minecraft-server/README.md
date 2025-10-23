# Minecraft Server

This directory contains the Minecraft Paper server configuration for testing the bot.

## Setup Instructions

After cloning, download the Paper server JAR:

```bash
cd minecraft-server
wget https://api.papermc.io/v2/projects/paper/versions/1.21.8/builds/83/downloads/paper-1.21.8-83.jar -O paper-1.21.8.jar
```

## Files in Repository

- `start.sh` - Server startup script
- `README.md` - This file

## Files to Ignore

All other files in this directory are generated at runtime and should not be committed to version control:

- World data (`world/`, `world_nether/`, `world_the_end/`)
- Server configuration files (`.json`, `.yml`, `.properties`)
- Logs (`logs/`)
- Cache and libraries
- Player data

## Setup

When cloning the repository, you'll need to:

1. Accept the EULA by creating `eula.txt` with `eula=true`
2. Run the server once to generate configuration files
3. Configure `server.properties` as needed

## Default Configuration

The server runs on port 25565 with offline mode enabled for bot testing.