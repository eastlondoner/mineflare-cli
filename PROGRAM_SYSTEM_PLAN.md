# Mineflare User Program System - Implementation Plan

## Executive Summary

This document outlines the design and implementation plan for adding a user program execution system to Mineflare. The system will allow users to write deterministic, sandboxed JavaScript/TypeScript programs that control the Minecraft bot through a safe, ergonomic API.

## Goals & Objectives

### Primary Goals
1. **Enable User Programming** - Allow users to write custom JavaScript/TypeScript programs to control the Minecraft bot
2. **Ensure Safety** - Sandbox user code execution with capability-based security and resource limits
3. **Provide Determinism** - Support deterministic execution for testing and reproducibility
4. **Maintain Simplicity** - Provide an ergonomic API that abstracts complexity while remaining powerful

### Specific Objectives
- Implement VM-based sandboxing using Bun's `vm` module for secure code execution
- Create a capability system that controls what programs can access
- Build deterministic navigation and search algorithms
- Provide resource limits and operation budgets to prevent abuse
- Support program storage, management, and lifecycle control
- Enable dry-run/simulation mode for testing without server connection
- Integrate seamlessly with existing Mineflare HTTP API infrastructure

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────┐
│              User Program (.js/.ts)          │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│            Program Sandbox (VM)              │
│  - Isolated execution context                │
│  - No filesystem/network access              │
│  - Controlled globals                        │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│             Context Builder                   │
│  - Wraps existing HTTP API                   │
│  - Enforces capabilities                     │
│  - Tracks resource usage                     │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│         Existing Bot Server API              │
│  - /move, /dig, /craft, etc.                 │
│  - Event system                              │
│  - Mineflayer instance                       │
└──────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core SDK & Runtime Foundation

#### 1.1 Project Structure
```
src/
├── program-system/
│   ├── sdk/
│   │   ├── index.js         # Main SDK exports
│   │   ├── types.js         # Type definitions
│   │   └── helpers.js       # Result helpers (ok/fail)
│   ├── runtime/
│   │   ├── sandbox.js       # VM sandbox implementation
│   │   ├── context.js       # Context builder
│   │   └── budget.js        # Resource limiter
│   ├── registry.js          # Program storage/management
│   ├── runner.js            # Program execution orchestrator
│   └── deterministic.js     # Deterministic algorithms
```

#### 1.2 SDK Types & Interfaces
- Define TypeScript types for all API surfaces
- Create `defineProgram` helper for program structure
- Implement result helpers (`ok`, `fail`)

#### 1.3 VM Sandbox
- Create isolated VM context using Bun's `vm` module
- Control available globals (no `Date.now()`, `Math.random()`, etc.)
- Implement timeout and resource limits

### Phase 2: Context API Layer

#### 2.1 Context Builder
- Wrap existing HTTP endpoints in ergonomic API
- Implement capability checking at each API call
- Add operation budget tracking

#### 2.2 Action APIs
- `navigate`: Wraps movement and pathfinding
- `gather`: Mining and resource collection
- `craft`: Crafting and recipe management
- `inventory`: Inventory management
- `search`: Deterministic search patterns

#### 2.3 World Query APIs
- Block scanning and detection
- Entity queries
- World state information

### Phase 3: Program Management

#### 3.1 Program Registry
- Storage system for named programs
- Metadata management (capabilities, defaults, versions)
- Program validation on registration

#### 3.2 Program Runner
- Orchestrates program execution
- Manages lifecycle (pending → running → completed/failed/cancelled)
- Handles cancellation and cleanup

#### 3.3 Lifecycle Management
- Status tracking for running programs
- Cancellation support with grace period
- Structured result/error reporting

### Phase 4: CLI Integration

#### 4.1 New CLI Commands
```bash
# Execute program immediately
mineflare program exec <file> [options]

# Register named program
mineflare program add <file> --name <name>

# Run registered program
mineflare program run <name> [--arg key=value]

# List registered programs
mineflare program ls

# Remove program
mineflare program rm <name>

# Cancel running program
mineflare program cancel <run-id>

# Check program status
mineflare program status <run-id>
```

#### 4.2 Options Support
- `--timeout <ms>`: Execution timeout
- `--cap <capabilities>`: Allowed capabilities
- `--arg <key=value>`: Program arguments
- `--dry-run`: Simulation mode
- `--profile <name>`: Configuration profile

### Phase 5: Deterministic Features

#### 5.1 Deterministic Navigation
- Fixed neighbor ordering in pathfinding
- Predictable tie-breaking in A* algorithm
- Bounded movement with retry limits

#### 5.2 Deterministic Search
- Expanding square pattern on ocean surface
- Fixed visit order (spiral pattern)
- Consistent state between rings

#### 5.3 Deterministic Time
- Clock API with controlled time progression
- No access to system time
- Tick-based timing for consistency

### Phase 6: Safety & Limits

#### 6.1 Capability System
```javascript
const CAPABILITIES = [
  'move',      // Movement and navigation
  'look',      // Camera control
  'dig',       // Block breaking
  'place',     // Block placement
  'attack',    // Combat actions
  'inventory', // Inventory access
  'craft',     // Crafting recipes
  'pathfind',  // Advanced pathfinding
  'events',    // Event subscriptions
  'time'       // Time queries
];
```

