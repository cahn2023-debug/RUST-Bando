import { describe, expect, it, vi } from 'vitest';
import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import { FeatureOverlayRenderer } from './FeatureOverlayRenderer';

const collection: MapLibreRenderFeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [105.8, 21.02] },
        properties: {
            id: 'point-1',
            groupId: 'group-1',
            layerId: 'layer-1',
            name: 'point-1',
            geomType: 'point',
            color: '#ef4444',
            size: 14,
            selected: false,
        },
    }],
};

describe('FeatureOverlayRenderer', () => {
    it('tracks point instances from render features', () => {
        const renderer = new FeatureOverlayRenderer();
        renderer.setDesignFeatures(collection);

        expect(renderer.getPointCount()).toBe(1);
    });

    it('draws point instances without MapLibre APIs', () => {
        const renderer = new FeatureOverlayRenderer();
        const canvas = document.createElement('canvas');
        const context = {
            canvas,
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0,
            globalAlpha: 1,
        };
        canvas.width = 800;
        canvas.height = 600;
        canvas.getContext = vi.fn(() => context) as any;

        renderer.setDesignFeatures(collection);
        renderer.draw(canvas);

        expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
        expect(context.arc).toHaveBeenCalled();
        expect(context.fill).toHaveBeenCalled();
    });
});

