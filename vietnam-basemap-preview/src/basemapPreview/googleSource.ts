import type maplibregl from 'maplibre-gl';
import type {
    PreviewLayerId,
    PreviewSourceAdapter,
    PreviewSourceMetadata,
    PreviewStyleId,
    PreviewTileError,
} from './types';
import type { BasemapLayerVisibility } from './basemapLayers';

export const GOOGLE_RASTER_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
export const GOOGLE_SATELLITE_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
export const GOOGLE_HYBRID_LABELS_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}';
export const GOOGLE_HYBRID_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
export const GOOGLE_TILE_PROXY_PATH = '/api/v1/google-tile';

export function getGoogleTileProxyBaseUrl(port = 38_741, useDevProxy = import.meta.env.DEV): string {
    return !useDevProxy && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
        ? `http://127.0.0.1:${port}${GOOGLE_TILE_PROXY_PATH}`
        : GOOGLE_TILE_PROXY_PATH;
}

export function buildGoogleTileProxyTemplate(
    tileTemplate: string,
    proxyBaseUrl = GOOGLE_TILE_PROXY_PATH,
): string {
    const upstream = new URL(tileTemplate);
    const layer = tileTemplate.match(/\/vt\/lyrs=([^&?]+)/)?.[1] ?? tileTemplate.match(/[?&]lyrs=([^&]+)/)?.[1];
    if (upstream.hostname !== 'mt1.google.com' || !upstream.pathname.startsWith('/vt') || !layer || !['m', 's', 'h', 'y'].includes(layer)) {
        throw new Error('Unsupported Google tile template');
    }
    return `${proxyBaseUrl.replace(/\/$/, '')}?lyrs=${encodeURIComponent(layer)}&x={x}&y={y}&z={z}`;
}

export function buildGoogleStyledTileTemplate(
    tileTemplate: string,
    visibility: Pick<BasemapLayerVisibility, 'roads' | 'labels' | 'pois'>,
): string {
    const rules: string[] = [];

    if (!visibility.roads) rules.push('s.t:3|s.e:g|p.v:off');
    if (!visibility.labels) rules.push('s.e:l|p.v:off');
    if (!visibility.pois) {
        rules.push('s.t:2|s.e:l|p.v:off');
        rules.push('s.t:2|s.e:l.i|p.v:off');
    } else if (!visibility.labels) {
        rules.push('s.t:2|s.e:l|p.v:on');
        rules.push('s.t:2|s.e:l.i|p.v:on');
    }

    return rules.length > 0
        ? `${tileTemplate}&apistyle=${encodeURIComponent(rules.join(','))}`
        : tileTemplate;
}

const GOOGLE_STREET_METADATA: PreviewSourceMetadata = {
    mode: 'online',
    name: 'Google Street (external)',
    version: 'public raster preview',
    attribution: 'Google Maps — external preview source',
    external: true,
};

const GOOGLE_HYBRID_METADATA: PreviewSourceMetadata = {
    ...GOOGLE_STREET_METADATA,
    name: 'Google Hybrid (external)',
};

export function createGoogleSourceAdapter(
    layer: Exclude<PreviewLayerId, 'local-package'> = 'google-street',
    tileProxyBaseUrl = getGoogleTileProxyBaseUrl(),
): PreviewSourceAdapter {
    let tileError: PreviewTileError | null = null;
    const metadata = layer === 'google-hybrid' ? GOOGLE_HYBRID_METADATA : GOOGLE_STREET_METADATA;
    const proxyBaseUrl = tileProxyBaseUrl ?? GOOGLE_TILE_PROXY_PATH;
    const rasterTileTemplate = buildGoogleTileProxyTemplate(GOOGLE_RASTER_TILE_TEMPLATE, proxyBaseUrl);
    const hybridBaseTileTemplate = buildGoogleTileProxyTemplate(GOOGLE_SATELLITE_TILE_TEMPLATE, proxyBaseUrl);
    const hybridOverlayTileTemplate = buildGoogleTileProxyTemplate(GOOGLE_HYBRID_LABELS_TILE_TEMPLATE, proxyBaseUrl);

    return {
        metadata,
        manifest: null,
        styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification> {
            if (styleId !== 'engineering' && styleId !== 'light' && styleId !== 'dark') {
                return Promise.reject(new Error(`Unsupported preview style: ${styleId}`));
            }

            if (layer === 'google-hybrid') {
                return Promise.resolve({
                    version: 8,
                    name: `${metadata.name} — ${styleId}`,
                    sources: {
                        'google-hybrid-base': {
                            type: 'raster',
                            tiles: [hybridBaseTileTemplate],
                            tileSize: 256,
                            maxzoom: 20,
                            attribution: metadata.attribution,
                        },
                        'google-hybrid-overlay': {
                            type: 'raster',
                            tiles: [hybridOverlayTileTemplate],
                            tileSize: 256,
                            maxzoom: 20,
                        },
                    },
                    layers: [
                        { id: 'google-hybrid-base-layer', type: 'raster', source: 'google-hybrid-base' },
                        { id: 'google-hybrid-overlay-layer', type: 'raster', source: 'google-hybrid-overlay' },
                    ],
                } as maplibregl.StyleSpecification);
            }

            return Promise.resolve({
                version: 8,
                name: `${metadata.name} — ${styleId}`,
                sources: {
                    'google-raster': {
                        type: 'raster',
                        tiles: [rasterTileTemplate],
                        tileSize: 256,
                        maxzoom: 20,
                        attribution: metadata.attribution,
                    },
                },
                layers: [{ id: 'google-raster-layer', type: 'raster', source: 'google-raster' }],
            } as maplibregl.StyleSpecification);
        },
        recordTileError(error: unknown): void {
            const detail = error instanceof Error ? error.message : String(error);
            tileError = { source: metadata.name, message: `Không tải được Google raster tile: ${detail}` };
        },
        getTileError(): PreviewTileError | null {
            return tileError;
        },
    };
}
