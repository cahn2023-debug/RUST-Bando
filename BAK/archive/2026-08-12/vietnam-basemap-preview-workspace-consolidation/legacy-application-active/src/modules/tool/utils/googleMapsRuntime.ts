export interface GoogleMapsRuntimeDetails {
    origin: string;
    protocol: string;
    host: string;
    isTauri: boolean;
    isHttpOrigin: boolean;
    recommendedReferrers: string[];
}

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const getGoogleMapsApiKey = (): string => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    return typeof key === 'string' ? key.trim() : '';
};

export const getGoogleMapsRuntimeDetails = (): GoogleMapsRuntimeDetails => {
    if (typeof window === 'undefined') {
        return {
            origin: '',
            protocol: '',
            host: '',
            isTauri: false,
            isHttpOrigin: false,
            recommendedReferrers: []
        };
    }

    const { origin, protocol, hostname, host, port, href } = window.location;
    const normalizedOrigin = origin && origin !== 'null' ? origin : href;
    const normalizedProtocol = protocol.replace(/:$/, '');
    const isHttpOrigin = normalizedProtocol === 'http' || normalizedProtocol === 'https';
    const isTauri = Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

    const recommendedReferrers = unique([
        isHttpOrigin ? `${normalizedOrigin}/*` : '',
        hostname === '127.0.0.1' && port ? `http://localhost:${port}/*` : '',
        hostname === 'localhost' && port ? `http://127.0.0.1:${port}/*` : '',
        isTauri ? 'http://tauri.localhost/*' : '',
        isTauri ? 'https://tauri.localhost/*' : ''
    ]);

    return {
        origin: normalizedOrigin,
        protocol: normalizedProtocol,
        host,
        isTauri,
        isHttpOrigin,
        recommendedReferrers
    };
};
