import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapLayer } from './MapLayer';

vi.mock('@DESIGN/features/map/MapContext', () => ({
    MapProvider: ({ children }: { children: unknown }) => children,
    useMapContext: () => ({}),
}));

vi.mock('@IMPLEMENT/stores/useDesignSync', () => ({
    useDesignSync: (selector: (state: { showDORILayers: boolean }) => unknown) =>
        selector({ showDORILayers: true }),
}));

vi.mock('./MapLibreFastRenderer', () => ({
    MapLibreFastRenderer: () => <div data-testid="map-renderer" />,
}));

vi.mock('@DESIGN/features/map/MapLayerComponents', () => {
    const overlay = (testId: string) => () => <div data-testid={testId} />;

    return {
        MapLibreBoxSelection: overlay('box-selection'),
        MapCaptureHandler: overlay('capture-handler'),
        DORIOverlay: overlay('dori-overlay'),
        FOVLayer: overlay('fov-layer'),
        InteractivePPM: overlay('interactive-ppm'),
        ZoomExtendControl: overlay('zoom-extend'),
        ZoomToHandler: overlay('zoom-to'),
        MapLibreMeasurementTool: ({ active, onDeactivate }: { active: boolean; onDeactivate: () => void }) => (
            <button type="button" data-testid="measurement-tool" data-active={String(active)} onClick={onDeactivate}>
                measurement
            </button>
        ),
    };
});

describe('MapLayer overlay contract', () => {
    it('keeps project overlays mounted on a transparent feature surface', () => {
        const onMeasureDeactivate = vi.fn();
        const { container } = render(
            <MapLayer
                center={[21.0285, 105.8542]}
                zoom={13}
                isMeasureActive
                onMeasureDeactivate={onMeasureDeactivate}
            />
        );

        expect(container.querySelector('.design-map-container')).toHaveClass('pointer-events-auto');
        expect(screen.getByTestId('map-renderer')).toBeInTheDocument();
        expect(screen.getByTestId('box-selection')).toBeInTheDocument();
        expect(screen.getByTestId('dori-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('fov-layer')).toBeInTheDocument();
        expect(screen.getByTestId('interactive-ppm')).toBeInTheDocument();
        expect(screen.getByTestId('capture-handler')).toBeInTheDocument();
        expect(screen.getByTestId('zoom-extend')).toBeInTheDocument();
        expect(screen.getByTestId('zoom-to')).toBeInTheDocument();
        expect(screen.getByText('DORI Visibility Scale')).toBeInTheDocument();

        const measurementTool = screen.getByTestId('measurement-tool');
        expect(measurementTool).toHaveAttribute('data-active', 'true');
        fireEvent.click(measurementTool);
        expect(onMeasureDeactivate).toHaveBeenCalledTimes(1);
    });
});
