import React from 'react';
import { useMapContext } from '../MapContext';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    getPointCoordinates,
    getEffectiveMountingHeight,
    getEffectiveCameraSpecs,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { calculateDORIRanges, calculateArcPoints, SENSOR_SIZES, calculateHFOV, mapRotationToHeading } from '@TOOL/utils/cameraMath';
import { getRenderableFeatureById } from '../featureLookup';

const DORI_SOURCE_ID = 'maplibre-dori-source';
const DORI_FILL_LAYER_ID = 'maplibre-dori-fill';
const DORI_LINE_LAYER_ID = 'maplibre-dori-line';

const emptyCollection = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

const metadataNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const parseMetadata = (value: unknown) => {
    if (typeof value !== 'string') return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
};

const removeDoriLayers = (map: maplibregl.Map) => {
    try {
        if (!(map as any).style) return;
        if (map.getLayer(DORI_LINE_LAYER_ID)) map.removeLayer(DORI_LINE_LAYER_ID);
        if (map.getLayer(DORI_FILL_LAYER_ID)) map.removeLayer(DORI_FILL_LAYER_ID);
        if (map.getSource(DORI_SOURCE_ID)) map.removeSource(DORI_SOURCE_ID);
    } catch {
        // Layer cleanup can race with MapLibre style disposal.
    }
};

const ensureDoriLayers = (map: maplibregl.Map, data: GeoJSON.FeatureCollection) => {
    const source = map.getSource(DORI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
        source.setData(data);
        return;
    }

    map.addSource(DORI_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
        id: DORI_FILL_LAYER_ID,
        type: 'fill',
        source: DORI_SOURCE_ID,
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.3,
        },
    });
    map.addLayer({
        id: DORI_LINE_LAYER_ID,
        type: 'line',
        source: DORI_SOURCE_ID,
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 1,
            'line-dasharray': [2, 2],
        },
    });
};

export const DORIOverlay: React.FC = () => {
    const { map } = useMapContext();
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const state = useDesignSync(s => s.state);
    const visibleFeatures = useDesignSync(s => s.visibleFeatures);
    const featureDetailsCache = useDesignSync(s => s.featureDetailsCache);
    const previewMetadata = useDesignSync(s => s.previewMetadata);

    const collection = React.useMemo<GeoJSON.FeatureCollection>(() => {
        if (!showDORILayers || !selectedFeatureId || !state) return emptyCollection();

        const feature = getRenderableFeatureById(selectedFeatureId, { state, visibleFeatures, featureDetailsCache });
        if (!feature) return emptyCollection();

        const isPreviewing = previewMetadata?.id === selectedFeatureId;
        const baseMeta = parseMetadata(feature.metadata);
        const metadata = isPreviewing ? { ...baseMeta, ...previewMetadata.metadata } : baseMeta;

        const isCamera = (
            feature.properties?.iconKey === 'cctv' ||
            getFeatureMetadataValue(feature, 'type', 'type', metadata) === 'camera' ||
            getFeatureMetadataValue(feature, 'specs.focal_length', 'focal_length', metadata) ||
            getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata) ||
            getFeatureMetadataValue(feature, 'specs.resolution_x', 'resolution_x', metadata) ||
            getFeatureMetadataValue(feature, 'specs.sensor_size', 'sensor_size', metadata)
        );
        if (!isCamera) return emptyCollection();

        const coords = getPointCoordinates(feature);
        if (!coords) return emptyCollection();

        const lat = coords[1] as number;
        const lng = coords[0] as number;
        const rotationVal = metadataNumber(getFeatureMetadataValue(feature, 'gis.rotation', 'rotation', metadata), 0);
        const heading = mapRotationToHeading(rotationVal);
        const { focalLength, sensorSize, resolutionX } = getEffectiveCameraSpecs(feature, state.settings, metadata);
        const installHeight = getEffectiveMountingHeight(feature, state.settings, metadata);
        const sensor = SENSOR_SIZES[sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/2.8"'];
        const calculatedHfov = calculateHFOV(sensor.width, focalLength);
        const hfov = metadataNumber(getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata), calculatedHfov);
        const targetHeight = metadataNumber(getFeatureMetadataValue(feature, 'specs.target_height', 'targetHeight', metadata), 1.7);
        const ranges = calculateDORIRanges(resolutionX, hfov, installHeight, targetHeight);
        const sortedRanges = [...ranges].sort((a, b) => b.distance - a.distance);

        return {
            type: 'FeatureCollection',
            features: sortedRanges.map((range, index) => {
                const nextDistance = index < sortedRanges.length - 1 ? sortedRanges[index + 1].distance : 0;
                const outerArc = calculateArcPoints(lat, lng, range.distance, heading, hfov);
                const innerArc = nextDistance > 0
                    ? calculateArcPoints(lat, lng, nextDistance, heading, hfov).reverse()
                    : [[lat, lng]] as [number, number][];
                const coordinates = [...outerArc, ...innerArc].map(point => [point[1], point[0]]);
                if (coordinates.length > 0) coordinates.push(coordinates[0]);
                return {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [coordinates] },
                    properties: { color: range.color, label: range.label },
                } as GeoJSON.Feature;
            }),
        };
    }, [featureDetailsCache, previewMetadata, selectedFeatureId, showDORILayers, state, visibleFeatures]);

    React.useEffect(() => {
        if (!map) return;
        if (collection.features.length === 0) {
            removeDoriLayers(map);
            return;
        }

        const apply = () => ensureDoriLayers(map, collection);
        if (map.isStyleLoaded()) apply();
        else map.once('styledata', apply);

        return () => {
            map.off('styledata', apply);
        };
    }, [collection, map]);

    React.useEffect(() => () => {
        if (map) removeDoriLayers(map);
    }, [map]);

    return null;
};
