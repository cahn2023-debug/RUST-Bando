import { MapProvider, useMapContext } from './MapContext';
import './MapLayer.css';
import {
    MapLibreMeasurementTool,
    MapLibreBoxSelection,
    MapCaptureHandler,
    DORIOverlay,
    FOVLayer,
    InteractivePPM,
    StreetViewControl,
    ZoomExtendControl,
    ZoomToHandler,
} from '@DESIGN/features/map/MapLayerComponents';
import { DORILegend } from '@DESIGN/features/map/MapLayerComponents/DORILegend';
import { MapSettingsPortal } from './MapSettingsPortal';
import { useMapStyles } from './useMapStyles';
import { MapSettingsPanel } from './MapSettings/MapSettingsPanel';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { MapLibreFastRenderer } from './MapLibreFastRenderer';

interface MapLayerProps {
    center: [number, number];
    zoom: number;
    onLocationChange?: (lat: number, lng: number, x: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
    isMeasureActive?: boolean;
    onMeasureDeactivate?: () => void;
}

export function MapLayer({
    center,
    zoom,
    onLocationChange,
    onFinishDrawing,
    onFinishDrawingSession,
    isMeasureActive = false,
    onMeasureDeactivate = () => {}
}: MapLayerProps) {
    const { mapFeatures, setMapFeatures, basemapId, setBasemapId, basemapPresets, activeBasemapPreset, getStyledTiles, mapKey } = useMapStyles();
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const basemapTiles = getStyledTiles();

    let hasOuterContext = false;
    try {
        hasOuterContext = Boolean(useMapContext());
    } catch {
        hasOuterContext = false;
    }

    const content = (
        <div className="relative w-full h-full overflow-hidden design-map-container">
            <MapLibreFastRenderer
                center={center}
                zoom={zoom}
                onLocationChange={(lat, lng, snapId) => onLocationChange?.(lat, lng, 0, snapId as any)}
                onFinishDrawing={onFinishDrawing}
                onFinishDrawingSession={onFinishDrawingSession}
                isMeasureActive={isMeasureActive}
                basemapTiles={basemapTiles}
                basemapKey={mapKey}
                basemapPreset={activeBasemapPreset}
            />

            <MapSettingsPortal>
                <MapSettingsPanel
                    mapFeatures={mapFeatures}
                    setMapFeatures={setMapFeatures}
                    basemapId={basemapId}
                    setBasemapId={setBasemapId}
                    basemapPresets={basemapPresets}
                />
            </MapSettingsPortal>

            {showDORILayers && (
                <div className="absolute bottom-6 right-16 z-cad-map-control animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <DORILegend />
                </div>
            )}

            <MapLibreBoxSelection />
            <MapLibreMeasurementTool active={isMeasureActive} onDeactivate={onMeasureDeactivate} />
            <DORIOverlay />
            <FOVLayer />
            <InteractivePPM />
            <MapCaptureHandler />
            <StreetViewControl />
            <ZoomExtendControl />
            <ZoomToHandler />
        </div>
    );

    if (hasOuterContext) return content;
    return <MapProvider>{content}</MapProvider>;
}
