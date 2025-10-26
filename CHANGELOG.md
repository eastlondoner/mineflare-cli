# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.8] - 2025-10-26

### Fixed
- Restored program execution support when running the isolated bot server by proxying state snapshots and command execution through the IPC layer.
- Added graceful error messaging for world-scan helpers that still require a full mineflayer instance.
- Documented the isolated-mode program limitations in the README.

## [1.0.0] - 2025-10-23

### Added
- Initial release of Minecraft Bot Controller
- HTTP API server with REST endpoints
- CLI client for bot control
- Single executable combining server and client
- Event logging with timestamps
- Screenshot capability (base64 encoded)
- Block manipulation (dig, place)
- Crafting system with recipe support
- Equipment management
- Batch job automation system
- Daemon mode with PID tracking
- Cross-platform support (Linux, Windows, macOS)
- Minecraft Paper 1.21.8 server integration
- Prismarine viewer for screenshots
- GitHub Actions for automated releases

### Features
- **Movement Control**: Move, sprint, jump, stop
- **Vision Control**: Look direction with yaw and pitch
- **Block Interaction**: Dig and place blocks
- **Combat**: Attack entities
- **Crafting**: Craft items with recipe checking
- **Equipment**: Equip items to different slots
- **Chat**: Send and receive chat messages
- **State Monitoring**: Health, food, position, inventory
- **Entity Detection**: Track nearby entities
- **Event System**: Timestamped event logging
- **Batch Jobs**: Execute sequences of instructions
- **Screenshots**: Capture bot's view as base64 PNG

### Technical
- Built with Bun 1.2
- Mineflayer 4.33.0
- Express 5.1.0
- Commander.js for CLI
- Canvas for screenshot rendering
- ~326MB standalone executable

[1.0.0]: https://github.com/eastlondoner/mineflare-cli/releases/tag/v1.0.0
