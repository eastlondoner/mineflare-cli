# Minecraft Bot Controller

AI-controlled Minecraft bot with HTTP API and CLI interface. Available as a single `mineflare` executable that combines both server and client functionality.

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
./mineflare server start --daemon

# Control the bot
./mineflare chat "Hello world!"
./mineflare move --forward 5 --sprint      # Move forward 5 blocks
./mineflare look --turn-left 90           # Turn left 90 degrees
./mineflare batch -f examples/batch-relative-movement.json  # Run patrol pattern

# Stop server
./mineflare server stop
```

See [mineflare_EXECUTABLE.md](mineflare_EXECUTABLE.md) for full executable documentation.

## Setup (Development)

1. Configure your Minecraft server connection:
   ```bash
   cp .env.example .env
   # Edit .env with your server details
   ```

2. Start the bot server:
   ```bash
   bun start
   # Or use the executable: ./mineflare server start
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

# Movement - Absolute
bun run cli move -x 1 -y 0 -z 0 --sprint    # Move using absolute coordinates

# Movement - Relative
bun run cli move --forward 5                 # Move 5 blocks forward
bun run cli move --backward 3                # Move 3 blocks backward
bun run cli move --left 2                    # Strafe left 2 blocks
bun run cli move --right 2                   # Strafe right 2 blocks
bun run cli move --forward 10 --sprint       # Sprint forward 10 blocks

bun run cli stop                             # Stop movement

# Looking - Absolute
bun run cli look --yaw 0 --pitch 0           # Look at specific angles

# Looking - Relative
bun run cli look --turn-left 90              # Turn left 90 degrees
bun run cli look --turn-right 45             # Turn right 45 degrees
bun run cli look --look-up 30                # Look up 30 degrees
bun run cli look --look-down 30              # Look down 30 degrees

# Looking - Cardinal Directions
bun run cli look --north                     # Face north
bun run cli look --south                     # Face south
bun run cli look --east                      # Face east
bun run cli look --west                      # Face west

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
bun run cli batch -f examples/batch-simple.json            # Run simple batch job
bun run cli batch -f examples/batch-mining.json            # Run mining operations
bun run cli batch -f examples/batch-relative-movement.json # Patrol in square pattern
bun run cli batch -f examples/batch-navigation.json        # Complex navigation demo
bun run cli batch -f examples/batch-exploration.json       # Area exploration
bun run cli batch -f batch.json --no-stop                  # Continue even if errors occur
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

### Move Bot - Absolute
```bash
curl -X POST http://localhost:3000/move \
  -H "Content-Type: application/json" \
  -d '{"x": 1, "y": 0, "z": 0, "sprint": true}'
```

### Move Bot - Relative
```bash
# Move forward 5 blocks
curl -X POST http://localhost:3000/move \
  -H "Content-Type: application/json" \
  -d '{"relative": {"forward": 5}, "sprint": false}'

# Strafe left 3 blocks
curl -X POST http://localhost:3000/move \
  -H "Content-Type: application/json" \
  -d '{"relative": {"left": 3}}'
```

### Look - Turn and Cardinal Directions
```bash
# Turn left 90 degrees
curl -X POST http://localhost:3000/look \
  -H "Content-Type: application/json" \
  -d '{"relative": {"yaw_delta": -90}}'

# Look north
curl -X POST http://localhost:3000/look \
  -H "Content-Type: application/json" \
  -d '{"cardinal": "north"}'
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

The bot supports a comprehensive configuration management system with multiple profiles, validation, and CLI management. Configuration is stored in `.mineflare/config.json`.

### Quick Configuration Examples

```bash
# View current configuration
./mineflare config get

# Set a configuration value
./mineflare config set minecraft.host "mc.example.com"
./mineflare config set server.port 8080

# Create and switch to a new profile
./mineflare config profile create production
./mineflare config profile switch production

# Start server with specific profile
./mineflare server start --profile production
```

### Configuration Profiles

The system includes three default profiles:
- **default** - Base configuration
- **development** - Debug logging enabled
- **production** - Warning-level logging with file output

### Configuration Commands

```bash
# View configuration
./mineflare config get                    # View all settings
./mineflare config get minecraft.host     # View specific value
./mineflare config get --json            # Output as JSON

# Set values
./mineflare config set minecraft.host "play.example.com"
./mineflare config set minecraft.port 25565
./mineflare config set viewer.enabled false

# Profile management
./mineflare config profile list           # List profiles
./mineflare config profile create staging # Create new profile
./mineflare config profile switch staging # Switch profile
./mineflare config profile delete old     # Delete profile

# Import/Export
./mineflare config export my-config.json  # Export configuration
./mineflare config import my-config.json  # Import configuration
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
- `MINEFLARE_SERVER_PORT` - HTTP API server port (default: 3000)

See [CONFIGURATION.md](CONFIGURATION.md) for complete configuration documentation.

## Architecture

The system consists of two main components:

1. **Bot Server** - Long-running process that:
   - Connects to Minecraft server using mineflare
   - Logs all events with timestamps
   - Exposes HTTP API for control
   - Provides screenshot capability via prismarine-viewer

2. **CLI Client** - Command-line tool that:
   - Communicates with the bot server via HTTP
   - Provides easy testing interface
   - Can be used by AI agents or humans

## Testing

The project includes a comprehensive end-to-end testing framework with **zero mocks**. All tests connect to real servers and validate actual system behavior.

### Test Infrastructure
- **Real Minecraft Server**: Paper 1.21.8 server running on port 25565 for testing
- **Zero Mocks Philosophy**: No fake implementations - all tests use real connections
- **Test Categories**: Server lifecycle, bot connections, API endpoints, and more

### Running Tests

```bash
# Run all E2E tests
bun test test/e2e/*.test.js

# Run specific test suites
bun test test/e2e/simple-connection.test.js  # Basic connectivity tests
bun test test/e2e/server-lifecycle.e2e.test.js  # Server management tests
bun test test/e2e/bot-connection.e2e.test.js    # Bot connection tests

# Run with custom Minecraft server
E2E_MC_HOST=localhost E2E_MC_PORT=25565 bun test test/e2e/*.test.js
```

### Test Minecraft Server

The project includes a dedicated Minecraft Paper server for testing:

```bash
# Start the test Minecraft server
cd minecraft-server
java -Xmx1024M -Xms1024M -jar paper-1.21.8.jar nogui
```

The test server is configured with:
- **Port**: 25565
- **Mode**: Offline mode for easy bot testing
- **Version**: Paper 1.21.8

See [test/e2e/README.md](test/e2e/README.md) for complete testing documentation.

## License

ISC
