# Minecraft Bot Controller

AI-controlled Minecraft bot with HTTP API and CLI interface. Available as a single `mineflayer` executable that combines both server and client functionality.

**Platform Support:** Linux and macOS only. Windows is not supported.

## Features

- **HTTP API** - REST endpoints for AI agents to control the bot
- **Event Logging** - Timestamped events (chat, health, spawns, etc.)
- **Screenshots** - Base64 encoded screenshots of bot's view
- **CLI Client** - Command-line interface for testing
- **Block Manipulation** - Dig/break blocks, place blocks, full block interaction
- **Crafting System** - Craft items with recipes, check available recipes
- **Equipment Management** - Equip items to different slots
- **Real-time Control** - Move, jump, sprint, look around, attack entities, send chat

## Quick Start (Single Executable)

Download the latest release from [GitHub Releases](https://github.com/eastlondoner/mineflare-cli/releases) for Linux or macOS, or build it yourself:

```bash
# Build the executable
bun run build

# Start server as daemon
./mineflayer server start --daemon

# Control the bot
./mineflayer chat "Hello world!"
./mineflayer move -x 1 --sprint
./mineflayer batch -f examples/batch-simple.json

# Stop server
./mineflayer server stop
```

See [MINEFLAYER_EXECUTABLE.md](MINEFLAYER_EXECUTABLE.md) for full executable documentation.

## Setup (Development)

1. Configure your Minecraft server connection:
   ```bash
   cp .env.example .env
   # Edit .env with your server details
   ```

2. Start the bot server:
   ```bash
   bun start
   # Or use the executable: ./mineflayer server start
   ```

3. Use the CLI to interact with the bot:
   ```bash
   bun run cli <command>
   ```

## CLI Commands

### Information
```bash
bun run cli health              # Check server health
bun run cli state               # Get bot state
bun run cli inventory           # Get inventory
bun run cli entities            # Get nearby entities
bun run cli events --since 0    # Get all events
bun run cli screenshot          # Get screenshot as base64
```

### Actions
```bash
bun run cli chat "Hello!"                    # Send chat message
bun run cli move -x 1 -y 0 -z 0 --sprint    # Move forward sprinting
bun run cli stop                             # Stop movement
bun run cli look --yaw 0 --pitch 0           # Look direction

# Block manipulation
bun run cli dig -x 0 -y 64 -z 0             # Dig/break block
bun run cli place -x 0 -y 64 -z 0 -b dirt   # Place block (needs item in inventory)

# Combat
bun run cli attack --entity 123              # Attack entity

# Crafting & Equipment
bun run cli recipes -i oak_planks            # Get recipes for item
bun run cli craft -i oak_planks -c 4        # Craft 4 oak planks
bun run cli equip -i diamond_sword          # Equip item to hand

# Batch Jobs (execute multiple instructions in sequence)
bun run cli batch -f examples/batch-simple.json     # Run simple batch job
bun run cli batch -f examples/batch-mining.json     # Run mining operations
bun run cli batch -f batch.json --no-stop           # Continue even if errors occur
```

## API Examples

### Get Bot State
```bash
curl http://localhost:3000/state
```

### Send Chat Message
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the bot!"}'
```

### Get Events Since Timestamp
```bash
curl http://localhost:3000/events?since=1698000000000
```

### Get Screenshot
```bash
curl http://localhost:3000/screenshot
```

### Move Bot
```bash
curl -X POST http://localhost:3000/move \
  -H "Content-Type: application/json" \
  -d '{"x": 1, "y": 0, "z": 0, "sprint": true}'
```

### Execute Batch Job
```bash
curl -X POST http://localhost:3000/batch \
  -H "Content-Type: application/json" \
  -d '{
    "instructions": [
      {"type": "chat", "params": {"message": "Starting..."}},
      {"type": "dig", "params": {"x": 0, "y": 64, "z": 0}},
      {"type": "wait", "params": {"duration": 1000}},
      {"type": "place", "params": {"x": 0, "y": 64, "z": 0, "blockName": "stone"}},
      {"type": "chat", "params": {"message": "Done!"}}
    ],
    "stopOnError": true
  }'
```

## Configuration

The bot supports a comprehensive configuration management system with multiple profiles, validation, and CLI management. Configuration is stored in `.mineflayer/config.json`.

### Quick Configuration Examples

```bash
# View current configuration
./mineflayer config get

# Set a configuration value
./mineflayer config set minecraft.host "mc.example.com"
./mineflayer config set server.port 8080

# Create and switch to a new profile
./mineflayer config profile create production
./mineflayer config profile switch production

# Start server with specific profile
./mineflayer server start --profile production
```

### Configuration Profiles

The system includes three default profiles:
- **default** - Base configuration
- **development** - Debug logging enabled
- **production** - Warning-level logging with file output

### Configuration Commands

```bash
# View configuration
./mineflayer config get                    # View all settings
./mineflayer config get minecraft.host     # View specific value
./mineflayer config get --json            # Output as JSON

# Set values
./mineflayer config set minecraft.host "play.example.com"
./mineflayer config set minecraft.port 25565
./mineflayer config set viewer.enabled false

# Profile management
./mineflayer config profile list           # List profiles
./mineflayer config profile create staging # Create new profile
./mineflayer config profile switch staging # Switch profile
./mineflayer config profile delete old     # Delete profile

# Import/Export
./mineflayer config export my-config.json  # Export configuration
./mineflayer config import my-config.json  # Import configuration
```

### Configuration Structure

- **server** - API server settings (port, timeout)
- **minecraft** - Server connection (host, port, username, version, auth)
- **viewer** - Web viewer settings (enabled, port, firstPerson)
- **api** - API base URL for CLI
- **logging** - Log level and file output
- **performance** - Event history and screenshot quality

### Environment Variables (Legacy)

Environment variables still work and override configuration file settings:

- `MC_HOST` - Minecraft server host (default: localhost)
- `MC_PORT` - Minecraft server port (default: 25565)
- `MC_USERNAME` - Bot username (default: AIBot)
- `MC_VERSION` - Minecraft version or false for auto-detect
- `MC_AUTH` - Authentication type: offline or microsoft
- `ENABLE_VIEWER` - Enable viewer for screenshots (default: true)
- `SERVER_PORT` - HTTP API server port (default: 3000)

See [CONFIGURATION.md](CONFIGURATION.md) for complete configuration documentation.

## Architecture

The system consists of two main components:

1. **Bot Server** - Long-running process that:
   - Connects to Minecraft server using Mineflayer
   - Logs all events with timestamps
   - Exposes HTTP API for control
   - Provides screenshot capability via prismarine-viewer

2. **CLI Client** - Command-line tool that:
   - Communicates with the bot server via HTTP
   - Provides easy testing interface
   - Can be used by AI agents or humans

## License

ISC
