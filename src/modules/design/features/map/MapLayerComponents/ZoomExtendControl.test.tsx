import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { ZoomExtendControl } from './ZoomExtendControl';

const mockMapState = vi.hoisted(() => {
    const map = {
        fitBounds: vi.fn(),
    };

    class LngLatBounds {
        points: [number, number][] = [];

        extend(point: [number, number]) {
            this.points.push(point);
            return this;
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

const mapStateWithFeatures = () => ({
    regions: {},
    layers: {
        'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Layer 1', is_visible: true },
    },
    feature_groups: {
        'group-1': { id: 'group-1', layer_id: 'layer-1', name: 'Group 1', is_visible: true },
    },
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
    settings: {},
    featureCount: 1,
    isLargeProject: false,
});

describe('ZoomExtendControl', () => {
    beforeEach(() => {
        mockMapState.map.fitBounds.mockReset();
        useDesignSync.setState({
            state: null,
            visibleFeatures: {},
            isHydrating: false,
            isViewportLoading: false,
            zoomExtendTrigger: 0,
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not warn while a non-empty project is still hydrating with no loaded features', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {},
                settings: {},
                featureCount: 1182,
                isLargeProject: false,
            },
            isHydrating: true,
            zoomExtendTrigger: 1,
        } as any);

        render(<ZoomExtendControl />);
        await Promise.resolve();

        expect(mockMapState.map.fitBounds).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalledWith('[ZoomExtend] No valid points found to zoom to.');
        expect(infoSpy).not.toHaveBeenCalledWith('[ZoomExtend] No valid points found to zoom to.');
    });

    it('keeps a pending zoom trigger until features are available', async () => {
        useDesignSync.setState({
            state: {
                regions: {},
                layers: {},
                feature_groups: {},
                features: {},
                settings: {},
                featureCount: 1,
                isLargeProject: false,
            },
            isHydrating: true,
            zoomExtendTrigger: 1,
        } as any);

        render(<ZoomExtendControl />);

        useDesignSync.setState({
            state: mapStateWithFeatures(),
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
