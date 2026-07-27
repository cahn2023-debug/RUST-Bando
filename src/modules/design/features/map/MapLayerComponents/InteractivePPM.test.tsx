import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { InteractivePPM } from './InteractivePPM';
import { calculatePPMAtPoint } from '@TOOL/utils/cameraMath';

vi.mock('react-leaflet', () => ({
    useMapEvents: vi.fn(),
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
    calculatePPMAtPoint: vi.fn(() => 123),
    getDORICategory: () => ({ color: '#22c55e', label: 'Detect' }),
}));

describe('InteractivePPM', () => {
    let handlers: Record<string, any>;
    let rafCallback: FrameRequestCallback | null;

    beforeEach(() => {
        handlers = {};
        rafCallback = null;
        (useMapEvents as Mock).mockImplementation((nextHandlers) => {
            handlers = nextHandlers;
            return null;
        });
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            rafCallback = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.mocked(calculatePPMAtPoint).mockClear();
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

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('coalesces mousemove work into a single animation frame', async () => {
        render(<InteractivePPM />);

        handlers.mousemove({
            latlng: { lat: 21.1, lng: 105.1 },
            originalEvent: { clientX: 10, clientY: 20 },
        });
        handlers.mousemove({
            latlng: { lat: 21.2, lng: 105.2 },
            originalEvent: { clientX: 30, clientY: 40 },
        });

        expect(calculatePPMAtPoint).not.toHaveBeenCalled();
        expect(screen.queryByText('123')).not.toBeInTheDocument();

        await act(async () => {
            rafCallback?.(performance.now());
        });

        expect(calculatePPMAtPoint).toHaveBeenCalledTimes(1);
        expect(screen.getByText('123')).toBeInTheDocument();
    });
});
