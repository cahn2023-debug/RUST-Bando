import { useEffect, useMemo, useState } from 'react';

export interface MapFeatures {
    roads: boolean;
    roadNames: boolean;
    buildings: boolean;
    pois: boolean;
    labels: boolean;
}

const MAP_FEATURES_STORAGE_KEY = 'design.map.features';
const DEFAULT_MAP_FEATURES: MapFeatures = {
    roads: true,
    roadNames: true,
    buildings: true,
    pois: true,
    labels: true
};

const getSavedMapFeatures = (): MapFeatures => {
    if (typeof window === 'undefined') return DEFAULT_MAP_FEATURES;

    try {
        const savedFeatures = window.localStorage.getItem(MAP_FEATURES_STORAGE_KEY);
        if (!savedFeatures) return DEFAULT_MAP_FEATURES;

        const parsedFeatures = JSON.parse(savedFeatures) as Partial<MapFeatures>;
        return {
            roads: typeof parsedFeatures.roads === 'boolean' ? parsedFeatures.roads : DEFAULT_MAP_FEATURES.roads,
            roadNames: typeof parsedFeatures.roadNames === 'boolean' ? parsedFeatures.roadNames : DEFAULT_MAP_FEATURES.roadNames,
            buildings: typeof parsedFeatures.buildings === 'boolean' ? parsedFeatures.buildings : DEFAULT_MAP_FEATURES.buildings,
            pois: typeof parsedFeatures.pois === 'boolean' ? parsedFeatures.pois : DEFAULT_MAP_FEATURES.pois,
            labels: typeof parsedFeatures.labels === 'boolean' ? parsedFeatures.labels : DEFAULT_MAP_FEATURES.labels
        };
    } catch {
        return DEFAULT_MAP_FEATURES;
    }
};

export function useMapStyles() {
    const [isGrayscale, setIsGrayscale] = useState(false);
    const [mapFeatures, setMapFeatures] = useState<MapFeatures>(getSavedMapFeatures);

    useEffect(() => {
        try {
            window.localStorage.setItem(MAP_FEATURES_STORAGE_KEY, JSON.stringify(mapFeatures));
        } catch {
            // localStorage can be unavailable in restricted browser contexts.
        }
    }, [mapFeatures]);

    const getStyledUrl = (lyr: string) => {
        const rules: string[] = [];
        // Road Geometry (the lines)
        if (!mapFeatures.roads) rules.push('s.t:3|s.e:g|p.v:off');
        // Road Labels (the text names)
        if (!mapFeatures.roadNames) rules.push('s.t:3|s.e:l|p.v:off');
        // Buildings and landuse
        if (!mapFeatures.buildings) rules.push('s.t:2|p.v:off', 's.t:5|p.v:off');
        // Points of Interest
        if (!mapFeatures.pois) rules.push('s.t:8|p.v:off');
        // Global labels (Towns, Regions, Countries, Water, Parks)
        if (!mapFeatures.labels) rules.push('s.t:1|s.e:l|p.v:off', 's.t:2|s.e:l|p.v:off', 's.t:4|s.e:l|p.v:off', 's.t:6|s.e:l|p.v:off');

        const styleParam = rules.length > 0 ? `&apistyle=${encodeURIComponent(rules.join(','))}` : '';
        return `https://mt1.google.com/vt/lyrs=${lyr}&hl=vi&gl=vn&x={x}&y={y}&z={z}${styleParam}`;
    };

    const mapKey = useMemo(() => JSON.stringify(mapFeatures), [mapFeatures]);

    return {
        isGrayscale,
        setIsGrayscale,
        mapFeatures,
        setMapFeatures,
        getStyledUrl,
        mapKey
    };
}
