import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

export type MapBasemapId = 'street' | 'satellite' | 'heat' | 'dark';
export type MapBasemapKind = 'raster' | 'heat';

export interface MapFeatures {
    roads: boolean;
    roadNames: boolean;
    buildings: boolean;
    pois: boolean;
    labels: boolean;
}

export interface MapStyleSettings extends MapFeatures {
    basemapId: MapBasemapId;
}

export interface MapBasemapPreset {
    id: MapBasemapId;
    label: string;
    tileLyr: 'm' | 's';
    kind: MapBasemapKind;
    supportsApiStyle: boolean;
    apiStyleRules?: readonly string[];
}

const MAP_FEATURES_STORAGE_KEY = 'design.map.features';
const GOOGLE_TILE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'] as const;

export const MAP_BASEMAP_PRESETS: ReadonlyArray<MapBasemapPreset> = [
    { id: 'street', label: 'Duong pho', tileLyr: 'm', kind: 'raster', supportsApiStyle: true },
    { id: 'satellite', label: 'Ve tinh', tileLyr: 's', kind: 'raster', supportsApiStyle: false },
    {
        id: 'heat',
        label: 'Ban do nhiet',
        tileLyr: 'm',
        kind: 'heat',
        supportsApiStyle: true,
        apiStyleRules: [
            's.t:3|s.e:l|p.v:off',
            's.t:8|p.v:off',
            's.t:2|p.v:off',
            's.t:5|p.v:off',
        ],
    },
    {
        id: 'dark',
        label: 'Ban do den',
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
    },
];

const DEFAULT_BASEMAP_ID: MapBasemapId = 'street';
const DEFAULT_MAP_FEATURES: MapFeatures = {
    roads: true,
    roadNames: true,
    buildings: true,
    pois: true,
    labels: true
};

const isMapBasemapId = (value: unknown): value is MapBasemapId =>
    typeof value === 'string' && MAP_BASEMAP_PRESETS.some(preset => preset.id === value);

const getPreset = (basemapId: MapBasemapId) =>
    MAP_BASEMAP_PRESETS.find(preset => preset.id === basemapId) || MAP_BASEMAP_PRESETS[0];

const migrateBasemapId = (value: unknown): MapBasemapId => {
    if (isMapBasemapId(value)) return value;
    if (value === 'google-vietnam-road') return 'street';
    if (value === 'google-vietnam-satellite') return 'satellite';
    if (value === 'google-vietnam-hybrid') return 'street';
    return DEFAULT_BASEMAP_ID;
};

const getSavedMapSettings = (): MapStyleSettings => {
    const defaults = { ...DEFAULT_MAP_FEATURES, basemapId: DEFAULT_BASEMAP_ID };
    if (typeof window === 'undefined') return defaults;

    try {
        const savedFeatures = window.localStorage.getItem(MAP_FEATURES_STORAGE_KEY);
        if (!savedFeatures) return defaults;

        const parsedFeatures = JSON.parse(savedFeatures) as Partial<MapStyleSettings>;
        return {
            roads: typeof parsedFeatures.roads === 'boolean' ? parsedFeatures.roads : DEFAULT_MAP_FEATURES.roads,
            roadNames: typeof parsedFeatures.roadNames === 'boolean' ? parsedFeatures.roadNames : DEFAULT_MAP_FEATURES.roadNames,
            buildings: typeof parsedFeatures.buildings === 'boolean' ? parsedFeatures.buildings : DEFAULT_MAP_FEATURES.buildings,
            pois: typeof parsedFeatures.pois === 'boolean' ? parsedFeatures.pois : DEFAULT_MAP_FEATURES.pois,
            labels: typeof parsedFeatures.labels === 'boolean' ? parsedFeatures.labels : DEFAULT_MAP_FEATURES.labels,
            basemapId: migrateBasemapId(parsedFeatures.basemapId),
        };
    } catch {
        return defaults;
    }
};

export function useMapStyles() {
    const [settings, setSettings] = useState<MapStyleSettings>(getSavedMapSettings);
    const { basemapId, ...mapFeatures } = settings;

    useEffect(() => {
        try {
            window.localStorage.setItem(MAP_FEATURES_STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // localStorage can be unavailable in restricted browser contexts.
        }
    }, [settings]);

    const featureStyleRules = useMemo(() => {
        const rules: string[] = [];
        if (!mapFeatures.roads) rules.push('s.t:3|s.e:g|p.v:off');
        if (!mapFeatures.roadNames) rules.push('s.t:3|s.e:l|p.v:off');
        if (!mapFeatures.buildings) rules.push('s.t:2|p.v:off', 's.t:5|p.v:off');
        if (!mapFeatures.pois) rules.push('s.t:8|p.v:off');
        if (!mapFeatures.labels) rules.push('s.t:1|s.e:l|p.v:off', 's.t:2|s.e:l|p.v:off', 's.t:4|s.e:l|p.v:off', 's.t:6|s.e:l|p.v:off');
        return rules;
    }, [mapFeatures.buildings, mapFeatures.labels, mapFeatures.pois, mapFeatures.roadNames, mapFeatures.roads]);

    const getStyledTiles = useCallback((targetBasemapId = basemapId) => {
        const preset = getPreset(targetBasemapId);
        const rules = [...(preset.apiStyleRules || []), ...featureStyleRules];
        const apiStyle = preset.supportsApiStyle
            ? rules.join(',')
            : '';
        const apiStyleParam = apiStyle ? `&apistyle=${encodeURIComponent(apiStyle)}` : '';
        return GOOGLE_TILE_SUBDOMAINS.map(
            subdomain => `https://${subdomain}.google.com/vt/lyrs=${preset.tileLyr}&hl=vi&gl=vn&x={x}&y={y}&z={z}${apiStyleParam}`
        );
    }, [basemapId, featureStyleRules]);

    const getStyledUrl = useCallback((lyr: string) => {
        const preset = MAP_BASEMAP_PRESETS.find(item => item.tileLyr === lyr) || getPreset(basemapId);
        return getStyledTiles(preset.id)[0];
    }, [basemapId, getStyledTiles]);

    const setMapFeatures = useCallback<Dispatch<SetStateAction<MapFeatures>>>((nextFeatures) => {
        setSettings(prev => {
            const resolved = typeof nextFeatures === 'function' ? nextFeatures(prev) : nextFeatures;
            return { ...prev, ...resolved, basemapId: prev.basemapId };
        });
    }, []);

    const setBasemapId = useCallback((nextBasemapId: MapBasemapId) => {
        setSettings(prev => ({ ...prev, basemapId: nextBasemapId }));
    }, []);

    const mapKey = useMemo(() => JSON.stringify(settings), [settings]);
    const activeBasemapPreset = useMemo(() => getPreset(basemapId), [basemapId]);

    return {
        mapFeatures,
        setMapFeatures,
        basemapId,
        setBasemapId,
        basemapPresets: MAP_BASEMAP_PRESETS,
        activeBasemapPreset,
        getStyledTiles,
        getStyledUrl,
        mapKey
    };
}
