import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createPublicStreetViewUrl,
    moveStreetViewPoint,
    normalizeStreetViewViewpoint,
    parseStreetViewViewpoint,
    type StreetViewViewpoint,
} from './basemapPreview/streetView';
import {
    listenPreviewStreetViewInit,
    sendPreviewStreetViewSync,
} from './basemapPreview/previewBridge';

const GOOGLE_MAPS_API_KEY = typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string'
    ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim()
    : '';

export function StreetViewPreviewApp() {
    const [viewpoint, setViewpoint] = useState<StreetViewViewpoint>(() => {
        return parseStreetViewViewpoint(window.location.search, [106.1, 16.2]);
    });
    const [mode, setMode] = useState<'loading' | 'api' | 'public'>('loading');
    const [error, setError] = useState<string | null>(null);
    const panoramaRef = useRef<GoogleStreetViewPanorama | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const sync = useCallback((next: StreetViewViewpoint, status: 'ready' | 'state' = 'state') => {
        const normalized = normalizeStreetViewViewpoint(next);
        setViewpoint(normalized);
        void sendPreviewStreetViewSync({ status, viewpoint: normalized });
    }, []);

    useEffect(() => {
        let active = true;
        let stop: (() => void) | undefined;
        void listenPreviewStreetViewInit(next => {
            if (!active) return;
            const normalized = normalizeStreetViewViewpoint(next);
            setViewpoint(normalized);
            const panorama = panoramaRef.current;
            if (panorama) {
                panorama.setPosition({ lat: normalized.point[1], lng: normalized.point[0] });
                panorama.setPov({ heading: normalized.heading, pitch: normalized.pitch });
                panorama.setZoom(fovToZoom(normalized.fov));
            }
        }).then(unlisten => { stop = unlisten; });
        const messageHandler = (event: MessageEvent<unknown>) => {
            if (!isRecord(event.data) || event.data.type !== 'preview-streetview-init') return;
            const next = event.data.viewpoint;
            if (!isRecord(next) || !Array.isArray(next.point)) return;
            const point = next.point;
            if (typeof point[0] !== 'number' || typeof point[1] !== 'number') return;
            const normalized = normalizeStreetViewViewpoint({
                point: [point[0], point[1]],
                heading: typeof next.heading === 'number' ? next.heading : 0,
                pitch: typeof next.pitch === 'number' ? next.pitch : 0,
                fov: typeof next.fov === 'number' ? next.fov : 90,
            });
            setViewpoint(normalized);
        };
        window.addEventListener('message', messageHandler);
        void sendPreviewStreetViewSync({ status: 'ready', viewpoint });
        return () => {
            active = false;
            stop?.();
            window.removeEventListener('message', messageHandler);
            void sendPreviewStreetViewSync({ status: 'closed' });
        };
    }, []);

    useEffect(() => {
        if (!GOOGLE_MAPS_API_KEY || !containerRef.current) {
            setMode('public');
            setError('Chưa cấu hình VITE_GOOGLE_MAPS_API_KEY; public embed chỉ xem được, đồng bộ liên tục cần Google Maps JS API.');
            return undefined;
        }
        let active = true;
        void loadGoogleMaps(GOOGLE_MAPS_API_KEY).then(() => {
            if (!active || !containerRef.current) return;
            const googleMaps = (window as WindowWithGoogle).google;
            if (!googleMaps?.maps?.StreetViewPanorama) throw new Error('Google Street View SDK không khả dụng');
            const panorama = new googleMaps.maps.StreetViewPanorama(containerRef.current, {
                position: { lat: viewpoint.point[1], lng: viewpoint.point[0] },
                pov: { heading: viewpoint.heading, pitch: viewpoint.pitch },
                zoom: fovToZoom(viewpoint.fov),
                visible: true,
                addressControl: true,
                linksControl: true,
                panControl: true,
                zoomControl: true,
                clickToGo: true,
                showRoadLabels: true,
            });
            panoramaRef.current = panorama;
            const publish = () => {
                const position = panorama.getPosition();
                if (!position) return;
                const pov = panorama.getPov();
                sync({
                    point: [position.lng(), position.lat()],
                    heading: pov.heading,
                    pitch: pov.pitch,
                    fov: zoomToFov(panorama.getZoom()),
                });
            };
            panorama.addListener('position_changed', publish);
            panorama.addListener('pov_changed', publish);
            panorama.addListener('zoom_changed', publish);
            setMode('api');
            void sendPreviewStreetViewSync({ status: 'ready', viewpoint });
        }).catch(reason => {
            if (!active) return;
            setError(reason instanceof Error ? reason.message : String(reason));
            setMode('public');
            void sendPreviewStreetViewSync({ status: 'error', message: `Street View SDK: ${String(reason)}` });
        });
        return () => { active = false; };
    }, [sync]);

    const publicUrl = useMemo(() => createPublicStreetViewUrl(viewpoint), [viewpoint]);
    const updateViewpoint = useCallback((changes: Partial<StreetViewViewpoint>) => {
        const next = normalizeStreetViewViewpoint({ ...viewpoint, ...changes, point: changes.point ?? viewpoint.point });
        const panorama = panoramaRef.current;
        if (panorama) {
            panorama.setPosition({ lat: next.point[1], lng: next.point[0] });
            panorama.setPov({ heading: next.heading, pitch: next.pitch });
            panorama.setZoom(fovToZoom(next.fov));
        }
        sync(next);
    }, [sync, viewpoint]);
    const move = useCallback((distanceMeters: number) => updateViewpoint(moveStreetViewPoint(viewpoint, distanceMeters)), [updateViewpoint, viewpoint]);

    return (
        <main className="street-view-shell">
            <header className="street-view-toolbar">
                <div>
                    <p className="eyebrow">GOOGLE STREET VIEW</p>
                    <h1>Street View</h1>
                </div>
                <div className="street-view-status" role="status">
                    {mode === 'api' ? 'Đồng bộ trực tiếp' : mode === 'public' ? 'Google public' : 'Đang tải'}
                </div>
            </header>
            <section className="street-view-content">
                {mode !== 'public' ? <div ref={containerRef} className="street-view-panorama" /> : (
                    <iframe src={publicUrl} title="Google Street View public" className="street-view-panorama" allowFullScreen />
                )}
                {mode === 'loading' && <div className="street-view-loading">Đang khởi tạo Street View…</div>}
                <div className="street-view-fallback-controls" aria-label="Điều khiển đồng bộ Street View">
                    <button type="button" onClick={() => updateViewpoint({ heading: viewpoint.heading - 15 })}>↶ 15°</button>
                    <button type="button" onClick={() => updateViewpoint({ heading: viewpoint.heading + 15 })}>↷ 15°</button>
                    <button type="button" onClick={() => move(12)}>Tiến</button>
                    <button type="button" onClick={() => move(-12)}>Lùi</button>
                    <label>FOV <input type="range" min="30" max="120" value={viewpoint.fov} onChange={event => updateViewpoint({ fov: Number(event.target.value) })} /></label>
                </div>
                {error && <p className="street-view-error" role="alert">{error} — đang dùng public embed; các nút đồng bộ vẫn cập nhật Pegman.</p>}
            </section>
        </main>
    );
}

