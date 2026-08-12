import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { PreviewFileReader, PreviewSourceAdapter, PreviewStyleId, SubLayerConfig } from './types';
import { registerLocalPackageProtocol } from './localProtocol';
import type { PreviewPoint } from './extent';
import { getPreviewExtent } from './extent';
import type { StreetViewViewpoint } from './streetView';
import { MeasureToolController } from './measureTool';
import {
    buildGoogleStyledTileTemplate,
    buildGoogleTileProxyTemplate,
    getGoogleTileProxyBaseUrl,
    GOOGLE_HYBRID_LABELS_TILE_TEMPLATE,
    GOOGLE_RASTER_TILE_TEMPLATE,
} from './googleSource';
import {
    classifyBasemapLayer,
    detectBasemapLayerCapabilities,
    GOOGLE_BASEMAP_LAYER_CAPABILITIES,
    type BasemapLayerCapabilities,
    type BasemapLayerVisibility,
    type BasemapStyleLayer,
} from './basemapLayers';
import 'maplibre-gl/dist/maplibre-gl.css';

export const VIETNAM_BOUNDS: maplibregl.LngLatBoundsLike = [
    [101.5, 7.5],
    [110.5, 23.8],
];

export function applyBasemapLayerVisibility(
    map: maplibregl.Map,
    visibility: BasemapLayerVisibility,
    googleTileProxyBaseUrl = getGoogleTileProxyBaseUrl(),
) {
    const style = map.getStyle();
    if (!style?.layers) return;

    const updatedSources = new Set<string>();
    const hasGoogleStyleRules = !visibility.roads || !visibility.labels || !visibility.pois;

    for (const layer of style.layers) {
        const source = 'source' in layer && typeof layer.source === 'string' ? layer.source : null;
        const isGoogleRaster = source === 'google-raster';
        const isGoogleHybridBase = source === 'google-hybrid-base' || source === 'google-hybrid';
        const isGoogleHybridOverlay = source === 'google-hybrid-overlay'
            || source === 'google-hybrid-labels'
            || layer.id.toLowerCase().includes('hybrid-overlay')
            || layer.id.toLowerCase().includes('hybrid-labels');
        const group = classifyBasemapLayer(layer as BasemapStyleLayer);
        const visible = isGoogleHybridBase
            ? true
            : isGoogleHybridOverlay
                ? visibility.roads || visibility.labels || visibility.pois
                : isGoogleRaster || !group
                    ? true
                    : visibility[group];

        try {
            map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
        } catch {
            // ignore uneditable layers
        }

        if (isGoogleRaster && source && !updatedSources.has(source)) {
            const rasterSource = getRasterSource(map, source);
            if (hasGoogleStyleRules || sourceHasGoogleStyleRules(rasterSource)) {
                setRasterTilesIfChanged(rasterSource, [
                    buildGoogleStyledTileTemplate(
                        buildGoogleTileProxyTemplate(GOOGLE_RASTER_TILE_TEMPLATE, googleTileProxyBaseUrl),
                        visibility,
                    ),
                ]);
            }
            updatedSources.add(source);
        }

        if (isGoogleHybridOverlay && source && !updatedSources.has(source)) {
            const overlaySource = getRasterSource(map, source);
            if (hasGoogleStyleRules || sourceHasGoogleStyleRules(overlaySource)) {
                setRasterTilesIfChanged(overlaySource, [
                    buildGoogleStyledTileTemplate(
                        buildGoogleTileProxyTemplate(GOOGLE_HYBRID_LABELS_TILE_TEMPLATE, googleTileProxyBaseUrl),
                        visibility,
                    ),
                ]);
            }
            updatedSources.add(source);
        }
    }
}

/** @deprecated Use applyBasemapLayerVisibility with the eight-group contract. */
export function applySubLayerVisibility(map: maplibregl.Map, subLayers: SubLayerConfig) {
    applyBasemapLayerVisibility(map, {
        landcover: true,
        water: true,
        boundaries: subLayers.bordersLabels,
        roads: subLayers.roads,
        labels: subLayers.bordersLabels,
        pois: subLayers.pois,
        buildings: subLayers.buildings3d,
        terrain: subLayers.terrain,
    });
}

type RasterSourceLike = {
    setTiles?: (tiles: string[]) => void;
    tiles?: string[];
};

function getRasterSource(map: maplibregl.Map, sourceId: string): RasterSourceLike | undefined {
    if (typeof map.getSource !== 'function') return undefined;
    return map.getSource(sourceId) as RasterSourceLike | undefined;
}

function setRasterTilesIfChanged(source: RasterSourceLike | undefined, tiles: string[]) {
    if (!source?.setTiles || source.tiles?.[0] === tiles[0]) return;
    source.setTiles(tiles);
}

