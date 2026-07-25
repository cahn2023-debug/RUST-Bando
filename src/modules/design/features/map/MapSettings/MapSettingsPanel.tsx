import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface MapFeatureFlags {
    roads: boolean;
    roadNames: boolean;
    buildings: boolean;
    pois: boolean;
    labels: boolean;
}

type MapFeatureKey = keyof MapFeatureFlags;

interface MapSettingsPanelProps {
    mapFeatures: MapFeatureFlags;
    setMapFeatures: React.Dispatch<React.SetStateAction<MapFeatureFlags>>;
}

/** Translate function shape we rely on — kept local so we do not depend on i18next types. */
type Translate = (key: string) => string;

/**
 * Static row config, hoisted out of render so the array identity is stable
 * (MASTER.md §7 — dense panel rows, one source per control).
 */
const MAP_FEATURE_ROWS: ReadonlyArray<{
    key: MapFeatureKey;
    titleKey: string;
    label: (t: Translate) => string;
}> = [
        { key: 'roads', titleKey: 'map.visibility', label: (t) => t('design.line') },
        { key: 'roadNames', titleKey: 'design.label', label: (t) => t('design.label') },
        { key: 'buildings', titleKey: 'design.geometry', label: (t) => t('design.polygon') },
        { key: 'pois', titleKey: 'map.features', label: (t) => `${t('map.features')} (POI)` },
        { key: 'labels', titleKey: 'design.visible', label: (t) => `${t('design.label')}/${t('design.visible')}` },
    ];

const HEADING_ID = 'map-settings-layers-heading';

export function MapSettingsPanel({ mapFeatures, setMapFeatures }: MapSettingsPanelProps) {
    const { t } = useTranslation();

    const handleToggle = useCallback(
        (key: MapFeatureKey, checked: boolean) => {
            setMapFeatures((prev) => ({ ...prev, [key]: checked }));
        },
        [setMapFeatures]
    );

    return (
        <div className="map-settings-control-inner">
            <div
                id={HEADING_ID}
                className="settings-header text-[9px] font-black p-1 border-b border-cad-border uppercase tracking-widest bg-cad-bg/50 text-cad-text-primary"
            >
                {t('map.layers')}
            </div>
            <div
                role="group"
                aria-labelledby={HEADING_ID}
                className="settings-content p-2 flex flex-col gap-1"
            >
                {MAP_FEATURE_ROWS.map((row) => {
                    const inputId = `map-settings-${row.key}`;
                    return (
                        <label
                            key={row.key}
                            htmlFor={inputId}
                            className="flex items-center gap-2 cursor-pointer text-[9px] text-cad-text-secondary hover:text-cad-accent transition-colors"
                            title={t(row.titleKey)}
                        >
                            <input
                                id={inputId}
                                type="checkbox"
                                className="accent-cad-accent cursor-pointer focus-visible:outline-none"
                                checked={mapFeatures[row.key]}
                                onChange={(e) => handleToggle(row.key, e.target.checked)}
                            />
                            {row.label(t)}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
