import React from 'react';
import { useMapContext } from '../MapContext';
import { useDesignSync, EMPTY_OBJ } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import {
    getFeatureDisplayInfo,
    getPointCoordinates,
    calculateFOVPoints,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { getParsedMetadata } from './SharedMapComponents';

const FOV_SOURCE_ID = 'maplibre-fov-source';
const FOV_FILL_LAYER_ID = 'maplibre-fov-fill';
const FOV_LINE_LAYER_ID = 'maplibre-fov-line';

const metadataNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const removeFovLayers = (map: maplibregl.Map) => {
    if (map.getLayer(FOV_LINE_LAYER_ID)) map.removeLayer(FOV_LINE_LAYER_ID);
    if (map.getLayer(FOV_FILL_LAYER_ID)) map.removeLayer(FOV_FILL_LAYER_ID);
    if (map.getSource(FOV_SOURCE_ID)) map.removeSource(FOV_SOURCE_ID);
};

const ensureFovLayers = (map: maplibregl.Map, data: GeoJSON.FeatureCollection) => {
    const source = map.getSource(FOV_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
        source.setData(data);
        return;
    }

    map.addSource(FOV_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
        id: FOV_FILL_LAYER_ID,
        type: 'fill',
        source: FOV_SOURCE_ID,
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.15,
        },
    });
    map.addLayer({
        id: FOV_LINE_LAYER_ID,
        type: 'line',
        source: FOV_SOURCE_ID,
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 1,
            'line-dasharray': [2, 2],
        },
    });
};

export const FOVLayer = React.memo(() => {
    const { map } = useMapContext();
    const rawFeatures = useDesignSync(s => s.state?.features || (EMPTY_OBJ as Record<string, any>));
    const visibleFeatures = useDesignSync(s => s.visibleFeatures);
    const isLargeProject = useDesignSync(s => Boolean(s.state?.isLargeProject));
    const featureGroups = useDesignSync(s => s.state?.feature_groups || (EMPTY_OBJ as Record<string, any>));
    const previewMetadata = useDesignSync(s => s.previewMetadata);
    const drawingMode = useDesignSync(s => s.drawingMode);
    const showFovTypes = useSettingsStore(s => s.showFovTypes);
    const [currentZoom, setCurrentZoom] = React.useState(() => map?.getZoom() ?? 0);

    React.useEffect(() => {
        if (!map) return;
        const syncZoom = () => setCurrentZoom(map.getZoom());
        syncZoom();
        map.on('zoomend', syncZoom);
        return () => {
            map.off('zoomend', syncZoom);
        };
    }, [map]);

    const collection = React.useMemo<GeoJSON.FeatureCollection>(() => {
        const features = Object.values(isLargeProject ? visibleFeatures : rawFeatures);
        const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';
        const items: GeoJSON.Feature[] = [];

        for (const f of features) {
            if (items.length >= 250) break;
            const geomType = String(f.geom_type || '').toLowerCase();
            if (geomType && geomType !== 'point') continue;

            const group = f.group_id ? featureGroups[f.group_id] : null;
            if (!group) continue;

            const metadata = getParsedMetadata(f, previewMetadata);
            const displayInfo = getFeatureDisplayInfo(f, group.type, group.name, metadata);
            const typeEnabled = showFovTypes.includes(displayInfo.iconKey);
            const showFov = getFeatureMetadataValue(f, 'gis.show_fov', 'show_fov', metadata) !== false;
            if (!displayInfo.isCamera || !typeEnabled || !showFov) continue;

            const groupType = String(group.type || '').toUpperCase();
            const groupName = String(group.name || '').toLowerCase();
            const isInsideIntersection =
                groupType === 'INTERSECTION' ||
                groupType === 'NUT_GIAO' ||
                groupName.includes('nut giao') ||
                groupName.includes('intersection') ||
                Boolean(metadata.parent_feature_id);
            const isJunctionIcon = displayInfo.isIntersection && displayInfo.iconKey === 'intersection';

            if (currentZoom < 13) continue;
            if (isInsideIntersection && !isJunctionIcon && currentZoom < 17) continue;

            const coords = getPointCoordinates(f);
            if (!coords) continue;

            const rotation = metadataNumber(getFeatureMetadataValue(f, 'gis.rotation', 'rotation', metadata), 0);
            const fovAngle = metadataNumber(getFeatureMetadataValue(f, 'gis.fov_angle', 'fov_angle', metadata), 60);
            const fovRadius = metadataNumber(getFeatureMetadataValue(f, 'gis.fov_radius', 'fov_radius', metadata), 50);
            const points = calculateFOVPoints(coords, fovRadius, rotation, fovAngle);
            if (points.length === 0) continue;

            const coordinates = points.map(point => [point[1], point[0]]);
            coordinates.push(coordinates[0]);
            items.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [coordinates] },
                properties: {
                    id: f.id,
                    color: displayInfo.color || '#3b82f6',
                    clickThrough: isClickThrough,
                },
            });
        }

        return { type: 'FeatureCollection', features: items };
    }, [currentZoom, drawingMode, featureGroups, isLargeProject, previewMetadata, rawFeatures, showFovTypes, visibleFeatures]);

    React.useEffect(() => {
        if (!map) return;
        if (collection.features.length === 0) {
            removeFovLayers(map);
            return;
        }

        const apply = () => ensureFovLayers(map, collection);
        if (map.isStyleLoaded()) apply();
        else map.once('styledata', apply);

        return () => {
            map.off('styledata', apply);
        };
    }, [collection, map]);

    React.useEffect(() => () => {
        if (map) removeFovLayers(map);
    }, [map]);

    return null;
});
