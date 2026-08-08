import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { area as turfArea, length as turfLength, lineString, polygon } from '@turf/turf';
import { useMapContext } from '../MapContext';

interface MeasurementToolProps {
    active: boolean;
    mode?: 'distance' | 'area';
    onDeactivate: () => void;
}

const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
    return `${Math.round(meters)} m`;
};

const formatArea = (squareMeters: number) => {
    if (squareMeters >= 1_000_000) return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
    if (squareMeters >= 10_000) return `${(squareMeters / 10_000).toFixed(2)} ha`;
    return `${Math.round(squareMeters)} m²`;
};

const stopEvent = (event: SyntheticEvent) => event.stopPropagation();
const preventEvent = (event: SyntheticEvent) => event.preventDefault();

const MEASURE_SOURCE_ID = 'maplibre-measure-source';
const MEASURE_LINE_LAYER_ID = 'maplibre-measure-line';
const MEASURE_FILL_LAYER_ID = 'maplibre-measure-fill';
const MEASURE_VERTEX_LAYER_ID = 'maplibre-measure-vertex';

const removeMeasureLayers = (map: maplibregl.Map) => {
    try {
        if (!(map as any).style) return;
        if (map.getLayer(MEASURE_VERTEX_LAYER_ID)) map.removeLayer(MEASURE_VERTEX_LAYER_ID);
        if (map.getLayer(MEASURE_LINE_LAYER_ID)) map.removeLayer(MEASURE_LINE_LAYER_ID);
        if (map.getLayer(MEASURE_FILL_LAYER_ID)) map.removeLayer(MEASURE_FILL_LAYER_ID);
        if (map.getSource(MEASURE_SOURCE_ID)) map.removeSource(MEASURE_SOURCE_ID);
    } catch (_e) {
        // Ignore teardown errors during unmount/style reloads
    }
};

