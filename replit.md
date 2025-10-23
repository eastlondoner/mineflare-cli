# Minecraft Bot Controller

## Overview
AI-controlled Minecraft bot system with HTTP API and CLI interface. Built with Mineflayer and Express.js running on Bun 1.2. Includes a local Minecraft Paper 1.21.8 server. Available as a single `mineflayer` executable that combines both server and client functionality.

**Platform Support:** Linux and macOS only. Windows is not supported.

## Purpose
Allows AI agents to control a Minecraft bot through a REST API. The bot can move, dig, place blocks, chat, and more. Includes event logging with timestamps and screenshot capability.

## Current State
- **Status**: Fully Operational
- **Runtime**: Bun 1.2
- **Bot Framework**: Mineflayer 4.33.0
- **HTTP Server**: Express 5.1.0
- **Viewer**: Prismarine-viewer 1.33.0
- **Minecraft Server**: Paper 1.21.8 (running on port 8099)

## Architecture

### Components
1. **Unified Executable** (`mineflayer`)
   - Single binary combining server and CLI functionality
   - Can run as daemon with `server start --daemon`
   - All CLI commands built-in
   - ~326MB standalone executable

2. **Bot Server** (`src/bot-server.js`)
   - Mineflayer bot instance
   - Event logging system with timestamps
   - Express API server with REST endpoints
   - Prismarine viewer for screenshots

3. **Server Entry Point** (`src/server.js`)
   - Configures and starts the bot server
   - Reads environment variables for configuration

4. **CLI Client** (`src/cli.js`)
   - Command-line interface for testing
   - Uses Commander.js for argument parsing
   - Makes HTTP requests to the bot server

5. **Unified Entry** (`src/mineflayer.js`)
   - Combines server and CLI into single command
   - Daemon management with PID tracking
   - Cross-platform executable support

### API Endpoints

#### Information Endpoints
- `GET /health` - Server health check
- `GET /state` - Bot state (position, health, food, etc.)
- `GET /inventory` - Bot inventory items
- `GET /entities` - Nearby entities
- `GET /events?since=<timestamp>` - Events since timestamp
- `GET /screenshot` - Base64 encoded screenshot
- `GET /recipes?item=<name>` - Get crafting recipes

#### Action Endpoints
- `POST /chat` - Send chat message
- `POST /move` - Move bot (x, y, z, sprint)
- `POST /stop` - Stop all movement
- `POST /look` - Look direction (yaw, pitch)
- `POST /dig` - Dig/break block at coordinates
- `POST /place` - Place block at coordinates (requires item in inventory)
- `POST /attack` - Attack entity by ID
- `POST /craft` - Craft items (item, count, craftingTable)
- `POST /equip` - Equip item to slot (hand, head, torso, legs, feet, off-hand)
- `POST /batch` - Execute a sequence of instructions (see BATCH_JOBS.md)

### Event Logging
All bot events are logged with timestamps:
- spawn, death, kicked, error
- chat messages
- health changes
- entity spawns
- hurt events

## Configuration
Environment variables (see `.env.example`):
- `MC_HOST` - Minecraft server host
- `MC_PORT` - Minecraft server port
- `MC_USERNAME` - Bot username
- `MC_VERSION` - Minecraft version (or false for auto)
- `MC_AUTH` - Authentication type (offline/microsoft)
- `ENABLE_VIEWER` - Enable viewer for screenshots
- `SERVER_PORT` - HTTP server port

## Recent Changes
- 2025-10-23: Initial implementation with Bun 1.2, Mineflayer, event logging, API endpoints, screenshot support, and CLI client
- 2025-10-23: Added Minecraft Paper 1.21.8 server running on port 8099
- 2025-10-23: Implemented crafting system with recipes and equipment management
- 2025-10-23: Added batch job system for executing sequences of instructions
- 2025-10-23: Created single `mineflayer` executable combining server daemon and CLI functionality
- 2025-10-23: Linux and macOS support only - Windows explicitly not supported
- 2025-10-23: Added comprehensive configuration management system with:
  - Multiple configuration profiles (default, development, production, custom)
  - CLI-based configuration management (get, set, profile switching)
  - Configuration validation with type checking and range validation
  - Environment variable override support for backward compatibility
  - Import/export functionality for configuration sharing
  - Persistent configuration storage in .mineflayer/config.json

## User Preferences
None specified yet.
