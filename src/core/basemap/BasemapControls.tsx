import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASEMAP_PRESETS } from './presets';
import { useBasemap } from './BasemapContext';
import { MeasurePanel, type MeasureMode } from './BasemapMeasure';
import { useBasemapCamera, useBasemapPreset } from './useBasemapState';
import type { BasemapPresetId } from './types';
import './BasemapControls.css';

/**
 * Native basemap controls: zoom, locate, layer switcher, measuring tape, scale bar.
 *
 * These belong to the basemap, not to any project feature — they render as soon
 * as the app opens, before a project exists, and keep working on every tab. They
 * drive the map exclusively through `BasemapController`, never by reaching for
 * the raw maplibre instance.
 *
 * Deliberately dependency-free: no icon library, no design-module imports, no
 * store. `basemapBoundary.test.ts` enforces that, and it also means the controls
 * cannot break when the design module changes. Icons are inline SVG.
 */

const LOCATE_TIMEOUT_MS = 8000;

type GeolocateStatus = 'idle' | 'locating' | 'denied' | 'unavailable';

function IconPlus() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 3.5v9M3.5 8h9" />
        </svg>
    );
}

function IconMinus() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3.5 8h9" />
        </svg>
    );
}

function IconCrosshair() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="3.25" />
            <path d="M8 1v2.25M8 12.75V15M1 8h2.25M12.75 8H15" />
        </svg>
    );
}

function IconLayers() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 1.75 1.75 5 8 8.25 14.25 5 8 1.75Z" />
            <path d="m1.75 8.5 6.25 3.25 6.25-3.25" />
        </svg>
    );
}

function IconCompass() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.25" />
            <path d="m10.5 5.5-3.25 1.75L5.5 10.5l3.25-1.75L10.5 5.5Z" />
        </svg>
    );
}

function IconRuler() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M1.75 9.5 9.5 1.75l4.75 4.75L6.5 14.25 1.75 9.5Z" />
            <path d="m5.25 6 1.5 1.5M7.5 3.75 9 5.25M8.5 8.75 10 10.25" />
        </svg>
    );
}

/**
 * Metric scale bar.
 *
 * Picks a "nice" round distance (1/2/5 × 10^n) that fits within ~110px at the
 * current latitude and zoom, then sizes the bar to match. The latitude term
 * matters: Web Mercator metres-per-pixel varies with cos(latitude), so a bar
 * computed for the equator would read ~35% short in northern Vietnam.
 */
function ScaleBar() {
    const camera = useBasemapCamera();

    const scale = useMemo(() => {
        if (!camera) return null;
        const [, latitude] = camera.center;
        const metresPerPixel =
            (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, camera.zoom);
        if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;

        const maxWidthPx = 110;
        const maxMetres = metresPerPixel * maxWidthPx;
        const exponent = Math.floor(Math.log10(maxMetres));
        const magnitude = Math.pow(10, exponent);
        const candidates = [5, 2, 1];
        const niceMetres =
            candidates.map(c => c * magnitude).find(value => value <= maxMetres) ?? magnitude;

        return {
            widthPx: Math.round(niceMetres / metresPerPixel),
            label: niceMetres >= 1000 ? `${niceMetres / 1000} km` : `${niceMetres} m`,
        };
    }, [camera]);

    if (!scale || scale.widthPx < 20) return null;

    return (
        <div className="basemap-scale" aria-label={`Ty le ban do: ${scale.label}`}>
            <span className="basemap-scale__label">{scale.label}</span>
            <span className="basemap-scale__bar" style={{ width: scale.widthPx }} />
        </div>
    );
}

