import { describe, it, expect } from 'vitest';
import { normalizeMetadataObject } from './metadataNormalization';

describe('metadataNormalization', () => {
  describe('normalizeMetadataObject', () => {
    it('should preserve size and sync it to weight and stroke', () => {
      const metadata = { size: 30 };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(30);
      expect(result.weight).toBe(30);
      expect(result.stroke).toBe(30);
    });

    it('should handle weight and sync it to size and stroke', () => {
      const metadata = { weight: 25 };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(25);
      expect(result.weight).toBe(25);
      expect(result.stroke).toBe(25);
    });

    it('should handle stroke and sync it to size and weight', () => {
      const metadata = { stroke: 20 };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(20);
      expect(result.weight).toBe(20);
      expect(result.stroke).toBe(20);
    });

    it('should convert string size to number', () => {
      const metadata = { size: '15' };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(15);
      expect(result.weight).toBe(15);
      expect(result.stroke).toBe(15);
    });

    it('should handle priority: size > weight > stroke', () => {
      const metadata = { size: 30, weight: 20, stroke: 10 };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(30);
      expect(result.weight).toBe(30);
      expect(result.stroke).toBe(30);
    });

    it('should handle gis.size mapping', () => {
      const metadata = { gis: { size: 40 } };
      const result = normalizeMetadataObject(metadata);
      expect(result.size).toBe(40);
      expect(result.weight).toBe(40);
      expect(result.stroke).toBe(40);
    });

    it('should preserve unknown fields', () => {
      const metadata = { custom_field: 'value', size: 10 };
      const result = normalizeMetadataObject(metadata);
      expect(result.custom_field).toBe('value');
      expect(result.size).toBe(10);
    });

    it('should clean string fields', () => {
      const metadata = { description: '  test  note  ' };
      const result = normalizeMetadataObject(metadata);
      expect(result.description).toBe('test note');
    });

    it('should handle nested gis fields', () => {
      const metadata = { vn2000_x: '123456.789', gis: { vn2000_y: 987654.321 } };
      const result = normalizeMetadataObject(metadata);
      expect(result.gis?.vn2000_x).toBe(123456.789);
      expect(result.gis?.vn2000_y).toBe(987654.321);
    });
  });
});
