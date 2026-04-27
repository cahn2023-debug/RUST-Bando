import React from 'react';
import { useTranslation } from 'react-i18next';

interface MapSettingsPanelProps {
    mapFeatures: {
        roads: boolean;
        roadNames: boolean;
        buildings: boolean;
        pois: boolean;
        labels: boolean;
    };
    setMapFeatures: React.Dispatch<React.SetStateAction<{
        roads: boolean;
        roadNames: boolean;
        buildings: boolean;
        pois: boolean;
        labels: boolean;
    }>>;
}

export function MapSettingsPanel({ mapFeatures, setMapFeatures }: MapSettingsPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="map-settings-control-inner">
            <div className="settings-header text-[9px] font-black p-1 border-b border-cad-border uppercase tracking-widest bg-cad-bg/50">
                {t('map.layers')}
            </div>
            <div className="settings-content p-2 flex flex-col gap-1">
                <label className="flex items-center gap-2 cursor-pointer text-[9px] hover:text-cad-accent transition-colors" title={t('map.visibility')}>
                    <input
                        type="checkbox"
                        className="accent-cad-accent"
                        checked={mapFeatures.roads}
                        onChange={(e) => setMapFeatures(p => ({ ...p, roads: e.target.checked }))}
                    />
                    {t('design.line')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[9px] hover:text-cad-accent transition-colors" title={t('design.label')}>
                    <input
                        type="checkbox"
                        className="accent-cad-accent"
                        checked={mapFeatures.roadNames}
                        onChange={(e) => setMapFeatures(p => ({ ...p, roadNames: e.target.checked }))}
                    />
                    {t('design.label')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[9px] hover:text-cad-accent transition-colors" title={t('design.geometry')}>
                    <input
                        type="checkbox"
                        className="accent-cad-accent"
                        checked={mapFeatures.buildings}
                        onChange={(e) => setMapFeatures(p => ({ ...p, buildings: e.target.checked }))}
                    />
                    {t('design.polygon')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[9px] hover:text-cad-accent transition-colors" title={t('map.features')}>
                    <input
                        type="checkbox"
                        className="accent-cad-accent"
                        checked={mapFeatures.pois}
                        onChange={(e) => setMapFeatures(p => ({ ...p, pois: e.target.checked }))}
                    />
                    {t('map.features')} (POI)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[9px] hover:text-cad-accent transition-colors" title={t('design.visible')}>
                    <input
                        type="checkbox"
                        className="accent-cad-accent"
                        checked={mapFeatures.labels}
                        onChange={(e) => setMapFeatures(p => ({ ...p, labels: e.target.checked }))}
                    />
                    {t('design.label')}/{t('design.visible')}
                </label>
            </div>
        </div>
    );
}
