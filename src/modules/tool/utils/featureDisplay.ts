import { Circle, MapPin } from "lucide-react";
import { Intersection, PolylineIcon, CameraCCTV, CameraPTZ, CameraSpeed, CameraLPR } from '../../design/components/icons/MapIcons';
import { getParsedMetadata, safeString } from "./featureMetadata";
import type { FeatureProperties, IconType } from '@CONTRACT/types';

/**
 * Camera icon types
 */
export const CAMERA_ICONS = ['camera', 'cctv', 'ptz', 'speed', 'lpr'];

/**
 * Intersection icon identifier
 */
export const INTERSECTION_ICON = 'intersection';

export type FeatureSymbolData = {
    iconKey: IconType;
    objectType: string;
    label: string;
};

/**
 * Display names for various object types
 */
export const DISPLAY_TYPES = {
    INTERSECTION: 'Nút giao',
    CCTV: 'CCTV',
    PTZ: 'PTZ',
    SPEED: 'SPEED',
    LPR: 'LPR',
    CABINET: 'Tủ thiết bị',
    PILLAR: 'Cột/Trụ',
    BRIDGE: 'Cầu/Hầm',
    POINT: 'Điểm',
    LINE: 'Tuyến',
    POLYGON: 'Vùng',
} as const;

export const SYMBOL_ICON_OPTIONS: Array<{ id: IconType; label: string; component: any }> = [
    { id: 'default', label: 'Mặc định', component: MapPin },
    { id: 'intersection', label: DISPLAY_TYPES.INTERSECTION, component: Intersection },
    { id: 'cctv', label: DISPLAY_TYPES.CCTV, component: CameraCCTV },
    { id: 'ptz', label: DISPLAY_TYPES.PTZ, component: CameraPTZ },
    { id: 'speed', label: DISPLAY_TYPES.SPEED, component: CameraSpeed },
    { id: 'lpr', label: DISPLAY_TYPES.LPR, component: CameraLPR },
    { id: 'point_circle', label: DISPLAY_TYPES.POINT, component: Circle },
];

/**
 * Checks if an icon key represents a camera
 */
export const isCameraIcon = (icon?: string): boolean => {
    if (!icon) return false;
    return CAMERA_ICONS.includes(icon.toLowerCase());
};

export const normalizeIconKey = (icon: unknown): IconType => {
    switch (safeString(icon).toLowerCase()) {
        case 'cctv':
        case 'camera':
            return 'cctv';
        case 'ptz':
            return 'ptz';
        case 'speed':
            return 'speed';
        case 'lpr':
            return 'lpr';
        case 'intersection':
            return 'intersection';
        case 'point_circle':
        case 'circle':
            return 'point_circle';
        default:
            return 'default';
    }
};

export const getObjectTypeForIcon = (icon: IconType): string => {
    switch (icon) {
        case 'cctv':
            return 'cctv';
        case 'ptz':
            return 'ptz';
        case 'speed':
            return 'speed';
        case 'lpr':
            return 'lpr';
        case 'intersection':
            return 'intersection';
        case 'point_circle':
            return 'point';
        default:
            return 'point';
    }
};

export const canonicalizeObjectType = (type: unknown): string => {
    const normalized = safeString(type).trim().toLowerCase();
    if (normalized === 'camera' || normalized === 'mat cam' || normalized === 'mắt cam') return 'cctv';
    if (normalized === 'nut_giao' || normalized === 'nút giao') return 'intersection';
    if (normalized === 'polyline' || normalized === 'linestring') return 'line';
    if (normalized === 'default') return 'point';
    return normalized;
};

const isLegacyPointType = (value: unknown): boolean => {
    const normalized = safeString(value).trim().toLowerCase();
    return normalized === '' || normalized === 'point' || normalized === 'default';
};