function LayerSwitcher({
    presetId,
    onSelect,
}: {
    presetId: BasemapPresetId;
    onSelect: (id: BasemapPresetId) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const active = BASEMAP_PRESETS.find(preset => preset.id === presetId);

    return (
        <div className="basemap-layers" ref={rootRef}>
            <button
                type="button"
                className="basemap-button basemap-layers__trigger"
                aria-expanded={open}
                aria-haspopup="menu"
                title={`Lop ban do: ${active?.label ?? presetId}`}
                onClick={() => setOpen(value => !value)}
            >
                <IconLayers />
            </button>

            {open && (
                <div className="basemap-layers__menu" role="menu">
                    {BASEMAP_PRESETS.map(preset => (
                        <button
                            key={preset.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={preset.id === presetId}
                            className={
                                preset.id === presetId
                                    ? 'basemap-layers__item basemap-layers__item--active'
                                    : 'basemap-layers__item'
                            }
                            onClick={() => {
                                onSelect(preset.id);
                                setOpen(false);
                            }}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function BasemapControls() {
    const { controller } = useBasemap();
    const { presetId, setPreset } = useBasemapPreset();
    const camera = useBasemapCamera();
    const [geolocate, setGeolocate] = useState<GeolocateStatus>('idle');
    const [measuring, setMeasuring] = useState(false);
    const [measureMode, setMeasureMode] = useState<MeasureMode>('distance');

    const handleLocate = useCallback(() => {
        if (!navigator.geolocation) {
            setGeolocate('unavailable');
            return;
        }
        setGeolocate('locating');
        navigator.geolocation.getCurrentPosition(
            position => {
                setGeolocate('idle');
                controller?.setCamera(
                    {
                        center: [position.coords.longitude, position.coords.latitude],
                        zoom: 16,
                    },
                    { animate: true, duration: 600 }
                );
            },
            error => {
                setGeolocate(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
            },
            { enableHighAccuracy: true, timeout: LOCATE_TIMEOUT_MS }
        );
    }, [controller]);

    const bearing = camera?.bearing ?? 0;
    const isRotated = Math.abs(bearing) > 0.5;

    const locateTitle =
        geolocate === 'denied'
            ? 'Khong co quyen truy cap vi tri'
            : geolocate === 'unavailable'
              ? 'Khong xac dinh duoc vi tri'
              : 'Ve vi tri hien tai';

    return (
        <div className="basemap-controls" data-basemap-controls="core">
            <div className="basemap-controls__group">
                <button
                    type="button"
                    className="basemap-button"
                    title="Phong to"
                    onClick={() => controller?.zoomBy(1)}
                >
                    <IconPlus />
                </button>
                <button
                    type="button"
                    className="basemap-button"
                    title="Thu nho"
                    onClick={() => controller?.zoomBy(-1)}
                >
                    <IconMinus />
                </button>
            </div>

            {isRotated && (
                <div className="basemap-controls__group">
                    <button
                        type="button"
                        className="basemap-button"
                        title="Dat lai huong bac"
                        onClick={() => controller?.setCamera({ bearing: 0, pitch: 0 }, { animate: true, duration: 300 })}
                    >
                        <span
                            className="basemap-button__rotator"
                            style={{ transform: `rotate(${-bearing}deg)` }}
                        >
                            <IconCompass />
                        </span>
                    </button>
                </div>
            )}

            <div className="basemap-controls__group">
                <button
                    type="button"
                    className={
                        geolocate === 'locating' ? 'basemap-button basemap-button--busy' : 'basemap-button'
                    }
                    title={locateTitle}
                    aria-busy={geolocate === 'locating'}
                    disabled={geolocate === 'locating'}
                    onClick={handleLocate}
                >
                    <IconCrosshair />
                </button>
            </div>

            <div className="basemap-controls__group">
                <LayerSwitcher presetId={presetId} onSelect={id => setPreset(id)} />
            </div>

            <div className="basemap-controls__group">
                <button
                    type="button"
                    className={
                        measuring ? 'basemap-button basemap-button--active' : 'basemap-button'
                    }
                    title="Thuoc do"
                    aria-pressed={measuring}
                    onClick={() => setMeasuring(value => !value)}
                >
                    <IconRuler />
                </button>
            </div>

            {measuring && (
                <MeasurePanel
                    mode={measureMode}
                    onModeChange={setMeasureMode}
                    onClose={() => setMeasuring(false)}
                />
            )}

            <ScaleBar />
        </div>
    );
}
