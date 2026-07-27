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

const metadataNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

export const FOVLayer = React.memo(({
    features,
    feature_groups,
    previewMetadata,
    currentZoom,
    renderedPointIds,
    renderLimit = 250
}: any) => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const showFovTypes = useSettingsStore(s => s.showFovTypes);
    const isClickThrough = drawingMode !== 'none' && drawingMode !== 'move';

    const fovItems = React.useMemo(() => {
        const items: Array<{
            id: string;
            points: [number, number][];
            color: string;
            isClickThrough: boolean;
        }> = [];

        for (const f of features) {
            if (items.length >= renderLimit) break;
            const geomType = String(f.geom_type || '').toLowerCase();
            if (geomType && geomType !== 'point') continue;
            if (renderedPointIds && !renderedPointIds.has(f.id)) continue;

            const group = feature_groups[f.group_id];
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
                !!metadata.parent_feature_id;
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

            items.push({
                id: `fov-${f.id}-${rotation}-${fovAngle}-${fovRadius}`,
                points,
                color: displayInfo.color || '#3b82f6',
                isClickThrough
            });
        }

        return items;
    }, [features, feature_groups, previewMetadata, currentZoom, renderedPointIds, showFovTypes, renderLimit, isClickThrough]);

    return (
        <>
            {fovItems.map(item => (
                <Polygon
                    key={item.id}
                    positions={item.points}
                    pathOptions={{
                        color: item.color,
                        weight: 1,
                        fillOpacity: 0.15,
                        fillColor: item.color,
                        dashArray: '5, 5',
                        className: item.isClickThrough ? 'pointer-events-none' : ''
                    }}
                    interactive={false}
                />
            ))}
        </>
    );
});
