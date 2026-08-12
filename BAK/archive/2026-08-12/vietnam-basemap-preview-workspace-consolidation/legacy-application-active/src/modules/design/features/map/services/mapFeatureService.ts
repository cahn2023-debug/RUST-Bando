import { mapApi } from '@/contracts/tauri-api';

export interface SnapPoint {
    x: number;
    y: number;
    snapType: string;
    distance: number;
}

export interface MapFeatureService {
    findNearestSnapPoint: (point: [number, number], tolerance: number) => Promise<SnapPoint | null>;
}

export const mapFeatureService: MapFeatureService = {
    findNearestSnapPoint: async (point: [number, number], tolerance: number) => {
        try {
            const result = await mapApi.findNearestSnapPoint(point, tolerance);
            return result;
        } catch (err) {
            console.warn('[mapFeatureService] Find snap point failed:', err);
            return null;
        }
    },
};
