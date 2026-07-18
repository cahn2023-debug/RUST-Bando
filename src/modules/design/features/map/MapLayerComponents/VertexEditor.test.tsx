import { render, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { VertexEditor } from './VertexEditor';

// Mock Leaflet L
vi.mock('leaflet', () => ({
    default: {
        DivIcon: vi.fn(),
        DomEvent: {
            stopPropagation: vi.fn(),
        },
    },
}));

let mapEventsHandlers: Record<string, Function> = {};
const mockMarkerProps: any[] = [];
const mockPolylineProps: any[] = [];

vi.mock('react-leaflet', () => ({
    useMapEvents: (handlers: any) => {
        mapEventsHandlers = handlers;
        return null;
    },
    useMap: () => ({
        dragging: {
            enable: vi.fn(),
            disable: vi.fn(),
        },
    }),
    Marker: (props: any) => {
        mockMarkerProps.push(props);
        return <div data-testid="marker" />;
    },
    Polyline: (props: any) => {
        mockPolylineProps.push(props);
        return <div data-testid="polyline" />;
    },
}));

const mockSnapRef = { current: null };
const mockSnapNow = vi.fn().mockResolvedValue(null);

vi.mock('@IMPLEMENT/hooks/useSnap', () => ({
    useSnap: () => ({
        performSnap: vi.fn(),
        snapNow: mockSnapNow,
        clearSnap: vi.fn(),
        snappedPointRef: mockSnapRef,
    }),
}));

describe('VertexEditor: Intersection Scope Locking', () => {
    const mockIntersection = {
        id: 'intersection-1',
        geom_type: 'Polygon',
        coordinates: JSON.stringify([[[105, 21], [107, 21], [107, 23], [105, 23], [105, 21]]]),
        metadata: '{}',
    };

    const mockSignalLine = {
        id: 'line-1',
        geom_type: 'LineString',
        coordinates: JSON.stringify([[106, 22], [106.2, 22.2], [106.5, 22.5]]),
        metadata: JSON.stringify({
            infrastructure: { type: 'SignalLine' },
            parent_feature_id: 'intersection-1',
        }),
    };

    const mockRegularLine = {
        id: 'line-2',
        geom_type: 'LineString',
        coordinates: JSON.stringify([[106, 22], [106.2, 22.2], [106.5, 22.5]]),
        metadata: '{}',
    };

    let setDrawingPoint: any;
    let insertDrawingPoint: any;

    beforeEach(() => {
        mockMarkerProps.length = 0;
        mockPolylineProps.length = 0;
        mapEventsHandlers = {};
        mockSnapRef.current = null;
        vi.clearAllMocks();

        setDrawingPoint = vi.fn().mockResolvedValue(undefined);
        insertDrawingPoint = vi.fn().mockResolvedValue(undefined);

        useDesignSync.setState({
            state: {
                features: {
                    'intersection-1': mockIntersection as any,
                    'line-1': mockSignalLine as any,
                    'line-2': mockRegularLine as any,
                },
            } as any,
            editingFeatureId: 'line-1',
            activeParentFeatureId: null,
            setDrawingPoint,
            insertDrawingPoint,
        } as any);
    });

    it('allows editing SignalLine point when within intersection scope', async () => {
        render(<VertexEditor />);

        // Start dragging middle vertex (index 1 is mockMarkerProps[1])
        const vertexMarker = mockMarkerProps[1];
        expect(vertexMarker).toBeDefined();

        act(() => {
            vertexMarker.eventHandlers.mousedown({ originalEvent: {} });
        });

        // Trigger mouseup at [106.1, 22.1] (inside intersection-1 bounds)
        expect(mapEventsHandlers.mouseup).toBeDefined();
        await act(async () => {
            await mapEventsHandlers.mouseup({
                latlng: { lat: 22.1, lng: 106.1 }
            });
        });

        expect(setDrawingPoint).toHaveBeenCalledWith(1, 22.1, 106.1, null);
    });

    it('rejects editing SignalLine point when outside intersection scope', async () => {
        render(<VertexEditor />);

        // Start dragging middle vertex (index 1 is mockMarkerProps[1])
        const vertexMarker = mockMarkerProps[1];
        expect(vertexMarker).toBeDefined();

        act(() => {
            vertexMarker.eventHandlers.mousedown({ originalEvent: {} });
        });

        // Trigger mouseup at [108, 24] (outside intersection-1 bounds)
        await act(async () => {
            await mapEventsHandlers.mouseup({
                latlng: { lat: 24, lng: 108 }
            });
        });

        expect(setDrawingPoint).not.toHaveBeenCalled();
    });

    it('allows editing regular line point outside intersection scope', async () => {
        useDesignSync.setState({ editingFeatureId: 'line-2' });
        render(<VertexEditor />);

        // Start dragging middle vertex (index 1 is mockMarkerProps[1])
        const vertexMarker = mockMarkerProps[1];
        expect(vertexMarker).toBeDefined();

        act(() => {
            vertexMarker.eventHandlers.mousedown({ originalEvent: {} });
        });

        // Trigger mouseup at [108, 24] (outside bounds)
        await act(async () => {
            await mapEventsHandlers.mouseup({
                latlng: { lat: 24, lng: 108 }
            });
        });

        expect(setDrawingPoint).toHaveBeenCalledWith(1, 24, 108, null);
    });

    it('rejects midpoint vertex insertion for SignalLine when outside intersection scope', async () => {
        render(<VertexEditor />);

        // Find midpoint handle (rendered as interactive=true, draggable=false)
        // With 3 points, there are 3 vertex handles (0, 1, 2) and then 2 midpoint handles (3, 4)
        const midpointMarker = mockMarkerProps[3];
        expect(midpointMarker).toBeDefined();

        act(() => {
            midpointMarker.eventHandlers.mousedown({ originalEvent: {} });
        });

        // Trigger mouseup outside bounds
        await act(async () => {
            await mapEventsHandlers.mouseup({
                latlng: { lat: 24, lng: 108 }
            });
        });

        expect(insertDrawingPoint).not.toHaveBeenCalled();
    });
});
