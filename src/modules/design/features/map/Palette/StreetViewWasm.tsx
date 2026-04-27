import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import init, { StreetViewRenderer } from '../../../../../src-tauri/streetview_wasm/pkg/streetview_wasm';

interface StreetViewWasmProps {
    lat: number;
    lng: number;
    heading: number;
    fov: number;
    apiKey: string;
    pitch?: number;
}

export const StreetViewWasm: React.FC<StreetViewWasmProps> = ({
    lat,
    lng,
    heading,
    fov,
    apiKey,
    pitch = 0
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<StreetViewRenderer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadWasmAndRender = async () => {
            try {
                if (!apiKey) {
                    throw new Error("Missing Google Maps API Key");
                }

                setLoading(true);
                setError(null);

                // Initialize Wasm
                await init();

                if (!canvasRef.current) return;

                // 1. Get Signed URL for the static image using location (lat, lng) direct
                // Max free size is 640x640
                const unsignedUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${apiKey}`;

                const signedUrl = await invoke<string>('sign_streetview_url', {
                    urlToSign: unsignedUrl,
                    secret: ""
                });

                // 2. Fetch Image Bytes
                const response = await fetch(signedUrl);
                if (!response.ok) throw new Error('Failed to fetch Street View image');
                const arrayBuffer = await response.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                // 3. Render via Wasm
                if (!rendererRef.current) {
                    rendererRef.current = new StreetViewRenderer(canvasRef.current);
                }

                rendererRef.current.render_bytes(bytes, 640, 640);
                setLoading(false);

            } catch (err: any) {
                console.error('[StreetViewWasm] Error:', err);
                setError(err.message || 'Rendering failed');
                setLoading(false);
            }
        };

        loadWasmAndRender();
    }, [lat, lng, heading, pitch, fov]);

    return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
            <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain"
                width={640}
                height={640}
            />

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 text-white p-4">
                    <div className="font-bold">Rendering Error</div>
                    <div className="text-sm opacity-80">{error}</div>
                </div>
            )}

            {/* Watermark-free indicator for dev */}
            {!loading && !error && (
                <div className="absolute bottom-2 left-2 text-[10px] text-white/30 pointer-events-none uppercase tracking-widest">
                    Wasm Rendered (Signed)
                </div>
            )}
        </div>
    );
};
