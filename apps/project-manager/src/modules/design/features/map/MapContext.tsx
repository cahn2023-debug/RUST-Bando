import React, { createContext, useContext, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';

interface MapContextType {
    map: maplibregl.Map | null;
    setMap: (map: maplibregl.Map | null) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [map, setMap] = useState<maplibregl.Map | null>(null);
    const value = useMemo(() => ({
        map,
        setMap,
    }), [map]);

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
