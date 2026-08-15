import { MapProvider, useMapContext } from './MapContext';
import './MapLayer.css';
import {
    MapLibreMeasurementTool,
    MapLibreBoxSelection,
    MapCaptureHandler,
    DORIOverlay,
    FOVLayer,
    InteractivePPM,
    ZoomExtendControl,
    ZoomToHandler,
} from '@DESIGN/features/map/MapLayerComponents';
import { DORILegend } from '@DESIGN/features/map/MapLayerComponents/DORILegend';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { CADCanvasEngine } from '@DESIGN/features/canvas/CADCanvasEngine';

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
    const showDORILayers = useDesignSync(s => s.showDORILayers);

    let hasOuterContext = false;
    try {
        hasOuterContext = Boolean(useMapContext());
    } catch {
        hasOuterContext = false;
    }

    const content = (
        <div className="relative w-full h-full overflow-hidden design-map-container pointer-events-auto bg-[#0b0f19]">
            {/* Pure CAD Canvas 2D Engine (Non-Map Independent) */}
            <CADCanvasEngine
                initialCenter={center}
                initialZoom={zoom}
                onLocationChange={onLocationChange}
                onFinishDrawing={onFinishDrawing}
                onFinishDrawingSession={onFinishDrawingSession}
                isMeasureActive={isMeasureActive}
            />

            {showDORILayers && (
                <div className="absolute bottom-6 right-16 z-cad-map-control pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <DORILegend />
                </div>
            )}

            <MapLibreBoxSelection />
            <MapLibreMeasurementTool active={isMeasureActive} onDeactivate={onMeasureDeactivate} />
            <DORIOverlay />
            <FOVLayer />
            <InteractivePPM />
            <MapCaptureHandler />
            <ZoomExtendControl />
            <ZoomToHandler />
        </div>
    );

    if (hasOuterContext) return content;
    return <MapProvider>{content}</MapProvider>;
}
