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
  --mc-port 25565 \
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

### Program System Commands

The program system allows you to run deterministic, sandboxed JavaScript programs that control the bot using the SDK.

#### Execute Program File

```bash
# Execute a program file directly
./mineflare program exec examples/programs/hello-world.js

# Execute with custom capabilities
./mineflare program exec mining-bot.js --capabilities move,dig,place

# Execute with arguments
./mineflare program exec collector.js --args '{"target":"diamond_ore","radius":50}'

# Execute with timeout (ms)
./mineflare program exec long-task.js --timeout 300000

# Dry-run simulation (no actual bot actions)
./mineflare program exec risky-program.js --dry-run

# Execute with specific seed for deterministic behavior
./mineflare program exec explorer.js --seed 42
```

#### Register Program

```bash
# Add a program to the registry
./mineflare program add examples/programs/smart-miner.js

# Add with custom name
./mineflare program add my-script.js --name "Wood Collector"

# Add with specific capabilities
./mineflare program add builder.js --capabilities move,place,inventory
```

#### Run Registered Program

```bash
# Run a registered program by name
./mineflare program run smart-miner

# Run with arguments
./mineflare program run "Wood Collector" --args '{"maxLogs":64}'

# Run with custom timeout
./mineflare program run explorer --timeout 600000

# Run with specific seed
./mineflare program run pathfinder --seed 123
```

#### List Programs

```bash
# List all registered programs
./mineflare program ls

# Output:
# Name            Version  Capabilities           Created
# smart-miner     1.0.0    move,dig,pathfind     2024-10-24T10:30:00
# Wood Collector  1.0.0    move,dig,inventory    2024-10-24T11:00:00
# builder         2.1.0    move,place,craft      2024-10-24T12:00:00
```

#### Remove Program

```bash
# Remove a registered program
./mineflare program rm smart-miner

# Remove with confirmation
./mineflare program rm "Wood Collector" --force
```

#### Program Execution Control

```bash
# Cancel a running program
./mineflare program cancel <runId>

# Check program execution status
./mineflare program status <runId>

# View execution history
./mineflare program history

# View detailed history with limit
./mineflare program history --limit 10 --verbose
```

### SDK Usage Examples

#### Basic Movement Program
```javascript
// move-forward.js
module.exports = async function(ctx) {
  const { ok, fail, Vec3 } = ctx;
  
  // Move 5 blocks north
  const result = await ctx.move.moveCardinal('north', 5);
  
  if (result.ok) {
    return ok(`Moved to ${result.value}`);
  } else {
    return fail(`Movement failed: ${result.error}`);
  }
};
```

#### Resource Collection with Safety
```javascript
// safe-mining.js
module.exports = async function(ctx) {
  const { ok, fail } = ctx;
  
  // Monitor health while mining
  const vitalCheck = await ctx.safety.monitorVitals({
    minHealth: 10,
    minFood: 5,
    action: async () => {
      // Search for and mine diamonds
      const searchResult = await ctx.search.expandSquare({
        radius: 30,
        predicate: async (pos) => {
          const blocks = await ctx.world.scan.blocks({
            kinds: ['diamond_ore'],
            radius: 3,
            max: 1
          });
          return blocks.length > 0;
        }
      });
      
      if (searchResult.ok) {
        await ctx.actions.gather.mineBlock({
          position: searchResult.value.position
        });
      }
      
      return searchResult;
    }
  });
  
  if (!vitalCheck.ok) {
    // Try to escape if in danger
    await ctx.safety.escapeHole();
    return fail('Mining aborted - low health');
  }
  
  return ok('Mining complete');
};
```

#### Complex Pathfinding with Retries
```javascript
// reliable-navigation.js
module.exports = async function(ctx) {
  const { Vec3, ok, fail } = ctx;
  const target = new Vec3(100, 64, 100);
  
  // Navigate with timeout and retries
  const result = await ctx.flow.retryBudget(
    async () => await ctx.flow.withTimeout(
      async () => await ctx.actions.navigate.goto(target),
      30000,
      'Navigate to target'
    ),
    {
      maxAttempts: 3,
      baseDelayMs: 5000,
      shouldRetry: (error) => !error.includes('unreachable')
    }
  );
  
  return result.ok 
    ? ok(`Reached target after ${result.attempts} attempts`)
    : fail(result.error);
};
```

#### Using Watchers
```javascript
// wait-for-day.js
module.exports = async function(ctx) {
  const { ok } = ctx;
  
  // Wait for daytime
  const result = await ctx.watch.until(
    async () => {
      const time = await ctx.world.time();
      return time.isDay;
    },
    {
      checkInterval: 2000,
      timeoutMs: 240000, // 4 minutes max
      description: 'Waiting for sunrise'
    }
  );
  
  if (result.ok) {
    await ctx.actions.chat('Good morning!');
  }
  
  return ok('Day has arrived');
};
```

### Program Capabilities

Programs must declare capabilities to access bot functions:

- **move** - Basic movement (step, moveCardinal)
- **pathfind** - Advanced pathfinding (goto, navigate)  
- **dig** - Break and mine blocks
- **place** - Place blocks in the world
- **craft** - Craft items and manage crafting table
- **inventory** - Access and manage inventory
- **attack** - Combat actions
- **chat** - Send chat messages
- **screenshot** - Take screenshots
- **events** - Listen to game events

### Program Arguments

Pass arguments to programs using JSON:

```bash
# Simple arguments
./mineflare program exec collector.js --args '{"item":"oak_log","count":10}'

# Complex arguments
./mineflare program exec builder.js --args '{
  "structure": "house",
  "position": {"x": 100, "y": 64, "z": 100},
  "materials": ["oak_planks", "cobblestone"]
}'
```

### Resource Budgets

Programs have resource budgets to prevent abuse:

- **Per-minute limits**: Prevent rapid operations
- **Total limits**: Cap total operations per execution
- **Capability-based**: Only tracked for enabled capabilities

Default limits can be configured in the configuration file.

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
- `MINEFLARE_SERVER_PORT` - Server port when starting
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
- Verify Minecraft server is running on port 25565
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