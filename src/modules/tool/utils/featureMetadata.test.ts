import { describe, it, expect } from 'vitest';
import { getParsedMetadata, safeString, getFeatureNote } from './featureMetadata';

describe('featureMetadata', () => {
  describe('getParsedMetadata', () => {
    it('should parse valid metadata JSON string', () => {
      const feature = {
        id: '1',
        metadata: '{"icon": "camera", "color": "#ff0000", "size": 32}'
      };
      const result = getParsedMetadata(feature as any);
      expect(result).toEqual({
        icon: 'camera',
        color: '#ff0000',
        size: 32
      });
    });

    it('should return metadata object if already parsed', () => {
      const feature = {
        id: '1',
        metadata: { icon: 'camera', color: '#ff0000' }
      };
      const result = getParsedMetadata(feature as any);
      expect(result).toEqual({ icon: 'camera', color: '#ff0000' });
    });

    it('should return empty object for invalid JSON', () => {
      const feature = {
        id: '1',
        metadata: 'invalid json'
      };
      const result = getParsedMetadata(feature as any);
      expect(result).toEqual({});
    });

    it('should return empty object for null metadata', () => {
      const feature = { id: '1', metadata: null };
      const result = getParsedMetadata(feature as any);
      expect(result).toEqual({});
    });

    it('should return empty object for undefined feature', () => {
      const result = getParsedMetadata(undefined as any);
      expect(result).toEqual({});
    });
  });

  describe('safeString', () => {
    it('should convert string to string', () => {
      expect(safeString('test')).toBe('test');
    });

    it('should convert number to string', () => {
      expect(safeString(123)).toBe('123');
    });

    it('should convert null to empty string', () => {
      expect(safeString(null)).toBe('');
    });

    it('should convert undefined to empty string', () => {
      expect(safeString(undefined)).toBe('');
    });

    it('should convert object to JSON string', () => {
      expect(safeString({ key: 'value' })).toBe('{"key":"value"}');
    });

    it('should handle boolean values', () => {
      expect(safeString(true)).toBe('true');
      expect(safeString(false)).toBe('false');
    });
  });

  describe('getFeatureNote', () => {
    it('should extract note from metadata', () => {
      const feature = {
        id: '1',
        metadata: '{"note": "Test note", "icon": "camera"}'
      };
      const result = getFeatureNote(feature as any);
      expect(result).toBe('Test note');
    });

    it('should return empty string for missing note', () => {
      const feature = {
        id: '1',
        metadata: '{"icon": "camera"}'
      };
      const result = getFeatureNote(feature as any);
      expect(result).toBe('');
    });

    it('should handle already parsed metadata', () => {
      const feature = {
        id: '1',
        metadata: { note: 'Test note' }
      };
      const result = getFeatureNote(feature as any);
      expect(result).toBe('Test note');
    });

    it('should return empty string for invalid metadata', () => {
      const feature = {
        id: '1',
        metadata: 'invalid'
      };
      const result = getFeatureNote(feature as any);
      expect(result).toBe('');
    });
  });
});
