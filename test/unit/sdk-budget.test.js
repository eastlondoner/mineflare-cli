const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const OperationBudget = require('../../src/program-system/runtime/budget');
const { ProgramError, ErrorCode } = require('../../src/program-system/sdk/types');

describe('Operation Budget', () => {
  let budget;
  
  beforeEach(() => {
    budget = new OperationBudget(['move', 'dig', 'place']);
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Capability checking', () => {
    it('should allow operations with enabled capabilities', () => {
      expect(() => budget.check('move')).not.toThrow();
      expect(() => budget.check('dig')).not.toThrow();
      expect(() => budget.check('place')).not.toThrow();
    });
    
    it('should deny operations without required capability', () => {
      expect(() => budget.check('craft')).toThrow(ProgramError);
      expect(() => budget.check('attack')).toThrow(ProgramError);
      
      try {
        budget.check('craft');
      } catch (error) {
        expect(error.code).toBe(ErrorCode.CAPABILITY);
        expect(error.message).toContain("requires the 'craft' capability");
      }
    });
  });
  
  describe('Per-minute rate limiting', () => {
    it('should allow operations within per-minute limit', () => {
      // Default limit for move is 60 per minute
      for (let i = 0; i < 60; i++) {
        expect(() => budget.check('move')).not.toThrow();
      }
    });
    
    it('should enforce per-minute rate limit', () => {
      // Fill up the limit
      for (let i = 0; i < 60; i++) {
        budget.check('move');
      }
      
      // Next one should fail
      expect(() => budget.check('move')).toThrow(ProgramError);
      
      try {
        budget.check('move');
      } catch (error) {
        expect(error.code).toBe(ErrorCode.RESOURCE_LIMIT);
        expect(error.message).toContain('Rate limit exceeded');
        expect(error.message).toContain('61 operations in last minute');
      }
    });
    
    it('should reset rate limit after time window', () => {
      // Fill up the limit
      for (let i = 0; i < 60; i++) {
        budget.check('move');
      }
      
      // Should fail now
      expect(() => budget.check('move')).toThrow();
      
      // Move time forward by 61 seconds
      jest.spyOn(Date, 'now').mockReturnValue(1061000);
      
      // Should work again
      expect(() => budget.check('move')).not.toThrow();
    });
    
    it('should track multiple operations independently', () => {
      // Use different limits
      for (let i = 0; i < 20; i++) {
        budget.check('dig'); // Limit: 20 per minute
      }
      
      for (let i = 0; i < 20; i++) {
        budget.check('place'); // Limit: 20 per minute
      }
      
      // Both should be at their limits
      expect(() => budget.check('dig')).toThrow();
      expect(() => budget.check('place')).toThrow();
      
      // But move should still work
      expect(() => budget.check('move')).not.toThrow();
    });
    
    it('should handle batch operations', () => {
      // Check 10 operations at once
      expect(() => budget.check('move', 10)).not.toThrow();
      
      // Should have consumed 10 from the budget
      for (let i = 0; i < 50; i++) {
        budget.check('move');
      }
      
      // Next one should fail (10 + 50 = 60, at limit)
      expect(() => budget.check('move')).toThrow();
    });
  });
  
  describe('Total limits', () => {
    it('should enforce total operation limit', () => {
      // Move has total limit of 1000
      // But we'll test with a smaller custom limit
      budget.setLimits('move', null, 100);
      
      // Spread operations over time to avoid rate limit
      for (let i = 0; i < 10; i++) {
        // Advance time by 1 minute each iteration
        jest.spyOn(Date, 'now').mockReturnValue(1000000 + i * 60000);
        
        // Do 10 operations
        for (let j = 0; j < 10; j++) {
          budget.check('move');
        }
      }
      
      // Should have done 100 operations total
      expect(() => budget.check('move')).toThrow();
      
      try {
        budget.check('move');
      } catch (error) {
        expect(error.code).toBe(ErrorCode.RESOURCE_LIMIT);
        expect(error.message).toContain('Total limit exceeded');
        expect(error.message).toContain('101 operations');
      }
    });
    
    it('should not reset total limit with time', () => {
      budget.setLimits('dig', 5, 10); // 5 per minute, 10 total
      
      // Use 10 operations over time
      for (let i = 0; i < 10; i++) {
        jest.spyOn(Date, 'now').mockReturnValue(1000000 + i * 15000); // 15 seconds apart
        budget.check('dig');
      }
      
      // Move time forward by an hour
      jest.spyOn(Date, 'now').mockReturnValue(1000000 + 3600000);
      
      // Should still be at total limit
      expect(() => budget.check('dig')).toThrow();
    });
  });
  
  describe('Usage tracking', () => {
    it('should track usage statistics', () => {
      budget.check('move', 5);
      budget.check('dig', 3);
      budget.check('place', 2);
      
      const usage = budget.getUsage();
      
      expect(usage.total).toEqual({
        move: 5,
        dig: 3,
        place: 2
      });
      
      expect(usage.perMinute).toEqual({
        move: 5,
        dig: 3,
        place: 2
      });
    });
    
    it('should clean old entries from minute window', () => {
      // Add some operations
      budget.check('move', 10);
      
      // Move time forward 30 seconds
      jest.spyOn(Date, 'now').mockReturnValue(1030000);
      budget.check('move', 5);
      
      // Check usage - should show all 15
      let usage = budget.getUsage();
      expect(usage.perMinute.move).toBe(15);
      
      // Move time forward past 1 minute from first operations
      jest.spyOn(Date, 'now').mockReturnValue(1061000);
      
      // Check usage - should only show recent 5
      usage = budget.getUsage();
      expect(usage.perMinute.move).toBe(5);
      expect(usage.total.move).toBe(15); // Total doesn't reset
    });
  });
  
  describe('Custom limits', () => {
    it('should allow setting custom limits', () => {
      budget.setLimits('move', 10, 50);
      
      // Should only allow 10 per minute now
      for (let i = 0; i < 10; i++) {
        budget.check('move');
      }
      
      expect(() => budget.check('move')).toThrow();
    });
    
    it('should allow disabling limits with null', () => {
      budget.setLimits('move', null, null);
      
      // Should allow unlimited operations
      for (let i = 0; i < 1000; i++) {
        budget.check('move');
      }
      
      // Still shouldn't throw
      expect(() => budget.check('move', 1000)).not.toThrow();
    });
  });
  
  describe('getRemaining', () => {
    it('should calculate remaining budget', () => {
      budget.setLimits('move', 10, 100);
      
      // Use some budget
      budget.check('move', 3);
      
      const remaining = budget.getRemaining('move');
      
      expect(remaining.perMinute).toBe(7);
      expect(remaining.total).toBe(97);
    });
    
    it('should return 0 for disabled capabilities', () => {
      const remaining = budget.getRemaining('craft');
      
      expect(remaining.perMinute).toBe(0);
      expect(remaining.total).toBe(0);
    });
    
    it('should handle infinity for unlimited operations', () => {
      budget.setLimits('move', null, null);
      
      const remaining = budget.getRemaining('move');
      
      expect(remaining.perMinute).toBe(Infinity);
      expect(remaining.total).toBe(Infinity);
    });
  });
  
  describe('reset', () => {
    it('should reset all usage counters', () => {
      // Use some operations
      budget.check('move', 10);
      budget.check('dig', 5);
      
      let usage = budget.getUsage();
      expect(usage.total.move).toBe(10);
      expect(usage.total.dig).toBe(5);
      
      // Reset
      budget.reset();
      
      usage = budget.getUsage();
      expect(usage.total.move).toBe(0);
      expect(usage.total.dig).toBe(0);
      expect(usage.perMinute.move).toBe(0);
      expect(usage.perMinute.dig).toBe(0);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle operations at exact rate limit boundary', () => {
      budget.setLimits('move', 2, 10);
      
      // First two should work
      budget.check('move');
      budget.check('move');
      
      // Third should fail
      expect(() => budget.check('move')).toThrow();
      
      // Move time forward exactly 1 minute
      jest.spyOn(Date, 'now').mockReturnValue(1060001);
      
      // Should work again
      expect(() => budget.check('move')).not.toThrow();
    });
    
    it('should handle multiple operations in same millisecond', () => {
      // All at same timestamp
      budget.check('move');
      budget.check('dig');
      budget.check('place');
      budget.check('move');
      
      const usage = budget.getUsage();
      expect(usage.perMinute.move).toBe(2);
      expect(usage.perMinute.dig).toBe(1);
      expect(usage.perMinute.place).toBe(1);
    });
  });
});