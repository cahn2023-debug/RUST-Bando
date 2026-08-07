import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBasemap } from './BasemapContext';
import { useBasemapCamera } from './useBasemapState';

/**
 * Basemap measuring tape.
 *
 * Lives in core rather than in the design module because measuring a distance on
 * a map needs nothing but the map — no project, no features, no layers. Putting
 * it here is what lets it work before a project is opened, which is the whole
 * point of separating the basemap out.
 *
 * Distances use the haversine formula on the WGS84 mean radius; area uses the
 * spherical excess formula. Both are accurate to well under a percent at the
 * scales this tool is used at, and neither needs a geodesy dependency.
 */

const EARTH_RADIUS_M = 6_371_008.8;

const MEASURE_SOURCE_ID = 'basemap-measure';
const MEASURE_FILL_LAYER_ID = 'basemap-measure-fill';
const MEASURE_LINE_LAYER_ID = 'basemap-measure-line';
const MEASURE_POINT_LAYER_ID = 'basemap-measure-point';

export type MeasureMode = 'distance' | 'area';
type LngLat = [number, number];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function totalLength(points: LngLat[]): number {
    let sum = 0;
    for (let index = 1; index < points.length; index += 1) {
        sum += haversine(points[index - 1], points[index]);
    }
    return sum;
}

/**
 * Spherical polygon area in square metres, via the shoelace formula on the
 * sphere. Returns the absolute value, so winding order does not matter.
 */
export function sphericalArea(points: LngLat[]): number {
    if (points.length < 3) return 0;
    let total = 0;
    for (let index = 0; index < points.length; index += 1) {
        const [lng1, lat1] = points[index];
        const [lng2, lat2] = points[(index + 1) % points.length];
        total +=
            toRadians(lng2 - lng1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
    }
    return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function formatDistance(metres: number): string {
    if (metres >= 1000) return `${(metres / 1000).toFixed(metres >= 10_000 ? 1 : 2)} km`;
    return `${Math.round(metres)} m`;
}

export function formatArea(squareMetres: number): string {
    if (squareMetres >= 1_000_000) return `${(squareMetres / 1_000_000).toFixed(2)} km2`;
    if (squareMetres >= 10_000) return `${(squareMetres / 10_000).toFixed(2)} ha`;
    return `${Math.round(squareMetres)} m2`;
}

function removeMeasureLayers(map: any): void {
    try {
        if (!map?.style) return;
        [MEASURE_POINT_LAYER_ID, MEASURE_LINE_LAYER_ID, MEASURE_FILL_LAYER_ID].forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(MEASURE_SOURCE_ID)) map.removeSource(MEASURE_SOURCE_ID);
    } catch {
        // Teardown races during style reloads are not worth reporting.
    }
}

/**
 * Draws the measurement onto the map and reports the running total.
 *
 * Rendering goes through the raw map object because MapLibre has no controller
 * concept for ad-hoc layers. That is the one place the basemap needs it, and it
 * is confined to this component.
 */
export function useMeasureTool(active: boolean, mode: MeasureMode) {
    const { controller } = useBasemap();
    const [points, setPoints] = useState<LngLat[]>([]);
    const [hover, setHover] = useState<LngLat | null>(null);

    const reset = useCallback(() => {
        setPoints([]);
        setHover(null);
    }, []);

    useEffect(() => {
        if (!active) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            reset();
        }
    }, [active, reset]);

    // Collect clicks.
    useEffect(() => {
        const map = controller?.getMap() as any;
        if (!active || !map) return;

        const container = map.getContainer?.();
        container?.classList?.add('basemap-measuring');
        map.doubleClickZoom?.disable?.();

        const onClick = (event: any) =>
            setPoints(current => [...current, [event.lngLat.lng, event.lngLat.lat]]);
        const onMouseMove = (event: any) => setHover([event.lngLat.lng, event.lngLat.lat]);
        const onContextMenu = (event: any) => {
            event.preventDefault?.();
            reset();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') reset();
        };

        map.on('click', onClick);
        map.on('mousemove', onMouseMove);
        map.on('contextmenu', onContextMenu);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            container?.classList?.remove('basemap-measuring');
            map.doubleClickZoom?.enable?.();
            map.off('click', onClick);
            map.off('mousemove', onMouseMove);
            map.off('contextmenu', onContextMenu);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [active, controller, reset]);

    const preview = useMemo<LngLat[]>(
        () => (hover && points.length > 0 ? [...points, hover] : points),
        [hover, points]
    );

    const value = useMemo(
        () => (mode === 'area' ? sphericalArea(preview) : totalLength(preview)),
        [mode, preview]
    );

    // Paint.
    useEffect(() => {
        const map = controller?.getMap() as any;
        if (!map) return;
        if (!active || preview.length === 0) {
            removeMeasureLayers(map);
            return;
        }

        const features: any[] = [];
        if (preview.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: preview },
                properties: { kind: 'line' },
            });
        }
        if (mode === 'area' && preview.length >= 3) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...preview, preview[0]]] },
                properties: { kind: 'area' },
            });
        }
        points.forEach(point => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: point },
                properties: { kind: 'vertex' },
            });
        });

        const data = { type: 'FeatureCollection', features };

        const apply = () => {
            const existing = map.getSource(MEASURE_SOURCE_ID);
            if (existing) {
                existing.setData(data);
                return;
            }
            map.addSource(MEASURE_SOURCE_ID, { type: 'geojson', data });
            map.addLayer({
                id: MEASURE_FILL_LAYER_ID,
                type: 'fill',
                source: MEASURE_SOURCE_ID,
                filter: ['==', ['get', 'kind'], 'area'],
                paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 },
            });
            map.addLayer({
                id: MEASURE_LINE_LAYER_ID,
                type: 'line',
                source: MEASURE_SOURCE_ID,
                filter: ['==', ['get', 'kind'], 'line'],
                paint: { 'line-color': '#2563eb', 'line-width': 2.5 },
            });
            map.addLayer({
                id: MEASURE_POINT_LAYER_ID,
                type: 'circle',
                source: MEASURE_SOURCE_ID,
                filter: ['==', ['get', 'kind'], 'vertex'],
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#ffffff',
                    'circle-stroke-color': '#2563eb',
                    'circle-stroke-width': 2,
                },
            });
        };

        if (map.isStyleLoaded?.()) apply();
        else map.once?.('styledata', apply);

        return () => {
            map.off?.('styledata', apply);
        };
    }, [active, controller, mode, points, preview]);

    // Clean up when the tool unmounts entirely.
    const controllerRef = useRef(controller);
    // eslint-disable-next-line react-hooks/refs
    controllerRef.current = controller;
    useEffect(
        () => () => {
            removeMeasureLayers(controllerRef.current?.getMap() as any);
        },
        []
    );

    return { points, value, reset };
}