export function MapLibreMeasurementTool({ active, mode = 'distance', onDeactivate }: MeasurementToolProps) {
    const { map } = useMapContext();
    const [points, setPoints] = useState<[number, number][]>([]);
    const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

    const clearMeasure = useCallback(() => {
        setPoints([]);
        setHoverPoint(null);
        onDeactivate();
    }, [onDeactivate]);

    useEffect(() => {
        if (!active || !map) return;

        const container = map.getContainer();
        container.classList.add('measure-tool-active');
        map.doubleClickZoom.disable();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') clearMeasure();
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            container.classList.remove('measure-tool-active');
            map.doubleClickZoom.enable();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [active, clearMeasure, map]);

    useEffect(() => {
        if (!active || !map) return;

        const handleClick = (event: maplibregl.MapMouseEvent) => {
            setPoints(current => [...current, [event.lngLat.lng, event.lngLat.lat]]);
            setHoverPoint(null);
        };

        const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
            setHoverPoint([event.lngLat.lng, event.lngLat.lat]);
        };

        const handleDblClick = (event: maplibregl.MapMouseEvent) => {
            event.preventDefault();
            setHoverPoint(null);
        };

        const handleContextMenu = (event: maplibregl.MapMouseEvent) => {
            event.preventDefault();
            clearMeasure();
        };

        map.on('click', handleClick);
        map.on('mousemove', handleMouseMove);
        map.on('dblclick', handleDblClick);
        map.on('contextmenu', handleContextMenu);

        return () => {
            map.off('click', handleClick);
            map.off('mousemove', handleMouseMove);
            map.off('dblclick', handleDblClick);
            map.off('contextmenu', handleContextMenu);
        };
    }, [active, clearMeasure, map]);

    const previewPoints = useMemo(() => {
        if (!hoverPoint || points.length === 0) return points;
        return [...points, hoverPoint];
    }, [hoverPoint, points]);

    const measuredValue = useMemo(() => {
        if (mode === 'area') {
            if (previewPoints.length < 3) return 0;
            const ring = [...previewPoints, previewPoints[0]];
            return turfArea(polygon([ring]));
        }
        if (previewPoints.length < 2) return 0;
        return turfLength(lineString(previewPoints), { units: 'kilometers' }) * 1000;
    }, [mode, previewPoints]);

    useEffect(() => {
        if (!map) return;

        if (!active || previewPoints.length === 0) {
            removeMeasureLayers(map);
            return;
        }

        const features: GeoJSON.Feature[] = [];

        if (previewPoints.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: previewPoints },
                properties: { kind: 'line' },
            });
        }

        if (mode === 'area' && previewPoints.length >= 3) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...previewPoints, previewPoints[0]]] },
                properties: { kind: 'area' },
            });
        }

        points.forEach((point, index) => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: point },
                properties: { kind: 'vertex', index },
            });
        });

        if (hoverPoint) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: hoverPoint },
                properties: { kind: 'hover' },
            });
        }

        const geojsonData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

        const apply = () => {
            const existingSource = map.getSource(MEASURE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
            if (existingSource) {
                existingSource.setData(geojsonData);
                return;
            }

            map.addSource(MEASURE_SOURCE_ID, { type: 'geojson', data: geojsonData });
            map.addLayer({
                id: MEASURE_FILL_LAYER_ID,
                type: 'fill',
                source: MEASURE_SOURCE_ID,
                filter: ['==', ['get', 'kind'], 'area'],
                paint: {
                    'fill-color': '#38bdf8',
                    'fill-opacity': 0.16,
                },
            });
            map.addLayer({
                id: MEASURE_LINE_LAYER_ID,
                type: 'line',
                source: MEASURE_SOURCE_ID,
                filter: ['==', ['get', 'kind'], 'line'],
                paint: {
                    'line-color': '#38bdf8',
                    'line-width': 3,
                    'line-opacity': 0.95,
                    'line-dasharray': hoverPoint ? [2, 2] : [1, 0],
                },
            });
            map.addLayer({
                id: MEASURE_VERTEX_LAYER_ID,
                type: 'circle',
                source: MEASURE_SOURCE_ID,
                filter: ['in', ['get', 'kind'], ['literal', ['vertex', 'hover']]],
                paint: {
                    'circle-radius': ['case', ['==', ['get', 'kind'], 'hover'], 4, 5],
                    'circle-color': ['case', ['==', ['get', 'kind'], 'hover'], '#38bdf8', '#0284c7'],
                    'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'hover'], '#bae6fd', '#e0f2fe'],
                    'circle-stroke-width': 2,
                },
            });
        };

        if (map.isStyleLoaded()) apply();
        else map.once('styledata', apply);

        return () => {
            map.off('styledata', apply);
        };
    }, [active, hoverPoint, map, mode, points, previewPoints]);

    useEffect(() => () => {
        if (map) removeMeasureLayers(map);
    }, [map]);

    if (!active) return null;

    return (
        <div
            className="measure-panel pointer-events-auto absolute bottom-6 right-6 z-cad-panel bg-cad-surface border border-cad-border p-3 rounded shadow-lg"
            role="group"
            onPointerDown={stopEvent}
            onMouseDown={stopEvent}
            onContextMenu={preventEvent}
        >
            <div className="text-[9px] font-black uppercase tracking-widest text-cad-text-muted">
                {mode === 'area' ? 'Do diện tích' : 'Do khoảng cách'}
            </div>
            <output className="mt-1 block font-mono text-sm font-black text-cad-accent" aria-live="polite">
                {mode === 'area' ? formatArea(measuredValue) : formatDistance(measuredValue)}
            </output>
            <div className="mt-1 text-[9px] text-cad-text-muted">
                Click để thêm điểm, chuột phải hoặc ESC để thoát
            </div>
            <button
                type="button"
                onClick={clearMeasure}
                className="mt-2 w-full cursor-pointer border border-cad-border px-2 py-1 text-[9px] font-black uppercase text-cad-text-secondary hover:border-cad-accent hover:text-cad-accent transition-colors"
            >
                Kết thúc
            </button>
        </div>
    );
}
