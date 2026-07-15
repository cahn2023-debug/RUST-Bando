import { useState } from 'react';
import { MapContainer, TileLayer, LayersControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapLayer.css';
import {
    LocationMarker,
    DesignFeatures,
    ZoomToHandler,
    ZoomExtendControl,
    BoxSelectionHandler,
    StreetViewControl,
    PrintAreaHandler,
    MapCaptureHandler,
    DORIOverlay,
    InteractivePPM,
    MapResizeObserver,
    MeasurementTool
} from '@DESIGN/features/map/MapLayerComponents';
import { DORILegend } from '@DESIGN/features/map/MapLayerComponents/DORILegend';
import { MapSettingsPortal } from './MapSettingsPortal';
import { useMapStyles } from './useMapStyles';
import { MapSettingsPanel } from './MapSettings/MapSettingsPanel';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const BASEMAP_STORAGE_KEY = 'design.map.selectedBasemap';
const BASEMAP_NAMES = [
    'Google Streets',
    'Google Satellite (Hybrid)',
    'Google Satellite (Trắng đen)',
    'Google Terrain'
] as const;
const DEFAULT_BASEMAP_NAME = 'Google Satellite (Hybrid)';

type BasemapName = typeof BASEMAP_NAMES[number];

const isBasemapName = (value: string | null): value is BasemapName => {
    return BASEMAP_NAMES.includes(value as BasemapName);
};

const getSavedBasemapName = (): BasemapName => {
    if (typeof window === 'undefined') return DEFAULT_BASEMAP_NAME;

    try {
        const savedBasemapName = window.localStorage.getItem(BASEMAP_STORAGE_KEY);
        return isBasemapName(savedBasemapName) ? savedBasemapName : DEFAULT_BASEMAP_NAME;
    } catch {
        return DEFAULT_BASEMAP_NAME;
    }
};

interface MapLayerProps {
    center: [number, number];
    zoom: number;
    onLocationChange?: (lat: number, lng: number, x: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
    isMeasureActive?: boolean;
    onMeasureDeactivate?: () => void;
}

function BasemapPersistence({ onBasemapChange }: { onBasemapChange: (name: BasemapName) => void }) {
    useMapEvents({
        baselayerchange: (event: L.LayersControlEvent) => {
            if (!isBasemapName(event.name)) return;

            onBasemapChange(event.name);
            try {
                window.localStorage.setItem(BASEMAP_STORAGE_KEY, event.name);
            } catch {
                // localStorage can be unavailable in restricted browser contexts.
            }
        }
    });

    return null;
}

export function MapLayer({
    center,
    zoom,
    onLocationChange,
    onFinishDrawing,
    onFinishDrawingSession,
    isMeasureActive = false,
    onMeasureDeactivate = () => { }
}: MapLayerProps) {
    const [selectedBasemapName, setSelectedBasemapName] = useState<BasemapName>(getSavedBasemapName);
    const {
        isGrayscale,
        setIsGrayscale,
        mapFeatures,
        setMapFeatures,
        getStyledUrl,
        mapKey
    } = useMapStyles();
    const showDORILayers = useDesignSync(s => s.showDORILayers);

    return (
        <MapContainer
            center={center}
            zoom={zoom}
            maxZoom={36}
            scrollWheelZoom={true}
            preferCanvas={true}
            style={{ height: '100%', width: '100%', background: 'transparent' }}
            zoomControl={false}
            attributionControl={false}
            boxZoom={false}
            className={isGrayscale ? 'grayscale-basemap' : ''}
        >
            <LayersControl position="topright">
                <LayersControl.BaseLayer checked={selectedBasemapName === 'Google Streets'} name="Google Streets">
                    <TileLayer
                        key={`r-${mapKey}`}
                        url={getStyledUrl('r')}
                        maxZoom={36}
                        maxNativeZoom={20}
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer checked={selectedBasemapName === 'Google Satellite (Hybrid)'} name="Google Satellite (Hybrid)">
                    <TileLayer
                        key={`y-${mapKey}`}
                        url={getStyledUrl('y')}
                        maxZoom={36}
                        maxNativeZoom={20}
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer checked={selectedBasemapName === 'Google Satellite (Trắng đen)'} name="Google Satellite (Trắng đen)">
                    <TileLayer
                        className="grayscale-tile"
                        key={`sbw-${mapKey}`}
                        url={getStyledUrl('y')}
                        maxZoom={36}
                        maxNativeZoom={20}
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer checked={selectedBasemapName === 'Google Terrain'} name="Google Terrain">
                    <TileLayer
                        key={`p-${mapKey}`}
                        url={getStyledUrl('p')}
                        maxZoom={36}
                        maxNativeZoom={20}
                    />
                </LayersControl.BaseLayer>

                <LayersControl.Overlay name="Chế độ Đen Trắng (Toàn bộ)">
                    <TileLayer url="" eventHandlers={{ add: () => setIsGrayscale(true), remove: () => setIsGrayscale(false) }} />
                </LayersControl.Overlay>
            </LayersControl>
            <BasemapPersistence onBasemapChange={setSelectedBasemapName} />

            <MapSettingsPortal>
                <MapSettingsPanel
                    mapFeatures={mapFeatures}
                    setMapFeatures={setMapFeatures}
                />
            </MapSettingsPortal>

            {/* Always visible Design and DORI components */}
            <DesignFeatures />
            <DORIOverlay />
            <InteractivePPM />

            {showDORILayers && (
                <div className="absolute bottom-6 right-16 z-[1000] animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <DORILegend />
                </div>
            )}

            <LocationMarker
                onLocationChange={(lat, lng, snapId) => onLocationChange?.(lat, lng, 0, snapId as any)}
                onFinishDrawing={onFinishDrawing}
                onFinishDrawingSession={onFinishDrawingSession}
                isMeasureActive={isMeasureActive}
            />

            <ZoomToHandler />
            <ZoomExtendControl />
            <BoxSelectionHandler />
            <StreetViewControl />
            <PrintAreaHandler />
            <MapCaptureHandler />
            <MapResizeObserver />
            <MeasurementTool active={isMeasureActive} onDeactivate={onMeasureDeactivate} />
        </MapContainer>
    );
}