/**
 * Readout panel for the active measurement.
 *
 * Positioned by the caller. Deliberately shows the keyboard/mouse escape hatches
 * inline, because a tool that captures every map click needs an obvious exit.
 */
export function MeasurePanel({
    mode,
    onModeChange,
    onClose,
}: {
    mode: MeasureMode;
    onModeChange: (mode: MeasureMode) => void;
    onClose: () => void;
}) {
    const { value, reset } = useMeasureTool(true, mode);
    // Keep the readout live while the camera moves so the panel never shows a
    // value from a stale projection.
    useBasemapCamera();

    return (
        <div className="basemap-measure" role="group">
            <div className="basemap-measure__tabs">
                <button
                    type="button"
                    className={mode === 'distance' ? 'basemap-measure__tab basemap-measure__tab--active' : 'basemap-measure__tab'}
                    onClick={() => onModeChange('distance')}
                >
                    Khoang cach
                </button>
                <button
                    type="button"
                    className={mode === 'area' ? 'basemap-measure__tab basemap-measure__tab--active' : 'basemap-measure__tab'}
                    onClick={() => onModeChange('area')}
                >
                    Dien tich
                </button>
            </div>

            <output className="basemap-measure__value" aria-live="polite">
                {mode === 'area' ? formatArea(value) : formatDistance(value)}
            </output>

            <p className="basemap-measure__hint">Click de them diem, chuot phai hoac ESC de xoa</p>

            <div className="basemap-measure__actions">
                <button type="button" className="basemap-measure__action" onClick={reset}>
                    Xoa
                </button>
                <button type="button" className="basemap-measure__action" onClick={onClose}>
                    Dong
                </button>
            </div>
        </div>
    );
}
