import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { PreviewFileReader } from './types';
import type { PreviewSourceAdapter, PreviewStyleId } from './types';
import { registerLocalPackageProtocol } from './localProtocol';
import type { PreviewPoint } from './extent';
import { getPreviewExtent } from './extent';
import type { StreetViewViewpoint } from './streetView';
import 'maplibre-gl/dist/maplibre-gl.css';

export const VIETNAM_BOUNDS: maplibregl.LngLatBoundsLike = [
    [101.5, 7.5],
    [110.5, 23.8],
];

export interface PreviewMapController {
    resetVietnamExtent(): void;
    zoomIn(): void;
    zoomOut(): void;
    fitDataExtent(data: unknown): boolean;
    setDeviceLocation(point: PreviewPoint): void;
    setStreetViewViewpoint(viewpoint: StreetViewViewpoint): void;
}

interface MapCanvasProps {
    adapter: PreviewSourceAdapter;
    reader: PreviewFileReader | null;
    styleId: PreviewStyleId;
    onControllerChange(controller: PreviewMapController | null): void;
    onPointSelect(point: PreviewPoint): void;
    onStateChange(state: 'loading' | 'ready' | 'error', message?: string): void;
}

export function MapCanvas({ adapter, reader, styleId, onControllerChange, onPointSelect, onStateChange }: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let map: maplibregl.Map | null = null;
        let selectedMarker: maplibregl.Marker | null = null;
        let deviceMarker: maplibregl.Marker | null = null;
        let streetViewMarker: maplibregl.Marker | null = null;
        let disposeProtocol: (() => void) | undefined;
        const container = containerRef.current;
        if (!container) return undefined;

        onStateChange('loading');
        const initialize = async () => {
            try {
                if (adapter.metadata.mode === 'offline') {
                    if (!reader) throw new Error('Local package reader chưa sẵn sàng');
                    const tileArchive = adapter.manifest?.assets.tileArchive;
                    if (!tileArchive) throw new Error('Local package không khai báo tile archive');
                    disposeProtocol = registerLocalPackageProtocol(reader, tileArchive);
                }
                const style = await adapter.styleDocument(styleId);
                if (cancelled) return;
                map = new maplibregl.Map({
                    container,
                    style,
                    center: [106.1, 16.2],
                    zoom: 5,
                    minZoom: 3,
                    maxZoom: 20,
                    attributionControl: false,
                    hash: false,
                });
                map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
                map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
                map.on('load', () => {
                    if (!cancelled) onStateChange('ready');
                });
                map.on('error', event => {
                    adapter.recordTileError(event.error ?? event);
                    if (!cancelled) onStateChange('error', adapter.getTileError()?.message);
                });
                map.on('click', event => {
                    const point: PreviewPoint = [event.lngLat.lng, event.lngLat.lat];
                    selectedMarker?.remove();
                    selectedMarker = new maplibregl.Marker({ color: '#65d6c3' })
                        .setLngLat(point)
                        .addTo(map!);
                    onPointSelect(point);
                });
                const controller: PreviewMapController = {
                    resetVietnamExtent: () => map?.fitBounds(VIETNAM_BOUNDS, { padding: 48, duration: 500 }),
                    zoomIn: () => map?.zoomIn({ duration: 180 }),
                    zoomOut: () => map?.zoomOut({ duration: 180 }),
                    fitDataExtent: data => {
                        const extent = getPreviewExtent(data);
                        if (!extent || !map) return false;
                        map.fitBounds(
                            [[extent.west, extent.south], [extent.east, extent.north]],
                            { padding: 64, maxZoom: 18, duration: 500 },
                        );
                        return true;
                    },
                    setDeviceLocation: point => {
                        deviceMarker?.remove();
                        deviceMarker = new maplibregl.Marker({ color: '#ff9f43' })
                            .setLngLat(point)
                            .addTo(map!);
                        map?.flyTo({ center: point, zoom: Math.max(map.getZoom(), 14), duration: 700 });
                    },
                    setStreetViewViewpoint: viewpoint => {
                        const markerElement = streetViewMarker?.getElement() ?? createStreetViewMarkerElement();
                        markerElement.style.setProperty('--pegman-heading', `${viewpoint.heading}deg`);
                        markerElement.style.setProperty('--pegman-fov', `${viewpoint.fov}deg`);
                        markerElement.title = `Pegman · hướng ${Math.round(viewpoint.heading)}° · FOV ${Math.round(viewpoint.fov)}°`;
                        if (!streetViewMarker) {
                            streetViewMarker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
                                .setLngLat(viewpoint.point)
                                .addTo(map!);
                        } else {
                            streetViewMarker.setLngLat(viewpoint.point);
                        }
                    },
                };
                if (!cancelled) onControllerChange(controller);
            } catch (error) {
                if (!cancelled) onStateChange('error', error instanceof Error ? error.message : String(error));
            }
        };
        void initialize();

        return () => {
            cancelled = true;
            onControllerChange(null);
            selectedMarker?.remove();
            deviceMarker?.remove();
            streetViewMarker?.remove();
            map?.remove();
            disposeProtocol?.();
        };
    }, [adapter, reader, styleId, onControllerChange, onStateChange]);

    return <div ref={containerRef} className="map-canvas" aria-label="Bản đồ Vietnam Basemap Preview" />;
}

function createStreetViewMarkerElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'pegman-marker';
    element.setAttribute('aria-label', 'Vị trí và hướng nhìn Street View');
    element.innerHTML = '<span class="pegman-marker-arrow" aria-hidden="true"></span><span class="pegman-marker-dot" aria-hidden="true"></span>';
    return element;
}