const getEffectiveIcon = (feature: any, meta: any, groupType?: string, groupName?: string): IconType => {
    const metaIcon = safeString(meta.icon).toLowerCase();
    const props = feature?.properties || {};
    const propertyIcon = safeString(props.icon || props.iconKey).toLowerCase();
    const metaType = safeString(meta.type).toLowerCase();
    const propertyType = safeString(props.type).toLowerCase();
    const lowerGType = safeString(groupType).toLowerCase();
    const lowerGName = safeString(groupName).toLowerCase();
    const lowerName = safeString(feature?.name).toLowerCase();

    const normalizedMetaIcon = normalizeIconKey(metaIcon);
    const normalizedPropertyIcon = normalizeIconKey(propertyIcon);

    if (normalizedMetaIcon !== 'default') return normalizedMetaIcon;
    if (normalizedPropertyIcon !== 'default') return normalizedPropertyIcon;
    if (metaType === 'intersection' || metaType === 'nut_giao' || metaType === 'nút giao') return 'intersection';
    if (propertyType === 'intersection' || propertyType === 'nut_giao' || propertyType === 'nút giao') return 'intersection';
    if (isCameraIcon(metaType)) return normalizeIconKey(metaType);
    if (isCameraIcon(propertyType)) return normalizeIconKey(propertyType);

    // Infer icon from feature.name when explicit icon is default or unspecified
    if (lowerName.includes('intersection') || lowerName.includes('nut_giao') || lowerName.includes('nút giao')) return 'intersection';
    if (lowerName.includes('ptz')) return 'ptz';
    if (lowerName.includes('speed') || lowerName.includes('tốc độ') || lowerName.includes('toc do')) return 'speed';
    if (lowerName.includes('lpr') || lowerName.includes('biển số') || lowerName.includes('bien so')) return 'lpr';
    if (lowerName.includes('cctv') || lowerName.includes('camera') || lowerName.includes('mắt cam') || lowerName.includes('mat cam')) return 'cctv';

    if (lowerGType.includes('intersection') || lowerGType.includes('nut_giao') || lowerGName.includes('nút giao')) return 'intersection';
    if ([lowerGType, lowerGName].some(s => s.includes('camera') || s.includes('cam') || s.includes('cctv'))) return 'cctv';

    return normalizedMetaIcon !== 'default' ? normalizedMetaIcon : normalizedPropertyIcon;
};

const getEffectiveType = (feature: any, meta: any): string => {
    const metaType = safeString(meta.type).toLowerCase();
    const propertyType = safeString(feature?.properties?.type).toLowerCase();
    const effectiveIcon = getEffectiveIcon(feature, meta);

    if (metaType && metaType !== 'point' && metaType !== 'default') return metaType;
    if (isCameraIcon(effectiveIcon)) return effectiveIcon;
    if (propertyType && propertyType !== 'point' && propertyType !== 'default') return propertyType;
    return metaType || propertyType;
};

export const getDisplayTypeForObjectType = (objectType: string, geomType?: string): string => {
    const normalized = safeString(objectType).toUpperCase();
    if (normalized === 'INTERSECTION' || normalized === 'NUT_GIAO' || normalized === 'NÚT GIAO') return DISPLAY_TYPES.INTERSECTION;
    if (normalized === 'CAMERA' || normalized === 'CCTV' || normalized === 'MẮT CAM') return DISPLAY_TYPES.CCTV;
    if (normalized === 'PTZ') return DISPLAY_TYPES.PTZ;
    if (normalized === 'SPEED') return DISPLAY_TYPES.SPEED;
    if (normalized === 'LPR') return DISPLAY_TYPES.LPR;
    if (normalized === 'CABINET' || normalized === 'TU_THIET_BI') return DISPLAY_TYPES.CABINET;
    if (normalized === 'PILLAR' || normalized === 'POLE') return DISPLAY_TYPES.PILLAR;
    if (normalized === 'BRIDGE' || normalized === 'TUNNEL') return DISPLAY_TYPES.BRIDGE;
    if (normalized === 'LINE') return DISPLAY_TYPES.LINE;
    if (normalized === 'POLYGON') return DISPLAY_TYPES.POLYGON;

    const geometry = safeString(geomType).toUpperCase();
    if (geometry === 'LINESTRING' || geometry === 'POLYLINE') return DISPLAY_TYPES.LINE;
    if (geometry === 'POLYGON') return DISPLAY_TYPES.POLYGON;
    return DISPLAY_TYPES.POINT;
};

export const normalizeFeatureSymbolData = (
    feature: { geom_type?: unknown; name?: unknown; properties?: FeatureProperties; metadata?: unknown } | null | undefined,
    groupType?: string,
    groupName?: string,
    providedMetadata?: any
): FeatureSymbolData => {
    const meta = providedMetadata || getParsedMetadata(feature as any);
    const geomType = safeString(feature?.geom_type || '').toUpperCase();
    const iconKey = getEffectiveIcon(feature, meta, groupType, groupName);
    const effectiveType = canonicalizeObjectType(getEffectiveType(feature, meta));
    const fallbackObjectType = geomType === 'LINESTRING' || geomType === 'POLYLINE'
        ? 'line'
        : geomType === 'POLYGON'
            ? 'polygon'
            : getObjectTypeForIcon(iconKey);
    const objectType = !isLegacyPointType(effectiveType)
        ? effectiveType
        : fallbackObjectType;
    const label = getDisplayTypeForObjectType(objectType, geomType);

    return {
        iconKey,
        objectType,
        label,
    };
};

