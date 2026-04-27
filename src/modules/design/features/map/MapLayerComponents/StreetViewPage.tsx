import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { StreetViewJS } from '../Palette/StreetViewJS';
import { getGoogleMapsApiKey } from '@TOOL/utils/googleMapsRuntime';

const StreetViewPage: React.FC = () => {
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [heading, setHeading] = useState<number>(0);
    const [fov, setFov] = useState<number>(90);

    // 🔍 Google Maps Style URL Parser: /@lat,lng,fov'y',heading't'
    const parseGoogleMapsUrl = (path: string) => {
        // Pattern: /@lat,lng,fov'y',heading't'
        const match = path.match(/@([-?\d.]+),([-?\d.]+)(?:,([\d.]+)y)?(?:,([\d.]+)t)?/);
        if (match) {
            return {
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                fov: match[3] ? parseFloat(match[3]) : null,
                heading: match[4] ? parseFloat(match[4]) : null
            };
        }
        return null;
    };

    useEffect(() => {
        const pathData = parseGoogleMapsUrl(window.location.pathname);
        const params = new URLSearchParams(window.location.search);

        if (pathData) {
            setLat(pathData.lat);
            setLng(pathData.lng);
            if (pathData.fov !== null) setFov(pathData.fov || 90);
            if (pathData.heading !== null) setHeading(pathData.heading || 0);
        } else {
            const urlLat = params.get('lat');
            const urlLng = params.get('lng');
            if (urlLat && urlLng) {
                setLat(parseFloat(urlLat));
                setLng(parseFloat(urlLng));
            }
            setHeading(parseFloat(params.get('heading') || '0'));
            setFov(parseFloat(params.get('fov') || '90'));
        }

        const unlistenLocation = listen<{ lat: number, lng: number, heading?: number, fov?: number }>('location-change', (event) => {
            setLat(event.payload.lat);
            setLng(event.payload.lng);
            if (event.payload.heading !== undefined) setHeading(event.payload.heading);
            if (event.payload.fov !== undefined) setFov(event.payload.fov);
        });

        const key = getGoogleMapsApiKey();
        setApiKey(key);

        const root = document.documentElement;
        const body = document.body;

        root.classList.add('streetview-window');
        body.classList.add('streetview-window');
        root.style.colorScheme = 'light';
        body.style.colorScheme = 'light';

        document.title = 'Street View - Premium Rendering';

        return () => {
            unlistenLocation.then((f) => f());
            root.classList.remove('streetview-window');
            body.classList.remove('streetview-window');
            root.style.removeProperty('color-scheme');
            body.style.removeProperty('color-scheme');
        };
    }, []);

    if (lat === null || lng === null) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-white font-sans">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-50">Dang tai du lieu vi tri...</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="w-screen h-screen overflow-hidden bg-white streetview-window-container"
            style={{
                colorScheme: 'light',
                background: '#ffffff',
                filter: 'none'
            }}
        >
            <StreetViewJS
                lat={lat}
                lng={lng}
                heading={heading}
                fov={fov}
                apiKey={apiKey}
            />
        </div>
    );
};

export default StreetViewPage;
