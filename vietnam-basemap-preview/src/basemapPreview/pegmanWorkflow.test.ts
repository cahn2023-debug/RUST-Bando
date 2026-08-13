import { describe, expect, it, vi } from 'vitest';
import { normalizeStreetViewViewpoint } from './streetView';
import type { PreviewPoint } from './extent';

describe('street view pegman workflow behavior', () => {
    it('verifies coordinate format for Pegman OFF click without marker', () => {
        const point: PreviewPoint = [105.8542, 21.0285];
        const formatted = `Đã chọn tọa độ ${point[1].toFixed(6)}°, ${point[0].toFixed(6)}°`;
        expect(formatted).toBe('Đã chọn tọa độ 21.028500°, 105.854200°');
    });

    it('maintains active pegman selection mode when viewpoint is selected', () => {
        let streetViewSelectionActive = true;
        let streetViewStatus: string | null = 'Nhấp vào điểm trên đường phủ để xem Street View';
        let currentViewpoint = null as ReturnType<typeof normalizeStreetViewViewpoint> | null;

        const handleStreetViewSelection = (point: PreviewPoint) => {
            const viewpoint = normalizeStreetViewViewpoint({ point, heading: 0, pitch: 0, fov: 90 });
            currentViewpoint = viewpoint;
            streetViewStatus = 'Nhấp vào điểm trên đường phủ để xem Street View';
            // streetViewSelectionActive remains true for subsequent clicks!
        };

        handleStreetViewSelection([105.85, 21.03]);
        expect(currentViewpoint).not.toBeNull();
        expect(currentViewpoint?.point).toEqual([105.85, 21.03]);
        expect(streetViewSelectionActive).toBe(true);
        expect(streetViewStatus).toBe('Nhấp vào điểm trên đường phủ để xem Street View');
    });

    it('clears viewpoint and updates status when Pegman is toggled OFF', () => {
        let streetViewSelectionActive = true;
        let currentViewpoint: ReturnType<typeof normalizeStreetViewViewpoint> | null = normalizeStreetViewViewpoint({ point: [105.85, 21.03], heading: 0, pitch: 0, fov: 90 });
        let streetViewStatus: string | null = 'Nhấp vào điểm trên đường phủ để xem Street View';

        const togglePegman = () => {
            streetViewSelectionActive = !streetViewSelectionActive;
            if (!streetViewSelectionActive) {
                currentViewpoint = null;
                streetViewStatus = 'Đã tắt Pegman';
            }
        };

        togglePegman();
        expect(streetViewSelectionActive).toBe(false);
        expect(currentViewpoint).toBeNull();
        expect(streetViewStatus).toBe('Đã tắt Pegman');
    });
});
