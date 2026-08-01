import type { BasemapPreferences, BasemapPreset, BasemapPresetId } from './types';

const GOOGLE_TILE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'] as const;

export const DEFAULT_BASEMAP_CAMERA = {
    center: [105.8342, 21.0278] as [number, number],
    zoom: 12,
    bearing: 0,
    pitch: 0,
};

export const DEFAULT_BASEMAP_PREFERENCES: BasemapPreferences = {
    presetId: 'street',
    roads: true,
    roadNames: true,
    buildings: true,
    pois: true,
    labels: true,
    locale: 'vi',
    region: 'vn',
};

const basePreset = (
    preset: Omit<BasemapPreset, 'tileUrls' | 'minZoom' | 'maxZoom'>
): BasemapPreset => ({
    ...preset,
    tileUrls: createGoogleTileUrls(preset.tileLyr),
    minZoom: 0,
    maxZoom: 20,
});

export const BASEMAP_PRESETS: ReadonlyArray<BasemapPreset> = [
    basePreset({ id: 'street', label: 'Duong pho', title: 'Duong pho', tileLyr: 'm', kind: 'raster', supportsApiStyle: true }),
    basePreset({ id: 'satellite', label: 'Ve tinh', title: 'Ve tinh', tileLyr: 's', kind: 'raster', supportsApiStyle: false }),
    basePreset({
        id: 'heat',
        label: 'Ban do nhiet',
        title: 'Ban do nhiet',
        tileLyr: 'm',
        kind: 'heat',
        supportsApiStyle: true,
        apiStyleRules: [
            's.t:3|s.e:l|p.v:off',
            's.t:8|p.v:off',
            's.t:2|p.v:off',
            's.t:5|p.v:off',
        ],
    }),
    basePreset({
        id: 'dark',
        label: 'Ban do den',
        title: 'Ban do den',
        tileLyr: 'm',
        kind: 'raster',
        supportsApiStyle: true,
        apiStyleRules: [
            'p.c:#101318',
            'p.l:-35',
            'p.s:-60',
            's.t:1|s.e:l|p.c:#d6dde8',
            's.t:3|s.e:g|p.c:#222936',
            's.t:3|s.e:l|p.c:#9aa4b2',
            's.t:8|p.v:off',
        ],
    }),
];

export function createGoogleTileUrls(
    tileLyr: 'm' | 's',
    preferences: Partial<BasemapPreferences> = {}
): string[] {
    const locale = preferences.locale || DEFAULT_BASEMAP_PREFERENCES.locale;
    const region = preferences.region || DEFAULT_BASEMAP_PREFERENCES.region;
    return GOOGLE_TILE_SUBDOMAINS.map(
        subdomain => `https://${subdomain}.google.com/vt/lyrs=${tileLyr}&hl=${locale}&gl=${region}&x={x}&y={y}&z={z}`
    );
}

export function getBasemapPreset(presetId: BasemapPresetId): BasemapPreset {
    return BASEMAP_PRESETS.find(preset => preset.id === presetId) || BASEMAP_PRESETS[0];
}

export function isBasemapPresetId(value: unknown): value is BasemapPresetId {
    return typeof value === 'string' && BASEMAP_PRESETS.some(preset => preset.id === value);
}

export function migrateBasemapPresetId(value: unknown): BasemapPresetId {
    if (isBasemapPresetId(value)) return value;
    if (value === 'google-vietnam-road') return 'street';
    if (value === 'google-vietnam-satellite') return 'satellite';
    if (value === 'google-vietnam-hybrid') return 'street';
    return DEFAULT_BASEMAP_PREFERENCES.presetId;
}
