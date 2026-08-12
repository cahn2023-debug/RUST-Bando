import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';

export interface TileCoordinates {
  z: number;
  x: number;
  y: number;
}

export interface BasemapCacheStats {
  cachedTilesCount: number;
  cacheSizeBytes: number;
}

export const basemapApi = {
  getTile: async (coords: TileCoordinates): Promise<Uint8Array | null> => {
    return invoke<Uint8Array>('get_basemap_tile', { ...coords });
  },

  prefetchTiles: async (tiles: TileCoordinates[]): Promise<void> => {
    return invoke('prefetch_basemap_tiles', { tiles });
  },

  getCacheStats: async (): Promise<BasemapCacheStats> => {
    return invoke<BasemapCacheStats>('get_basemap_cache_stats');
  },

  clearCache: async (): Promise<void> => {
    return invoke('clear_basemap_tile_cache');
  },
};
