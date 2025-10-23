# End-to-End Testing Suite - Zero Dependencies

## Philosophy

This E2E testing framework operates on the principle of **absolute realism**. Unlike unit tests that mock dependencies, these tests interact with real services, real servers, and real systems to validate that our application works in production-like conditions.

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

## Test Categories

### 1. Server Lifecycle Tests (`server-lifecycle.e2e.test.js`)
- Real server startup and shutdown
- Daemon mode operations
- Process management
- Signal handling (SIGINT, SIGTERM)
- Port binding and conflicts
- Configuration loading from real files

### 2. Bot Connection Tests (`bot-connection.e2e.test.js`)
- Real Minecraft server connections
- Authentication flows
- Network error handling
- Reconnection logic
- Multiple bot instances
- Connection timeouts

### 3. Bot Interaction Tests (`bot-interaction.e2e.test.js`)
- Movement commands on real terrain
- Inventory management with real items
- Chat interactions
- Block placement and breaking
- Entity interactions
- Combat mechanics

### 4. API Tests (`api.e2e.test.js`)
- Real HTTP requests to running server
- WebSocket connections
- File uploads/downloads
- Rate limiting
- Authentication
- Concurrent request handling

### 5. Configuration Tests (`config.e2e.test.js`)
- Profile switching with real effects
- Configuration persistence
- Import/export with real files
- Environment variable overrides
- Configuration validation

### 6. CLI Tests (`cli.e2e.test.js`)
- Real command execution
- Output formatting
- Error messages
- Interactive prompts
- Batch operations
- Pipeline operations

### 7. Viewer Tests (`viewer.e2e.test.js`)
- Real viewer startup
- Canvas rendering
- Screenshot generation
- Real-time updates
- Performance under load

### 8. Stress Tests (`stress.e2e.test.js`)
- Multiple simultaneous connections
- High-frequency command execution
- Memory leak detection
- CPU usage monitoring
- Network bandwidth testing

## Test Environment

### Prerequisites

1. **Test Minecraft Server**: A dedicated Minecraft server for testing (can be local or Docker)
2. **Network Access**: Tests require network connectivity
3. **File System Access**: Tests create and modify real files
4. **Port Availability**: Tests need ports 3000-3010 available
5. **Sufficient Resources**: CPU and memory for running server + bot + tests

### Setup

The test environment can be configured via environment variables:

```bash
# Minecraft test server configuration
E2E_MC_HOST=localhost          # Minecraft server host
E2E_MC_PORT=25565              # Minecraft server port
E2E_MC_VERSION=1.21.1          # Minecraft version
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

### Full Suite
```bash
bun test:e2e
```

### Specific Category
```bash
bun test:e2e:server    # Server lifecycle tests
bun test:e2e:bot       # Bot connection/interaction tests
bun test:e2e:api       # API tests
bun test:e2e:stress    # Stress tests
```

### With Custom Configuration
```bash
E2E_MC_HOST=play.example.com E2E_MC_PORT=25565 bun test:e2e
```

### In CI/CD Pipeline
```bash
bun test:e2e:ci        # Runs with CI-appropriate timeouts and settings
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
   - Ensure server is running: `docker-compose up minecraft-test`
   - Check connectivity: `nc -zv localhost 25565`

2. **Port Conflicts**
   - Check for processes using test ports: `lsof -i :3000-3010`
   - Kill conflicting processes or adjust `E2E_PORT_RANGE`

3. **Timeout Errors**
   - Increase timeouts: `E2E_TIMEOUT=60000 bun test:e2e`
   - Check network latency to test server
   - Verify server performance

4. **Resource Exhaustion**
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