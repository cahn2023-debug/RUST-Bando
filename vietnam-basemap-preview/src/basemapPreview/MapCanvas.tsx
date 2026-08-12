import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { PreviewFileReader } from './types';
import type { PreviewSourceAdapter, PreviewStyleId } from './types';
import { registerLocalPackageProtocol } from './localProtocol';
import type { PreviewPoint } from './extent';
import { getPreviewExtent } from './extent';
import type { StreetViewViewpoint } from './streetView';
import { MeasureToolController } from './measureTool';
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
    clearMeasure(): void;
}

interface MapCanvasProps {
    adapter: PreviewSourceAdapter;
    reader: PreviewFileReader | null;
    styleId: PreviewStyleId;
    measureActive: boolean;
    onControllerChange(controller: PreviewMapController | null): void;
    onPointSelect(point: PreviewPoint): void;
    onStateChange(state: 'loading' | 'ready' | 'error', message?: string): void;
    onMeasureDistanceChange(distanceText: string | null): void;
}

export function MapCanvas({
    adapter,
    reader,
    styleId,
    measureActive,
    onControllerChange,
    onPointSelect,
    onStateChange,
    onMeasureDistanceChange,
}: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const measureActiveRef = useRef(measureActive);
    measureActiveRef.current = measureActive;

    const measureToolRef = useRef<MeasureToolController | null>(null);

    // Sync clear measure when measureActive toggles off
    useEffect(() => {
        if (!measureActive && measureToolRef.current) {
            measureToolRef.current.clear();
            onMeasureDistanceChange(null);
        }
    }, [measureActive, onMeasureDistanceChange]);

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

                map.on('load', () => {
                    if (cancelled || !map) return;
                    onStateChange('ready');
                    measureToolRef.current = new MeasureToolController(map);
                });

                map.on('error', event => {
                    adapter.recordTileError(event.error ?? event);
                    if (!cancelled) onStateChange('error', adapter.getTileError()?.message);
                });

                map.on('click', event => {
                    const point: PreviewPoint = [event.lngLat.lng, event.lngLat.lat];

                    if (measureActiveRef.current && measureToolRef.current) {
                        measureToolRef.current.addPoint(point);
                        onMeasureDistanceChange(measureToolRef.current.getTotalDistanceFormatted());
                        return;
                    }

                    selectedMarker?.remove();
                    selectedMarker = new maplibregl.Marker({ color: '#65d6c3' })
                        .setLngLat(point)
                        .addTo(map!);
                    onPointSelect(point);
                });

                map.on('mousemove', event => {
                    if (measureActiveRef.current && measureToolRef.current && measureToolRef.current.getPointCount() > 0) {
                        const point: PreviewPoint = [event.lngLat.lng, event.lngLat.lat];
                        measureToolRef.current.updateHoverPoint(point);
                    }
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
                    clearMeasure: () => {
                        if (measureToolRef.current) {
                            measureToolRef.current.clear();
                            onMeasureDistanceChange(null);
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
            measureToolRef.current?.destroy();
            measureToolRef.current = null;
            onControllerChange(null);
            selectedMarker?.remove();
            deviceMarker?.remove();
            streetViewMarker?.remove();
            map?.remove();
            disposeProtocol?.();
        };
    }, [adapter, reader, styleId, onControllerChange, onPointSelect, onStateChange, onMeasureDistanceChange]);

    return <div ref={containerRef} className="map-canvas" aria-label="Bản đồ Vietnam Basemap Preview" />;
}

function createStreetViewMarkerElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'pegman-marker';
    element.setAttribute('aria-label', 'Vị trí và hướng nhìn Street View');
    element.innerHTML = `
        <span class="pegman-marker-fov" aria-hidden="true"></span>
        <div class="pegman-marker-center">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M12 2L15 5.5H9L12 2Z" fill="#ffcf5a" />
                <ellipse cx="12" cy="15.5" rx="7" ry="3.5" fill="#65d6c3" />
                <ellipse cx="12" cy="10" rx="3.8" ry="3.8" fill="#ffcf5a" />
            </svg>
        </div>
    `;
    return element;
}
