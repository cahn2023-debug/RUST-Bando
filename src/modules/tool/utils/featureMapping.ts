import { getParsedMetadata, safeString, getFeatureNote } from "./featureMetadata";
import { FeatureCoordinates, FeatureState } from "../../contract/types";

// Cache for parsed coordinates to avoid repeated JSON.parse in render cycles
const _coordsCache = new WeakMap<object, FeatureCoordinates>();
const _coordsStringCache = new Map<string, FeatureCoordinates>();
const COORDS_STRING_CACHE_MAX = 50000;

/**
 * Safely parses the coordinates from a feature
 */
export const getParsedCoordinates = (feature: FeatureState | { coordinates: unknown }): FeatureCoordinates => {
    if (!feature) return null;
    const coords = feature.coordinates;
    if (!coords) return null;

    // Fast path: already an array
    if (Array.isArray(coords)) return coords as FeatureCoordinates;

    // Check WeakMap cache (keyed by feature object identity)
    const cached = _coordsCache.get(feature as object);
    if (cached) return cached;

    const parseAndCache = (data: unknown): FeatureCoordinates => {
        if (!data) return null;
        if (Array.isArray(data)) {
            _coordsCache.set(feature as object, data as FeatureCoordinates);
            return data as FeatureCoordinates;
        }

        // Handle Object format from Rust (e.g. { "points": [...] } or { "coordinates": [...] })
        if (typeof data === 'object') {
            const obj = data as Record<string, unknown>;
            const inner = obj.points || obj.coordinates || obj.coords;
            if (Array.isArray(inner)) {
                _coordsCache.set(feature as object, inner as FeatureCoordinates);
                return inner as FeatureCoordinates;
            }
        }

        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (!trimmed) return null;

            if (_coordsStringCache.has(trimmed)) {
                const cached = _coordsStringCache.get(trimmed);
                _coordsCache.set(feature as object, cached);
                return cached;
            }

            try {
                let cleanStr = trimmed;
                if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                    try {
                        const inner = JSON.parse(cleanStr);
                        if (Array.isArray(inner)) {
                            _coordsCache.set(feature, inner);
                            return inner;
                        }
                        if (typeof inner === 'object' && inner !== null) {
                            const innerData = inner.points || inner.coordinates || inner.coords;
                            if (Array.isArray(innerData)) {
                                _coordsCache.set(feature, innerData);
                                return innerData;
                            }
                        }
                        if (typeof inner === 'string') cleanStr = inner.trim();
                    } catch {
                        cleanStr = cleanStr.slice(1, -1).trim();
                    }
                }

                const parsed = JSON.parse(cleanStr);
                const result = Array.isArray(parsed) ? parsed : (
                    (typeof parsed === 'object' && parsed !== null) ? (parsed.points || parsed.coordinates || parsed.coords) : null
                );

                if (Array.isArray(result)) {
                    _coordsCache.set(feature, result);
                    if (_coordsStringCache.size < COORDS_STRING_CACHE_MAX) _coordsStringCache.set(trimmed, result);
                    return result;
                }
            } catch (e) {
                console.error('[featureMapping] Coordinate parse error:', e, 'for raw:', data);
            }
        }
        return null;
    };

    return parseAndCache(coords);
};

/**
 * Safely converts any value to an integer string if it's a number,
 * otherwise returns trimmed string. Used for STT/Display Order.
 */
export const formatToIntegerString = (val: unknown): string => {
    if (val === undefined || val === null || val === '') return "";
    const s = String(val).trim();
    if (s === 'Data::Empty') return "";

    // Special Case: Junction Numbering (e.g. 15_1, 192_4)
    // We should preserve these as-is if they match the numeric hierarchy pattern
    if (/^\d+(_\d+)+$/.test(s)) {
        return s;
    }

    // If it looks like a number (including 193.0), parse and floor it
    const num = parseFloat(s);
    if (!isNaN(num) && isFinite(num)) {
        return Math.floor(num).toString();
    }
    return s;
};

/**
 * Removes STT prefix from feature names for cleaner display
 */
