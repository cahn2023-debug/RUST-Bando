import type maplibregl from 'maplibre-gl';
import type {
    PreviewLayerId,
    PreviewSourceAdapter,
    PreviewSourceMetadata,
    PreviewStyleId,
    PreviewTileError,
} from './types';

export const GOOGLE_RASTER_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
export const GOOGLE_HYBRID_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

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
): PreviewSourceAdapter {
    let tileError: PreviewTileError | null = null;
    const metadata = layer === 'google-hybrid' ? GOOGLE_HYBRID_METADATA : GOOGLE_STREET_METADATA;
    const tileTemplate = layer === 'google-hybrid' ? GOOGLE_HYBRID_TILE_TEMPLATE : GOOGLE_RASTER_TILE_TEMPLATE;

    return {
        metadata,
        manifest: null,
        styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification> {
            if (styleId !== 'engineering' && styleId !== 'light' && styleId !== 'dark') {
                return Promise.reject(new Error(`Unsupported preview style: ${styleId}`));
            }
            return Promise.resolve({
                version: 8,
                name: `${metadata.name} — ${styleId}`,
                sources: {
                    'google-raster': {
                        type: 'raster',
                        tiles: [tileTemplate],
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
