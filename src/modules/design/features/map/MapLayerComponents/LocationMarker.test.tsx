import { render } from '@testing-library/react';
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
        useDesignSync.setState({ drawingMode: 'none' });
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
