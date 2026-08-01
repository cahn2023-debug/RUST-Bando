import { describe, expect, it } from 'vitest';
import {
    BASEMAP_SOURCE_ID,
    createBasemapStyle,
    getStyledBasemapTiles,
    migrateBasemapPresetId,
} from './index';

describe('core basemap style', () => {
    it('creates a project-free raster style', () => {
        const style = createBasemapStyle(['https://tiles.example/{z}/{x}/{y}.png']);

        expect(Object.keys(style.sources || {})).toEqual([BASEMAP_SOURCE_ID]);
        expect(style.layers?.map(layer => layer.id)).toEqual(['neutral-background', 'basemap']);
        expect(JSON.stringify(style)).not.toContain('design-fast-features');
        expect(JSON.stringify(style)).not.toContain('FeatureState');
    });

    it('builds application basemap tile urls with optional api style rules', () => {
        const street = getStyledBasemapTiles('street', { roads: false, pois: false })[0];
        const satellite = getStyledBasemapTiles('satellite', { roads: false, pois: false })[0];

        expect(street).toContain('https://mt0.google.com/vt/lyrs=m&hl=vi&gl=vn');
        expect(decodeURIComponent(street)).toContain('s.t:3|s.e:g|p.v:off');
        expect(decodeURIComponent(street)).toContain('s.t:8|p.v:off');
        expect(satellite).toBe('https://mt0.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}');
    });

    it('migrates legacy preset ids without project metadata', () => {
        expect(migrateBasemapPresetId('google-vietnam-satellite')).toBe('satellite');
        expect(migrateBasemapPresetId('project-custom-value')).toBe('street');
    });
});
