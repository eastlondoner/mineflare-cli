# mineflare Executable

A single executable that combines both the Minecraft bot server and CLI client functionality.

## Installation

The `mineflare` executable is a standalone binary that includes:
- The complete bot server with mineflare
- HTTP API server
- CLI client for controlling the bot
- All dependencies bundled

## Building the Executable

```bash
# Build for current platform
bun run build

# Build for specific platforms
bun run build:linux     # Linux x64
bun run build:mac       # macOS ARM64
```

The executable will be ~326MB and includes the entire Bun runtime.

## Usage

### Server Management

#### Start the Bot Server

```bash
# Start in foreground (interactive mode)
./mineflare server start

# Start as background daemon
./mineflare server start --daemon

# Start with custom options
./mineflare server start \
  --port 3000 \
  --mc-host localhost \
  --mc-port 8099 \
  --mc-username MyBot \
  --mc-version 1.21.8
```

#### Stop the Daemon

```bash
# Stop the background daemon
./mineflare server stop
```

#### Check Server Status

```bash
# Check if server is running
./mineflare server status
```

### Bot Control Commands

All CLI commands work directly with the executable:

```bash
# Get bot state
./mineflare state

# Send chat message
./mineflare chat "Hello world!"

# Move the bot
./mineflare move -x 1 -z 0 --sprint

# Stop movement
./mineflare stop

# Look around
./mineflare look --yaw 0 --pitch 0

# Get inventory
./mineflare inventory

# Get nearby entities
./mineflare entities

# Get events
./mineflare events --since 0

# Take screenshot
./mineflare screenshot -o screenshot.png

# Dig blocks
./mineflare dig -x 10 -y 64 -z 10

# Place blocks
./mineflare place -x 10 -y 64 -z 10 -b stone

# Attack entity
./mineflare attack --entity 123

# Get recipes
./mineflare recipes -i oak_planks

# Craft items
./mineflare craft -i oak_planks -c 4

# Equip items
./mineflare equip -i diamond_sword

# Run batch jobs
./mineflare batch -f examples/batch-simple.json
```

## Typical Workflow

1. **Start the server daemon:**
   ```bash
   ./mineflare server start --daemon
   ```

2. **Check server status:**
   ```bash
   ./mineflare server status
   ```

3. **Control the bot:**
   ```bash
   ./mineflare chat "I'm online!"
   ./mineflare move -x 1 --sprint
   ./mineflare stop
   ```

4. **Run automation:**
   ```bash
   ./mineflare batch -f automation.json
   ```

5. **Stop when done:**
   ```bash
   ./mineflare server stop
   ```

## Daemon Mode

When running with `--daemon`:
- Server runs in background
- PID is saved to `mineflare.pid`
- Logs are detached from terminal
- Server continues running after terminal closes

## Environment Variables

The executable respects these environment variables:

- `API_BASE` - API endpoint (default: http://localhost:3000)
- `SERVER_PORT` - Server port when starting
- `MC_HOST` - Minecraft server host
- `MC_PORT` - Minecraft server port
- `MC_USERNAME` - Bot username
- `MC_VERSION` - Minecraft version
- `MC_AUTH` - Authentication type
- `ENABLE_VIEWER` - Enable screenshot viewer

## Distribution

The executable is completely self-contained. To distribute:

1. Build for target platform
2. Copy single executable file
3. No installation or dependencies needed

## Platform Support

- **Linux x64**: Most servers and desktops
- **macOS ARM64**: Apple Silicon Macs (M1/M2/M3)
- **macOS x64**: Intel Macs

**Note:** Windows is not supported. Windows users should use WSL (Windows Subsystem for Linux) or a Linux VM.

## File Structure

When running, the executable may create:
- `mineflare.pid` - PID file for daemon mode
- Log files (if configured)
- Screenshot files (when using -o option)

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Verify Minecraft server is running on port 8099
- Check for stale PID file: `rm mineflare.pid`

### Daemon won't stop
- Manually kill process: `kill $(cat mineflare.pid)`
- Remove PID file: `rm mineflare.pid`

### Commands fail
- Ensure server is running: `./mineflare server status`
- Check API_BASE environment variable
- Verify bot is connected to Minecraft server

## Examples

### Quick Test
```bash
# Start server, send message, stop
./mineflare server start --daemon
./mineflare chat "Hello!"
./mineflare state
./mineflare server stop
```

### Automation Script
```bash
#!/bin/bash
./mineflare server start --daemon
sleep 5
./mineflare batch -f mining-routine.json
./mineflare screenshot -o result.png
./mineflare server stop
```

### AI Integration
```python
import subprocess
import json

# Start server
subprocess.run(['./mineflare', 'server', 'start', '--daemon'])

# Get state
result = subprocess.run(['./mineflare', 'state'], capture_output=True, text=True)
state = json.loads(result.stdout)

# Control bot based on state
if state['health'] < 10:
    subprocess.run(['./mineflare', 'chat', 'I need healing!'])
```

## Performance

- Startup time: ~1-2 seconds
- Memory usage: ~100-150MB when running
- Executable size: ~326MB (includes Bun runtime)
- HTTP API latency: <10ms local

## Security

- Bot runs with offline authentication by default
- No external network access required (except Minecraft server)
- API binds to localhost only by default
- No persistent data stored