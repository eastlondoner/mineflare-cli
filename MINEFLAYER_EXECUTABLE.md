# Mineflayer Executable

A single executable that combines both the Minecraft bot server and CLI client functionality.

## Installation

The `mineflayer` executable is a standalone binary that includes:
- The complete bot server with Mineflayer
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
./mineflayer server start

# Start as background daemon
./mineflayer server start --daemon

# Start with custom options
./mineflayer server start \
  --port 3000 \
  --mc-host localhost \
  --mc-port 8099 \
  --mc-username MyBot \
  --mc-version 1.21.8
```

#### Stop the Daemon

```bash
# Stop the background daemon
./mineflayer server stop
```

#### Check Server Status

```bash
# Check if server is running
./mineflayer server status
```

### Bot Control Commands

All CLI commands work directly with the executable:

```bash
# Get bot state
./mineflayer state

# Send chat message
./mineflayer chat "Hello world!"

# Move the bot
./mineflayer move -x 1 -z 0 --sprint

# Stop movement
./mineflayer stop

# Look around
./mineflayer look --yaw 0 --pitch 0

# Get inventory
./mineflayer inventory

# Get nearby entities
./mineflayer entities

# Get events
./mineflayer events --since 0

# Take screenshot
./mineflayer screenshot -o screenshot.png

# Dig blocks
./mineflayer dig -x 10 -y 64 -z 10

# Place blocks
./mineflayer place -x 10 -y 64 -z 10 -b stone

# Attack entity
./mineflayer attack --entity 123

# Get recipes
./mineflayer recipes -i oak_planks

# Craft items
./mineflayer craft -i oak_planks -c 4

# Equip items
./mineflayer equip -i diamond_sword

# Run batch jobs
./mineflayer batch -f examples/batch-simple.json
```

## Typical Workflow

1. **Start the server daemon:**
   ```bash
   ./mineflayer server start --daemon
   ```

2. **Check server status:**
   ```bash
   ./mineflayer server status
   ```

3. **Control the bot:**
   ```bash
   ./mineflayer chat "I'm online!"
   ./mineflayer move -x 1 --sprint
   ./mineflayer stop
   ```

4. **Run automation:**
   ```bash
   ./mineflayer batch -f automation.json
   ```

5. **Stop when done:**
   ```bash
   ./mineflayer server stop
   ```

## Daemon Mode

When running with `--daemon`:
- Server runs in background
- PID is saved to `mineflayer.pid`
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
- `mineflayer.pid` - PID file for daemon mode
- Log files (if configured)
- Screenshot files (when using -o option)

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Verify Minecraft server is running on port 8099
- Check for stale PID file: `rm mineflayer.pid`

### Daemon won't stop
- Manually kill process: `kill $(cat mineflayer.pid)`
- Remove PID file: `rm mineflayer.pid`

### Commands fail
- Ensure server is running: `./mineflayer server status`
- Check API_BASE environment variable
- Verify bot is connected to Minecraft server

## Examples

### Quick Test
```bash
# Start server, send message, stop
./mineflayer server start --daemon
./mineflayer chat "Hello!"
./mineflayer state
./mineflayer server stop
```

### Automation Script
```bash
#!/bin/bash
./mineflayer server start --daemon
sleep 5
./mineflayer batch -f mining-routine.json
./mineflayer screenshot -o result.png
./mineflayer server stop
```

### AI Integration
```python
import subprocess
import json

# Start server
subprocess.run(['./mineflayer', 'server', 'start', '--daemon'])

# Get state
result = subprocess.run(['./mineflayer', 'state'], capture_output=True, text=True)
state = json.loads(result.stdout)

# Control bot based on state
if state['health'] < 10:
    subprocess.run(['./mineflayer', 'chat', 'I need healing!'])
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