import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { DORIOverlay } from './DORIOverlay';

const polygonProps: any[] = [];

vi.mock('react-leaflet', () => ({
    Polygon: (props: any) => {
        polygonProps.push(props);
        return <div data-testid="dori-polygon" />;
    },
}));

vi.mock('@TOOL/utils/featureUtils', () => ({
    getPointCoordinates: (feature: any) => feature.coordinates,
    getEffectiveMountingHeight: () => 4,
    getEffectiveCameraSpecs: () => ({ focalLength: 4, sensorSize: '1/2.8"', resolutionX: 1920 }),
    getFeatureMetadataValue: (_feature: any, path: string) => path === 'type' ? 'camera' : undefined,
}));

vi.mock('@TOOL/utils/cameraMath', () => ({
    SENSOR_SIZES: { '1/2.8"': { width: 5.6 } },
    calculateHFOV: () => 70,
    mapRotationToHeading: () => 0,
    calculateDORIRanges: () => [
        { label: 'Detect', distance: 10, color: '#22c55e' },
        { label: 'Observe', distance: 5, color: '#3b82f6' },
    ],
    calculateArcPoints: (lat: number, lng: number, distance: number) => [
        [lat, lng],
        [lat + distance * 0.00001, lng],
    ],
}));

describe('DORIOverlay', () => {
    beforeEach(() => {
        polygonProps.length = 0;
        useDesignSync.setState({
            showDORILayers: true,
            selectedFeatureId: 'camera-1',
            previewMetadata: null,
            state: {
                settings: {},
                features: {
                    'camera-1': {
                        id: 'camera-1',
                        geom_type: 'POINT',
                        coordinates: [105, 21],
                        metadata: JSON.stringify({ type: 'camera' }),
                        properties: { iconKey: 'cctv' },
                    },
                },
            },
        } as any);
    });

    it('does not render when DORI layers are disabled', () => {
        useDesignSync.setState({ showDORILayers: false } as any);
        render(<DORIOverlay />);
        expect(polygonProps).toHaveLength(0);
    });

    it('renders DORI polygons for the selected camera', () => {
        render(<DORIOverlay />);
        expect(polygonProps).toHaveLength(2);
    });
});
