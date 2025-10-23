# End-to-End Testing Suite - Zero Mocks

## Philosophy

This E2E testing framework operates on the principle of **absolute realism**. Unlike unit tests that mock dependencies, these tests interact with real services, real servers, and real systems to validate that our application works in production-like conditions.

**Current Status**: The framework is operational with a real Minecraft Paper 1.21.8 server running on port 8099. Basic connectivity tests are passing and demonstrating real TCP connections to the actual Minecraft server.

### Core Principles

1. **Zero Mocks**: No mocking of any dependencies. Every test runs against real implementations.
2. **Full Stack Testing**: Tests the complete flow from CLI commands to actual Minecraft server interactions.
3. **Production Similarity**: Tests run in an environment as close to production as possible.
4. **Real Network Communication**: All API calls, bot connections, and server communications are real.
5. **State Verification**: Tests verify actual state changes in the system, not mocked responses.

## Goals

### Primary Goals

- **Confidence in Production**: If E2E tests pass, we have high confidence the system works in production
- **Integration Validation**: Verify all components work together seamlessly
- **Real-World Scenarios**: Test actual user workflows and edge cases
- **Performance Validation**: Measure real response times and resource usage
- **Error Handling**: Verify the system handles real network issues, timeouts, and failures

### Secondary Goals

- **Documentation**: E2E tests serve as living documentation of system capabilities
- **Regression Prevention**: Catch issues that unit tests might miss
- **User Experience Validation**: Ensure the system works from a user's perspective

## Current Test Files

### Implemented Tests

#### 1. Simple Connection Test (`simple-connection.test.js`) ✅ **PASSING**
- Verifies the Minecraft server port is open and accepting connections
- Tests multiple simultaneous TCP connections
- Measures real network latency to the server
- **Status**: All 3 tests passing with real connections

#### 2. Real Minecraft Connection Test (`real-minecraft-connection.test.js`)
- Connects real bots to the real Minecraft server
- Tests multiple bot connections simultaneously
- Performs real actions in the Minecraft world
- Handles real events from the Minecraft server
- **Status**: Framework ready, connection protocols being refined

#### 3. Server Lifecycle Tests (`server-lifecycle.e2e.test.js`)
- Real server startup and shutdown
- Daemon mode operations
- Process management
- Signal handling (SIGINT, SIGTERM)
- Port binding and conflicts
- Configuration loading from real files
- **Status**: Framework implemented, server startup tests in progress

#### 4. Bot Connection Tests (`bot-connection.e2e.test.js`)
- Real Minecraft server connections
- Authentication flows
- Network error handling
- Reconnection logic
- Multiple bot instances
- Connection timeouts
- **Status**: Framework implemented, connection tests in development

#### 5. API Tests (`api.e2e.test.js`)
- Real HTTP requests to running server
- State endpoint verification
- Movement and action commands
- Event streaming
- Batch operations
- **Status**: Framework ready for implementation

#### 6. CLI Commands Tests (`cli-commands.e2e.test.js`) 🔥 **NEW**
- **Comprehensive test suite for ALL CLI commands**
- Tests every single CLI command with real execution
- Information commands: health, state, inventory, entities, events, recipes, screenshot
- Action commands: chat, move, stop, look, dig, place, attack, craft, equip
- Batch job execution with real JSON files
- Server management commands: start, stop, status, daemon mode
- Configuration commands: get, set, profile management, import/export
- **Status**: Framework fully implemented, comprehensive coverage

#### 7. Simple CLI Tests (`cli-simple.e2e.test.js`) ✅ **WORKING**
- Streamlined version of CLI tests for quick validation
- Essential command testing with real bot server
- Uses execSync for synchronous CLI execution
- **Status**: 12/20 tests passing with real command execution
- Demonstrates real bot interactions with Minecraft server

### Test Utilities

#### `test-environment.js`
- Manages real server processes
- Handles test lifecycle
- Provides utilities for spawning and monitoring servers
- **No mocks** - real process management