export const getCleanName = (feature: FeatureState | { name: unknown }, stt?: string): string => {
    const name = safeString(feature.name);
    if (!stt || stt === '0') return name;

    const s = stt.trim();
    const n = name.trim();

    // Normalization to handle matching "193" with "193.0 Nút giao"
    const normalizeForMatch = (val: string) => val.replace(/^0+/, '').replace(/\.0+$/, '').replace(/[\.\-:]+$/, '');
    const sNorm = normalizeForMatch(s);
    const nNorm = normalizeForMatch(n);

    if (sNorm && (n.startsWith(s) || n.startsWith(sNorm) || nNorm.startsWith(sNorm))) {
        // Find how much of the original name to cut
        let prefixToCut = "";
        if (n.startsWith(s)) prefixToCut = s;
        else if (n.startsWith(sNorm)) prefixToCut = sNorm;
        else {
            // Check if name has something like "193.0 ..." but sNorm is "193"
            const match = n.match(/^(\d+\.0+)/);
            if (match && normalizeForMatch(match[1]) === sNorm) {
                prefixToCut = match[1];
            }
        }

        if (prefixToCut) {
            let rest = n.slice(prefixToCut.length).trim();
            while (rest.startsWith('.') || rest.startsWith('-') || rest.startsWith(':') || rest.startsWith(' ')) {
                rest = rest.slice(1).trim();
            }
            if (rest) return rest;
        }
    }

    return name;
};

/**
 * Removes Vietnamese tones for non-accented search
 */
export const removeVietnameseTones = (str: string): string => {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
    str = str.replace(/\u02C6|\u0306|\u031B/g, "");
    return str.replace(/ + /g, " ").trim();
};

/**
 * Calculates display sequence numbers for features
 */
type FeaturesMapType = Record<string, FeatureState | { metadata: unknown; group_id?: string | null }>;

export const calculateFeatureNumbers = (features: FeatureState[], featuresMap: FeaturesMapType): Record<string, string> => {
    const sortedFeatures = [...features].sort((a: FeatureState, b: FeatureState) => {
        return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
    });

    const featureNumberMap: Record<string, string> = {};
    const parentSequenceMap: Record<string, number> = {};
    const groupSequenceMap: Record<string, number> = {};

    // Helper to resolve STT for a feature, ensuring its parent is resolved first
    const getOrResolveSTT = (fId: string): string => {
        if (featureNumberMap[fId]) return featureNumberMap[fId];

        const f = featuresMap[fId];
        if (!f) return "";

        const meta = getParsedMetadata(f);
        let sttValue = meta.display_order || meta.stt || meta.STT || (meta as Record<string, unknown>).order;

        // If explicitly set, use it (but still format it)
        if (sttValue) {
            const formatted = formatToIntegerString(sttValue);
            if (formatted !== "") {
                featureNumberMap[fId] = formatted;
                return formatted;
            }
        }

        // Fallback: Check parent hierarchy
        const parentId = meta.parent_feature_id as string | undefined;
        if (parentId && featuresMap[parentId]) {
            const parentSTT = getOrResolveSTT(parentId);

            if (!parentSequenceMap[parentId]) parentSequenceMap[parentId] = 0;
            parentSequenceMap[parentId]++;

            const result = `${parentSTT}_${parentSequenceMap[parentId]}`;
            featureNumberMap[fId] = result;
            return result;
        } else {
            // Default: Root level sequencing by group
            const groupId = (f.group_id as string) || "default";
            if (!groupSequenceMap[groupId]) groupSequenceMap[groupId] = 0;
            groupSequenceMap[groupId]++;

            const result = `${groupSequenceMap[groupId]}`;
            featureNumberMap[fId] = result;
            return result;
        }
    };

    // Process all features in sorted order to maintain stable sequence numbers
    sortedFeatures.forEach(f => getOrResolveSTT(f.id));

    return featureNumberMap;
};

/**
 * Checks if a feature matches the search query
 */
export const isMatchSearch = (
    feature: FeatureState | { name: unknown; id: string; metadata: unknown },
    query: string,
    featureNumbers?: Record<string, string>
): boolean => {
    if (!query) return false;
    const qOrig = query.toLowerCase().trim();
    const qNoTone = removeVietnameseTones(qOrig);

    const checkMatch = (val: unknown) => {
        if (!val) return false;
        const s = safeString(val).toLowerCase();
        return s.includes(qOrig) || removeVietnameseTones(s).includes(qNoTone);
    };

    if (checkMatch(feature.name) || checkMatch(feature.id)) return true;
    if (featureNumbers && featureNumbers[feature.id] && checkMatch(featureNumbers[feature.id])) return true;

    const meta = getParsedMetadata(feature);
    const sttValues = [
        meta.display_order, meta.stt, meta.STT, meta.code, meta.label, meta.type,
        meta['MÃ HIỆU (STT)'], meta['Mã hiệu (STT)'], meta['mã hiệu (stt)']
    ];

    for (const val of sttValues) {
        if (checkMatch(val)) return true;
    }

    if (checkMatch(getFeatureNote(feature))) return true;

    return false;
};

