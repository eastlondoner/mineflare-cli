# Batch Jobs Documentation

The batch job system allows you to send a sequence of instructions to the bot that will be executed in order. This is perfect for automation, complex building tasks, or scripted behaviors.

## How It Works

Send a POST request to `/batch` with an array of instructions. Each instruction has a `type` and optional `params`.

## Instruction Types

### Movement Instructions

#### move
Control the bot's movement.
```json
{
  "type": "move",
  "params": {
    "x": 1,      // Forward (+1) or backward (-1)
    "y": 1,      // Jump (>0)
    "z": 0,      // Left (-1) or right (+1)
    "sprint": true
  }
}
```

#### stop
Stop all movement.
```json
{
  "type": "stop"
}
```

#### look
Control where the bot looks.
```json
{
  "type": "look",
  "params": {
    "yaw": 0,    // Rotation (radians)
    "pitch": 0   // Up/down angle (radians)
  }
}
```

#### goto
Simple movement toward coordinates (basic pathfinding).
```json
{
  "type": "goto",
  "params": {
    "x": 100,
    "y": 64,
    "z": 200
  }
}
```

### Block Manipulation

#### dig
Break a block at specific coordinates.
```json
{
  "type": "dig",
  "params": {
    "x": 10,
    "y": 64,
    "z": 10
  }
}
```

#### place
Place a block (must be in inventory).
```json
{
  "type": "place",
  "params": {
    "x": 10,
    "y": 64,
    "z": 10,
    "blockName": "stone"
  }
}
```

### Crafting & Equipment

#### craft
Craft items (automatically finds nearby crafting table if needed).
```json
{
  "type": "craft",
  "params": {
    "item": "oak_planks",
    "count": 4,
    "craftingTable": false
  }
}
```

#### equip
Equip an item from inventory.
```json
{
  "type": "equip",
  "params": {
    "item": "diamond_sword",
    "destination": "hand"
  }
}
```

### Communication

#### chat
Send a chat message.
```json
{
  "type": "chat",
  "params": {
    "message": "Hello world!"
  }
}
```

### Utility

#### wait
Pause execution for a duration.
```json
{
  "type": "wait",
  "params": {
    "duration": 2000  // milliseconds
  }
}
```

## Options

- `stopOnError` (default: true) - Stop execution if any instruction fails
- `delay` - Add custom delay after specific instruction (milliseconds)

## Examples

### Simple Movement Pattern
```json
[
  {"type": "look", "params": {"yaw": 0, "pitch": 0}},
  {"type": "move", "params": {"x": 1, "sprint": true}},
  {"type": "wait", "params": {"duration": 2000}},
  {"type": "stop"},
  {"type": "chat", "params": {"message": "Arrived!"}}
]
```

### Mining Operation
```json
[
  {"type": "chat", "params": {"message": "Mining 3x3 area..."}},
  {"type": "dig", "params": {"x": 0, "y": 64, "z": 0}},
  {"type": "dig", "params": {"x": 1, "y": 64, "z": 0}},
  {"type": "dig", "params": {"x": 2, "y": 64, "z": 0}},
  {"type": "chat", "params": {"message": "Mining complete!"}}
]
```

### Building Structure
```json
[
  {"type": "equip", "params": {"item": "stone"}},
  {"type": "place", "params": {"x": 0, "y": 64, "z": 0, "blockName": "stone"}},
  {"type": "place", "params": {"x": 1, "y": 64, "z": 0, "blockName": "stone"}},
  {"type": "place", "params": {"x": 2, "y": 64, "z": 0, "blockName": "stone"}},
  {"type": "chat", "params": {"message": "Wall built!"}}
]
```

## CLI Usage

```bash
# Run a batch job from file
bun run cli batch -f batch.json

# Continue on errors
bun run cli batch -f batch.json --no-stop
```

## API Usage

```bash
curl -X POST http://localhost:3000/batch \
  -H "Content-Type: application/json" \
  -d @batch.json
```

## Response Format

The API returns detailed results for each instruction:

```json
{
  "completed": 5,
  "total": 5,
  "stopped": false,
  "results": [
    {
      "index": 0,
      "instruction": {...},
      "success": true,
      "response": {...},
      "error": null
    }
  ]
}
```

## Tips

1. Add `wait` instructions between actions to prevent overwhelming the bot
2. Use `stopOnError: false` for non-critical operations
3. Test small batches before running large automation sequences
4. Check bot inventory before placing blocks or crafting
5. Use custom delays for operations that need more time

## Limitations

- Maximum 100 instructions per batch (configurable)
- Simple pathfinding only (goto uses basic movement)
- Bot must have required items for place/craft operations
- Some operations may fail due to game mechanics (e.g., can't place blocks in air)