#### `api-client.js`
- Makes real HTTP requests to the API
- No axios mocking - actual network calls
- Response validation
- Error handling utilities

#### `e2e-setup.js`
- Global test configuration
- Environment variable management
- Performance tracking
- Resource cleanup

## Test Environment

### Prerequisites

1. **Test Minecraft Server**: Paper 1.21.8 server included in `minecraft-server/` directory
2. **Network Access**: Tests require network connectivity
3. **File System Access**: Tests create and modify real files
4. **Port Availability**: Port 8099 for Minecraft server, ports 3000-3010 for test servers
5. **Sufficient Resources**: CPU and memory for running server + bot + tests

### Current Test Server

The project includes a **real Minecraft Paper 1.21.8 server** for testing:

```bash
# The test server is already configured in minecraft-server/ directory
# It runs on port 8099 to avoid conflicts
# Offline mode is enabled for easy bot testing

# To start manually:
cd minecraft-server
java -Xmx1024M -Xms1024M -jar paper-1.21.8.jar nogui
```

### Setup

The test environment can be configured via environment variables:

```bash
# Minecraft test server configuration (defaults for included server)
E2E_MC_HOST=localhost          # Minecraft server host
E2E_MC_PORT=8099               # Minecraft server port (using 8099)
E2E_MC_VERSION=1.21.8          # Minecraft version
E2E_MC_OFFLINE=true            # Use offline mode for testing

# Test configuration
E2E_TIMEOUT=30000              # Global test timeout (ms)
E2E_CLEANUP=true               # Clean up test artifacts
E2E_VERBOSE=false              # Verbose logging
E2E_PARALLEL=false             # Run tests in parallel

# Performance thresholds
E2E_MAX_STARTUP_TIME=5000      # Max server startup time (ms)
E2E_MAX_CONNECT_TIME=10000     # Max bot connection time (ms)
E2E_MAX_API_RESPONSE=1000      # Max API response time (ms)
```

## Running E2E Tests

### Quick Start - Run Working Tests
```bash
# Run the simple connection test (currently passing!)
bun test test/e2e/simple-connection.test.js

# This will show:
# ✓ Server port verification
# ✓ Multiple simultaneous connections
# ✓ Network latency measurements
```

### Full Test Suite
```bash
# Run all E2E tests
bun test test/e2e/*.test.js

# Run with environment variables for the test server
E2E_MC_HOST=localhost E2E_MC_PORT=8099 bun test test/e2e/*.test.js
```

### Specific Test Files
```bash
# Simple connection tests (✅ PASSING - 3/3 tests)
bun test test/e2e/simple-connection.test.js

# Simple CLI tests (✅ WORKING - 12/20 tests passing)
bun test test/e2e/cli-simple.e2e.test.js

# Comprehensive CLI commands test suite (🔥 NEW - Full coverage)
bun test test/e2e/cli-commands.e2e.test.js

# Real Minecraft bot connections
bun test test/e2e/real-minecraft-connection.test.js

# Server lifecycle tests
bun test test/e2e/server-lifecycle.e2e.test.js

# Bot connection tests
bun test test/e2e/bot-connection.e2e.test.js

# API endpoint tests
bun test test/e2e/api.e2e.test.js
```

### With Custom Configuration
```bash
# Point to a different Minecraft server
E2E_MC_HOST=mc.example.com E2E_MC_PORT=25565 bun test test/e2e/*.test.js

# Enable verbose logging
E2E_VERBOSE=true bun test test/e2e/*.test.js
```

## Test Utilities

### `TestEnvironment` Class
Manages the test environment lifecycle, including:
- Starting/stopping test servers
- Managing test data directories
- Cleaning up after tests
- Monitoring resource usage

### `RealMinecraftServer` Class
Interfaces with actual Minecraft servers:
- Server startup/shutdown
- Player management
- World management
- Command execution

