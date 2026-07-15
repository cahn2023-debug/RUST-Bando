import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { LocationMarker } from './LocationMarker';

vi.mock('react-leaflet', () => ({
    useMapEvents: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

vi.mock('@IMPLEMENT/hooks/useSnap', () => ({
    useSnap: () => ({
        performSnap: vi.fn(),
        snapNow: vi.fn().mockResolvedValue(null),
        clearSnap: vi.fn(),
        snappedPointRef: { current: null },
    }),
}));

describe('LocationMarker', () => {
    let handlers: Record<string, any>;

    beforeEach(() => {
        handlers = {};
        (useMapEvents as Mock).mockImplementation((nextHandlers) => {
            handlers = nextHandlers;
            return null;
        });
        useDesignSync.setState({ drawingMode: 'none', editingFeatureId: null });
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
    });

    it('finishes the drawing session on right click while drawing', () => {
        const onFinishDrawingSession = vi.fn();
        const preventDefault = vi.fn();
        useDesignSync.setState({ drawingMode: 'point' });

        render(
            <LocationMarker
                onLocationChange={vi.fn()}
                onFinishDrawingSession={onFinishDrawingSession}
            />
        );

        handlers.contextmenu({ originalEvent: { preventDefault } });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(onFinishDrawingSession).toHaveBeenCalledTimes(1);
    });

    it('shows a copy-coordinate popup on right click while idle', async () => {
        const preventDefault = vi.fn();

        render(<LocationMarker onLocationChange={vi.fn()} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: { lat: 21.02851111, lng: 105.85422222 },
                containerPoint: { x: 320, y: 240 },
                originalEvent: { preventDefault },
            });
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Tọa độ điểm click')).toBeInTheDocument();
        expect(screen.getByText('21.0285111')).toBeInTheDocument();
        expect(screen.getByText('105.8542222')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Copy tọa độ'));

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('21.0285111, 105.8542222');
        expect(await screen.findByText('Đã copy tọa độ')).toBeInTheDocument();
    });

    it('does not show the copy-coordinate popup while editing a feature', async () => {
        const preventDefault = vi.fn();
        useDesignSync.setState({ drawingMode: 'none', editingFeatureId: 'line-1' });

        render(<LocationMarker onLocationChange={vi.fn()} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: { lat: 21.02851111, lng: 105.85422222 },
                containerPoint: { x: 320, y: 240 },
                originalEvent: { preventDefault },
            });
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Tọa độ điểm click')).not.toBeInTheDocument();
    });

    it('keeps double click finalize scoped to polyline mode', () => {
        const onFinishDrawing = vi.fn();
        useDesignSync.setState({ drawingMode: 'polyline' });

        render(
            <LocationMarker
                onLocationChange={vi.fn()}
                onFinishDrawing={onFinishDrawing}
            />
        );

        handlers.dblclick();
        expect(onFinishDrawing).toHaveBeenCalledTimes(1);

        onFinishDrawing.mockClear();
        useDesignSync.setState({ drawingMode: 'point' });
        render(
            <LocationMarker
                onLocationChange={vi.fn()}
                onFinishDrawing={onFinishDrawing}
            />
        );

        handlers.dblclick();
        expect(onFinishDrawing).not.toHaveBeenCalled();
    });
});
