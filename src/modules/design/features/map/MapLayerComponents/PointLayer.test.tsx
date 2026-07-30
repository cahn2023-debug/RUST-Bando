import { describe, expect, it, vi } from 'vitest';
import { createIconCacheKey, createNativeIcon, getPointMarkerPlacement } from './PointLayer';

vi.mock('react-leaflet', () => ({
    useMap: () => ({}),
    useMapEvents: () => null,
    Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('leaflet', () => ({
    default: (() => {
        const Marker = function Marker() {};
        (Marker as any).prototype.options = {};
        return {
            icon: vi.fn(() => ({})),
            Marker,
            DivIcon: class {
                constructor(public options: any) {}
            },
            marker: vi.fn(),
            FeatureGroup: class {},
            DomEvent: { stopPropagation: vi.fn() },
        };
    })(),
}));

vi.mock('leaflet.markercluster', () => ({}));

describe('PointLayer icon cache key', () => {
    it('stays stable across cloned feature and metadata objects with the same display data', () => {
        const feature = {
            id: 'camera-1',
            name: 'Camera',
            properties: { iconKey: 'cctv', type: 'camera' },
        };
        const group = { type: 'CAMERA', name: 'Camera group' };
        const metadata = { color: '#22c55e', size: 32, gis: { rotation: 90 } };

        const first = createIconCacheKey(feature, group, metadata, 1, false, false, true);
        const second = createIconCacheKey(
            { ...feature, properties: { ...feature.properties } },
            { ...group },
            { ...metadata, gis: { ...metadata.gis } },
            1,
            false,
            false,
            true
        );

        expect(second).toBe(first);
    });

    it('creates a fallback point icon when the feature group is missing', () => {
        expect(() => createNativeIcon(
            {
                id: 'point-1',
                name: 'Point 1',
                geom_type: 'Point',
                properties: {},
            },
            undefined,
            { color: '#ef4444', size: 18 },
            7,
            false,
            false,
            true
        )).not.toThrow();

        const icon = createNativeIcon(
            {
                id: 'point-1',
                name: 'Point 1',
                geom_type: 'Point',
                properties: {},
            },
            undefined,
            { color: '#ef4444', size: 18 },
            7,
            false,
            false,
            true
        ) as any;

        expect(icon.options.html).toContain('border-radius: 50%');
        expect(icon.options.html).toContain('7');
    });

    it('creates SVG icons for camera and intersection point features', () => {
        const cameraIcon = createNativeIcon(
            { id: 'camera-1', name: 'Camera', geom_type: 'Point', properties: {} },
            { type: 'CAMERA', name: 'Camera group' },
            { icon: 'cctv', color: '#2563eb', size: 24 },
            3,
            false,
            false,
            true
        ) as any;
        const intersectionIcon = createNativeIcon(
            { id: 'node-1', name: 'Node', geom_type: 'Point', properties: {} },
            { type: 'INTERSECTION', name: 'Intersection group' },
            { icon: 'intersection', color: '#8b5cf6', size: 24 },
            4,
            false,
            false,
            true
        ) as any;

        expect(cameraIcon.options.html).toContain('<svg');
        expect(intersectionIcon.options.html).toContain('<svg');
    });

    it('places selected points in the overlay group so closed clusters cannot hide them', () => {
        expect(getPointMarkerPlacement({
            isMoveMode: false,
            isSelected: true,
            showFeatureGroups: true,
        })).toEqual({
            isSelectedForMove: false,
            useOverlayGroup: true,
            pane: 'move-tool-pane',
        });

        expect(getPointMarkerPlacement({
            isMoveMode: false,
            isSelected: false,
            showFeatureGroups: true,
        })).toEqual({
            isSelectedForMove: false,
            useOverlayGroup: false,
            pane: 'markerPane',
        });
    });
});