### `TestBot` Class
Creates real bot instances for testing:
- Connection management
- Action execution
- State verification
- Event monitoring

### `APIClient` Class
Makes real HTTP requests:
- No axios mocking
- Real network communication
- Actual response validation
- Error handling

## Writing E2E Tests

### Example Structure

```javascript
describe('E2E: Bot Movement', () => {
  let env;
  let server;
  let bot;

  beforeAll(async () => {
    // Set up real environment
    env = new TestEnvironment();
    await env.setup();
    
    // Start real server
    server = await env.startServer({
      port: 3000,
      config: 'test/e2e/fixtures/test-config.json'
    });
    
    // Connect real bot
    bot = await env.connectBot({
      host: process.env.E2E_MC_HOST,
      port: process.env.E2E_MC_PORT
    });
  }, 30000);

  afterAll(async () => {
    // Clean up everything
    await bot?.disconnect();
    await server?.stop();
    await env?.cleanup();
  });

  it('should move bot to specific coordinates', async () => {
    // Execute real movement
    const startPos = bot.entity.position.clone();
    await bot.pathfinder.goto(new Vec3(100, 64, 100));
    
    // Verify actual position change
    const endPos = bot.entity.position;
    expect(endPos.distanceTo(new Vec3(100, 64, 100))).toBeLessThan(2);
    expect(endPos).not.toEqual(startPos);
  }, 20000);
});
```

## Performance Benchmarks

E2E tests track and validate performance metrics:

| Operation | Target | Maximum |
|-----------|--------|---------|
| Server Startup | < 2s | 5s |
| Bot Connection | < 3s | 10s |
| API Response | < 200ms | 1s |
| Movement Command | < 500ms | 2s |
| Screenshot Generation | < 1s | 3s |
| Config Load | < 100ms | 500ms |

## Troubleshooting

### Common Issues

1. **Test Minecraft Server Not Available**
   - Ensure server is running: `cd minecraft-server && java -jar paper-1.21.8.jar nogui`
   - Check connectivity: `nc -zv localhost 8099`
   - Verify server logs in minecraft-server/logs/

2. **Port Conflicts**
   - Test server uses port 8099 (not standard 25565)
   - Check for processes using test ports: `lsof -i :8099` and `lsof -i :3000-3010`
   - Kill conflicting processes or adjust ports

3. **Version Mismatch Errors**
   - Use auto-detection: Set `version: false` in bot configuration
   - Or specify exact version: `version: '1.21.8'`

4. **Timeout Errors**
   - Increase timeouts: `E2E_TIMEOUT=60000 bun test test/e2e/*.test.js`
   - Check network latency to test server
   - Verify server performance

5. **Resource Exhaustion**
   - Monitor memory: `watch -n 1 free -h`
   - Check CPU: `top`
   - Reduce parallel execution: `E2E_PARALLEL=false`

## Continuous Integration

E2E tests run in CI with:
- Dockerized Minecraft server
- Isolated test environment
- Automatic cleanup
- Performance reporting
- Failure screenshots
- Log collection

## Future Enhancements

- [ ] Video recording of test runs
- [ ] Distributed test execution
- [ ] Multiple Minecraft version testing
- [ ] Modded server testing
- [ ] Performance regression tracking
- [ ] Automated bug report generation
- [ ] Cross-platform testing (Windows, macOS)
- [ ] Network condition simulation (latency, packet loss)

## Contributing

When adding new E2E tests:
1. Follow the zero-mocks principle strictly
2. Ensure tests are idempotent
3. Clean up all created resources
4. Document any new environment requirements
5. Add appropriate timeouts
6. Include performance assertions
7. Handle both success and failure cases
8. Test on both local and CI environments

## Metrics and Reporting

E2E tests generate:
- JUnit XML reports for CI
- HTML reports with screenshots
- Performance metrics JSON
- Coverage reports (functional coverage)
- Resource usage graphs
- Failure analysis reports

---

*"Test like it's production, because eventually, it will be."*