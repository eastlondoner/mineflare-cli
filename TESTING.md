# Testing Guide

This document provides a comprehensive guide to the testing infrastructure for the Minecraft Bot Server project.

## Overview

The project uses Bun's built-in test runner with comprehensive unit and integration tests to ensure code quality and reliability.

### Current Test Status
- **Total Tests**: 191 tests
- **Passing**: 182 tests (95%)
- **Failing**: 9 tests (due to Bun module mocking limitations)
- **Coverage**: 52.27% (target: 80%)

## Test Structure

```
test/
├── unit/                  # Unit tests for individual modules
│   ├── ConfigManager.test.js  # Configuration manager tests (37 tests)
│   ├── bot-server.test.js     # Bot server tests (67 tests)
│   ├── cli.test.js           # CLI tests (45 tests)
│   ├── server.test.js        # Server tests (20 tests)
│   └── mineflare.test.js     # Main entry point tests (55 tests)
├── integration/          # Integration tests
│   └── api.test.js           # API endpoint tests (37 tests)
├── mocks/               # Mock implementations
│   └── mineflayer-mock.js    # Mock Minecraft bot
└── utils/               # Test utilities
    ├── test-setup.js         # Global test setup
    └── test-helpers.js       # Helper functions
```

## Running Tests

### Basic Commands

```bash
# Run all tests
bun test

# Run unit tests only
bun test:unit

# Run integration tests only
bun test:integration

# Run tests in watch mode
bun test:watch

# Run tests with coverage report
bun test:coverage

# Run tests for CI pipeline
bun test:ci
```

### Running Specific Tests

```bash
# Run a specific test file
bun test test/unit/ConfigManager.test.js

# Run tests matching a pattern
bun test --preload ./test/utils/test-setup.js test/unit/*.test.js

# Run tests with debug output
DEBUG_TESTS=true bun test
```

## Writing Tests

### Test File Structure

```javascript
const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const ModuleToTest = require('../../src/module-to-test.js');

describe('ModuleName', () => {
  let instance;

  beforeEach(() => {
    // Setup before each test
    instance = new ModuleToTest();
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Test implementation
      const result = instance.method();
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Using Mocks

Bun provides Jest-compatible mocking functions:

```javascript
const { jest, mock } = require('bun:test');

// Create a mock function
const mockFunction = jest.fn(() => 'return value');

// Mock a module
mock.module('module-name', () => ({
  method: jest.fn()
}));

// Spy on existing functions
const spy = jest.spyOn(object, 'method');
```

### Test Helpers

The project includes several helper utilities in `test/utils/test-helpers.js`:

```javascript
const { 
  createTempDir,    // Create temporary directory
  cleanupTempDir,   // Clean up temporary directory
  mockAxios,        // Mock axios requests
  createMockBot,    // Create mock Minecraft bot
  waitForEvent      // Wait for event emission
} = require('../utils/test-helpers.js');
```

## Test Coverage

### Coverage Requirements

The project enforces the following minimum coverage thresholds:

- **Line Coverage**: 80%
- **Function Coverage**: 80%
- **Branch Coverage**: 75%
- **Statement Coverage**: 80%

### Viewing Coverage Reports

```bash
# Generate coverage report
bun test:coverage

