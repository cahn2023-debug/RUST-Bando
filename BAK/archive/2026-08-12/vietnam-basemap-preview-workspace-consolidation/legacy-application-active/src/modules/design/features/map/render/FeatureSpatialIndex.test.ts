import { describe, expect, it } from 'vitest';
import { FeatureSpatialIndex } from './FeatureSpatialIndex';

describe('FeatureSpatialIndex', () => {
    it('returns only candidates intersecting the query bbox', () => {
        const index = new FeatureSpatialIndex();
        index.upsert({ id: 'inside', bbox: [10, 10, 20, 20] });
        index.upsert({ id: 'outside', bbox: [30, 30, 40, 40] });

        expect(index.query([15, 15, 16, 16]).map(entry => entry.id)).toEqual(['inside']);
    });

    it('supports point tolerance queries', () => {
        const index = new FeatureSpatialIndex();
        index.upsert({ id: 'near', bbox: [100, 100, 110, 110] });

        expect(index.queryPoint(95, 95, 6).map(entry => entry.id)).toEqual(['near']);
        expect(index.queryPoint(90, 90, 4)).toEqual([]);
    });
});