/**
 * Determines the display label for a feature based on its geometry and metadata
 */
export const getFeatureDisplayType = (feature: any, groupType?: string, groupName?: string, providedMetadata?: any): string => {
    if (!feature) return "N/A";

    const meta = providedMetadata || getParsedMetadata(feature);
    const geomType = (feature.geom_type || '').toUpperCase();
    const symbol = normalizeFeatureSymbolData(feature, groupType, groupName, meta);
    const icon = symbol.iconKey;
    const metaType = symbol.objectType.toUpperCase();
    const lowerGType = (groupType || '').toLowerCase();
    const lowerGName = (groupName || '').toLowerCase();
    const lowerName = safeString(feature.name || '').toLowerCase();

    const isPoint = geomType === 'POINT' || geomType === '' || geomType === 'DEFAULT';

    if (isPoint) {
        if (icon === INTERSECTION_ICON) return DISPLAY_TYPES.INTERSECTION;
        if (isCameraIcon(icon)) {
            if (icon === 'ptz') return DISPLAY_TYPES.PTZ;
            if (icon === 'speed') return DISPLAY_TYPES.SPEED;
            if (icon === 'lpr') return DISPLAY_TYPES.LPR;
            return DISPLAY_TYPES.CCTV;
        }
        if (metaType) {
            if (metaType === 'INTERSECTION' || metaType === 'NUT_GIAO' || metaType === 'NÚT GIAO') return DISPLAY_TYPES.INTERSECTION;
            if (metaType === 'CAMERA' || metaType === 'CCTV' || metaType === 'MẮT CAM') return DISPLAY_TYPES.CCTV;
            if (metaType === 'SPEED') return DISPLAY_TYPES.SPEED;
            if (metaType === 'LPR') return DISPLAY_TYPES.LPR;
            if (metaType === 'PTZ') return DISPLAY_TYPES.PTZ;
        }
        if (metaType && metaType !== 'POINT' && metaType !== 'DEFAULT' && DISPLAY_TYPES[metaType as keyof typeof DISPLAY_TYPES]) {
            return DISPLAY_TYPES[metaType as keyof typeof DISPLAY_TYPES];
        }

        if (['cabinet', 'box', 'server'].includes(icon)) return DISPLAY_TYPES.CABINET;
        if (['pillar', 'pole', 'tower'].includes(icon)) return DISPLAY_TYPES.PILLAR;
        if (['bridge', 'tunnel', 'gate'].includes(icon)) return DISPLAY_TYPES.BRIDGE;

        const isCamera = [lowerGType, lowerGName, lowerName].some(s =>
            s.includes('camera') || s.includes('cam') || s.includes('cctv') || s.includes('lpr') ||
            s.includes('mắt cam') || s.includes('giám sát') || s.includes('quan sát')
        );
        if (isCamera) {
            if (icon === 'ptz') return DISPLAY_TYPES.PTZ;
            if (icon === 'speed') return DISPLAY_TYPES.SPEED;
            if (icon === 'lpr') return DISPLAY_TYPES.LPR;
            return DISPLAY_TYPES.CCTV;
        }

        if (lowerGType.includes('intersection') || lowerGType.includes('nut_giao')) return DISPLAY_TYPES.INTERSECTION;

        const isCabinet = lowerGType.includes('cabinet') || lowerGType.includes('tu_thiet_bi') ||
            lowerGName.includes('tủ thiết bị') || lowerName.includes('tủ thiết bị') || lowerName.includes('tủ cáp');
        if (isCabinet) return DISPLAY_TYPES.CABINET;

        return DISPLAY_TYPES.POINT;
    }

    if (geomType === 'LINESTRING' || geomType === 'POLYLINE') return DISPLAY_TYPES.LINE;
    if (geomType === 'POLYGON') return DISPLAY_TYPES.POLYGON;

    return geomType || DISPLAY_TYPES.POINT;
};

/**
 * Returns complete display configuration for a feature (Icon, Color, Label)
 */
