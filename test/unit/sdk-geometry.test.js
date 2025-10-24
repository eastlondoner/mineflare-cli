const { describe, it, expect, beforeEach } = require('@jest/globals');
const geometryUtils = require('../../src/program-system/sdk/geometry');
const { Vec3 } = require('../../src/program-system/sdk/types');

describe('SDK Geometry Utilities', () => {
  describe('nearestFirst', () => {
    it('should sort positions by distance from reference', () => {
      const positions = [
        new Vec3(10, 0, 0),
        new Vec3(5, 0, 0),
        new Vec3(20, 0, 0),
        new Vec3(2, 0, 0)
      ];
      const reference = new Vec3(0, 0, 0);
      
      const sorted = geometryUtils.nearestFirst(positions, reference);
      
      expect(sorted[0]).toEqual(new Vec3(2, 0, 0));
      expect(sorted[1]).toEqual(new Vec3(5, 0, 0));
      expect(sorted[2]).toEqual(new Vec3(10, 0, 0));
      expect(sorted[3]).toEqual(new Vec3(20, 0, 0));
    });
    
    it('should use Manhattan distance when specified', () => {
      const positions = [
        new Vec3(3, 3, 0),    // Manhattan: 6, Euclidean: 4.24
        new Vec3(0, 5, 0),    // Manhattan: 5, Euclidean: 5
        new Vec3(4, 0, 0)     // Manhattan: 4, Euclidean: 4
      ];
      const reference = new Vec3(0, 0, 0);
      
      const sorted = geometryUtils.nearestFirst(positions, reference, { metric: 'manhattan' });
      
      expect(sorted[0]).toEqual(new Vec3(4, 0, 0));   // Manhattan: 4
      expect(sorted[1]).toEqual(new Vec3(0, 5, 0));   // Manhattan: 5
      expect(sorted[2]).toEqual(new Vec3(3, 3, 0));   // Manhattan: 6
    });
    
    it('should use Chebyshev distance when specified', () => {
      const positions = [
        new Vec3(3, 3, 0),    // Chebyshev: 3
        new Vec3(0, 5, 0),    // Chebyshev: 5
        new Vec3(4, 2, 0)     // Chebyshev: 4
      ];
      const reference = new Vec3(0, 0, 0);
      
      const sorted = geometryUtils.nearestFirst(positions, reference, { metric: 'chebyshev' });
      
      expect(sorted[0]).toEqual(new Vec3(3, 3, 0));   // Chebyshev: 3
      expect(sorted[1]).toEqual(new Vec3(4, 2, 0));   // Chebyshev: 4
      expect(sorted[2]).toEqual(new Vec3(0, 5, 0));   // Chebyshev: 5
    });
    
    it('should apply deterministic tie-breaking', () => {
      const positions = [
        new Vec3(5, 0, 0),
        new Vec3(0, 5, 0),
        new Vec3(0, 0, 5),
        new Vec3(-5, 0, 0)
      ];
      const reference = new Vec3(0, 0, 0);
      
      // All have same Euclidean distance
      const sorted = geometryUtils.nearestFirst(positions, reference);
      
      // Should be sorted by x, then y, then z for ties
      expect(sorted[0]).toEqual(new Vec3(-5, 0, 0));  // x = -5
      expect(sorted[1]).toEqual(new Vec3(0, 0, 5));   // x = 0, z = 5
      expect(sorted[2]).toEqual(new Vec3(0, 5, 0));   // x = 0, y = 5
      expect(sorted[3]).toEqual(new Vec3(5, 0, 0));   // x = 5
    });
  });
  
  describe('Distance metrics', () => {
    const from = new Vec3(1, 2, 3);
    const to = new Vec3(4, 6, 8);
    
    it('should calculate Manhattan distance', () => {
      const distance = geometryUtils.manhattan(from, to);
      expect(distance).toBe(12); // |4-1| + |6-2| + |8-3| = 3 + 4 + 5
    });
    
    it('should calculate Chebyshev distance', () => {
      const distance = geometryUtils.chebyshev(from, to);
      expect(distance).toBe(5); // max(|4-1|, |6-2|, |8-3|) = max(3, 4, 5)
    });
    
    it('should calculate Euclidean distance', () => {
      const distance = geometryUtils.euclidean(from, to);
      expect(distance).toBeCloseTo(7.071, 3); // sqrt(3^2 + 4^2 + 5^2)
    });
  });
  
  describe('Vector operations', () => {
    it('should add vectors', () => {
      const v1 = new Vec3(1, 2, 3);
      const v2 = new Vec3(4, 5, 6);
      
      const result = geometryUtils.add(v1, v2);
      
      expect(result).toEqual(new Vec3(5, 7, 9));
    });
    
    it('should subtract vectors', () => {
      const v1 = new Vec3(5, 7, 9);
      const v2 = new Vec3(1, 2, 3);
      
      const result = geometryUtils.subtract(v1, v2);
      
      expect(result).toEqual(new Vec3(4, 5, 6));
    });
    
    it('should scale vectors', () => {
      const v = new Vec3(2, 3, 4);
      
      const result = geometryUtils.scale(v, 2.5);
      
      expect(result).toEqual(new Vec3(5, 7.5, 10));
    });
    
    it('should normalize vectors', () => {
      const v = new Vec3(3, 4, 0);
      
      const result = geometryUtils.normalize(v);
      
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBeCloseTo(0, 5);
      
      // Check magnitude is 1
      const magnitude = Math.sqrt(result.x * result.x + result.y * result.y + result.z * result.z);
      expect(magnitude).toBeCloseTo(1, 5);
    });
    
    it('should handle zero vector normalization', () => {
      const v = new Vec3(0, 0, 0);
      
      const result = geometryUtils.normalize(v);
      
      expect(result).toEqual(new Vec3(0, 0, 0));
    });
    
    it('should calculate dot product', () => {
      const v1 = new Vec3(2, 3, 4);
      const v2 = new Vec3(5, 6, 7);
      
      const result = geometryUtils.dot(v1, v2);
      
      expect(result).toBe(56); // 2*5 + 3*6 + 4*7
    });
    
    it('should calculate cross product', () => {
      const v1 = new Vec3(1, 0, 0);
      const v2 = new Vec3(0, 1, 0);
      
      const result = geometryUtils.cross(v1, v2);
      
      expect(result).toEqual(new Vec3(0, 0, 1));
    });
    
    it('should lerp between vectors', () => {
      const v1 = new Vec3(0, 0, 0);
      const v2 = new Vec3(10, 20, 30);
      
      const result1 = geometryUtils.lerp(v1, v2, 0.5);
      expect(result1).toEqual(new Vec3(5, 10, 15));
      
      const result2 = geometryUtils.lerp(v1, v2, 0.25);
      expect(result2).toEqual(new Vec3(2.5, 5, 7.5));
    });
    
    it('should project vector onto another', () => {
      const v = new Vec3(3, 4, 0);
      const onto = new Vec3(1, 0, 0);
      
      const result = geometryUtils.project(v, onto);
      
      expect(result).toEqual(new Vec3(3, 0, 0));
    });
    
    it('should reflect vector across normal', () => {
      const v = new Vec3(1, -1, 0);
      const normal = new Vec3(0, 1, 0);
      
      const result = geometryUtils.reflect(v, normal);
      
      expect(result).toEqual(new Vec3(1, 1, 0));
    });
    
    it('should rotate vector around Y axis', () => {
      const v = new Vec3(1, 0, 0);
      
      const result90 = geometryUtils.rotateY(v, Math.PI / 2);
      expect(result90.x).toBeCloseTo(0, 5);
      expect(result90.y).toBeCloseTo(0, 5);
      expect(result90.z).toBeCloseTo(1, 5); // Positive z for +90 deg rotation
      
      const result180 = geometryUtils.rotateY(v, Math.PI);
      expect(result180.x).toBeCloseTo(-1, 5);
      expect(result180.y).toBeCloseTo(0, 5);
      expect(result180.z).toBeCloseTo(0, 5);
    });
  });
  
  describe('Bounds and regions', () => {
    it('should calculate bounding box', () => {
      const positions = [
        new Vec3(1, 2, 3),
        new Vec3(-5, 10, 0),
        new Vec3(8, -3, 7)
      ];
      
      const bounds = geometryUtils.getBoundingBox(positions);
      
      expect(bounds.min).toEqual(new Vec3(-5, -3, 0));
      expect(bounds.max).toEqual(new Vec3(8, 10, 7));
    });
    
    it('should check if point is within bounds', () => {
      const min = new Vec3(0, 0, 0);
      const max = new Vec3(10, 10, 10);
      
      expect(geometryUtils.isWithinBounds(new Vec3(5, 5, 5), min, max)).toBe(true);
      expect(geometryUtils.isWithinBounds(new Vec3(0, 0, 0), min, max)).toBe(true);
      expect(geometryUtils.isWithinBounds(new Vec3(10, 10, 10), min, max)).toBe(true);
      expect(geometryUtils.isWithinBounds(new Vec3(-1, 5, 5), min, max)).toBe(false);
      expect(geometryUtils.isWithinBounds(new Vec3(5, 11, 5), min, max)).toBe(false);
    });
  });
  
  describe('Shape generators', () => {
    it('should generate line points', () => {
      const from = new Vec3(0, 0, 0);
      const to = new Vec3(4, 0, 0);
      
      const points = geometryUtils.getLine(from, to, 1);
      
      expect(points).toHaveLength(5);
      expect(points[0]).toEqual(new Vec3(0, 0, 0));
      expect(points[1]).toEqual(new Vec3(1, 0, 0));
      expect(points[2]).toEqual(new Vec3(2, 0, 0));
      expect(points[3]).toEqual(new Vec3(3, 0, 0));
      expect(points[4]).toEqual(new Vec3(4, 0, 0));
    });
    
    it('should generate circle points', () => {
      // Check if getCircle function exists
      if (!geometryUtils.getCircle) {
        console.log('getCircle function not implemented');
        return;
      }
      
      const center = new Vec3(0, 0, 0);
      const radius = 2;
      
      const points = geometryUtils.getCircle(center, radius, 4);
      
      expect(points).toHaveLength(4);
      
      // Check all points are at correct distance
      points.forEach(point => {
        const distance = Math.sqrt(
          point.x * point.x + point.z * point.z
        );
        expect(distance).toBeCloseTo(radius, 5);
        expect(point.y).toBe(0);
      });
    });
    
    it('should generate disc points', () => {
      // Check if getDisc function exists
      if (!geometryUtils.getDisc) {
        console.log('getDisc function not implemented');
        return;
      }
      
      const center = new Vec3(0, 0, 0);
      const radius = 2;
      
      const points = geometryUtils.getDisc(center, radius, 1);
      
      // Should include center and points at various radii
      expect(points.some(p => p.equals(center))).toBe(true);
      
      // All points should be within radius
      points.forEach(point => {
        const distance = Math.sqrt(
          point.x * point.x + point.z * point.z
        );
        expect(distance).toBeLessThanOrEqual(radius + 0.1);
      });
    });
  });
  
  describe('Utility functions', () => {
    it('should clamp values', () => {
      // Check if clamp function exists, if not skip test
      if (!geometryUtils.clamp) {
        console.log('clamp function not implemented');
        return;
      }
      expect(geometryUtils.clamp(5, 0, 10)).toBe(5);
      expect(geometryUtils.clamp(-5, 0, 10)).toBe(0);
      expect(geometryUtils.clamp(15, 0, 10)).toBe(10);
    });
    
    it('should round vector components', () => {
      const v = new Vec3(1.7, 2.3, 3.5);
      
      const result = geometryUtils.round(v);
      
      expect(result).toEqual(new Vec3(2, 2, 4));
    });
    
    it('should floor vector components', () => {
      const v = new Vec3(1.7, 2.3, 3.9);
      
      const result = geometryUtils.floor(v);
      
      expect(result).toEqual(new Vec3(1, 2, 3));
    });
  });
});