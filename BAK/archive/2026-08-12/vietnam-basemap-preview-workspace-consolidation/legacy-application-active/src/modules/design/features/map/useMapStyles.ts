import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
    BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PREFERENCES,
    getBasemapPreset,
    getStyledBasemapTiles,
    useBasemapPreset,
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

export const MAP_BASEMAP_PRESETS = BASEMAP_PRESETS as ReadonlyArray<MapBasemapPreset>;

const DEFAULT_BASEMAP_ID: MapBasemapId = DEFAULT_BASEMAP_PREFERENCES.presetId;

const getPreset = (basemapId: MapBasemapId) => getBasemapPreset(basemapId) as MapBasemapPreset;

/**
 * Design-module view of the basemap selection.
 *
 * This used to hold its own copy of the selection in
 * `localStorage['design.map.features']`, which meant the design module and the
 * core runtime each believed they owned the basemap and could disagree — switch
 * layers in one and the other kept its old answer. The selection now lives in
 * `BasemapRuntime`, which persists it under `basemap.preferences`, and this hook
 * is a thin adapter that keeps the existing call sites working.
 *
 * Kept as a separate hook rather than deleted so the design module retains its
 * own vocabulary (`basemapId`, `mapFeatures`) and the `MapFeatures` shape its
 * settings panel is built around.
 */
export function useMapStyles() {
    const { presetId, preferences, setPreset } = useBasemapPreset();

    const basemapId = presetId ?? DEFAULT_BASEMAP_ID;

    const mapFeatures = useMemo<MapFeatures>(() => ({
        roads: preferences.roads,
        roadNames: preferences.roadNames,
        buildings: preferences.buildings,
        pois: preferences.pois,
        labels: preferences.labels,
    }), [preferences.roads, preferences.roadNames, preferences.buildings, preferences.pois, preferences.labels]);

    const getStyledTiles = useCallback((targetBasemapId = basemapId) => (
        getStyledBasemapTiles(targetBasemapId, mapFeatures)
    ), [basemapId, mapFeatures]);

    const getStyledUrl = useCallback((lyr: string) => {
        const preset = MAP_BASEMAP_PRESETS.find(item => item.tileLyr === lyr) || getPreset(basemapId);
        return getStyledTiles(preset.id)[0];
    }, [basemapId, getStyledTiles]);

    const setMapFeatures = useCallback<Dispatch<SetStateAction<MapFeatures>>>((nextFeatures) => {
        const resolved = typeof nextFeatures === 'function' ? nextFeatures(mapFeatures) : nextFeatures;
        setPreset(basemapId, resolved);
    }, [basemapId, mapFeatures, setPreset]);

    const setBasemapId = useCallback((nextBasemapId: MapBasemapId) => {
        setPreset(nextBasemapId);
    }, [setPreset]);

    // Identity of the current styling, used by consumers to detect real changes.
    const mapKey = useMemo(
        () => JSON.stringify({ ...mapFeatures, basemapId }),
        [basemapId, mapFeatures]
    );
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