#### 6.2 Resource Limits
- Operation budgets (per-minute and total)
- Memory limits via VM heap size
- CPU time limits via timeout
- Network request limits

#### 6.3 Error Handling
- Typed errors with codes
- Structured error information
- Safe error propagation

## Testing Criteria

### Unit Tests

#### 1. Sandbox Security Tests
- **Test**: Verify VM isolation prevents filesystem access
  - **Criteria**: Attempting `require('fs')` should fail
- **Test**: Verify network access is blocked
  - **Criteria**: Attempting `require('http')` should fail
- **Test**: Verify dangerous globals are unavailable
  - **Criteria**: `Date.now()`, `Math.random()`, `setTimeout` should be undefined

#### 2. Capability Enforcement Tests
- **Test**: Verify capability checking works
  - **Criteria**: Calling `actions.dig()` without 'dig' capability should throw
- **Test**: Verify partial capabilities
  - **Criteria**: Program with only 'move' can move but not dig

#### 3. Resource Limit Tests
- **Test**: Verify operation budgets are enforced
  - **Criteria**: Exceeding rate limit (e.g., 60 moves/minute) should throw
- **Test**: Verify timeout enforcement
  - **Criteria**: Infinite loop should be terminated at timeout

### Integration Tests

#### 1. Program Lifecycle Tests
- **Test**: Program registration and execution
  - **Criteria**: Can register, list, run, and remove programs
- **Test**: Program cancellation
  - **Criteria**: Running program can be cancelled mid-execution
- **Test**: Program status tracking
  - **Criteria**: Status transitions correctly through lifecycle

#### 2. Deterministic Execution Tests
- **Test**: Deterministic navigation produces same path
  - **Criteria**: Same start/end with same seed produces identical path
- **Test**: Expanding square search is reproducible
  - **Criteria**: Search pattern visits blocks in same order every time

#### 3. API Integration Tests
- **Test**: Context APIs call underlying HTTP endpoints
  - **Criteria**: `actions.move.goto()` results in POST to `/move`
- **Test**: Event subscriptions work
  - **Criteria**: Programs can receive and react to bot events

### End-to-End Tests

#### 1. Example Program Tests
- **Test**: Wood search program finds wood
  - **Criteria**: Program successfully locates and navigates to wood blocks
- **Test**: Mining program gathers resources
  - **Criteria**: Program mines specified blocks and manages inventory
- **Test**: Crafting program creates items
  - **Criteria**: Program crafts items using recipes

#### 2. Dry-Run Mode Tests
- **Test**: Simulation without server connection
  - **Criteria**: Programs run against world snapshot without real server
- **Test**: Predictable simulation results
  - **Criteria**: Same snapshot produces same simulation outcome

#### 3. Performance Tests
- **Test**: Program execution overhead
  - **Criteria**: VM overhead < 100ms for simple programs
- **Test**: Memory usage stays bounded
  - **Criteria**: Program memory usage doesn't exceed configured limits

### Acceptance Criteria

1. **Security**: No program can access filesystem, network, or system resources
2. **Determinism**: Programs with deterministic flag produce reproducible results
3. **Performance**: Simple programs execute in < 1 second
4. **Reliability**: Programs handle errors gracefully and report them clearly
5. **Usability**: SDK is well-documented with clear examples
6. **Compatibility**: Works with existing Mineflare infrastructure without breaking changes

## Implementation Timeline

### Week 1: Foundation (Days 1-7)
- Day 1-2: Set up project structure and SDK types
- Day 3-4: Implement VM sandbox with Bun
- Day 5-6: Create context builder wrapping existing APIs
- Day 7: Initial testing of sandbox security

### Week 2: Core Features (Days 8-14)
- Day 8-9: Implement deterministic navigation
- Day 10-11: Add operation budgets and rate limiting
- Day 12-13: Build program registry and storage
- Day 14: Integration testing of core features

### Week 3: CLI & Polish (Days 15-21)
- Day 15-16: Extend CLI with program commands
- Day 17-18: Add dry-run/simulation mode
- Day 19-20: Implement lifecycle management
- Day 21: End-to-end testing with example programs

### Week 4: Documentation & Release (Days 22-28)
- Day 22-23: Write comprehensive SDK documentation
- Day 24-25: Create example programs and tutorials
- Day 26-27: Performance optimization and bug fixes
- Day 28: Final testing and release preparation

## Risk Mitigation

### Technical Risks
1. **VM Performance**: Mitigate with caching compiled scripts
2. **Resource Exhaustion**: Implement strict budgets and monitoring
3. **Determinism Bugs**: Extensive testing with property-based tests

### Security Risks
1. **Sandbox Escape**: Regular security audits and updates
2. **Resource Abuse**: Rate limiting and quotas
3. **Code Injection**: Input validation and sanitization

## Success Metrics

1. **Adoption**: 10+ user programs created in first month
2. **Reliability**: < 1% failure rate for valid programs
3. **Performance**: 95% of programs complete in < 30 seconds
4. **Security**: Zero sandbox escapes or security incidents
5. **User Satisfaction**: Positive feedback on API ergonomics

## Conclusion

This system will transform Mineflare from a command-driven bot into a programmable platform, enabling users to create sophisticated automation while maintaining security and reliability. The implementation leverages existing infrastructure while adding powerful new capabilities through a clean, deterministic API.