# Coverage output formats
# - Console (text)
# - LCOV (for CI integration)
```

### Areas Needing Coverage Improvement

Current coverage gaps that need attention:

1. **ConfigManager** (34% coverage)
   - Environment variable overrides
   - Profile management edge cases
   - Config file error handling
   - Schema validation edge cases

2. **Bot Server** (67% coverage)
   - Event handler edge cases
   - Batch operation error scenarios
   - Screenshot generation errors

3. **CLI** (needs coverage measurement)
   - Command validation
   - Error output formatting
   - Interactive mode

## Known Issues

### Module Mocking Limitations

Bun's current module mocking has limitations with certain require() patterns. The following tests fail due to these limitations:

- Bot server tests related to mineflayer module mocking (8 tests)
- Tests requiring deep module replacement

**Workaround**: Use dependency injection or factory patterns instead of direct module mocking where possible.

### Async Test Considerations

- Always use `async/await` for asynchronous tests
- Set appropriate timeouts for long-running operations
- Clean up async resources in `afterEach`

## Best Practices

### 1. Test Organization

- Group related tests using `describe` blocks
- Use descriptive test names that explain the expected behavior
- Keep tests focused on a single behavior

### 2. Test Independence

- Each test should be independent and not rely on others
- Use `beforeEach` and `afterEach` for setup and cleanup
- Avoid shared state between tests

### 3. Mock Management

```javascript
beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});
```

### 4. Assertions

- Use specific matchers for better error messages
- Test both success and failure paths
- Include edge cases and boundary conditions

```javascript
// Good
expect(result).toBe(42);
expect(error.message).toContain('Invalid input');

// Avoid
expect(result).toBeTruthy();
expect(error).toBeDefined();
```

### 5. Performance

- Keep tests fast (< 100ms per test ideal)
- Mock external dependencies
- Use test fixtures for large data sets

## CI/CD Integration

The test suite is designed to run in CI pipelines:

```yaml
# Example GitHub Actions workflow
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:ci
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage.lcov
```

## Debugging Tests

### Enable Debug Output

```bash
# Show console output during tests
DEBUG_TESTS=true bun test

# Use Bun's built-in inspector
bun test --inspect
```

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Test timeout | Increase timeout: `it('test', async () => {}, 10000)` |
| Mock not working | Check mock.module() is called before require() |
| Flaky tests | Add proper cleanup, avoid timing dependencies |
| Coverage not updating | Clear cache: `rm -rf node_modules/.cache` |

## Test Data Management

### Fixtures

Store test data in separate files:

```javascript
// test/fixtures/bot-config.json
{
  "host": "localhost",
  "port": 25565,
  "username": "TestBot"
}

// In test file
const config = require('../fixtures/bot-config.json');
```

### Temporary Files

Use the helper functions for temporary file operations:

```javascript
const { createTempDir, cleanupTempDir } = require('../utils/test-helpers');

beforeEach(() => {
  this.tempDir = createTempDir();
});

afterEach(() => {
  cleanupTempDir(this.tempDir);
});
```

## Contributing

When adding new features or fixing bugs:

1. **Write tests first** (TDD approach recommended)
2. **Ensure all tests pass** before submitting PR
3. **Maintain or improve coverage** - don't decrease it
4. **Update this documentation** if adding new test utilities or patterns

### Test Checklist

Before submitting code:

- [ ] All new code has tests
- [ ] All tests pass (`bun test`)
- [ ] Coverage meets thresholds (`bun test:coverage`)
- [ ] No console.log statements in tests (unless debugging)
- [ ] Tests are properly organized and named
- [ ] Mocks are properly cleaned up

## Performance Testing

For load testing and performance validation:

```javascript
describe('Performance', () => {
  it('should handle 100 concurrent requests', async () => {
    const requests = Array(100).fill(null).map(() => 
      makeRequest('/endpoint')
    );
    
    const start = Date.now();
    await Promise.all(requests);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // Should complete within 5s
  });
});
```

## Resources

- [Bun Test Documentation](https://bun.sh/docs/test)
- [Jest Matchers Reference](https://jestjs.io/docs/expect)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## Maintenance

### Regular Tasks

- **Weekly**: Review and update failing tests
- **Monthly**: Audit test coverage and identify gaps
- **Quarterly**: Review and optimize slow tests
- **Yearly**: Update testing dependencies and patterns

### Test Health Metrics

Track these metrics to maintain test quality:

- Test execution time (target: < 30 seconds for full suite)
- Coverage percentage (target: > 80%)
- Test flakiness rate (target: < 1%)
- Test-to-code ratio (target: 1:1 or higher)

---

*Last Updated: Current Session*
*Test Suite Version: 1.0.0*