import { describe, it, expect } from 'vitest';
import { getParsedCoordinates } from './featureMapping';

describe('featureMapping', () => {
  describe('getParsedCoordinates', () => {
    it('should return null for null feature', () => {
      expect(getParsedCoordinates(null as any)).toBeNull();
    });

    it('should return null for undefined coordinates', () => {
      const feature = { id: '1', coordinates: undefined };
      expect(getParsedCoordinates(feature as any)).toBeNull();
    });

    it('should parse array coordinates', () => {
      const feature = {
        id: '1',
        coordinates: [[10.5, 20.3], [10.6, 20.4]]
      };
      const result = getParsedCoordinates(feature as any);
      expect(result).toEqual([[10.5, 20.3], [10.6, 20.4]]);
    });

    it('should parse JSON string coordinates', () => {
      const feature = {
        id: '1',
        coordinates: '[[10.5, 20.3], [10.6, 20.4]]'
      };
      const result = getParsedCoordinates(feature as any);
      expect(result).toEqual([[10.5, 20.3], [10.6, 20.4]]);
    });

    it('should parse object with points property', () => {
      const feature = {
        id: '1',
        coordinates: { points: [[10.5, 20.3]] }
      };
      const result = getParsedCoordinates(feature as any);
      expect(result).toEqual([[10.5, 20.3]]);
    });

    it('should handle empty string coordinates', () => {
      const feature = { id: '1', coordinates: '' };
      expect(getParsedCoordinates(feature as any)).toBeNull();
    });

    it('should cache parsed coordinates', () => {
      const feature = {
        id: '1',
        coordinates: '[[10.5, 20.3]]'
      };
      const result1 = getParsedCoordinates(feature as any);
      const result2 = getParsedCoordinates(feature as any);
      expect(result1).toBe(result2); // Same reference
    });
  });
});
