import React, { useState, useEffect, useMemo } from 'react';

interface GoogleEarthIframeProps {
    lat: number;
    lng: number;
    heading: number;
    altitude?: number;
    tilt?: number;
}

/**
 * GoogleEarthIframe Component
 * 
 * Simulates a ground-level 3D view by embedding Google Earth Web inside an iframe.
 * Uses direct URL parameter manipulation to control the camera without an SDK.
 */
export const GoogleEarthIframe: React.FC<GoogleEarthIframeProps> = ({
    lat,
    lng,
    heading,
    altitude = 150, // Meters above ground (eye level simulation)
    tilt = 85      // Near-horizontal ground view
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [debouncedUrl, setDebouncedUrl] = useState('');

    /**
     * URL Builder Function
     * Reverse engineered format: https://earth.google.com/web/@LAT,LNG,ALTITUDEa,HEADINGd,TILTy,ROLLh
     */
    const buildEarthUrl = (l: number, g: number, h: number): string => {
        // Ensure values are numbers
        const latitude = Number(l).toFixed(6);
        const longitude = Number(g).toFixed(6);
        const head = Math.round(h);
        const alt = Math.round(altitude);
        const t = Math.round(tilt);
        const roll = 0;

        return `https://earth.google.com/web/@${latitude},${longitude},${alt}a,${head}d,${t}y,${roll}h`;
    };

    // Construct URL with memoization to track changes
    const currentUrl = useMemo(() => buildEarthUrl(lat, lng, heading), [lat, lng, heading, altitude, tilt]);

    // Debounce URL updates to prevent excessive iframe reloads
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedUrl(currentUrl);
        }, 800); // 800ms debounce for smoothness

        return () => clearTimeout(timer);
    }, [currentUrl]);

    const handleLoad = () => {
        setIsLoading(false);
    };

    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
    };

    return (
        <div className="relative w-full h-full bg-[#050505] overflow-hidden rounded-md border border-white/5 shadow-inner">
            {/* The Iframe Viewer */}
            {debouncedUrl && !hasError && (
                <iframe
                    key={debouncedUrl} // Force re-render if needed, but debounce handles it
                    src={debouncedUrl}
                    className={`w-full h-full border-none transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={handleLoad}
                    onError={handleError}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    title="Google Earth Ground View"
                />
            )}

            {/* Overlays */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
                    <div className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mb-4" />
                    <div className="text-[10px] text-white/50 font-bold uppercase tracking-widest animate-pulse">
                        Đang kết nối Google Earth...
                    </div>
                </div>
            )}

            {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/20 backdrop-blur-md z-20 p-6 text-center">
                    <div className="text-3xl mb-2">🔭</div>
                    <div className="text-[12px] text-red-400 font-bold uppercase mb-1">Không thể nhúng Google Earth</div>
                    <div className="text-[10px] text-white/60 leading-relaxed max-w-[250px]">
                        Trình duyệt hoặc cấu hình hệ thống đã chặn việc hiển thị trực tiếp. Vui lòng sử dụng tính năng "Mở trên Web" để xem 3D.
                    </div>
                </div>
            )}

            {/* View Meta Info */}
            {!isLoading && !hasError && (
                <div className="absolute bottom-3 left-3 flex gap-2 z-10 pointer-events-none">
                    <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[9px] text-white/70 font-mono">
                        LAT: {lat.toFixed(5)}
                    </div>
                    <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[9px] text-white/70 font-mono">
                        LNG: {lng.toFixed(5)}
                    </div>
                    <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/20 rounded text-[9px] text-orange-400 font-mono font-bold">
                        HDG: {Math.round(heading)}°
                    </div>
                </div>
            )}
        </div>
    );
};
