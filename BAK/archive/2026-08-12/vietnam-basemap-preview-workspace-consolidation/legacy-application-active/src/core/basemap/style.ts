import type maplibregl from 'maplibre-gl';
import { createGoogleTileUrls, getBasemapPreset } from './presets';
import type { BasemapPreferences, BasemapPresetId } from './types';

export const BASEMAP_SOURCE_ID = 'basemap';
export const BASEMAP_RASTER_LAYER_ID = 'basemap';
export const BASEMAP_BACKGROUND_LAYER_ID = 'neutral-background';
export const BASEMAP_MAX_NATIVE_ZOOM = 20;

export function getBasemapApiStyleRules(preferences: Partial<BasemapPreferences>): string[] {
    const rules: string[] = [];
    if (preferences.roads === false) rules.push('s.t:3|s.e:g|p.v:off');
    if (preferences.roadNames === false) rules.push('s.t:3|s.e:l|p.v:off');
    if (preferences.buildings === false) rules.push('s.t:2|p.v:off', 's.t:5|p.v:off');
    if (preferences.pois === false) rules.push('s.t:8|p.v:off');
    if (preferences.labels === false) {
        rules.push('s.t:1|s.e:l|p.v:off', 's.t:2|s.e:l|p.v:off', 's.t:4|s.e:l|p.v:off', 's.t:6|s.e:l|p.v:off');
    }
    return rules;
}

export function getStyledBasemapTiles(
    presetId: BasemapPresetId,
    preferences: Partial<BasemapPreferences> = {}
): string[] {
    const preset = getBasemapPreset(presetId);
    const baseTiles = createGoogleTileUrls(preset.tileLyr, preferences);
    const rules = [...(preset.apiStyleRules || []), ...getBasemapApiStyleRules(preferences)];
    if (!preset.supportsApiStyle || rules.length === 0) return baseTiles;
    const apiStyleParam = `&apistyle=${encodeURIComponent(rules.join(','))}`;
    return baseTiles.map(tile => `${tile}${apiStyleParam}`);
}

export function createBasemapStyle(tileUrls: string[]): maplibregl.StyleSpecification {
    return {
        version: 8,
        sources: {
            [BASEMAP_SOURCE_ID]: {
                type: 'raster',
                tiles: tileUrls,
                tileSize: 256,
                maxzoom: BASEMAP_MAX_NATIVE_ZOOM,
            },
        },
        layers: [
            {
                id: BASEMAP_BACKGROUND_LAYER_ID,
                type: 'background',
                paint: {
                    'background-color': '#e5e7eb',
                },
            },
            {
                id: BASEMAP_RASTER_LAYER_ID,
                type: 'raster',
                source: BASEMAP_SOURCE_ID,
            },
        ],
    };
}
