import { safeInvoke } from '@IMPLEMENT/lib/tauri';

export interface MapTileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  zoom: number;
}

export interface SnapPoint {
  x: number;
  y: number;
  snapType: string;
  distance: number;
}

export const mapApi = {
  findNearestSnapPoint: (point: [number, number], tolerance: number) =>
    safeInvoke<SnapPoint | null>('find_nearest_snap_point', { point, tolerance }),

  prefetchBasemapTiles: (bounds: MapTileBounds) =>
    safeInvoke<void>('prefetch_basemap_tiles', { bounds }),

  clearBasemapCache: () => safeInvoke<void>('clear_basemap_tile_cache'),
};
