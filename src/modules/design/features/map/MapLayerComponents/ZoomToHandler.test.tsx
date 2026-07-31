import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { ZoomToHandler } from './ZoomToHandler';

const mockMapState = vi.hoisted(() => {
    const map = {
        fitBounds: vi.fn(),
        flyTo: vi.fn(),
    };

    class LngLatBounds {
        points: [number, number][] = [];

        extend(point: [number, number]) {
            this.points.push(point);
            return this;
        }

        isEmpty() {
            return this.points.length === 0;
        }
    }

    return { map, LngLatBounds };
});

vi.mock('../MapContext', () => ({
    useMapContext: () => ({ map: mockMapState.map }),
}));

vi.mock('maplibre-gl', () => ({
    default: {
        LngLatBounds: mockMapState.LngLatBounds,
    },
}));

describe('ZoomToHandler', () => {
    beforeEach(() => {
        mockMapState.map.fitBounds.mockReset();
        mockMapState.map.flyTo.mockReset();
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        useDesignSync.setState({
            state: null,
            featureDetailsCache: {},
            visibleFeatures: {},
            isHydrating: false,
            isViewportLoading: false,
            zoomToTrigger: null,
        } as any);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('keeps large-project group zoom pending until full features are available', async () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: { 'layer-1': { id: 'layer-1', region_id: 'region-1', is_visible: true } },
                feature_groups: { 'group-1': { id: 'group-1', layer_id: 'layer-1', is_visible: true } },
                settings: {},
                features: {},
                isLargeProject: true,
                featureCount: 1,
            } as any,
            isHydrating: true,
            zoomToTrigger: { id: 'group-1', type: 'group', timestamp: 1 },
        } as any);

        render(<ZoomToHandler />);

        expect(mockMapState.map.fitBounds).not.toHaveBeenCalled();

        useDesignSync.setState({
            state: {
                regions: {},
                layers: { 'layer-1': { id: 'layer-1', region_id: 'region-1', is_visible: true } },
                feature_groups: { 'group-1': { id: 'group-1', layer_id: 'layer-1', is_visible: true } },
                settings: {},
                features: {
                    'feature-1': {
                        id: 'feature-1',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Feature 1',
                        geom_type: 'Point',
                        coordinates: [105.8, 21.02],
                        properties: {},
                        metadata: '{}',
                    },
                },
                isLargeProject: true,
                featureCount: 1,
            } as any,
            isHydrating: false,
        } as any);

        await waitFor(() => {
            expect(mockMapState.map.fitBounds).toHaveBeenCalledWith(
                expect.objectContaining({ points: [[105.8, 21.02]] }),
                { padding: 50, maxZoom: 18 }
            );
        });
    });
});
