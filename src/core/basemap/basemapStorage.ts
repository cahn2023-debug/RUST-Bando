import { DEFAULT_BASEMAP_PREFERENCES } from './presets';
import { migrateBasemapPresetId } from './presets';
import type { BasemapPreferences, BasemapPresetId } from './types';

/*
 * Persistence for the basemap selection.
 *
 * The selection now lives in `BasemapRuntime` alone — the design module no longer
 * keeps a rival copy in its own localStorage. This small module is the runtime's
 * own store, deliberately self-contained and side-effect-free so it stays clear
 * of the project/design domain (see `basemapBoundary.test.ts`).
 *
 * The key `basemap.preferences` is intentionally NOT namespaced to any project:
 * the basemap is app-global, it exists before a project opens, and it should not
 * reset when you switch projects.
 */

export const BASEMAP_PREFERENCES_STORAGE_KEY = 'basemap.preferences';

const readBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

const readString = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.length > 0 ? value : fallback;

/**
 * Merge anything saved under BASEMAP_PREFERENCES_STORAGE_KEY onto the defaults.
 *
 * Returns `null` when nothing was saved (or storage is unavailable), so callers
 * can distinguish "no stored preference, fall back to the runtime config" from
 * "stored preference present, use it".
 */
export function loadStoredPreferences(): BasemapPreferences | null {
    const defaults = { ...DEFAULT_BASEMAP_PREFERENCES };
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(BASEMAP_PREFERENCES_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<BasemapPreferences>;
        return {
            presetId: migrateBasemapPresetId(parsed.presetId),
            roads: readBoolean(parsed.roads, defaults.roads),
            roadNames: readBoolean(parsed.roadNames, defaults.roadNames),
            buildings: readBoolean(parsed.buildings, defaults.buildings),
            pois: readBoolean(parsed.pois, defaults.pois),
            labels: readBoolean(parsed.labels, defaults.labels),
            locale: readString(parsed.locale, defaults.locale),
            region: readString(parsed.region, defaults.region),
        };
    } catch {
        return null;
    }
}

export function storePreferences(preferences: BasemapPreferences): void {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
        window.localStorage.setItem(BASEMAP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
        // localStorage can be unavailable in restricted browser contexts.
    }
}

/**
 * Read only the persisted preset id (without the full preferences object), for
 * callers that need the id before the runtime mounts. Falls back to the default
 * when nothing was stored.
 */
export function loadStoredPresetId(): BasemapPresetId {
    return loadStoredPreferences()?.presetId ?? DEFAULT_BASEMAP_PREFERENCES.presetId;
}