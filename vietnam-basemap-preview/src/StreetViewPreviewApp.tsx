import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createPublicStreetViewUrl,
    normalizeStreetViewViewpoint,
    parseStreetViewViewpoint,
    type StreetViewViewpoint,
} from './basemapPreview/streetView';
import {
    closePreviewStreetViewWindow,
    listenPreviewStreetViewInit,
    sendPreviewStreetViewSync,
} from './basemapPreview/previewBridge';

const DEFAULT_CENTER_POINT: [number, number] = [105.8542, 21.0285]; // Center Hanoi

export function StreetViewPreviewApp() {
    const [viewpoint, setViewpoint] = useState<StreetViewViewpoint>(() => {
        return parseStreetViewViewpoint(window.location.search, DEFAULT_CENTER_POINT);
    });
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<number | null>(null);

    // Auto-hide floating badge on mouse idle
    const handleMouseMove = useCallback(() => {
        setIsIdle(false);
        if (idleTimerRef.current !== null) {
            window.clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
        }, 2500);
    }, []);

    const handleClose = useCallback(() => {
        void closePreviewStreetViewWindow();
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose]);

    useEffect(() => {
        let active = true;
        let stop: (() => void) | undefined;

        void listenPreviewStreetViewInit(next => {
            if (!active) return;
            const normalized = normalizeStreetViewViewpoint(next);
            setViewpoint(normalized);
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

        const handleUnload = () => {
            void sendPreviewStreetViewSync({ status: 'closed' });
        };

        window.addEventListener('message', messageHandler);
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
        void sendPreviewStreetViewSync({ status: 'ready', viewpoint });

        return () => {
            active = false;
            stop?.();
            window.removeEventListener('message', messageHandler);
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('pagehide', handleUnload);
            if (idleTimerRef.current !== null) {
                window.clearTimeout(idleTimerRef.current);
            }
            void sendPreviewStreetViewSync({ status: 'closed' });
        };
    }, []);

    const publicUrl = useMemo(() => createPublicStreetViewUrl(viewpoint), [viewpoint]);

    const hasValidPoint = Boolean(
        viewpoint.point &&
        Array.isArray(viewpoint.point) &&
        typeof viewpoint.point[0] === 'number' &&
        typeof viewpoint.point[1] === 'number' &&
        !isNaN(viewpoint.point[0]) &&
        !isNaN(viewpoint.point[1])
    );

    const resetToDefaultPoint = useCallback(() => {
        const next = normalizeStreetViewViewpoint({
            point: DEFAULT_CENTER_POINT,
            heading: 0,
            pitch: 0,
            fov: 90,
        });
        setViewpoint(next);
        void sendPreviewStreetViewSync({ status: 'state', viewpoint: next });
    }, []);

    return (
        <main
            className="street-view-shell full-bleed"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseMove}
        >
            {/* Floating Glassmorphism Badge with Close Button */}
            <div className={`street-view-floating-badge ${isIdle ? 'idle' : ''}`} role="status">
                <span className="badge-dot" />
                <span className="badge-title">Google Street View</span>
                <span className="badge-coords">
                    {viewpoint.point[1].toFixed(5)}°, {viewpoint.point[0].toFixed(5)}°
                </span>
                <button
                    type="button"
                    className="badge-close-btn"
                    onClick={handleClose}
                    title="Đóng cửa sổ Street View (Phím Esc)"
                    aria-label="Đóng cửa sổ Street View"
                >
                    ✕
                </button>
            </div>

            {/* 100% Full-bleed Google Street View Public Iframe */}
            {hasValidPoint ? (
                <iframe
                    src={publicUrl}
                    title="Google Street View Public Embed"
                    className="street-view-panorama full-bleed-iframe"
                    allowFullScreen
                    loading="eager"
                />
            ) : (
                <div className="street-view-empty-state">
                    <div className="empty-state-card">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                            <circle cx="12" cy="9" r="2.5" />
                        </svg>
                        <h2>Chưa chọn tọa độ Street View</h2>
                        <p>Kéo biểu tượng người vàng (Pegman) trên bản đồ chính hoặc chọn vị trí mặc định để xem ảnh Street View.</p>
                        <div className="empty-state-actions">
                            <button type="button" className="empty-state-btn" onClick={resetToDefaultPoint}>
                                Về vị trí mặc định (Hà Nội)
                            </button>
                            <button type="button" className="empty-state-btn secondary" onClick={handleClose}>
                                Đóng cửa sổ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