/**
 * Calculates points for a FOV (Field Of View) cone polygon
 * @param center [lng, lat]
 * @param radius distance in meters
 * @param rotation center angle in degrees (North is 0, clockwise)
 * @param fovAngle opening angle in degrees
 */
export const calculateFOVPoints = (center: [number, number], radius: number, rotation: number, fovAngle: number): [number, number][] => {
    if (!center || center.length < 2) return [];

    const [lng, lat] = center;
    const points: [number, number][] = [[lat, lng]]; // Leaflet uses [lat, lng]

    // Apply +90 offset because 0 degrees in compass math is North, 
    // but icons are now aligned to point East (Right) at 0 UI rotation.
    const effectiveRotation = rotation + 90;
    const startAngle = effectiveRotation - fovAngle / 2;
    const endAngle = effectiveRotation + fovAngle / 2;
    const steps = 20; // Number of points to approximate the arc

    // Approximation for meters to degrees
    // 1 degree latitude ~= 111,320 meters
    // 1 degree longitude ~= 111,320 * cos(lat) meters
    const latOffsetPerMeter = 1 / 111319.9;
    const lngOffsetPerMeter = 1 / (111319.9 * Math.cos(lat * Math.PI / 180));

    for (let i = 0; i <= steps; i++) {
        const currentAngle = startAngle + (endAngle - startAngle) * (i / steps);
        // Compass coordinate system: 0 is North (up), increases clockwise
        // Math coordinate system: 0 is East (right), increases counter-clockwise
        // math_angle = 90 - compass_angle
        const rad = (90 - currentAngle) * Math.PI / 180;

        const pLat = lat + (radius * latOffsetPerMeter) * Math.sin(rad);
        const pLng = lng + (radius * lngOffsetPerMeter) * Math.cos(rad);
        points.push([pLat, pLng]);
    }

    points.push([lat, lng]); // Close the polygon back to center
    return points;
};

/**
 * Finds the nearest road segment and calculates the angle for the camera to face it.
 * AI feature for auto-rotation.
 * @param point [lng, lat] of the camera
 * @param features all features to search for roads (polylines)
 * @returns angle in degrees (0 = North) or null if no roads found
 */
export const calculateNearestRoadAngle = (point: [number, number], features: FeatureState[]): number | null => {
    if (!point || point.length < 2 || !features || features.length === 0) return null;

    const [pLng, pLat] = point;
    const roads = features.filter(f =>
        (f.geom_type || '').toUpperCase() === 'LINESTRING' ||
        (f.geom_type || '').toUpperCase() === 'POLYLINE'
    );

    if (roads.length === 0) return null;

    let minDistanceSq = Infinity;
    let selectedAngle = null;

    // Approximation for meters
    const latScale = 111319.9;
    const lngScale = 111319.9 * Math.cos(pLat * Math.PI / 180);

    for (const road of roads) {
        const coords = getParsedCoordinates(road);
        if (!coords || !Array.isArray(coords) || coords.length < 2) continue;

        for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];
            
            if (!Array.isArray(p1) || !Array.isArray(p2)) continue;
            
            const [x1, y1] = p1 as [number, number];
            const [x2, y2] = p2 as [number, number];

            // Convert everything to local Cartesian meters relative to point
            const dx1 = (x1 - pLng) * lngScale;
            const dy1 = (y1 - pLat) * latScale;
            const dx2 = (x2 - pLng) * lngScale;
            const dy2 = (y2 - pLat) * latScale;

            // Distance from (0,0) to segment
            const l2 = (dx2 - dx1) ** 2 + (dy2 - dy1) ** 2;
            let t = ((-dx1) * (dx2 - dx1) + (-dy1) * (dy2 - dy1)) / l2;
            t = Math.max(0, Math.min(1, t));
            const distSq = (-(dx1 + t * (dx2 - dx1))) ** 2 + (-(dy1 + t * (dy2 - dy1))) ** 2;

            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;

                // Angle of the road segment
                const segmentAngleRad = Math.atan2(dy2 - dy1, dx2 - dx1);
                const segmentAngleDeg = segmentAngleRad * 180 / Math.PI;

                // Compass heading (0 North, clockwise): 90 - math_deg
                const roadHeading = (90 - segmentAngleDeg + 360) % 360;

                // Parallel orientation:
                // We have two choices: roadHeading or roadHeading + 180.
                // For now, let's pick the one that points "forward" along the road vector
                // or just pick the base roadHeading.
                selectedAngle = roadHeading;
            }
        }
    }

    // Threshold: only rotate if within 200 meters
    if (minDistanceSq > 200 * 200) return null;

    return selectedAngle !== null ? Math.round(selectedAngle) : null;
};
