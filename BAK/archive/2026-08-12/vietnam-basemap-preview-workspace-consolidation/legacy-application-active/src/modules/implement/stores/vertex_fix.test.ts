import { describe, it, expect } from 'vitest';
import { getParsedCoordinates } from '../../tool/utils/featureUtils';

describe('Vertex Fix: Coordinate Parsing', () => {
    it('should correctly parse coordinates if they are already an array', () => {
        const feature = {
            coordinates: [[105, 21], [106, 22]]
        };
        const parsed = getParsedCoordinates(feature);
        expect(parsed).toEqual([[105, 21], [106, 22]]);
        expect(Array.isArray(parsed)).toBe(true);
    });

    it('should correctly parse coordinates if they are a JSON string', () => {
        const feature = {
            coordinates: '[[105, 21], [106, 22]]'
        };
        const parsed = getParsedCoordinates(feature);
        expect(parsed).toEqual([[105, 21], [106, 22]]);
    });

    it('should return null for invalid coordinates', () => {
        const feature = {
            coordinates: '{invalid json}'
        };
        const parsed = getParsedCoordinates(feature);
        expect(parsed).toBeNull();
    });
});
