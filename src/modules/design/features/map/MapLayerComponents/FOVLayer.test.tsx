import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import { FOVLayer } from './FOVLayer';

const polygonProps: any[] = [];

vi.mock('react-leaflet', () => ({
    Polygon: (props: any) => {
        polygonProps.push(props);
        return <div data-testid="fov-polygon" />;
    },
}));

vi.mock('@TOOL/utils/featureUtils', () => ({
    getFeatureDisplayInfo: () => ({ isCamera: true, isIntersection: false, iconKey: 'cctv', color: '#3b82f6' }),
    getPointCoordinates: (feature: any) => feature.coordinates,
    calculateFOVPoints: () => [[21, 105], [21.001, 105.001], [21.002, 105.002]],
    getFeatureMetadataValue: () => true,
}));

vi.mock('./SharedMapComponents', () => ({
    getParsedMetadata: (feature: any) => typeof feature.metadata === 'string' ? JSON.parse(feature.metadata) : (feature.metadata || {}),
}));

describe('FOVLayer', () => {
    beforeEach(() => {
        polygonProps.length = 0;
        useDesignSync.setState({ drawingMode: 'none' } as any);
        useSettingsStore.setState({ showFovTypes: ['cctv'] } as any);
    });

    const features = Array.from({ length: 5 }, (_, index) => ({
        id: `camera-${index}`,
        geom_type: 'POINT',
        group_id: 'group-1',
        coordinates: [105 + index * 0.001, 21],
        metadata: '{}',
        properties: { iconKey: 'cctv' },
    }));

    it('does not render camera FOVs below the global zoom threshold', () => {
        render(
            <FOVLayer
                features={features}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'CAMERA', name: 'Camera' } }}
                previewMetadata={null}
                currentZoom={12}
                renderedPointIds={new Set(features.map(feature => feature.id))}
            />
        );

        expect(polygonProps).toHaveLength(0);
    });

    it('limits the number of rendered FOV polygons', () => {
        render(
            <FOVLayer
                features={features}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'CAMERA', name: 'Camera' } }}
                previewMetadata={null}
                currentZoom={18}
                renderedPointIds={new Set(features.map(feature => feature.id))}
                renderLimit={2}
            />
        );

        expect(polygonProps).toHaveLength(2);
    });
});
