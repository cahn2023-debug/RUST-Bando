import type { FeatureState } from '@CONTRACT/types';

export const MAP_POINT_CLUSTER_MAX_ZOOM = 14;
export const MAP_POINT_CLUSTER_HIDE_AT_ZOOM = 15;
export const MAP_INTERSECTION_CHILD_MIN_ZOOM = 17;
export const MAP_FOV_MIN_ZOOM = 13;

const parseObject = (value: unknown): Record<string, any> => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
};

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';

export const isIntersectionGroup = (group?: Record<string, any> | null) => {
    if (!group) return false;
    const groupType = String(group.type || '').toUpperCase();
    const groupName = String(group.name || '').toLowerCase();
    return (
        groupType === 'INTERSECTION' ||
        groupType === 'NUT_GIAO' ||
        groupName.includes('nut giao') ||
        groupName.includes('nút giao') ||
        groupName.includes('intersection')
    );
};

export const isMapIntersectionChild = (
    feature: FeatureState,
    group?: Record<string, any> | null,
    metadata: Record<string, any> = {},
    displayInfo?: { isIntersection?: boolean; iconKey?: string | null } | null
) => {
    if (displayInfo?.isIntersection || displayInfo?.iconKey === 'intersection') return false;

    const properties = parseObject(feature.properties);
    const gis = parseObject(metadata.gis);
    const parentFeatureId =
        (feature as any).parent_feature_id ??
        metadata.parent_feature_id ??
        gis.parent_feature_id ??
        properties.parent_feature_id;

    return hasValue(parentFeatureId) || isIntersectionGroup(group);
};
