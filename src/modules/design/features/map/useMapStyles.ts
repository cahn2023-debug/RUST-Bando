import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
    BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PREFERENCES,
    getBasemapPreset,
    getStyledBasemapTiles,
    migrateBasemapPresetId,
    type BasemapPreset,
    type BasemapPresetId,
} from '@/core/basemap';

export type MapBasemapId = BasemapPresetId;
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

export type MapBasemapPreset = BasemapPreset & { kind: MapBasemapKind };

const MAP_FEATURES_STORAGE_KEY = 'design.map.features';

export const MAP_BASEMAP_PRESETS = BASEMAP_PRESETS as ReadonlyArray<MapBasemapPreset>;

const DEFAULT_BASEMAP_ID: MapBasemapId = DEFAULT_BASEMAP_PREFERENCES.presetId;
const DEFAULT_MAP_FEATURES: MapFeatures = {
    roads: DEFAULT_BASEMAP_PREFERENCES.roads,
    roadNames: DEFAULT_BASEMAP_PREFERENCES.roadNames,
    buildings: DEFAULT_BASEMAP_PREFERENCES.buildings,
    pois: DEFAULT_BASEMAP_PREFERENCES.pois,
    labels: DEFAULT_BASEMAP_PREFERENCES.labels
};

const getPreset = (basemapId: MapBasemapId) => getBasemapPreset(basemapId) as MapBasemapPreset;

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
            basemapId: migrateBasemapPresetId(parsedFeatures.basemapId),
        };
    } catch {
        return defaults;
    }
};

export function useMapStyles() {
    const [settings, setSettings] = useState<MapStyleSettings>(getSavedMapSettings);
    const basemapId = settings.basemapId;
    const { basemapId: _localBasemapId, ...mapFeatures } = settings;

    useEffect(() => {
        try {
            window.localStorage.setItem(MAP_FEATURES_STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // localStorage can be unavailable in restricted browser contexts.
        }
    }, [settings]);

    const getStyledTiles = useCallback((targetBasemapId = basemapId) => (
        getStyledBasemapTiles(targetBasemapId, mapFeatures)
    ), [basemapId, mapFeatures]);

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
