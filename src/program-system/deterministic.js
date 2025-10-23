const { Vec3, ProgramError, ErrorCode } = require('./sdk/types');
const { SeededRandom } = require('./sdk/helpers');

class DeterministicSearch {
  constructor(botServer, seed = 1) {
    this.botServer = botServer;
    this.random = new SeededRandom(seed);
    this.seaLevel = 63; // Standard Minecraft sea level
  }
  
  // Generate positions in an expanding square pattern
  generateExpandingSquare(radius) {
    const positions = [];
    
    // Start from center (0, seaLevel, 0) relative to bot position
    const center = this.botServer.bot ? 
      this.botServer.bot.entity.position : 
      new Vec3(0, this.seaLevel, 0);
    
    // Generate rings outward
    for (let ring = 0; ring <= radius; ring++) {
      if (ring === 0) {
        // Center position
        positions.push(new Vec3(center.x, this.seaLevel, center.z));
      } else {
        // Generate positions for this ring
        const ringPositions = [];
        
        // North edge (constant z = -ring)
        for (let x = -ring; x <= ring; x++) {
          ringPositions.push(new Vec3(
            center.x + x,
            this.seaLevel,
            center.z - ring
          ));
        }
        
        // East edge (constant x = ring)
        for (let z = -ring + 1; z <= ring; z++) {
          ringPositions.push(new Vec3(
            center.x + ring,
            this.seaLevel,
            center.z + z
          ));
        }
        
        // South edge (constant z = ring)
        for (let x = ring - 1; x >= -ring; x--) {
          ringPositions.push(new Vec3(
            center.x + x,
            this.seaLevel,
            center.z + ring
          ));
        }
        
        // West edge (constant x = -ring)
        for (let z = ring - 1; z > -ring; z--) {
          ringPositions.push(new Vec3(
            center.x - ring,
            this.seaLevel,
            center.z + z
          ));
        }
        
        positions.push(...ringPositions);
      }
    }
    
    return positions;
  }
  
  // Deterministic expanding square search
  async expandSquare({ radius, predicate, ringCallback, navigate }) {
    if (!this.botServer.bot) {
      throw new ProgramError(ErrorCode.BOT_DISCONNECTED, 'Bot is not connected');
    }
    
    const positions = this.generateExpandingSquare(radius);
    let currentRing = 0;
    let positionsVisited = 0;
    
    for (const position of positions) {
      // Calculate which ring this position belongs to
      const ring = Math.max(
        Math.abs(position.x - this.botServer.bot.entity.position.x),
        Math.abs(position.z - this.botServer.bot.entity.position.z)
      );
      
      // Notify about ring completion
      if (ring > currentRing) {
        if (ringCallback) {
          await ringCallback(currentRing);
        }
        currentRing = ring;
      }
      
      // Navigate to the position
      try {
        await navigate.goto(position, { 
          timeoutMs: 30000,
          deterministic: true 
        });
      } catch (error) {
        // If we can't reach this position, try the next one
        console.log(`Failed to reach position ${position.x}, ${position.z}: ${error.message}`);
        continue;
      }
      
      positionsVisited++;
      
      // Check the predicate at this position
      const result = await predicate();
      if (result.ok) {
        return {
          ok: true,
          value: {
            ...result.value,
            position,
            positionsVisited,
            ring: currentRing
          }
        };
      }
    }
    
    // Nothing found within radius
    return {
      ok: false,
      error: `No matching position found within radius ${radius}`,
      positionsVisited
    };
  }
  
  // Deterministic pathfinding with fixed neighbor ordering
  deterministicPathfind(start, goal, options = {}) {
    const maxIterations = options.maxIterations || 10000;
    const maxDrop = options.maxDrop || 4;
    const avoidHoles = options.avoidHoles || true;
    
    // A* pathfinding with deterministic neighbor ordering
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const posKey = (pos) => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    
    gScore.set(posKey(start), 0);
    fScore.set(posKey(start), this.heuristic(start, goal));
    
    let iterations = 0;
    
    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;
      
      // Get node with lowest fScore
      let current = openSet[0];
      let currentIndex = 0;
      
      for (let i = 1; i < openSet.length; i++) {
        const f = fScore.get(posKey(openSet[i])) || Infinity;
        const currentF = fScore.get(posKey(current)) || Infinity;
        
        if (f < currentF) {
          current = openSet[i];
          currentIndex = i;
        } else if (f === currentF) {
          // Tie-breaker: prefer positions closer to goal in deterministic order
          if (this.deterministicCompare(openSet[i], current, goal) < 0) {
            current = openSet[i];
            currentIndex = i;
          }
        }
      }
      
      // Check if we reached the goal
      if (this.isGoal(current, goal)) {
        return this.reconstructPath(cameFrom, current);
      }
      
      // Remove current from openSet
      openSet.splice(currentIndex, 1);
      
      // Check neighbors in deterministic order
      const neighbors = this.getNeighbors(current, { maxDrop, avoidHoles });
      
      for (const neighbor of neighbors) {
        const neighborKey = posKey(neighbor);
        const tentativeGScore = (gScore.get(posKey(current)) || 0) + 
                               this.distance(current, neighbor);
        
        if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
          // This path to neighbor is better
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));
          
