import type maplibregl from 'maplibre-gl';
import type {
    PreviewSourceAdapter,
    PreviewSourceMetadata,
    PreviewStyleId,
    PreviewTileError,
} from './types';

export const GOOGLE_RASTER_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

const GOOGLE_METADATA: PreviewSourceMetadata = {
    mode: 'online',
    name: 'Google Maps (external)',
    version: 'public raster preview',
    attribution: 'Google Maps — external preview source',
    external: true,
};

export function createGoogleSourceAdapter(): PreviewSourceAdapter {
    let tileError: PreviewTileError | null = null;

    return {
        metadata: GOOGLE_METADATA,
        manifest: null,
        styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification> {
            if (styleId !== 'engineering' && styleId !== 'light' && styleId !== 'dark') {
                return Promise.reject(new Error(`Unsupported preview style: ${styleId}`));
            }
            return Promise.resolve({
                version: 8,
                name: `Google raster — ${styleId}`,
                sources: {
                    'google-raster': {
                        type: 'raster',
                        tiles: [GOOGLE_RASTER_TILE_TEMPLATE],
                        tileSize: 256,
                        maxzoom: 20,
                        attribution: GOOGLE_METADATA.attribution,
                    },
                },
                layers: [
                    {
                        id: 'google-raster-layer',
                        type: 'raster',
                        source: 'google-raster',
                    },
                ],
            } as maplibregl.StyleSpecification);
        },
        recordTileError(error: unknown): void {
            const detail = error instanceof Error ? error.message : String(error);
            tileError = {
                source: 'Google raster',
                message: `Không tải được Google raster tile: ${detail}`,
            };
        },
        getTileError(): PreviewTileError | null {
            return tileError;
        },
    };
}
