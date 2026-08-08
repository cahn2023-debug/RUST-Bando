import { mapApi } from '@/contracts/tauri-api';

export interface TileBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    zoom: number;
}

export interface MapTileService {
    prefetchBasemapTiles: (bounds: TileBounds) => Promise<boolean>;
    clearBasemapCache: () => Promise<boolean>;
}

export const mapTileService: MapTileService = {
    prefetchBasemapTiles: async (bounds: TileBounds) => {
        try {
            await mapApi.prefetchBasemapTiles(bounds);
            return true;
        } catch (err) {
            console.warn('[mapTileService] Prefetch failed:', err);
            return false;
        }
    },
    clearBasemapCache: async () => {
        try {
            await mapApi.clearBasemapCache();
            return true;
        } catch (err) {
            console.warn('[mapTileService] Clear cache failed:', err);
            return false;
        }
    },
};
