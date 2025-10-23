/**
 * Flow Control Utilities for Mineflare SDK
 * Provides composable utilities for managing control flow with timeouts and retries
 */

const { ProgramError, ErrorCode } = require('./types');

/**
 * Run an async operation with a timeout
 * @param {Function} operation - The async operation to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [description] - Optional description for error messages
 * @returns {Promise<{ok: boolean, value?: any, error?: string}>} Result type
 * 
 * @example
 * const result = await withTimeout(
 *   async () => await bot.navigate.goto(target),
 *   5000,
 *   'Navigate to target'
 * );
 * if (!result.ok) {
 *   console.log('Operation timed out:', result.error);
 * }
 */
async function withTimeout(operation, timeoutMs, description = 'Operation') {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new ProgramError(
          ErrorCode.TIMEOUT,
          `${description} timed out after ${timeoutMs}ms`
        ));
      }, timeoutMs);
    });

    const result = await Promise.race([
      operation(),
      timeoutPromise
    ]);

    return { ok: true, value: result };
  } catch (error) {
    if (error instanceof ProgramError && error.code === ErrorCode.TIMEOUT) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Retry an operation with deterministic exponential backoff
 * @param {Function} operation - The async operation to retry
 * @param {Object} options - Retry configuration
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {number} [options.baseDelayMs=1000] - Base delay between retries
 * @param {number} [options.maxDelayMs=30000] - Maximum delay between retries
 * @param {Function} [options.shouldRetry] - Predicate to determine if retry should occur
 * @param {Function} [options.onRetry] - Callback on each retry attempt
 * @returns {Promise<{ok: boolean, value?: any, error?: string, attempts?: number}>}
 * 
 * @example
 * const result = await retryBudget(
 *   async () => await bot.gather.mineBlock(position),
 *   {
 *     maxAttempts: 5,
 *     baseDelayMs: 2000,
 *     shouldRetry: (error) => !error.includes('unreachable'),
 *     onRetry: (attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`)
 *   }
 * );
 */
async function retryBudget(operation, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      // If operation returns a Result type
      if (result && typeof result === 'object' && 'ok' in result) {
        if (result.ok) {
          return { ...result, attempts: attempt };
        }
        // Check if we should retry this specific error
        if (!shouldRetry(result.error || '')) {
          return { ...result, attempts: attempt };
        }
        lastError = result.error;
      } else {
        // Success for non-Result returns
        return { ok: true, value: result, attempts: attempt };
      }
    } catch (error) {
      lastError = error.message || 'Unknown error';
      
      // Check if we should retry this error
      if (!shouldRetry(lastError)) {
        return { 
          ok: false, 
          error: lastError, 
          attempts: attempt 
        };
      }
    }

    // Don't delay after the last attempt
    if (attempt < maxAttempts) {
      // Deterministic exponential backoff
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );
      
      onRetry(attempt, delay);
      await sleep(delay);
    }
  }

  return { 
    ok: false, 
    error: `Failed after ${maxAttempts} attempts: ${lastError}`,
    attempts: maxAttempts 
  };
}

/**
 * Run operations in sequence with automatic rollback on failure
 * @param {Array<{operation: Function, rollback?: Function, name?: string}>} steps
 * @returns {Promise<{ok: boolean, value?: any, error?: string, completedSteps?: Array}>}
 * 
 * @example
 * const result = await transaction([
 *   {
 *     name: 'Place crafting table',
 *     operation: async () => await bot.place(tablePos, 'crafting_table'),
 *     rollback: async () => await bot.dig(tablePos)
 *   },
 *   {
 *     name: 'Craft pickaxe',
 *     operation: async () => await bot.craft('wooden_pickaxe', 1)
 *   }
 * ]);
 */
async function transaction(steps) {
  const completedSteps = [];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `Step ${i + 1}`;
    
    try {
      const result = await step.operation();
      
      // Track completed step
      completedSteps.push({
        index: i,
        name: stepName,
        rollback: step.rollback
      });
      
      // Check if step failed
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        // Rollback completed steps in reverse order
        await rollbackSteps(completedSteps);
        return {
          ok: false,
          error: `${stepName} failed: ${result.error}`,
          completedSteps: completedSteps.map(s => s.name)
        };
      }
    } catch (error) {
      // Rollback on exception
      await rollbackSteps(completedSteps);
      return {
        ok: false,
        error: `${stepName} failed: ${error.message}`,
        completedSteps: completedSteps.map(s => s.name)
      };
    }
  }
  
  return {
    ok: true,
    value: `All ${steps.length} steps completed successfully`,
    completedSteps: completedSteps.map(s => s.name)
  };
}

async function rollbackSteps(completedSteps) {
  // Rollback in reverse order
  for (let i = completedSteps.length - 1; i >= 0; i--) {
    const step = completedSteps[i];
    if (step.rollback) {
      try {
        await step.rollback();
      } catch (error) {
        console.error(`Rollback failed for ${step.name}:`, error.message);
      }
    }
  }
}

/**
 * Run operations in parallel with a concurrency limit
 * @param {Array<Function>} operations - Array of async operations
 * @param {number} [concurrency=3] - Maximum concurrent operations
 * @returns {Promise<{ok: boolean, results: Array<{ok: boolean, value?: any, error?: string}>}>}
 * 
 * @example
 * const blocks = await world.scan.blocks({ kinds: ['wood'], radius: 10 });
 * const result = await parallel(
 *   blocks.map(block => async () => await bot.gather.mineBlock(block.position)),
 *   2  // Mine 2 blocks at a time
 * );
 */
async function parallel(operations, concurrency = 3) {
  const results = [];
  const executing = [];
  
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    
    const promise = operation().then(
      value => ({ ok: true, value, index: i }),
      error => ({ ok: false, error: error.message || 'Unknown error', index: i })
    );
    
    results[i] = promise;
    
    if (operations.length >= concurrency) {
      executing.push(promise);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }
  }
  
  const allResults = await Promise.all(results);
  const success = allResults.every(r => r.ok);
  
  return {
    ok: success,
    results: allResults
  };
}

/**
 * Helper sleep function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  withTimeout,
  retryBudget,
  transaction,
  parallel,
  sleep
};