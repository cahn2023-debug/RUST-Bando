import { describe, expect, it, vi } from 'vitest';
import { createIconCacheKey } from './PointLayer';

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
});
