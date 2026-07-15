import React from 'react';
import { Polygon } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    getPointCoordinates,
    getEffectiveMountingHeight,
    getEffectiveCameraSpecs,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { calculateDORIRanges, calculateArcPoints, SENSOR_SIZES, calculateHFOV, mapRotationToHeading } from '@TOOL/utils/cameraMath';

export const DORIOverlay: React.FC = () => {
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const state = useDesignSync(s => s.state);
    const previewMetadata = useDesignSync(s => s.previewMetadata);

    if (!showDORILayers || !selectedFeatureId || !state) return null;

    const feature = state.features[selectedFeatureId];
    if (!feature) return null;

    // Prioritize preview metadata if it matches the selected feature
    const isPreviewing = previewMetadata?.id === selectedFeatureId;
    const baseMeta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata) : (feature.metadata || {});
    const metadata = isPreviewing ? { ...baseMeta, ...previewMetadata.metadata } : baseMeta;

    const isCamera = (
        feature.properties?.iconKey === 'cctv' ||
        getFeatureMetadataValue(feature, 'type', 'type', metadata) === 'camera' ||
        getFeatureMetadataValue(feature, 'specs.focal_length', 'focal_length', metadata) ||
        getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata) ||
        getFeatureMetadataValue(feature, 'specs.resolution_x', 'resolution_x', metadata) ||
        getFeatureMetadataValue(feature, 'specs.sensor_size', 'sensor_size', metadata)
    );

    if (!isCamera) return null;

    const coords = getPointCoordinates(feature);
    if (!coords) return null;

    const lat = coords[1] as number;
    const lng = coords[0] as number;

    // Support both flattened and nested metadata paths
    const rotationVal = parseFloat(String(getFeatureMetadataValue(feature, 'gis.rotation', 'rotation', metadata) ?? 0));
    const heading = mapRotationToHeading(rotationVal);

    const { focalLength, sensorSize, resolutionX } = getEffectiveCameraSpecs(feature, state?.settings, metadata);
    const installHeight = getEffectiveMountingHeight(feature, state?.settings, metadata);

    // Calculate hfov from focalLength and sensorSize if not explicitly in metadata
    const sensor = SENSOR_SIZES[sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/2.8"'];
    const calculatedHfov = calculateHFOV(sensor.width, focalLength);
    const hfov = parseFloat(String(getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata) ?? calculatedHfov));
    const targetHeight = parseFloat(String(getFeatureMetadataValue(feature, 'specs.target_height', 'targetHeight', metadata) ?? 1.7));

    const ranges = calculateDORIRanges(resolutionX, hfov, installHeight, targetHeight);

    // Sort ranges by distance to draw from furthest to nearest or vice versa correctly
    // We want to draw filled segments between R[i] and R[i+1]
    const sortedRanges = [...ranges].sort((a, b) => b.distance - a.distance);

    return (
        <>
            {sortedRanges.map((range, index) => {
                const nextDistance = index < sortedRanges.length - 1 ? sortedRanges[index + 1].distance : 0;

                // Calculate outer arc points
                const outerArc = calculateArcPoints(lat, lng, range.distance, heading, hfov);
                // Calculate inner arc points (reversed for polygon winding)
                const innerArc = nextDistance > 0
                    ? calculateArcPoints(lat, lng, nextDistance, heading, hfov).reverse()
                    : [[lat, lng]] as [number, number][]; // Origin if it's the closest zone

                const polygonPoints = [...outerArc, ...innerArc];

                return (
                    <Polygon
                        key={`${range.label}-${heading}-${hfov}-${range.distance}-${nextDistance}`}
                        positions={polygonPoints}
                        pathOptions={{
                            fillColor: range.color,
                            fillOpacity: 0.3,
                            color: range.color,
                            weight: 1,
                            dashArray: '5, 5'
                        }}
                        interactive={false}
                    />
                );
            })}
        </>
    );
};
