/**
 * Google Maps Loader - Direct Script Injection (No library dependency)
 * 
 * This bypasses @googlemaps/js-api-loader entirely to ensure
 * the API key is ALWAYS present in the script URL.
 */
import { getGoogleMapsApiKey } from './googleMapsRuntime';

let loadPromise: Promise<void> | null = null;
let isLoaded = false;

const GOOGLE_MAPS_CALLBACK = '__googleMapsInitCallback';

/**
 * Ensures Google Maps SDK is loaded with the API key via direct <script> tag injection.
 */
export const initGoogleMaps = (apiKey?: string): boolean => {
    const finalKey = (apiKey || getGoogleMapsApiKey()).trim();

    if (!finalKey || finalKey.length < 20 || finalKey === 'undefined') {
        console.error('[GoogleMapsLoader] ❌ Invalid API Key! Check VITE_GOOGLE_MAPS_API_KEY in .env');
        return false;
    }

    if (isLoaded && (window as any).google?.maps) {
        return true;
    }

    const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
    if (existingScripts.length > 0) {
        const hasKey = Array.from(existingScripts).some(s =>
            s.getAttribute('src')?.includes(`key=${finalKey}`)
        );

        if (hasKey && (window as any).google?.maps) {
            isLoaded = true;
            return true;
        }

        if (!hasKey) {
            console.warn('[GoogleMapsLoader] ⚠️ Cleaning up stale Google Maps scripts...');
            existingScripts.forEach(s => s.remove());
            delete (window as any).google;
        }
    }

    const script = document.createElement('script');
    // StreetView is part of maps core. Removing unknown library param to fix console warning.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${finalKey}&language=vi&v=weekly&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.async = true;
    script.defer = true;

    (window as any)[GOOGLE_MAPS_CALLBACK] = () => {
        isLoaded = true;
        delete (window as any)[GOOGLE_MAPS_CALLBACK];
    };

    script.onerror = () => {
    };

    document.head.appendChild(script);
    return true;
};

/**
 * Checks if Street View metadata is available for a location
 */
export const checkStreetViewMetadata = async (lat: number, lng: number, apiKey: string): Promise<{ ok: boolean, status: string, panoId?: string }> => {
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${apiKey}`);
        const data = await response.json();

        if (data.status === 'OK') {
            return { ok: true, status: 'OK', panoId: data.pano_id };
        } else {
            console.warn(`[StreetView] Metadata check failed: ${data.status}`);
            return { ok: false, status: data.status };
        }
    } catch (err) {
        console.error('[StreetView] Metadata request error:', err);
        return { ok: false, status: 'NETWORK_ERROR' };
    }
};

export const waitForGoogleMaps = (): Promise<void> => {
    if ((window as any).google?.maps) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        const maxWait = 15000;
        const interval = 100;
        let elapsed = 0;

        const check = () => {
            if ((window as any).google?.maps) {
                loadPromise = null;
                resolve();
                return;
            }
            elapsed += interval;
            if (elapsed >= maxWait) {
                loadPromise = null;
                reject(new Error('Google Maps SDK Timeout'));
                return;
            }
            setTimeout(check, interval);
        };
        check();
    });

    return loadPromise;
};
