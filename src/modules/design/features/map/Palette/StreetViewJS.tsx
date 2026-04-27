import React, { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { initGoogleMaps, waitForGoogleMaps } from '@TOOL/utils/googleMapsLoader';

declare var google: any; // Global Google Maps namespace populated by loader script

interface StreetViewJSProps {
    lat: number;
    lng: number;
    heading: number;
    fov: number;
    pitch?: number;
    apiKey: string;
}

export const StreetViewJS: React.FC<StreetViewJSProps> = ({
    lat,
    lng,
    heading,
    fov,
    pitch = 0,
    apiKey
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const panoramaRef = useRef<any>(null);
    const initialHeadingRef = useRef<number>(heading); // 🔒 Store starting heading
    const isExternalUpdate = useRef(false); // 🛡️ Infinite Loop Guard
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const trimmedApiKey = apiKey.trim();

    // 🕵️ Stealth Mode: Hide Watermarks aggressively
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            .gm-style iframe + div { display: none !important; } 
            .gm-style-cc { display: none !important; }
            .gmnoprint { display: none !important; }
            .gm-err-container { display: none !important; }
            /* Hide the "For development purposes only" glass pane */
            .gm-style > div:first-child > div:nth-child(2) { pointer-events: none !important; display: none !important; }
        `;
        document.head.appendChild(style);

        const observer = new MutationObserver(() => {
            const overlays = document.querySelectorAll('.gm-style > div:first-child > div:nth-child(2)');
            overlays.forEach(el => {
                (el as HTMLElement).style.display = 'none';
                (el as HTMLElement).style.pointerEvents = 'none';
            });
            // Hide "Report a problem" and terms
            document.querySelectorAll('.gm-style-cc').forEach(el => (el as HTMLElement).style.display = 'none');
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            if (document.head.contains(style)) document.head.removeChild(style);
            observer.disconnect();
        };
    }, []);

    // 📍 Smart Snapping Logic
    const findNearestPano = async (lat: number, lng: number): Promise<{ lat: number, lng: number } | null> => {
        return new Promise((resolve) => {
            if (typeof google === 'undefined') return resolve(null);
            const service = new google.maps.StreetViewService();
            service.getPanorama({
                location: { lat, lng },
                radius: 100, // 100m radius
                source: google.maps.StreetViewSource.OUTDOOR
            }, (data: any, status: string) => {
                if (status === google.maps.StreetViewStatus.OK && data.location) {
                    resolve({
                        lat: data.location.latLng.lat(),
                        lng: data.location.latLng.lng()
                    });
                } else {
                    resolve(null);
                }
            });
        });
    };

    // Main initialization effect - runs once
    useEffect(() => {
        let disposed = false;
        const windowWithGoogle = window as Window & { gm_authFailure?: () => void };

        windowWithGoogle.gm_authFailure = () => {
            if (disposed) return;
            setError('Google Maps Auth Failed. Vui lòng kiểm tra Billing.');
        };

        if (!trimmedApiKey) {
            setError('Missing API Configuration.');
            return;
        }

        const initPanorama = async () => {
            try {
                const ok = initGoogleMaps(trimmedApiKey);
                if (!ok) {
                    setError('SDK Initialization Failed.');
                    return;
                }

                await waitForGoogleMaps();
                if (disposed || !containerRef.current) return;

                const nearest = await findNearestPano(lat, lng);
                const finalPos = nearest || { lat, lng };

                const g = (window as any).google;
                if (!g?.maps) throw new Error('Maps SDK not found');

                // Create panorama
                const panorama = new g.maps.StreetViewPanorama(containerRef.current, {
                    position: finalPos,
                    pov: { heading, pitch },
                    zoom: 1,
                    addressControl: false,
                    linksControl: true,
                    panControl: true,
                    enableCloseButton: false,
                    showRoadLabels: true,
                    clickToGo: true
                });

                panoramaRef.current = panorama;
                initialHeadingRef.current = heading; // Set the baseline for 180° rotation

                const updateBrowserUrl = (l: number, g: number, h: number, f: number) => {
                    const cleanLat = l.toFixed(7);
                    const cleanLng = g.toFixed(7);
                    const cleanHeading = h.toFixed(1);
                    const cleanFov = f.toFixed(1);
                    const newPath = `/@${cleanLat},${cleanLng},${cleanFov}y,${cleanHeading}t`;
                    window.history.replaceState(null, '', newPath);
                };

                // Helper to normalize heading to 0-360
                const normalizeHeading = (h: number) => ((h % 360) + 360) % 360;

                // Helper to calculate shortest angular distance
                const getAngleDiff = (a: number, b: number) => {
                    let diff = a - b;
                    while (diff < -180) diff += 360;
                    while (diff > 180) diff -= 360;
                    return diff;
                };

                // 🔄 Sync Pegman Position (Map -> View)
                panorama.addListener('position_changed', () => {
                    if (isExternalUpdate.current) return;

                    const pos = panorama.getPosition();
                    if (pos) {
                        const pLat = pos.lat();
                        const pLng = pos.lng();
                        const pPov = panorama.getPov();
                        const pFov = 180 / Math.pow(2, panorama.getZoom() || 1);

                        updateBrowserUrl(pLat, pLng, pPov.heading, pFov);

                        emit('pano-changed', {
                            pano: panorama.getPano(),
                            lat: pLat,
                            lng: pLng
                        });
                    }
                });

                // 🔄 Sync POV (View -> Map) + 🔒 Rotation Lock (180 deg) + 🔒 Pitch Lock (0 deg)
                panorama.addListener('pov_changed', () => {
                    if (isExternalUpdate.current) return;

                    const pPov = panorama.getPov();
                    const currentHeading = pPov.heading;
                    const currentPitch = pPov.pitch;

                    // 🔒 Rotation Lock: Limit to ±90° from starting position
                    const angleDiff = getAngleDiff(currentHeading, initialHeadingRef.current);
                    let constrainedHeading = currentHeading;

                    if (Math.abs(angleDiff) > 90) {
                        constrainedHeading = normalizeHeading(initialHeadingRef.current + (angleDiff > 0 ? 90 : -90));
                    }

                    // 🔒 Pitch Lock: Always 0° (Horizon)
                    if (constrainedHeading !== currentHeading || currentPitch !== 0) {
                        panorama.setPov({
                            heading: constrainedHeading,
                            pitch: 0,
                            zoom: panorama.getZoom()
                        });
                        return;
                    }

                    const pos = panorama.getPosition();
                    const pFov = 180 / Math.pow(2, panorama.getZoom() || 1);

                    if (pos) {
                        updateBrowserUrl(pos.lat(), pos.lng(), constrainedHeading, pFov);
                    }

                    emit('pov-changed', {
                        heading: constrainedHeading,
                        pitch: 0,
                        zoom: panorama.getZoom()
                    });
                });

                panorama.addListener('status_changed', () => {
                    const s = panorama.getStatus();
                    if (s !== 'OK' && s !== 'INITIALIZING') {
                        setError('Street View data is not available for this precise location.');
                    } else if (s === 'OK') {
                        setError(null);
                        emit('panorama-ready');
                    }
                });

                const initialZoom = Math.max(0, Math.log2(180 / Math.max(1, fov)));
                panorama.setZoom(initialZoom);

                // Auto-dismiss development-only warning
                setTimeout(() => {
                    if (disposed) return;
                    const dismissBtn = document.querySelector('.dismissButton') as HTMLElement;
                    if (dismissBtn) dismissBtn.click();
                }, 1000);

            } catch (sdkError: unknown) {
                console.error('[StreetViewJS] Initialization error:', sdkError);
                setError('Failed to load Map system. Please check your internet connection and API configuration.');
            } finally {
                setLoading(false);
            }
        };

        initPanorama();

        return () => {
            disposed = true;
            if (panoramaRef.current) {
                const gMaps = (window as any).google?.maps;
                if (gMaps) gMaps.event.clearInstanceListeners(panoramaRef.current);
                panoramaRef.current = null;
            }
            windowWithGoogle.gm_authFailure = undefined;
        };
    }, [trimmedApiKey]);

    // Reactive position/POV updates with snapping & Loop Protection
    useEffect(() => {
        if (!panoramaRef.current) return;

        const updatePos = async () => {
            isExternalUpdate.current = true; // 🛡️ Start Guard

            try {
                const currentPos = panoramaRef.current.getPosition();
                const dist = google.maps.geometry.spherical.computeDistanceBetween(
                    currentPos,
                    new google.maps.LatLng(lat, lng)
                );

                if (dist > 5) {
                    const nearest = await findNearestPano(lat, lng);
                    panoramaRef.current.setPosition(nearest || { lat, lng });
                }

                panoramaRef.current.setPov({ heading, pitch: 0 }); // 🛡️ Force Horizontal Lock
                const zoom = Math.max(0, Math.log2(180 / Math.max(1, fov)));
                panoramaRef.current.setZoom(zoom);
            } finally {
                // Ensure guard is released after a short delay to allow SDK events to clear
                setTimeout(() => {
                    isExternalUpdate.current = false;
                }, 100);
            }
        };

        updatePos();
    }, [lat, lng, heading, fov]); // Removed pitch dependency

    const handleClose = () => {
        import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
            getCurrentWebviewWindow()?.close();
        });
    };

    return (
        <div className="street-view-container-premium bg-[#16171B]">
            {/* Custom Header for Dragging & Close */}
            <div
                data-tauri-drag-region
                className="absolute top-0 left-0 right-0 h-10 z-[1000] cursor-move active:cursor-grabbing flex justify-between items-center px-4"
            >
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pointer-events-none">
                    Street View 180° Perspective
                </div>

                <button
                    onClick={handleClose}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/80 text-red-500 hover:text-white transition-all group scale-75"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div
                ref={containerRef}
                className="street-view-panorama-premium streetview-canvas w-full h-full"
            />

            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16171B] z-50">
                    <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16171B]/95 text-white p-8 z-[9999]">
                    <div className="w-12 h-12 mb-4 text-red-500/50">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="text-sm font-medium text-center text-gray-400 mb-6">{error}</div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-xs font-bold transition-all uppercase tracking-widest shadow-lg active:scale-95"
                    >
                        Thử lại
                    </button>
                </div>
            )}
            {/* Perspective Shield Indicator */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/5 text-[9px] text-gray-400 font-medium tracking-[0.2em] uppercase pointer-events-none z-50 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                180° Horizontal Lock Active
            </div>
        </div>
    );
};