interface GoogleStreetViewPanorama {
    getPosition(): { lat(): number; lng(): number } | null;
    getPov(): { heading: number; pitch: number };
    getZoom(): number;
    setPosition(position: { lat: number; lng: number }): void;
    setPov(pov: { heading: number; pitch: number }): void;
    setZoom(zoom: number): void;
    addListener(event: string, handler: () => void): void;
}

interface WindowWithGoogle extends Window {
    google?: { maps?: { StreetViewPanorama: new (container: HTMLElement, options: Record<string, unknown>) => GoogleStreetViewPanorama } };
}

function loadGoogleMaps(apiKey: string): Promise<void> {
    if ((window as WindowWithGoogle).google?.maps?.StreetViewPanorama) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const callbackName = '__vietnamBasemapPreviewGoogleMapsLoaded';
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&language=vi`;
        script.async = true;
        script.defer = true;
        (window as unknown as Record<string, unknown>)[callbackName] = resolve;
        script.onerror = () => reject(new Error('Không tải được Google Street View SDK'));
        document.head.appendChild(script);
    });
}

function fovToZoom(fov: number): number { return Math.max(0, Math.log2(180 / fov)); }
function zoomToFov(zoom: number): number { return Math.min(120, Math.max(30, 180 / (2 ** zoom))); }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
