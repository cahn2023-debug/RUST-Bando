import React from 'react';
import { Polygon } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import {
    getFeatureDisplayInfo,
    getPointCoordinates,
    calculateFOVPoints,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { getParsedMetadata } from './SharedMapComponents';

/**
 * Layer component for rendering Camera Field of View (FOV) cones.
 * Renders circular sectors (wedges) for point features configured as cameras.
 */
export const FOVLayer = React.memo(({
    features,
    feature_groups,
    previewMetadata,
    currentZoom
}: any) => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const showFovTypes = useSettingsStore(s => s.showFovTypes);
    const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';


    return (
        <>
            {features.map((f: any) => {
                // Only process points (cameras are always points)
                const geomType = String(f.geom_type || '').toLowerCase();
                if (geomType && geomType !== 'point') return null;

                const group = feature_groups[f.group_id];
                if (!group) return null;

                const metadata = getParsedMetadata(f, previewMetadata);
                const displayInfo = getFeatureDisplayInfo(f, group.type, group.name, metadata);

                // Only render if it's a camera and FOV is enabled globally and locally
                const isCamera = displayInfo.isCamera;
                const typeEnabled = showFovTypes.includes(displayInfo.iconKey);
                const showFov = getFeatureMetadataValue(f, 'gis.show_fov', 'show_fov', metadata) !== false;

                if (!isCamera || !typeEnabled || !showFov) return null;

                // --- Threshold logic ---
                // We want to hide FOV when zoomed out to see the whole intersection or map summary.

                // 1. Detection: Is this a device inside an intersection?
                const groupType = (group.type || '').toUpperCase();
                const groupName = (group.name || '').toLowerCase();
                const hasParent = !!metadata.parent_feature_id;

                const isInsideIntersection =
                    groupType === 'INTERSECTION' ||
                    groupType === 'NUT_GIAO' ||
                    groupName.includes('nút giao') ||
                    groupName.includes('intersection') ||
                    hasParent;

                const isJunctionIcon = displayInfo.isIntersection && displayInfo.iconKey === 'intersection';

                // 2. Zoom Thresholds
                const CLUSTER_ZOOM_THRESHOLD = 17; // Lowered from 18 to show FOVs earlier in intersections
                const GLOBAL_HIDE_THRESHOLD = 13; // Lowered from 15 to show FOVs from further out

                // Logic A: Hide all FOVs if extremely zoomed out (Performance & Clarity)
                if (currentZoom < GLOBAL_HIDE_THRESHOLD) return null;

                // Logic B: Hide FOVs for devices inside intersections when zoomed out
                if (isInsideIntersection && !isJunctionIcon && currentZoom < CLUSTER_ZOOM_THRESHOLD) {
                    return null;
                }

                const coords = getPointCoordinates(f);
                if (!coords) return null;

                // Extract FOV parameters from metadata
                const rotation = parseFloat(String(getFeatureMetadataValue(f, 'gis.rotation', 'rotation', metadata) ?? 0));
                const fovAngle = parseFloat(String(getFeatureMetadataValue(f, 'gis.fov_angle', 'fov_angle', metadata) ?? 60));
                const fovRadius = parseFloat(String(getFeatureMetadataValue(f, 'gis.fov_radius', 'fov_radius', metadata) ?? 50));

                // Calculate polygon points (Offsets are now handled in calculateFOVPoints)
                const fovPoints = calculateFOVPoints(coords, fovRadius, rotation, fovAngle);

                if (fovPoints.length === 0) return null;

                return (
                    <Polygon
                        key={`fov-${f.id}-${rotation}-${fovAngle}-${fovRadius}`}
                        positions={fovPoints}
                        pathOptions={{
                            color: displayInfo.color || '#3b82f6',
                            weight: 1,
                            fillOpacity: 0.15,
                            fillColor: displayInfo.color || '#3b82f6',
                            dashArray: '5, 5',
                            className: isClickThrough ? 'pointer-events-none' : ''
                        }}
                        interactive={false} // FOV area itself is not interactive to avoid blocking camera click
                    />
                );
            })}
        </>
    );
});
