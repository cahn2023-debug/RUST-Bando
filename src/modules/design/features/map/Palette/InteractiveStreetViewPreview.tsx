import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@TOOL/utils/cn';

export interface InteractiveStreetViewPreviewProps {
    lat: number;
    lng: number;
    heading: number;
    fov: number;
    fallback: React.ReactNode;
    onHeadingChange?: (heading: number) => void;
}

const PUBLIC_STREET_VIEW_TIMEOUT_MS = 5000;

export const InteractiveStreetViewPreview: React.FC<InteractiveStreetViewPreviewProps> = ({
    lat,
    lng,
    heading,
    fallback,
}) => {
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    if (isNaN(lat) || isNaN(lng)) {
        return <>{fallback}</>;
    }

    const normalizedHeading = ((heading % 360) + 360) % 360;
    const publicUrl = useMemo(() => {
        const params = new URLSearchParams({
            layer: 'c',
            cbll: `${lat},${lng}`,
            cbp: `12,${normalizedHeading.toFixed(1)},0,0,0`,
            output: 'svembed'
        });
        return `https://maps.google.com/maps?${params.toString()}`;
    }, [lat, lng, normalizedHeading]);

    useEffect(() => {
        setLoading(true);
        setLoadFailed(false);
    }, [publicUrl]);

    useEffect(() => {
        if (!loading) return undefined;
        const timeoutId = window.setTimeout(() => {
            setLoadFailed(true);
            setLoading(false);
        }, PUBLIC_STREET_VIEW_TIMEOUT_MS);
        return () => window.clearTimeout(timeoutId);
    }, [loading, publicUrl]);

    if (loadFailed) {
        return <>{fallback}</>;
    }

    return (
        <div className="relative w-full aspect-video rounded-lg bg-[#070b12] border border-white/10 overflow-hidden shadow-2xl select-none group pointer-events-none">
            <iframe
                src={publicUrl}
                title="Street View Public Preview"
                frameBorder="0"
                style={{
                    position: 'absolute',
                    width: 'calc(100% + 600px)',
                    height: 'calc(100% + 200px)',
                    left: '-300px',
                    top: '-100px',
                    border: 0
                }}
                allowFullScreen
                onLoad={() => {
                    setLoadFailed(false);
                    setLoading(false);
                }}
                className={cn(
                    'transition-opacity duration-300',
                    loading ? 'opacity-0' : 'opacity-100'
                )}
            />

            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 pointer-events-none">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <div className="mt-2 text-[9px] font-mono text-gray-500 uppercase tracking-widest">
                        Đang tải Street View...
                    </div>
                </div>
            )}
            
            {!loading && !loadFailed && (
                <div className="absolute bottom-2.5 right-2.5 text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-[#030712]/50 px-1.5 py-0.5 rounded border border-white/5 backdrop-blur-sm pointer-events-none">
                    Street View (Public)
                </div>
            )}
        </div>
    );
};
