import { useEffect, useState } from 'react';
import { useBasemap, useOptionalBasemapController } from './BasemapContext';
import { DEFAULT_BASEMAP_PREFERENCES } from './presets';
import type { BasemapLifecycleState, BasemapPreferences, BasemapPresetId, CameraSnapshot } from './types';

/**
 * Subscribes to the runtime's lifecycle state.
 *
 * Returns 'uninitialized' when no controller is mounted yet, so callers can
 * render a disabled shell rather than branching on null.
 */
export function useBasemapLifecycle(): BasemapLifecycleState {
    const { controller } = useBasemap();
    const [state, setState] = useState<BasemapLifecycleState>(
        () => controller?.getLifecycleState() ?? 'uninitialized'
    );

    useEffect(() => {
        if (!controller) {
            setState('uninitialized');
            return;
        }
        return controller.subscribeLifecycle(setState);
    }, [controller]);

    return state;
}

/**
 * Subscribes to the active preset and its display preferences.
 *
 * This is the single source of truth for "which basemap am I looking at" —
 * previously the answer lived in a design-module store while the runtime kept
 * its own copy, and the two could disagree.
 *
 * Provider-optional: without a `BasemapProvider` this reports the defaults and
 * `setPreset` is inert, so a component can render outside the app shell without
 * wrapping the hook in try/catch.
 */
export function useBasemapPreset(): {
    presetId: BasemapPresetId;
    preferences: BasemapPreferences;
    setPreset: (presetId: BasemapPresetId, preferences?: Partial<BasemapPreferences>) => void;
} {
    const controller = useOptionalBasemapController();
    const [presetId, setPresetId] = useState<BasemapPresetId>(
        () => controller?.getPresetId() ?? DEFAULT_BASEMAP_PREFERENCES.presetId
    );
    const [preferences, setPreferences] = useState<BasemapPreferences>(
        () => controller?.getPreferences() ?? { ...DEFAULT_BASEMAP_PREFERENCES }
    );

    useEffect(() => {
        if (!controller) return;
        return controller.subscribePreset((nextPreset, nextPreferences) => {
            setPresetId(nextPreset);
            setPreferences(nextPreferences);
        });
    }, [controller]);

    return {
        presetId,
        preferences,
        setPreset: (next, nextPreferences) => controller?.setPreset(next, nextPreferences),
    };
}

/**
 * Subscribes to camera changes.
 *
 * Note this fires on every `move` event, so only use it where the value is
 * actually displayed (the scale bar, a coordinate readout). Anything doing real
 * work per frame should read `controller.getCamera()` inside its own render
 * loop instead of re-rendering React.
 */
export function useBasemapCamera(): CameraSnapshot | null {
    const { controller } = useBasemap();
    const [snapshot, setSnapshot] = useState<CameraSnapshot | null>(
        () => controller?.getCamera() ?? null
    );

    useEffect(() => {
        if (!controller) {
            setSnapshot(null);
            return;
        }
        return controller.subscribeCamera(setSnapshot);
    }, [controller]);

    return snapshot;
}
