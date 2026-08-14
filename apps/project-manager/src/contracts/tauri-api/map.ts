import { safeInvoke } from '@IMPLEMENT/lib/tauri';

export interface SnapPoint {
  x: number;
  y: number;
  snapType: string;
  distance: number;
}

export const mapApi = {
  findNearestSnapPoint: (point: [number, number], tolerance: number) =>
    safeInvoke<SnapPoint | null>('find_nearest_snap_point', { point, tolerance }),

};