function sourceHasGoogleStyleRules(source: RasterSourceLike | undefined): boolean {
    return source?.tiles?.[0]?.includes('&apistyle=') ?? false;
}

export interface PreviewMapController {
    resetVietnamExtent(): void;
    zoomIn(): void;
    zoomOut(): void;
    fitDataExtent(data: unknown): boolean;
    setDeviceLocation(point: PreviewPoint): void;
    setStreetViewViewpoint(viewpoint: StreetViewViewpoint): void;
    clearMeasure(): void;
    setBasemapLayerVisibility(visibility: BasemapLayerVisibility): void;
}

interface MapCanvasProps {
    adapter: PreviewSourceAdapter;
    reader: PreviewFileReader | null;
    styleId: PreviewStyleId;
    layerVisibility: BasemapLayerVisibility;
    googleTileProxyBaseUrl?: string;
    measureActive: boolean;
    onControllerChange(controller: PreviewMapController | null): void;
    onPointSelect(point: PreviewPoint): void;
    onStateChange(state: 'loading' | 'ready' | 'error', message?: string): void;
    onCapabilitiesChange(capabilities: BasemapLayerCapabilities | null): void;
    onMeasureDistanceChange(distanceText: string | null): void;
}

export function MapCanvas({
    adapter,
    reader,
    styleId,
    layerVisibility,
    googleTileProxyBaseUrl,
    measureActive,
    onControllerChange,
    onPointSelect,
    onStateChange,
    onCapabilitiesChange,
    onMeasureDistanceChange,
}: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const adapterRef = useRef(adapter);
    const measureActiveRef = useRef(measureActive);
    const layerVisibilityRef = useRef(layerVisibility);
    const measureToolRef = useRef<MeasureToolController | null>(null);
    const selectedMarkerRef = useRef<maplibregl.Marker | null>(null);
    const deviceMarkerRef = useRef<maplibregl.Marker | null>(null);
    const streetViewMarkerRef = useRef<maplibregl.Marker | null>(null);
    const disposeProtocolRef = useRef<(() => void) | undefined>(undefined);
    const protocolArchiveRef = useRef<string | null>(null);
    const controllerRef = useRef<PreviewMapController | null>(null);
    const callbacksRef = useRef({
        onControllerChange,
        onPointSelect,
        onStateChange,
        onCapabilitiesChange,
        onMeasureDistanceChange,
    });

    adapterRef.current = adapter;
    measureActiveRef.current = measureActive;
    layerVisibilityRef.current = layerVisibility;
    callbacksRef.current = {
        onControllerChange,
        onPointSelect,
        onStateChange,
        onCapabilitiesChange,
        onMeasureDistanceChange,
    };

    const createController = (map: maplibregl.Map): PreviewMapController => ({
        resetVietnamExtent: () => map.fitBounds(VIETNAM_BOUNDS, { padding: 48, duration: 500 }),
        zoomIn: () => map.zoomIn({ duration: 180 }),
        zoomOut: () => map.zoomOut({ duration: 180 }),
        fitDataExtent: data => {
            const extent = getPreviewExtent(data);
            if (!extent) return false;
            map.fitBounds(
                [[extent.west, extent.south], [extent.east, extent.north]],
                { padding: 64, maxZoom: 18, duration: 500 },
            );
            return true;
        },
        setDeviceLocation: point => {
            deviceMarkerRef.current?.remove();
            deviceMarkerRef.current = new maplibregl.Marker({ color: '#ff9f43' })
                .setLngLat(point)
                .addTo(map);
            map.flyTo({ center: point, zoom: Math.max(map.getZoom(), 14), duration: 700 });
        },
        setStreetViewViewpoint: viewpoint => {
            const markerElement = streetViewMarkerRef.current?.getElement() ?? createStreetViewMarkerElement();
            markerElement.style.setProperty('--pegman-heading', `${viewpoint.heading}deg`);
            markerElement.style.setProperty('--pegman-fov', `${viewpoint.fov}deg`);
            markerElement.title = `Pegman · hướng ${Math.round(viewpoint.heading)}° · FOV ${Math.round(viewpoint.fov)}°`;
            if (!streetViewMarkerRef.current) {
                streetViewMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
                    .setLngLat(viewpoint.point)
                    .addTo(map);
            } else {
                streetViewMarkerRef.current.setLngLat(viewpoint.point);
            }
        },
        clearMeasure: () => {
            measureToolRef.current?.clear();
            callbacksRef.current.onMeasureDistanceChange(null);
        },
        setBasemapLayerVisibility: nextVisibility => {
            applyBasemapLayerVisibility(map, nextVisibility, googleTileProxyBaseUrl);
        },
    });

    const handleStyleReady = (map: maplibregl.Map, sourceAdapter: PreviewSourceAdapter) => {
        if (mapRef.current !== map) return;
        callbacksRef.current.onStateChange('ready');
        const capabilities = sourceAdapter.metadata.mode === 'offline'
            ? detectBasemapLayerCapabilities((map.getStyle().layers ?? []) as BasemapStyleLayer[])
            : GOOGLE_BASEMAP_LAYER_CAPABILITIES;
        callbacksRef.current.onCapabilitiesChange(capabilities);
        measureToolRef.current?.destroy();
        measureToolRef.current = new MeasureToolController(map);
        applyBasemapLayerVisibility(map, layerVisibilityRef.current, googleTileProxyBaseUrl);
    };

    useEffect(() => {
        let cancelled = false;
        const initializeOrUpdateStyle = async () => {
            try {
                callbacksRef.current.onStateChange('loading');
                callbacksRef.current.onCapabilitiesChange(null);

                if (adapter.metadata.mode === 'offline') {
                    if (!reader) throw new Error('Local package reader chưa sẵn sàng');
                    const tileArchive = adapter.manifest?.assets.tileArchive;
                    if (!tileArchive) throw new Error('Local package không khai báo tile archive');
                    if (protocolArchiveRef.current !== tileArchive) {
                        disposeProtocolRef.current?.();
                        disposeProtocolRef.current = registerLocalPackageProtocol(reader, tileArchive);
                        protocolArchiveRef.current = tileArchive;
                    }
                } else if (protocolArchiveRef.current) {
                    disposeProtocolRef.current?.();
                    disposeProtocolRef.current = undefined;
                    protocolArchiveRef.current = null;
                }

                const style = await adapter.styleDocument(styleId);
                if (cancelled) return;

                const existingMap = mapRef.current;
                if (!existingMap) {
                    const map = new maplibregl.Map({
                        container: containerRef.current!,
                        style,
                        center: [106.1, 16.2],
                        zoom: 5,
                        minZoom: 3,
                        maxZoom: 20,
                        attributionControl: false,
                        hash: false,
                    });
                    mapRef.current = map;
                    controllerRef.current = createController(map);
                    callbacksRef.current.onControllerChange(controllerRef.current);

                    map.on('load', () => handleStyleReady(map, adapterRef.current));
                    map.on('error', event => {
                        const activeAdapter = adapterRef.current;
                        activeAdapter.recordTileError(event.error ?? event);
                        callbacksRef.current.onStateChange('error', activeAdapter.getTileError()?.message);
                    });
                    map.on('click', event => {
                        const point: PreviewPoint = [event.lngLat.lng, event.lngLat.lat];
                        if (measureActiveRef.current && measureToolRef.current) {
                            measureToolRef.current.addPoint(point);
                            callbacksRef.current.onMeasureDistanceChange(measureToolRef.current.getTotalDistanceFormatted());
                            return;
                        }
                        selectedMarkerRef.current?.remove();
                        selectedMarkerRef.current = new maplibregl.Marker({ color: '#65d6c3' })
                            .setLngLat(point)
                            .addTo(map);
                        callbacksRef.current.onPointSelect(point);
                    });
                    map.on('mousemove', event => {
                        if (measureActiveRef.current && measureToolRef.current && measureToolRef.current.getPointCount() > 0) {
                            const point: PreviewPoint = [event.lngLat.lng, event.lngLat.lat];
                            measureToolRef.current.updateHoverPoint(point);
                        }
                    });
                    return;
                }

                const camera = {
                    center: existingMap.getCenter(),
                    zoom: existingMap.getZoom(),
                    bearing: existingMap.getBearing(),
                    pitch: existingMap.getPitch(),
                };
                existingMap.once('style.load', () => {
                    if (!cancelled && mapRef.current === existingMap) {
                        existingMap.jumpTo(camera);
                        handleStyleReady(existingMap, adapter);
                    }
                });
                existingMap.setStyle(style);
            } catch (error) {
                if (!cancelled) callbacksRef.current.onStateChange('error', error instanceof Error ? error.message : String(error));
            }
        };

        if (containerRef.current) void initializeOrUpdateStyle();
        return () => {
            cancelled = true;
        };
    }, [adapter, reader, styleId, googleTileProxyBaseUrl]);

    useEffect(() => {
        return () => {
            measureToolRef.current?.destroy();
            measureToolRef.current = null;
            selectedMarkerRef.current?.remove();
            deviceMarkerRef.current?.remove();
            streetViewMarkerRef.current?.remove();
            mapRef.current?.remove();
            mapRef.current = null;
            controllerRef.current = null;
            disposeProtocolRef.current?.();
            disposeProtocolRef.current = undefined;
            protocolArchiveRef.current = null;
            callbacksRef.current.onControllerChange(null);
        };
    }, []);

    useEffect(() => {
        if (!measureActive && measureToolRef.current) {
            measureToolRef.current.clear();
            onMeasureDistanceChange(null);
        }
    }, [measureActive, onMeasureDistanceChange]);

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
