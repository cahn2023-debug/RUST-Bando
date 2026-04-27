import { useState, useMemo } from 'react';

export interface MapFeatures {
    roads: boolean;
    roadNames: boolean;
    buildings: boolean;
    pois: boolean;
    labels: boolean;
}

export function useMapStyles() {
    const [isGrayscale, setIsGrayscale] = useState(false);
    const [mapFeatures, setMapFeatures] = useState<MapFeatures>({
        roads: true,
        roadNames: true,
        buildings: true,
        pois: true,
        labels: true
    });

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
        return `https://mt1.google.com/vt/lyrs=${lyr}&hl=vi&x={x}&y={y}&z={z}${styleParam}`;
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
