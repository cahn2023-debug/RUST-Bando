import { describe, it, expect } from 'vitest';
import {
  calculateFeatureNumbers,
  getDeclaredOrderFieldKey,
  getNextFeatureDisplayOrder,
  getParsedCoordinates,
  syncDisplayOrderAliases,
} from './featureMapping';

describe('featureMapping', () => {
  it('preserves an intersection child number whose parent name starts with digits', () => {
    expect(syncDisplayOrderAliases({}, '15 Lê Lợi_1')).toMatchObject({
      display_order: '15 Lê Lợi_1',
    });
  });

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

  describe('getNextFeatureDisplayOrder', () => {
    it('returns the next root display order in the selected group', () => {
      const features = {
        'feature-1': {
          id: 'feature-1',
          group_id: 'group-1',
          metadata: JSON.stringify({ display_order: '1' }),
        },
        'feature-2': {
          id: 'feature-2',
          group_id: 'group-1',
          metadata: JSON.stringify({ display_order: '2' }),
        },
        'feature-3': {
          id: 'feature-3',
          group_id: 'group-2',
          metadata: JSON.stringify({ display_order: '9' }),
        },
      };

      expect(getNextFeatureDisplayOrder(features as any, 'group-1')).toBe('3');
    });

    it('returns the parent STT plus the next consecutive child number', () => {
      const features = {
        'intersection-1': {
          id: 'intersection-1',
          group_id: 'group-1',
          name: 'Nút giao Lê Lợi',
          metadata: JSON.stringify({ display_order: '15', type: 'intersection' }),
        },
        'camera-1': {
          id: 'camera-1',
          group_id: 'group-1',
          metadata: JSON.stringify({ parent_feature_id: 'intersection-1', display_order: '15_1' }),
        },
        'camera-2': {
          id: 'camera-2',
          group_id: 'group-1',
          metadata: JSON.stringify({ parent_feature_id: 'intersection-1', display_order: '15_2' }),
        },
      };

      expect(getNextFeatureDisplayOrder(features as any, 'group-1', 'intersection-1')).toBe('15_3');
    });

    it('repairs duplicate and missing child numbers into one consecutive sequence', () => {
      const features = {
        parent: {
          id: 'parent',
          group_id: 'group-1',
          name: 'NG-01',
          metadata: JSON.stringify({ display_order: '9', type: 'intersection' }),
        },
        'camera-1': {
          id: 'camera-1',
          group_id: 'group-1',
          metadata: JSON.stringify({ parent_feature_id: 'parent', display_order: '9_4' }),
        },
        'camera-2': {
          id: 'camera-2',
          group_id: 'group-1',
          metadata: JSON.stringify({ parent_feature_id: 'parent', display_order: '9_4' }),
        },
      };

      const numbers = calculateFeatureNumbers(Object.values(features) as any, features as any);

      expect(numbers['camera-1']).toBe('9_1');
      expect(numbers['camera-2']).toBe('9_2');
      expect(getNextFeatureDisplayOrder(features as any, 'group-1', 'parent')).toBe('9_3');
    });
  });

  describe('display order aliases', () => {
    it('detects the user-declared order field from source properties', () => {
      expect(getDeclaredOrderFieldKey({
        display_order: '21_4',
        source_properties: {
          STT: '21_4',
        },
      })).toBe('STT');
    });

    it('syncs display_order into the declared STT field', () => {
      expect(syncDisplayOrderAliases({
        display_order: '21_4',
        source_properties: {
          STT: '21_4',
        },
      }, '21_5')).toMatchObject({
        display_order: '21_5',
        STT: '21_5',
      });
    });
  });
});