export const getFeatureDisplayInfo = (feature: any, groupType?: string, groupName?: string, providedMetadata?: any) => {
    const meta = providedMetadata || getParsedMetadata(feature);
    const symbol = normalizeFeatureSymbolData(feature, groupType, groupName, meta);
    const displayType = getFeatureDisplayType(feature, groupType, groupName, meta);
    const iconKey = symbol.iconKey;

    let IconComponent: any = MapPin;
    let colorClass = "text-indigo-400";

    const isLine = displayType === DISPLAY_TYPES.LINE;
    const isPolygon = displayType === DISPLAY_TYPES.POLYGON;

    if (isLine) {
        IconComponent = PolylineIcon;
        colorClass = "text-emerald-400";
    } else if (iconKey === 'point_circle') {
        IconComponent = Circle;
        colorClass = "text-indigo-400";
    } else if (displayType === DISPLAY_TYPES.INTERSECTION) {
        IconComponent = Intersection;
        colorClass = "text-indigo-400";
    } else if (displayType === DISPLAY_TYPES.CCTV || displayType === DISPLAY_TYPES.PTZ || displayType === DISPLAY_TYPES.SPEED || displayType === DISPLAY_TYPES.LPR) {
        colorClass = "text-blue-400";
        if (displayType === DISPLAY_TYPES.PTZ || iconKey === 'ptz') IconComponent = CameraPTZ;
        else if (displayType === DISPLAY_TYPES.SPEED || iconKey === 'speed') IconComponent = CameraSpeed;
        else if (displayType === DISPLAY_TYPES.LPR || iconKey === 'lpr') IconComponent = CameraLPR;
        else IconComponent = CameraCCTV;
    } else if (displayType === DISPLAY_TYPES.CABINET) {
        colorClass = "text-cad-warn";
    }

    return {
        label: displayType,
        tailwindColor: colorClass,
        color: meta.gis?.color || meta.color || feature?.properties?.color || (isLine ? '#10b981' : '#6366f1'),
        icon: IconComponent,
        iconKey: iconKey,
        objectType: symbol.objectType,
        isIntersection: displayType === DISPLAY_TYPES.INTERSECTION,
        isCamera: displayType === DISPLAY_TYPES.CCTV || displayType === DISPLAY_TYPES.PTZ || displayType === DISPLAY_TYPES.SPEED || displayType === DISPLAY_TYPES.LPR,
        isLine,
        isPolygon,
        gType: (feature.geom_type || 'POINT').toUpperCase()
    };
};

/**
 * Maps display label back to icon configuration (used for summary tables)
 */
export const getIconByDisplayType = (displayType: string) => {
    let IconComponent: any = MapPin;
    let colorClass = "text-indigo-400";

    switch (displayType) {
        case DISPLAY_TYPES.LINE:
            IconComponent = PolylineIcon;
            colorClass = "text-emerald-400";
            break;
        case DISPLAY_TYPES.INTERSECTION:
            IconComponent = Intersection;
            colorClass = "text-indigo-400";
            break;
        case DISPLAY_TYPES.CCTV:
            IconComponent = CameraCCTV;
            colorClass = "text-blue-400";
            break;
        case DISPLAY_TYPES.PTZ:
            IconComponent = CameraPTZ;
            colorClass = "text-blue-400";
            break;
        case DISPLAY_TYPES.POLYGON:
            IconComponent = PolylineIcon;
            colorClass = "text-fuchsia-400";
            break;
        case DISPLAY_TYPES.CABINET:
            colorClass = "text-cad-warn";
            break;
    }

    return { icon: IconComponent, color: colorClass };
};

/**
 * Checks if a feature represents a network connection link that lacks coordinates (and thus should be hidden).
 * Features with valid coordinates should remain visible in both the map and list views.
 */
export const isNetworkLinkFeature = (feature: any): boolean => {
    if (!feature) return false;

    // We only hide network features if they DO NOT have valid coordinates.
    let coords = feature.coordinates;
    while (typeof coords === 'string') {
        try {
            const parsed = JSON.parse(coords);
            if (parsed === coords) break;
            coords = parsed;
        } catch {
            break;
        }
    }
    
    const hasCoordinates = coords && (
        (Array.isArray(coords) && coords.length > 0) ||
        (typeof coords === 'object' && !Array.isArray(coords) && Object.keys(coords).length > 0)
    );

    // If it has coordinates, we do NOT hide it from the frontend views.
    if (hasCoordinates) return false;

    if (feature.geom_type === 'NetworkLink') return true;
    if (typeof feature.name === 'string' && (feature.name.startsWith('Tuyen Network Moi') || feature.name.startsWith('Tuyến Network Mới'))) return true;
    
    let metadata = feature.metadata;
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch {
            metadata = null;
        }
    }
    if (metadata && typeof metadata === 'object') {
        if (metadata.network && typeof metadata.network === 'object') return true;
        if (metadata.infrastructure && typeof metadata.infrastructure === 'object' && metadata.infrastructure.type === 'NetworkLink') return true;
    }
    return false;
};
