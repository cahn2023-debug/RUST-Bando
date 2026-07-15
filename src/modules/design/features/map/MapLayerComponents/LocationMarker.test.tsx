import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
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
    let execCommandMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        handlers = {};
        (useMapEvents as Mock).mockImplementation((nextHandlers) => {
            handlers = nextHandlers;
            return null;
        });
        useDesignSync.setState({ drawingMode: 'none', editingFeatureId: null });
        delete (window as any).__TAURI_INTERNALS__;
        delete (window as any).__TAURI__;
        vi.mocked(invoke).mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
        execCommandMock = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: execCommandMock,
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

        expect(invoke).toHaveBeenCalledWith('copy_text_to_system_clipboard', {
            text: '21.0285111, 105.8542222',
        });
        expect(await screen.findByText('Đã copy tọa độ')).toBeInTheDocument();
    });

    it('falls back to execCommand copy when Clipboard API is unavailable', async () => {
        const preventDefault = vi.fn();
        Object.assign(navigator, { clipboard: undefined });
        vi.mocked(invoke).mockRejectedValueOnce(new Error('not tauri'));

        render(<LocationMarker onLocationChange={vi.fn()} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: { lat: 21.02851111, lng: 105.85422222 },
                containerPoint: { x: 320, y: 240 },
                originalEvent: { preventDefault },
            });
        });

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(execCommandMock).toHaveBeenCalledWith('copy');
            expect(screen.getByRole('button')).toHaveTextContent('Đã copy tọa độ');
        });
    });

    it('retries clipboard writes when Windows clipboard is temporarily busy', async () => {
        const preventDefault = vi.fn();
        const writeText = vi.fn()
            .mockRejectedValueOnce(new Error('clipboard busy'))
            .mockResolvedValueOnce(undefined);
        vi.mocked(invoke).mockRejectedValueOnce(new Error('not tauri'));
        Object.assign(navigator, {
            clipboard: { writeText },
        });

        render(<LocationMarker onLocationChange={vi.fn()} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: { lat: 21.02851111, lng: 105.85422222 },
                containerPoint: { x: 320, y: 240 },
                originalEvent: { preventDefault },
            });
        });

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(2);
            expect(screen.getByRole('button')).toHaveTextContent('Đã copy tọa độ');
        });
    });

    it('uses the Tauri clipboard command when running inside the desktop app', async () => {
        const preventDefault = vi.fn();
        Object.assign(navigator, { clipboard: undefined });
        (window as any).__TAURI_INTERNALS__ = {};
        vi.mocked(invoke).mockResolvedValueOnce(undefined);

        render(<LocationMarker onLocationChange={vi.fn()} />);

        await act(async () => {
            handlers.contextmenu({
                latlng: { lat: 21.02851111, lng: 105.85422222 },
                containerPoint: { x: 320, y: 240 },
                originalEvent: { preventDefault },
            });
        });

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('copy_text_to_system_clipboard', {
                text: '21.0285111, 105.8542222',
            });
            expect(screen.getByRole('button')).toHaveTextContent('Đã copy tọa độ');
        });
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

    it('does not show the copy-coordinate popup while measuring', async () => {
        const preventDefault = vi.fn();

        render(<LocationMarker onLocationChange={vi.fn()} isMeasureActive />);

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
