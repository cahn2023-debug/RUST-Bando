import { MapPin } from "lucide-react";
import { Intersection, PolylineIcon, CameraCCTV, CameraPTZ, CameraSpeed, CameraLPR } from '../../design/components/icons/MapIcons';
import { getParsedMetadata, safeString } from "./featureMetadata";

/**
 * Camera icon types
 */
export const CAMERA_ICONS = ['camera', 'cctv', 'ptz', 'speed', 'lpr'];

/**
 * Intersection icon identifier
 */
export const INTERSECTION_ICON = 'intersection';

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

/**
 * Checks if an icon key represents a camera
 */
export const isCameraIcon = (icon?: string): boolean => {
    if (!icon) return false;
    return CAMERA_ICONS.includes(icon.toLowerCase());
};

/**
 * Determines the display label for a feature based on its geometry and metadata
 */
export const getFeatureDisplayType = (feature: any, groupType?: string, groupName?: string): string => {
    if (!feature) return "N/A";

    const meta = getParsedMetadata(feature);
    const geomType = (feature.geom_type || '').toUpperCase();
    const icon = (meta.icon || '').toLowerCase();
    const metaType = safeString(meta.type || '').toUpperCase();
    const lowerGType = (groupType || '').toLowerCase();
    const lowerGName = (groupName || '').toLowerCase();
    const lowerName = safeString(feature.name || '').toLowerCase();

    const isPoint = geomType === 'POINT' || geomType === '' || geomType === 'DEFAULT';

    if (isPoint) {
        if (metaType) {
            if (metaType === 'INTERSECTION' || metaType === 'NUT_GIAO' || metaType === 'NÚT GIAO') return DISPLAY_TYPES.INTERSECTION;
            if (metaType === 'CAMERA' || metaType === 'CCTV' || metaType === 'MẮT CAM') return DISPLAY_TYPES.CCTV;
            if (metaType === 'SPEED') return DISPLAY_TYPES.SPEED;
            if (metaType === 'LPR') return DISPLAY_TYPES.LPR;
            if (metaType === 'PTZ') return DISPLAY_TYPES.PTZ;
        }
        if (metaType && DISPLAY_TYPES[metaType as keyof typeof DISPLAY_TYPES]) {
            return DISPLAY_TYPES[metaType as keyof typeof DISPLAY_TYPES];
        }

        if (icon === INTERSECTION_ICON) return DISPLAY_TYPES.INTERSECTION;
        if (isCameraIcon(icon)) {
            if (icon === 'ptz') return DISPLAY_TYPES.PTZ;
            if (icon === 'speed') return DISPLAY_TYPES.SPEED;
            if (icon === 'lpr') return DISPLAY_TYPES.LPR;
            return DISPLAY_TYPES.CCTV;
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
    const displayType = getFeatureDisplayType(feature, groupType, groupName);
    const iconKey = (meta.icon || 'default').toLowerCase();

    let IconComponent: any = MapPin;
    let colorClass = "text-indigo-400";

    const isLine = displayType === DISPLAY_TYPES.LINE;
    const isPolygon = displayType === DISPLAY_TYPES.POLYGON;

    if (isLine) {
        IconComponent = PolylineIcon;
        colorClass = "text-emerald-400";
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
        colorClass = "text-orange-400";
    }

    return {
        label: displayType,
        tailwindColor: colorClass,
        color: meta.color || (isLine ? '#10b981' : '#6366f1'),
        icon: IconComponent,
        iconKey: iconKey,
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
            colorClass = "text-orange-400";
            break;
    }

    return { icon: IconComponent, color: colorClass };
};
