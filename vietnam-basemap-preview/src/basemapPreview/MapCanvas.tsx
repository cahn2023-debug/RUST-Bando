import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { PreviewFileReader } from './types';
import type { PreviewSourceAdapter, PreviewStyleId } from './types';
import { registerLocalPackageProtocol } from './localProtocol';
import 'maplibre-gl/dist/maplibre-gl.css';

export const VIETNAM_BOUNDS: maplibregl.LngLatBoundsLike = [
    [101.5, 7.5],
    [110.5, 23.8],
];

export interface PreviewMapController {
    resetVietnamExtent(): void;
    zoomIn(): void;
    zoomOut(): void;
}

interface MapCanvasProps {
    adapter: PreviewSourceAdapter;
    reader: PreviewFileReader | null;
    styleId: PreviewStyleId;
    onControllerChange(controller: PreviewMapController | null): void;
    onStateChange(state: 'loading' | 'ready' | 'error', message?: string): void;
}

export function MapCanvas({ adapter, reader, styleId, onControllerChange, onStateChange }: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let map: maplibregl.Map | null = null;
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
                const controller: PreviewMapController = {
                    resetVietnamExtent: () => map?.fitBounds(VIETNAM_BOUNDS, { padding: 48, duration: 500 }),
                    zoomIn: () => map?.zoomIn({ duration: 180 }),
                    zoomOut: () => map?.zoomOut({ duration: 180 }),
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
            map?.remove();
            disposeProtocol?.();
        };
    }, [adapter, reader, styleId, onControllerChange, onStateChange]);

    return <div ref={containerRef} className="map-canvas" aria-label="Bản đồ Vietnam Basemap Preview" />;
}
