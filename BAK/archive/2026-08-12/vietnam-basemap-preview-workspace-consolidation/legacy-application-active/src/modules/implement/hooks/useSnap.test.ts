import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSnap } from './useSnap';

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

describe('useSnap', () => {
    beforeEach(() => {
        useDesignSync.setState({
            drawingMode: 'polyline',
            editingFeatureId: null,
            state: {
                features: {
                    'point-a': {
                        id: 'point-a',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Point A',
                        geom_type: 'Point',
                        coordinates: [106.0, 10.0],
                        metadata: JSON.stringify({}),
                        properties: {},
                    },
                    'line-a': {
                        id: 'line-a',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Line A',
                        geom_type: 'LineString',
                        coordinates: [[106.0, 10.0], [106.001, 10.0]],
                        metadata: JSON.stringify({}),
                        properties: {},
                    },
                },
            } as any,
        });
    });

    it('snaps to the exact point feature coordinate', async () => {
        const { result } = renderHook(() => useSnap());
        const snap = await result.current.snapNow(10.0, 106.0);

        expect(snap).toEqual({ x: 106.0, y: 10.0, id: 'point-a' });
    });

    it('projects to the nearest point on a polyline segment', async () => {
        useDesignSync.setState({
            state: {
                features: {
                    'line-a': {
                        id: 'line-a',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Line A',
                        geom_type: 'LineString',
                        coordinates: [[106.0, 10.0], [106.001, 10.0]],
                        metadata: JSON.stringify({}),
                        properties: {},
                    },
                },
            } as any,
        });

        const { result } = renderHook(() => useSnap());
        const snap = await result.current.snapNow(10.00001, 106.0004, 0.001);

        expect(snap?.id).toBe('line-a');
        expect(snap?.x).toBeCloseTo(106.0004, 6);
        expect(snap?.y).toBeCloseTo(10.0, 6);
    });
});
