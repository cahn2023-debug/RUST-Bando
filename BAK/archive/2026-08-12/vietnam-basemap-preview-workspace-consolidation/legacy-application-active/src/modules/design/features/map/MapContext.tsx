import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useBasemap } from '@/core/basemap';

interface MapContextType {
    map: maplibregl.Map | null;
    setMap: (map: maplibregl.Map | null) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [map, setMap] = useState<maplibregl.Map | null>(null);
    const [basemapRevision, setBasemapRevision] = useState(0);
    let basemapController = null;
    try {
        basemapController = useBasemap().controller;
    } catch {
        // BasemapProvider is optional for legacy tests and isolated design surfaces.
    }

    useEffect(() => {
        if (!basemapController) return;
        return basemapController.subscribeLifecycle(() => {
            setBasemapRevision(revision => revision + 1);
        });
    }, [basemapController]);

    const value = useMemo(() => ({
        map: map || basemapController?.getMap() || null,
        setMap,
    }), [basemapController, basemapRevision, map]);

    return (
        <MapContext.Provider value={value}>
            {children}
        </MapContext.Provider>
    );
};

export const useMapContext = () => {
    const context = useContext(MapContext);
    if (context === undefined) {
        throw new Error('useMapContext must be used within a MapProvider');
    }
    return context;
};
