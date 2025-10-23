# Minecraft Bot Controller

## Overview
AI-controlled Minecraft bot system with HTTP API and CLI interface. Built with Mineflayer and Express.js running on Bun 1.2. Includes a local Minecraft Paper 1.21.8 server. Available as a single `mineflare` executable that combines both server and client functionality.

**Platform Support:** Linux and macOS only. Windows is not supported.

## Purpose
Allows AI agents to control a Minecraft bot through a REST API. The bot can move, dig, place blocks, chat, and more. Includes event logging with timestamps and screenshot capability.

## Current State
- **Status**: Fully Operational
- **Runtime**: Bun 1.2
- **Bot Framework**: Mineflayer 4.33.0
- **HTTP Server**: Express 5.1.0
- **Viewer**: Prismarine-viewer 1.33.0
- **Minecraft Server**: Paper 1.21.8 (running on port 25565)

## Architecture

### Components
1. **Unified Executable** (`mineflare`)
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

5. **Unified Entry** (`src/mineflare.js`)
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

### User Program System
Mineflare now supports running user-submitted JavaScript programs in a secure, sandboxed environment:

#### Features
- **Secure VM Sandbox**: Programs run in isolated VM contexts using Bun's vm module
- **Capability-Based Security**: Programs must declare capabilities (move, dig, craft, etc.)
- **Deterministic Execution**: Optional deterministic mode for reproducible results
- **Resource Limits**: Rate limiting and operation budgets prevent abuse
- **Program Management**: Register, list, run, and remove named programs

#### Program Commands
- `mineflare program exec <file>` - Execute a program file immediately
- `mineflare program add <file> --name <name>` - Register a named program
- `mineflare program run <name>` - Run a registered program
- `mineflare program ls` - List all registered programs
- `mineflare program rm <name>` - Remove a program
- `mineflare program cancel <runId>` - Cancel a running program
- `mineflare program status <runId>` - Get program execution status
- `mineflare program history` - View execution history

#### SDK API
Programs use the Mineflare SDK to interact with the bot:
- **Context Object**: Provides args, bot state, world queries, actions, events, logging
- **Actions API**: Wrapped bot commands (navigate, gather, craft, inventory)
- **Deterministic Search**: Expanding square pattern for exploration
- **Result Helpers**: `ok()` and `fail()` for functional error handling
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
- `MINEFLARE_SERVER_PORT` - HTTP server port

## Testing Infrastructure

### End-to-End Testing Framework
The project includes a comprehensive E2E testing framework with **zero mocks**:
- Real Minecraft Paper 1.21.8 server running on port 25565 for testing
- All tests connect to actual servers with real network connections
- No mocks or fakes - validates actual system behavior
- Test categories: server lifecycle, bot connections, API endpoints, and more
- Located in `test/e2e/` with detailed documentation

### Test Minecraft Server
- **Type**: Paper 1.21.8
- **Port**: 25565 (dedicated test port)
- **Mode**: Offline mode enabled for bot testing
- **Location**: `minecraft-server/` directory
- **Purpose**: Enables real end-to-end testing without mocks

## Recent Changes
- 2025-10-23: Initial implementation with Bun 1.2, Mineflayer, event logging, API endpoints, screenshot support, and CLI client
- 2025-10-23: Added Minecraft Paper 1.21.8 server running on port 25565
- 2025-10-23: Implemented crafting system with recipes and equipment management
- 2025-10-23: Added batch job system for executing sequences of instructions
- 2025-10-23: Created single `mineflare` executable combining server daemon and CLI functionality
- 2025-10-23: Linux and macOS support only - Windows explicitly not supported
- 2025-10-23: Added comprehensive configuration management system with:
  - Multiple configuration profiles (default, development, production, custom)
  - CLI-based configuration management (get, set, profile switching)
  - Configuration validation with type checking and range validation
  - Environment variable override support for backward compatibility
  - Import/export functionality for configuration sharing
  - Persistent configuration storage in .mineflare/config.json
- 2025-10-23: Added Linux ARM64 build support to GitHub Actions release workflow
  - Builds native ARM64 binaries for AWS Graviton, Raspberry Pi 4+, and other ARM servers
  - Uses GitHub's new free ARM64 runners (ubuntu-24.04-arm) for native compilation and testing
- 2025-10-23: Implemented comprehensive E2E testing framework with zero mocks
  - All tests use real Minecraft server connections (Paper 1.21.8 on port 25565)
  - Real network connections, real process spawning, real HTTP requests
  - Test utilities for managing real server processes and bot connections
  - Validates production-like behavior without any mocking
- 2025-10-23: Fixed critical bot-server.js viewer import bug (changed from mineflare to mineflayer)
- 2025-10-23: Added comprehensive CLI commands E2E test suite
  - Tests ALL CLI commands with real execution against live bot server
  - Covers information, action, server management, and config commands
  - Simple connection tests consistently passing (3/3)
  - Simple CLI tests showing real command execution (12/20 passing)
- 2025-10-23: Fixed libjpeg library compatibility issues for ARM64 systems
  - Refactored bot-server.js to use dynamic imports for canvas and prismarine-viewer
  - Canvas and viewer modules now load on-demand instead of at startup
  - Added graceful error handling for missing native libraries
  - Bot server continues functioning without viewer when libraries unavailable
- 2025-10-23: Updated GitHub Actions workflows to install system dependencies
  - Added system library installation step before building (libcairo, libpango, libjpeg-turbo, etc.)
  - Ensures native modules are built with up-to-date system libraries
  - Added clean install with --force flag to rebuild native bindings
  - Added library version output for debugging build environments
- 2025-10-23: Fixed v1.2.0 ConfigManager toLowerCase() bug
  - Added type checking before calling toLowerCase() on boolean config values
  - Prevents crash when processing non-string environment variables
  - Handles boolean values correctly whether string, boolean, or number type
  - Validated fix with comprehensive test suite
- 2025-10-23: Fixed critical bot death loop issue
  - Implemented automatic respawn using proper mineflayer API (bot.respawn() / client_command packet)
  - Added respawn verification with timeout-based reconnection fallback
  - Safely handles digging plugin cleanup errors that caused the original crash
  - Works on both operator and non-operator servers
  - Prevents bots from getting stuck on death screen
- 2025-10-23: Added advanced relative movement and orientation features
  - Implemented relative movement commands: --forward, --backward, --left, --right with block distances
  - Added turn commands: --turn-left, --turn-right, --look-up, --look-down with degree parameters
  - Added cardinal direction commands: --north, --south, --east, --west for quick orientation
  - Enhanced state display with compass direction, readable pitch/yaw, movement status, and environment info
  - Full batch command support for all new movement types
  - Created example batch files: batch-relative-movement.json, batch-navigation.json, batch-exploration.json
  - API supports both absolute and relative movement/look operations

## User Preferences
None specified yet.

## Development Guidelines
- **ALWAYS update the README.md** when adding or changing functionality
  - Document new features in the appropriate section
  - Update command examples if CLI changes
  - Add new API endpoints to the API Examples section
  - Update configuration documentation if settings change
  - Keep the Quick Start section current with any changes
- The README should be the single source of truth for users
- If major changes are made, also update the CHANGELOG.md
