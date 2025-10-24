const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const flowUtils = require('../../src/program-system/sdk/flow');

describe('SDK Flow Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  describe('withTimeout', () => {
    it('should complete successfully within timeout', async () => {
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });
      
      jest.useRealTimers(); // Need real timers for this test
      const result = await flowUtils.withTimeout(operation, 1000, 'Test operation');
      
      expect(result.ok).toBe(true);
      expect(result.value).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should timeout if operation takes too long', async () => {
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      });
      
      jest.useRealTimers();
      const result = await flowUtils.withTimeout(operation, 500, 'Test operation');
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timed out after 500ms');
    });
    
    it('should catch operation errors', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Operation failed');
      });
      
      jest.useRealTimers();
      const result = await flowUtils.withTimeout(operation, 1000);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Operation failed');
    });
  });
  
  describe('retryBudget', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn(async () => ({ ok: true, value: 'success' }));
      
      const result = await flowUtils.retryBudget(operation, {
        maxAttempts: 3,
        baseDelayMs: 100
      });
      
      expect(result.ok).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should retry on failure and eventually succeed', async () => {
      let attempt = 0;
      const operation = jest.fn(async () => {
        attempt++;
        if (attempt < 3) {
          return { ok: false, error: 'Temporary failure' };
        }
        return { ok: true, value: 'success' };
      });
      
      jest.useRealTimers();
      const result = await flowUtils.retryBudget(operation, {
        maxAttempts: 5,
        baseDelayMs: 10
      });
      
      expect(result.ok).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should fail after max attempts', async () => {
      const operation = jest.fn(async () => ({ ok: false, error: 'Always fails' }));
      
      jest.useRealTimers();
      const result = await flowUtils.retryBudget(operation, {
        maxAttempts: 3,
        baseDelayMs: 10
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed after 3 attempts: Always fails');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should respect shouldRetry predicate', async () => {
      const operation = jest.fn(async () => ({ ok: false, error: 'Permanent error' }));
      const shouldRetry = jest.fn(() => false);
      
      const result = await flowUtils.retryBudget(operation, {
        maxAttempts: 5,
        shouldRetry
      });
      
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith('Permanent error');
    });
    
    it('should call onRetry callback', async () => {
      let attempt = 0;
      const operation = jest.fn(async () => {
        attempt++;
        if (attempt < 3) {
          return { ok: false, error: 'Retry me' };
        }
        return { ok: true, value: 'done' };
      });
      
      const onRetry = jest.fn();
      
      jest.useRealTimers();
      await flowUtils.retryBudget(operation, {
        maxAttempts: 5,
        baseDelayMs: 10,
        onRetry
      });
      
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Number));
    });
    
    it('should apply exponential backoff with max delay', async () => {
      const operation = jest.fn(async () => ({ ok: false, error: 'Fail' }));
      const delays = [];
      
      jest.useRealTimers();
      const startTime = Date.now();
      
      await flowUtils.retryBudget(operation, {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 300,
        onRetry: (attempt, delay) => {
          delays.push(delay);
        }
      });
      
      // Check delays follow exponential pattern with cap
      expect(delays[0]).toBeLessThanOrEqual(100); // First retry: base delay
      expect(delays[1]).toBeLessThanOrEqual(200); // Second retry: 2x base
      expect(delays[2]).toBeLessThanOrEqual(300); // Third retry: capped at max
    });
  });
  
  describe('transaction', () => {
    it('should commit on success', async () => {
      const operation1 = jest.fn(async () => ({ ok: true, value: 'step1' }));
      const operation2 = jest.fn(async () => ({ ok: true, value: 'step2' }));
      
      const steps = [
        { name: 'Step 1', operation: operation1 },
        { name: 'Step 2', operation: operation2 }
      ];
      
      const result = await flowUtils.transaction(steps);
      
      expect(result.ok).toBe(true);
      expect(result.value).toBe('All 2 steps completed successfully');
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
    });
    
    it('should rollback on operation failure', async () => {
      const operation1 = jest.fn(async () => ({ ok: true, value: 'step1' }));
      const operation2 = jest.fn(async () => ({ ok: false, error: 'Failed' }));
      const rollback1 = jest.fn(async () => ({ ok: true }));
      
      const steps = [
        { name: 'Step 1', operation: operation1, rollback: rollback1 },
        { name: 'Step 2', operation: operation2 }
      ];
      
      const result = await flowUtils.transaction(steps);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Step 2 failed: Failed');
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
      expect(rollback1).toHaveBeenCalledTimes(1);
    });
    
    it('should handle exceptions in operations', async () => {
      const operation1 = jest.fn(async () => ({ ok: true }));
      const operation2 = jest.fn(async () => {
        throw new Error('Exception occurred');
      });
      const rollback1 = jest.fn(async () => ({ ok: true }));
      
      const steps = [
        { name: 'Step 1', operation: operation1, rollback: rollback1 },
        { name: 'Step 2', operation: operation2 }
      ];
      
      const result = await flowUtils.transaction(steps);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Step 2 failed: Exception occurred');
      expect(rollback1).toHaveBeenCalledTimes(1);
    });
    
    it('should track completed steps', async () => {
      const operation1 = jest.fn(async () => ({ ok: true }));
      const operation2 = jest.fn(async () => ({ ok: false, error: 'Stop here' }));
      
      const steps = [
        { name: 'Setup', operation: operation1 },
        { name: 'Execute', operation: operation2 },
        { name: 'Cleanup', operation: jest.fn() }
      ];
      
      const result = await flowUtils.transaction(steps);
      
      expect(result.ok).toBe(false);
      expect(result.completedSteps).toEqual(['Setup']);
    });
  });
  
  describe('parallel', () => {
    it('should execute operations in parallel', async () => {
      const operations = [
        jest.fn(async () => 'op1'),
        jest.fn(async () => 'op2'),
        jest.fn(async () => 'op3')
      ];
      
      const result = await flowUtils.parallel(operations);
      
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toMatchObject({ ok: true, value: 'op1' });
      expect(result.results[1]).toMatchObject({ ok: true, value: 'op2' });
      expect(result.results[2]).toMatchObject({ ok: true, value: 'op3' });
    });
    
    it('should handle partial failures', async () => {
      const operations = [
        jest.fn(async () => 'success1'),
        jest.fn(async () => { throw new Error('fail1'); }),
        jest.fn(async () => 'success2'),
        jest.fn(async () => { throw new Error('fail2'); })
      ];
      
      const result = await flowUtils.parallel(operations);
      
      expect(result.ok).toBe(false);
      expect(result.results).toHaveLength(4);
      expect(result.results[0]).toMatchObject({ ok: true, value: 'success1' });
      expect(result.results[1]).toMatchObject({ ok: false, error: 'fail1' });
      expect(result.results[2]).toMatchObject({ ok: true, value: 'success2' });
      expect(result.results[3]).toMatchObject({ ok: false, error: 'fail2' });
    });
    
    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      
      const operations = Array(5).fill(null).map(() => 
        jest.fn(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(resolve => setTimeout(resolve, 50));
          concurrent--;
          return 'done';
        })
      );
      
      jest.useRealTimers();
      const result = await flowUtils.parallel(operations, 2); // Limit to 2 concurrent
      
      expect(result.ok).toBe(true);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });
  
  describe('sleep', () => {
    it('should delay for specified time', async () => {
      jest.useRealTimers();
      const start = Date.now();
      
      await flowUtils.sleep(100);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small timing variance
      expect(elapsed).toBeLessThan(150);
    });
  });
});