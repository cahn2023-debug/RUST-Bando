import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { initGoogleMaps, waitForGoogleMaps } from '@TOOL/utils/googleMapsLoader';
import { getStreetViewUrl } from '@TOOL/utils/cameraMath';

export interface StaticStreetViewPreviewProps {
    lat: number;
    lng: number;
    heading: number;
    fov: number;
    pitch?: number;
    apiKey: string;
    fallback: React.ReactNode;
}

/**
 * Resolves the nearest outdoor panorama coordinates within 200m radius using Google Maps StreetViewService.
 * If the JS SDK fails to load or check, it falls back to a direct Metadata API fetch.
 */
export async function resolveNearestStreetViewPano(
    lat: number,
    lng: number,
    apiKey: string
): Promise<{ lat: number; lng: number } | null> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey || trimmedKey === 'undefined') return null;

    try {
        // Try resolving via JS SDK first
        initGoogleMaps(trimmedKey);
        await waitForGoogleMaps();

        const g = (window as any).google;
        if (g?.maps) {
            return new Promise((resolve) => {
                const service = new g.maps.StreetViewService();
                service.getPanorama(
                    {
                        location: { lat, lng },
                        radius: 200,
                        source: g.maps.StreetViewSource.OUTDOOR
                    },
                    (data: any, status: string) => {
                        if (status === g.maps.StreetViewStatus.OK && data.location) {
                            resolve({
                                lat: data.location.latLng.lat(),
                                lng: data.location.latLng.lng()
                            });
                        } else {
                            resolve(null);
                        }
                    }
                );
            });
        }
    } catch (e) {
        console.warn('[resolveNearestStreetViewPano] JS SDK error, using fetch fallback:', e);
    }

    // Direct JSON API Fallback (useful in CI or if SDK script injection fails)
    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${trimmedKey}`
        );
        const data = await response.json();
        if (data.status === 'OK' && data.location) {
            return {
                lat: data.location.lat,
                lng: data.location.lng
            };
        }
    } catch (err) {
        console.error('[resolveNearestStreetViewPano] Metadata fetch fallback error:', err);
    }

    return null;
}

/**
 * Builds a signed static Google Street View URL using the Tauri 'sign_streetview_url' command.
 * Falls back to an unsigned URL if the Tauri invoke fails.
 */
export async function buildStaticStreetViewUrl({
    lat,
    lng,
    heading,
    fov,
    pitch = 0,
    apiKey
}: {
    lat: number;
    lng: number;
    heading: number;
    fov: number;
    pitch?: number;
    apiKey: string;
}): Promise<string> {
    const trimmedKey = apiKey.trim();
    const cleanFov = Math.max(10, Math.min(120, fov));
    const unsignedUrl = getStreetViewUrl(lat, lng, heading, cleanFov, pitch, trimmedKey);
    try {
        const signedUrl = await invoke<string>('sign_streetview_url', {
            urlToSign: unsignedUrl,
            secret: ''
        });
        return signedUrl;
    } catch (err) {
        console.warn('[buildStaticStreetViewUrl] Tauri sign_streetview_url failed, falling back to unsigned:', err);
        return unsignedUrl;
    }
}

export const StaticStreetViewPreview: React.FC<StaticStreetViewPreviewProps> = ({
    lat,
    lng,
    heading,
    fov,
    pitch = 0,
    apiKey,
    fallback
}) => {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [resolvedUrl, setResolvedUrl] = useState<string>('');
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        let active = true;
        setStatus('loading');
        setImageError(false);

        const loadPreview = async () => {
            if (isNaN(lat) || isNaN(lng) || !apiKey.trim() || apiKey === 'undefined') {
                if (active) setStatus('error');
                return;
            }

            // 1. Resolve nearest pano
            const nearest = await resolveNearestStreetViewPano(lat, lng, apiKey);
            if (!active) return;

            if (!nearest) {
                console.warn(`[StaticStreetViewPreview] No Street View coverage within 200m of ${lat}, ${lng}`);
                setStatus('error');
                return;
            }

            // 2. Build signed static image URL
            const url = await buildStaticStreetViewUrl({
                lat: nearest.lat,
                lng: nearest.lng,
                heading,
                fov,
                pitch,
                apiKey
            });
            if (!active) return;

            setResolvedUrl(url);
            setStatus('ready');
        };

        void loadPreview();

        return () => {
            active = false;
        };
    }, [lat, lng, heading, fov, pitch, apiKey]);

    if (status === 'error' || imageError) {
        return <>{fallback}</>;
    }

    return (
        <div className="relative w-full aspect-video rounded-lg bg-[#070b12] border border-white/10 overflow-hidden shadow-2xl select-none group">
            <img
                src={resolvedUrl}
                alt="Street View Preview"
                className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loading' || imageError ? 'opacity-0' : 'opacity-100'}`}
                onError={() => {
                    console.error('[StaticStreetViewPreview] Image failed to load, falling back to HUD.');
                    setImageError(true);
                }}
            />

            {status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <div className="mt-2 text-[9px] font-mono text-gray-500 uppercase tracking-widest">
                        Resolving Nearest Pano...
                    </div>
                </div>
            )}

            {status === 'ready' && !imageError && (
                <div className="absolute inset-0 pointer-events-none">
                    {/* High-Tech Security Camera HUD Overlay on Street View */}
                    <svg viewBox="0 0 320 180" className="absolute inset-0 w-full h-full overflow-visible">
                        {/* Center Target Reticle */}
                        <g stroke="#ec4899" strokeWidth="0.75" fill="none" opacity="0.85">
                            <circle cx="160" cy="90" r="10" />
                            <circle cx="160" cy="90" r="18" strokeDasharray="3, 3" />
                            <circle cx="160" cy="90" r="1" fill="#ec4899" />
                            <line x1="135" y1="90" x2="148" y2="90" />
                            <line x1="172" y1="90" x2="185" y2="90" />
                            <line x1="160" y1="65" x2="160" y2="78" />
                            <line x1="160" y1="102" x2="160" y2="115" />
                            <path d="M 135 75 L 135 70 L 140 70" />
                            <path d="M 185 75 L 185 70 L 180 70" />
                            <path d="M 135 105 L 135 110 L 140 110" />
                            <path d="M 185 105 L 185 110 L 180 110" />
                        </g>

                        <text x="192" y="94" fill="#ec4899" fontSize="6" fontFamily="monospace" fontWeight="bold" opacity="0.9">
                            FOV: {fov.toFixed(1)}°
                        </text>
                        <text x="192" y="101" fill="#ec4899" fontSize="5" fontFamily="monospace" opacity="0.7">
                            HDG: {Math.round(heading)}°
                        </text>

                        {/* Pulse targeting circle */}
                        <circle cx="160" cy="90" r="14" fill="none" stroke="#ec4899" strokeWidth="0.5" opacity="0.6">
                            <animate attributeName="r" values="10;25" dur="3s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8;0" dur="3s" repeatCount="indefinite" />
                        </circle>

                        {/* HUD Compass Dial (Top Left) */}
                        <g transform="translate(26, 26)">
                            <circle cx="0" cy="0" r="15" fill="#030712" stroke="#1f2937" strokeWidth="1" opacity="0.75" />
                            <text x="0" y="-9" fontSize="5" fontFamily="monospace" fill="#94a3b8" textAnchor="middle" fontWeight="black">N</text>
                            <text x="0" y="13" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">S</text>
                            <text x="10" y="2" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">E</text>
                            <text x="-10" y="2" fontSize="5" fontFamily="monospace" fill="#4b5563" textAnchor="middle">W</text>
                            <g transform={`rotate(${heading})`}>
                                <line x1="0" y1="8" x2="0" y2="-9" stroke="#f97316" strokeWidth="1.2" strokeLinecap="round" />
                                <polygon points="0,-11 -2.5,-5 2.5,-5" fill="#f97316" />
                            </g>
                            <circle cx="0" cy="0" r="1.5" fill="#030712" stroke="#f97316" strokeWidth="1" />
                        </g>

                        {/* Fine crosshairs HUD overlay */}
                        <path d="M 12 90 L 22 90 M 17 85 L 17 95" stroke="#475569" strokeWidth="0.5" opacity="0.4" />
                        <path d="M 298 90 L 308 90 M 303 85 L 303 95" stroke="#475569" strokeWidth="0.5" opacity="0.4" />

                        {/* Video recording style corners */}
                        <path d="M 10 15 L 25 15 M 10 15 L 10 30" stroke="#475569" strokeWidth="0.75" opacity="0.6" />
                        <path d="M 310 15 L 295 15 M 310 15 L 310 30" stroke="#475569" strokeWidth="0.75" opacity="0.6" />
                        <path d="M 10 165 L 25 165 M 10 165 L 10 150" stroke="#475569" strokeWidth="0.75" opacity="0.6" />
                        <path d="M 310 165 L 295 165 M 310 165 L 310 150" stroke="#475569" strokeWidth="0.75" opacity="0.6" />
                    </svg>

                    {/* HUD labels */}
                    <div className="absolute top-2.5 left-11 text-[9px] font-mono text-gray-400 font-bold bg-[#030712]/60 px-1 rounded border border-white/5 backdrop-blur-sm">
                        HDG: {Math.round(heading)}°
                    </div>

                    <div className="absolute bottom-2.5 right-2.5 text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-[#030712]/50 px-1.5 py-0.5 rounded border border-white/5 backdrop-blur-sm">
                        Street View Tĩnh
                    </div>
                </div>
            )}
        </div>
    );
};
