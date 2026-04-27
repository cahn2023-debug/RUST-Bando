import React from 'react';
import { Polygon } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getParsedCoordinates, getEffectiveMountingHeight, getEffectiveCameraSpecs } from '@TOOL/utils/featureUtils';
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
        metadata.type === 'camera' ||
        metadata.focal_length ||
        metadata.hfov ||
        metadata['specs.resolution_x'] ||
        metadata['specs.sensor_size']
    );

    if (!isCamera) return null;

    const coords = getParsedCoordinates(feature);
    if (!coords) return null;

    const lat = coords[1] as number;
    const lng = coords[0] as number;

    // Support both flattened and nested metadata paths
    const rotationVal = parseFloat(metadata['gis.rotation'] ?? metadata.rotation ?? 0);
    const heading = mapRotationToHeading(rotationVal);

    const { focalLength, sensorSize, resolutionX } = getEffectiveCameraSpecs(feature, state?.settings, metadata);
    const installHeight = getEffectiveMountingHeight(feature, state?.settings, metadata);

    // Calculate hfov from focalLength and sensorSize if not explicitly in metadata
    const sensor = SENSOR_SIZES[sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/2.8"'];
    const calculatedHfov = calculateHFOV(sensor.width, focalLength);
    const hfov = parseFloat(metadata['specs.hfov'] ?? metadata.hfov ?? calculatedHfov);
    const targetHeight = parseFloat(metadata['specs.target_height'] ?? metadata.targetHeight ?? 1.7);

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
                        key={range.label}
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
