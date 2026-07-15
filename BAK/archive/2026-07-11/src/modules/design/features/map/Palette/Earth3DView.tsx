import React, { useEffect, useRef, useState, useCallback } from 'react';
import { initGoogleMaps, waitForGoogleMaps } from '@TOOL/utils/googleMapsLoader';

interface Earth3DViewProps {
    lat: number;
    lng: number;
    heading: number;
    tilt?: number;
    zoom?: number;
    apiKey: string;
}

// Removed: loaderInitialized flag - now handled by centralized loader

/**
 * Earth3DView Component (V8 Final - Robust & Embed Fallback)
 * 
 * Includes:
 * 1. Robust SDK initialization with stale closure fix.
 * 2. Authenticated Embed API fallback for reliability.
 * 3. Diagnostic checklist for API configuration issues.
 */
export const Earth3DView: React.FC<Earth3DViewProps> = ({
    lat,
    lng,
    heading,
    tilt = 45,
    zoom = 19,
    apiKey
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<any>(null);
    const [status, setStatus] = useState<'loading' | 'initializing' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [useEmbed, setUseEmbed] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    // Global Auth Failure Handler
    useEffect(() => {
        (window as any).gm_authFailure = () => {
            console.error("[Earth3D] Auth failure detected.");
            setErrorMsg("Lỗi xác thực API Key. Bạn có thể cần bật Maps JS API hoặc Billing.");
            setStatus('error');
        };
        return () => {
            (window as any).gm_authFailure = undefined;
        };
    }, []);

    const initMap = useCallback(async () => {
        if (!mapRef.current || useEmbed) return;

        try {
            console.log("[Earth3D] Starting SDK V8 init...");
            setStatus('loading');
            setErrorMsg(null);

            // Use centralized loader to ensure API key is always present
            const ok = initGoogleMaps(apiKey);
            if (!ok) {
                setErrorMsg('API Key không hợp lệ. Kiểm tra .env');
                setStatus('error');
                return;
            }
            await waitForGoogleMaps();

            const google = (window as any).google;
            const { Map } = google.maps;
            setStatus('initializing');

            const mapOptions = {
                center: { lat: Number(lat), lng: Number(lng) },
                zoom: Number(zoom),
                heading: Number(heading),
                tilt: Math.min(45, Number(tilt)),
                mapTypeId: 'satellite',
                disableDefaultUI: true,
                gestureHandling: 'greedy',
                renderingType: 'raster',
                backgroundColor: '#050505'
            };

            googleMapRef.current = new Map(mapRef.current, mapOptions);

            googleMapRef.current.addListener('tilesloaded', () => {
                setStatus('ready');
            });

            // If we are still initializing after 5s, assume tile fetch failed
            setTimeout(() => {
                setStatus(current => {
                    if (current === 'initializing') {
                        // We don't force 'ready' anymore if we want to show a warning, 
                        // but for UX we show the map and allow switching to Embed.
                        return 'ready';
                    }
                    return current;
                });
            }, 5000);

        } catch (e: any) {
            setErrorMsg(e?.message || String(e));
            setStatus('error');
        }
    }, [apiKey, lat, lng, useEmbed]);

    useEffect(() => {
        initMap();
    }, [initMap]);

    // Reactive orientation/location updates
    useEffect(() => {
        if (googleMapRef.current && status === 'ready' && !useEmbed) {
            try {
                googleMapRef.current.setCenter({ lat: Number(lat), lng: Number(lng) });
                googleMapRef.current.setHeading(Number(heading));
                googleMapRef.current.setTilt(Math.min(45, Number(tilt)));
                googleMapRef.current.setZoom(Number(zoom));
            } catch (err) {
                console.warn("[Earth3D] Update failed:", err);
            }
        }
    }, [lat, lng, heading, tilt, zoom, status, useEmbed]);

    // Construct Embed URL
    const embedUrl = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${lat},${lng}&zoom=${zoom}&maptype=satellite`;

    if (useEmbed) {
        return (
            <div className="relative w-full h-full bg-[#050505] rounded-md overflow-hidden border border-white/10">
                <iframe
                    title="Google Maps Embed"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={embedUrl}
                    allowFullScreen
                />
                <button
                    onClick={() => setUseEmbed(false)}
                    className="absolute top-2 left-2 px-2 py-1 bg-black/60 hover:bg-black/80 text-[8px] text-white/70 rounded border border-white/10 uppercase font-bold backdrop-blur-sm"
                >
                    Quay lại mô phỏng
                </button>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-[#050505] overflow-hidden rounded-md border border-white/5 group">
            <div ref={mapRef} className="w-full h-full" />

            {status !== 'ready' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050505]/95 backdrop-blur-sm z-20 p-6 text-center">
                    <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Nạp bản đồ 3D...</div>
                </div>
            )}

            {/* Diagnostic Overlay / Fallback Trigger */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 group-hover:bg-black/5 transition-all">
                {/* If map is visible but might be black, provide the "Embed" toggle as a floating action */}
                <div className="absolute bottom-10 flex flex-col items-center gap-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => setUseEmbed(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-full shadow-lg border border-blue-400/30 uppercase transition-all"
                    >
                        Hiện không xem được? Dùng Chế độ Tin cậy (2D)
                    </button>
                    <button
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                        className="text-[9px] text-white/40 hover:text-white/60 underline decoration-white/20"
                    >
                        Tại sao màn hình bị đen?
                    </button>
                </div>
            </div>

            {/* Diagnostic Panel */}
            {showDiagnostics && (
                <div className="absolute inset-0 bg-black/95 z-30 p-4 overflow-y-auto pointer-events-auto">
                    <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                        <span className="text-white font-bold text-[10px] uppercase tracking-wider text-orange-400">📋 Chẩn đoán lỗi Map SDK</span>
                        <button onClick={() => setShowDiagnostics(false)} className="text-white/50 hover:text-white">✕</button>
                    </div>

                    <div className="space-y-4 text-left">
                        <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                            <p className="text-[10px] text-white/90 mb-1 font-bold">Nếu bạn thấy màn hình đen, hãy kiểm tra:</p>
                            <ul className="text-[9px] text-white/60 list-disc ml-4 space-y-1">
                                <li><strong>Bật Services</strong>: Truy cập Google Cloud Console và chắc chắn đã bật <span className="text-white/80 italic">"Maps JavaScript API"</span>.</li>
                                <li><strong>Kích hoạt Billing</strong>: Google yêu cầu tài khoản phải có thẻ tín dụng (cho dù dùng miễn phí).</li>
                                <li><strong>Cấp quyền Domain</strong>: Thêm <code className="bg-white/5 px-1 rounded text-orange-300">tauri:/localhost</code> vào danh sách "Website restrictions" của API Key.</li>
                            </ul>
                        </div>

                        {errorMsg && (
                            <div className="p-2 mt-2 bg-red-900/20 border border-red-500/30 rounded text-[8px] text-red-400 font-mono break-words">
                                ERROR: {errorMsg}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => { setUseEmbed(true); setShowDiagnostics(false); }}
                                className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded text-[9px] font-bold uppercase"
                            >
                                Bỏ qua lỗi và dùng Iframe Embed (Khuyên dùng)
                            </button>
                            <a
                                href="https://console.cloud.google.com/google/maps-apis/overview"
                                target="_blank"
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded text-[9px] font-bold uppercase text-center"
                            >
                                Mở Trang quản trị Google Cloud ↗
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