          // Add neighbor to openSet if not already there
          if (!openSet.some(pos => posKey(pos) === neighborKey)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    
    // No path found
    throw new ProgramError(
      ErrorCode.PATHFIND,
      `No path found from ${posKey(start)} to ${posKey(goal)} after ${iterations} iterations`
    );
  }
  
  // Get neighbors in deterministic order
  getNeighbors(position, options = {}) {
    const neighbors = [];
    
    // Fixed order: North, East, South, West, Up, Down
    const offsets = [
      [0, 0, -1],  // North
      [1, 0, 0],   // East
      [0, 0, 1],   // South
      [-1, 0, 0],  // West
      [0, 1, 0],   // Up
      [0, -1, 0]   // Down
    ];
    
    for (const [dx, dy, dz] of offsets) {
      const neighbor = new Vec3(
        Math.floor(position.x) + dx,
        Math.floor(position.y) + dy,
        Math.floor(position.z) + dz
      );
      
      // Check if neighbor is valid
      if (this.isValidPosition(neighbor, position, options)) {
        neighbors.push(neighbor);
      }
    }
    
    return neighbors;
  }
  
  // Check if a position is valid for pathfinding
  isValidPosition(position, fromPosition, options = {}) {
    if (!this.botServer.bot) return false;
    
    const block = this.botServer.bot.blockAt(position);
    if (!block) return false;
    
    // Check if we can stand on this block
    const blockBelow = this.botServer.bot.blockAt(
      position.offset(0, -1, 0)
    );
    
    if (!blockBelow || blockBelow.name === 'air' || blockBelow.name === 'water') {
      if (options.avoidHoles) return false;
    }
    
    // Check if block is passable
    if (block.name !== 'air' && 
        block.name !== 'water' && 
        block.name !== 'grass' &&
        block.name !== 'tall_grass') {
      return false;
    }
    
    // Check drop distance
    if (options.maxDrop) {
      const dropDistance = fromPosition.y - position.y;
      if (dropDistance > options.maxDrop) {
        return false;
      }
    }
    
    return true;
  }
  
  // Heuristic function for A* (Manhattan distance)
  heuristic(position, goal) {
    return Math.abs(position.x - goal.x) + 
           Math.abs(position.y - goal.y) + 
           Math.abs(position.z - goal.z);
  }
  
  // Distance between two positions
  distance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  // Check if position matches goal
  isGoal(position, goal) {
    const tolerance = 1; // Within 1 block
    return Math.abs(position.x - goal.x) <= tolerance &&
           Math.abs(position.y - goal.y) <= tolerance &&
           Math.abs(position.z - goal.z) <= tolerance;
  }
  
  // Reconstruct path from A* search
  reconstructPath(cameFrom, current) {
    const path = [current];
    const posKey = (pos) => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    
    let currentKey = posKey(current);
    while (cameFrom.has(currentKey)) {
      current = cameFrom.get(currentKey);
      currentKey = posKey(current);
      path.unshift(current);
    }
    
    return path;
  }
  
  // Deterministic comparison for tie-breaking
  deterministicCompare(pos1, pos2, goal) {
    // First compare by distance to goal
    const dist1 = this.heuristic(pos1, goal);
    const dist2 = this.heuristic(pos2, goal);
    
    if (dist1 !== dist2) {
      return dist1 - dist2;
    }
    
    // Tie-break by position (x, then y, then z)
    if (pos1.x !== pos2.x) return pos1.x - pos2.x;
    if (pos1.y !== pos2.y) return pos1.y - pos2.y;
    return pos1.z - pos2.z;
  }
}

module.exports = DeterministicSearch;