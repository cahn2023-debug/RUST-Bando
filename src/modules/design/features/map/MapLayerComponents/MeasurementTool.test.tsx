import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useMap, useMapEvents } from 'react-leaflet';
import { MeasurementTool } from './MeasurementTool';

vi.mock('react-leaflet', () => ({
    useMap: vi.fn(),
    useMapEvents: vi.fn(),
    Polyline: () => <div data-testid="measure-line" />,
    CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="measure-point">{children}</div>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="measure-tooltip">{children}</div>,
}));

const createLatLng = (lat: number, lng: number) => ({ lat, lng });

describe('MeasurementTool', () => {
    let handlers: Record<string, any>;
    let classList: { add: Mock; remove: Mock };

    beforeEach(() => {
        handlers = {};
        classList = { add: vi.fn(), remove: vi.fn() };
        (useMapEvents as Mock).mockImplementation((nextHandlers) => {
            handlers = nextHandlers;
            return null;
        });
        (useMap as Mock).mockReturnValue({
            getContainer: () => ({ classList }),
            doubleClickZoom: {
                disable: vi.fn(),
                enable: vi.fn(),
            },
            distance: (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
                Math.hypot(to.lat - from.lat, to.lng - from.lng) * 1000,
        });
    });

    it('measures continuously from clicked points to the current mouse position', async () => {
        render(<MeasurementTool active={true} onDeactivate={vi.fn()} />);

        await act(async () => {
            handlers.click({
                latlng: createLatLng(0, 0),
                originalEvent: { preventDefault: vi.fn() },
            });
        });

        await act(async () => {
            handlers.mousemove({ latlng: createLatLng(0, 2) });
        });

        expect(classList.add).toHaveBeenCalledWith('measure-tool-active');
        expect(screen.getByText('Đo khoảng cách')).toBeInTheDocument();
        expect(screen.getAllByText('2.00 km').length).toBeGreaterThan(0);
        expect(screen.getByTestId('measure-line')).toBeInTheDocument();
    });

    it('deactivates and clears the measurement on right click', async () => {
        const onDeactivate = vi.fn();
        const preventDefault = vi.fn();

        render(<MeasurementTool active={true} onDeactivate={onDeactivate} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: createLatLng(0, 0),
                originalEvent: { preventDefault },
            });
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(onDeactivate).toHaveBeenCalledTimes(1);
    });

    it('does not render controls while inactive', () => {
        render(<MeasurementTool active={false} onDeactivate={vi.fn()} />);

        expect(screen.queryByText('Đo khoảng cách')).not.toBeInTheDocument();
    });
});
