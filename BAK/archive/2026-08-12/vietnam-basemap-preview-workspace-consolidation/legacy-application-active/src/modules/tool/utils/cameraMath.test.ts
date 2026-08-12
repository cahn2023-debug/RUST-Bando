import { describe, it, expect } from 'vitest';
import {
    calculateHFOV,
    calculatePPM,
    calculateSlantRange,
    calculateDORIDistance,
    getDORICategory,
    mapRotationToHeading,
    SENSOR_SIZES
} from '@SHARED/utils/cameraMath';

describe('cameraMath Utilities', () => {
    describe('calculateHFOV', () => {
        it('should calculate correct HFOV for 2.8mm on 1/2.8" sensor', () => {
            const sensor = SENSOR_SIZES['1/2.8"'];
            const hfov = calculateHFOV(sensor.width, 2.8);
            // 2 * atan(4.59 / (2 * 2.8)) = 78.679...
            expect(hfov).toBeCloseTo(78.7, 1);
        });
    });

    describe('calculateSlantRange', () => {
        it('should calculate correct slant range (3rd side of triangle)', () => {
            // Horizontal 3m, Height diff 4m -> Slant 5m
            expect(calculateSlantRange(3, 5.7, 1.7)).toBeCloseTo(5, 1);
            // Height diff 0
            expect(calculateSlantRange(10, 1.7, 1.7)).toBe(10);
        });
    });

    describe('calculatePPM', () => {
        it('should calculate correct PPM at 10m (horizontal) with 0 height', () => {
            const resX = 1920;
            const distance = 10;
            const hfov = 78.6;
            const ppm = calculatePPM(resX, distance, hfov);
            expect(ppm).toBeCloseTo(117.3, 1);
        });

        it('should reflect lower PPM when mounted high (8m)', () => {
            const resX = 1920;
            const distance = 10;
            const hfov = 78.6;
            const ppmFlat = calculatePPM(resX, distance, hfov, 1.7, 1.7);
            const ppmHigh = calculatePPM(resX, distance, hfov, 8, 1.7);

            // Slant range at 8m height: sqrt(10^2 + (8-1.7)^2) = sqrt(100 + 39.69) = 11.82m
            // PPM should be ~117.3 * (10 / 11.82) = 99.2
            expect(ppmHigh).toBeLessThan(ppmFlat);
            expect(ppmHigh).toBeCloseTo(99.2, 1);
        });
    });

    describe('calculateDORIDistance', () => {
        it('should calculate correct max distance for Identification (250 PPM)', () => {
            const resX = 1920;
            const hfov = 78.6;
            const dist = calculateDORIDistance(resX, hfov, 250, 1.7, 1.7);
            // S = 1920 / (2 * 250 * tan(39.3)) = 1920 / (500 * 0.818) = 1920 / 409 = 4.69m
            expect(dist).toBeCloseTo(4.7, 1);
        });
    });

    describe('getDORICategory', () => {
        it('should identify Identification at 250+ PPM', () => {
            expect(getDORICategory(300).label).toBe('Identification (ID)');
        });
    });

    describe('mapRotationToHeading', () => {
        it('should map 0 (East) to 90 (Heading East)', () => {
            expect(mapRotationToHeading(0)).toBe(90);
        });
        it('should map -90 (North) to 0 (Heading North)', () => {
            expect(mapRotationToHeading(-90)).toBe(0);
        });
    });
});
