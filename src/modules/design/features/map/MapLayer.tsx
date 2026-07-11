import { MapContainer, TileLayer, LayersControl } from 'react-leaflet';
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
    MapResizeObserver
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

interface MapLayerProps {
    center: [number, number];
    zoom: number;
    onLocationChange?: (lat: number, lng: number, x: number, snapId?: string | null) => void;
    onFinishDrawing?: () => void;
    onFinishDrawingSession?: () => void;
}

export function MapLayer({ center, zoom, onLocationChange, onFinishDrawing, onFinishDrawingSession }: MapLayerProps) {
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
            scrollWheelZoom={true}
            preferCanvas={true}
            style={{ height: '100%', width: '100%', background: 'transparent' }}
            zoomControl={false}
            boxZoom={false}
            className={isGrayscale ? 'grayscale-basemap' : ''}
        >
            <LayersControl position="topright">
                <LayersControl.BaseLayer name="Google Streets">
                    <TileLayer
                        key={`r-${mapKey}`}
                        url={getStyledUrl('r')}
                        maxZoom={20}
                        attribution="&copy; Google"
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer checked name="Google Satellite (Hybrid)">
                    <TileLayer
                        key={`y-${mapKey}`}
                        url={getStyledUrl('y')}
                        maxZoom={20}
                        attribution="&copy; Google"
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Google Satellite (Trắng đen)">
                    <TileLayer
                        className="grayscale-tile"
                        key={`sbw-${mapKey}`}
                        url={getStyledUrl('y')}
                        maxZoom={20}
                        attribution="&copy; Google"
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Google Terrain">
                    <TileLayer
                        key={`p-${mapKey}`}
                        url={getStyledUrl('p')}
                        maxZoom={20}
                        attribution="&copy; Google"
                    />
                </LayersControl.BaseLayer>

                <LayersControl.Overlay name="Chế độ Đen Trắng (Toàn bộ)">
                    <TileLayer url="" eventHandlers={{ add: () => setIsGrayscale(true), remove: () => setIsGrayscale(false) }} />
                </LayersControl.Overlay>
            </LayersControl>

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
            />

            <ZoomToHandler />
            <ZoomExtendControl />
            <BoxSelectionHandler />
            <StreetViewControl />
            <PrintAreaHandler />
            <MapCaptureHandler />
            <MapResizeObserver />
        </MapContainer>
    );
}
