/**
 * Camera Math Utilities
 * Calculations for FOV, PPM, and Street View mapping.
 */

export interface CameraSpecs {
    resolutionX: number; // e.g. 1920
    sensorWidth: number; // mm (e.g. 4.59 for 1/2.8")
    focalLength: number; // mm (e.g. 2.8)
    distance: number; // meters
}

export const SENSOR_SIZES = {
    '1/2.8"': { width: 4.59, height: 3.42 },
    '1/3"': { width: 4.80, height: 3.60 },
    '1/1.8"': { width: 7.18, height: 5.32 },
    '1/2"': { width: 6.40, height: 4.80 },
    'Full Frame': { width: 36.0, height: 24.0 }
};

export const DORI_LEVELS = [
    { label: 'Identification (ID)', minPpm: 250, color: '#ef4444' }, // Red
    { label: 'Recognition (REC)', minPpm: 125, color: '#f59e0b' },   // Yellow
    { label: 'Observation (OBS)', minPpm: 63, color: '#10b981' },    // Green
    { label: 'Detection (DET)', minPpm: 25, color: '#06b6d4' }       // Cyan
];

/**
 * Calculates Slant Range (Direct distance from camera lens to target)
 * @param horizontalDistance Distance on the ground (meters)
 * @param installHeight Height of camera (meters)
 * @param targetHeight Height of target, e.g. 1.7m for human (meters)
 */
export function calculateSlantRange(
    horizontalDistance: number,
    installHeight: number,
    targetHeight: number = 1.7
): number {
    const heightDiff = Math.max(0, installHeight - targetHeight);
    return Math.sqrt(Math.pow(horizontalDistance, 2) + Math.pow(heightDiff, 2));
}

/**
 * Calculates Horizontal Field of View in Degrees
 */
export function calculateHFOV(sensorWidth: number, focalLength: number): number {
    if (!focalLength || focalLength <= 0) return 0;
    const hfovRad = 2 * Math.atan(sensorWidth / (2 * focalLength));
    return (hfovRad * 180) / Math.PI;
}

/**
 * Calculates Pixels Per Meter (PPM) at a specific distance
 * Accounts for slant range if heights are provided.
 */
export function calculatePPM(
    resolutionX: number,
    distance: number,
    hfovDegrees: number,
    installHeight?: number,
    targetHeight: number = 1.7
): number {
    if (!distance || distance <= 0 || !hfovDegrees) return 0;

    // Use slant range if heights are available for more accuracy
    const effectiveDistance = (installHeight !== undefined)
        ? calculateSlantRange(distance, installHeight, targetHeight)
        : distance;

    // Field width at distance D
    // W = 2 * D * tan(HFOV / 2)
    const hfovRad = (hfovDegrees * Math.PI) / 180;
    const fieldWidth = 2 * effectiveDistance * Math.tan(hfovRad / 2);

    if (fieldWidth <= 0) return 0;
    return resolutionX / fieldWidth;
}

/**
 * Calculates the maximum horizontal distance for a target PPM threshold
 */
export function calculateDORIDistance(
    resolutionX: number,
    hfovDegrees: number,
    ppmThreshold: number,
    installHeight: number = 0,
    targetHeight: number = 0
): number {
    if (ppmThreshold <= 0 || !hfovDegrees || !resolutionX) return 0;

    // ppm = res / (2 * S * tan(hfov/2))
    // S = res / (2 * ppm * tan(hfov/2))
    const hfovRad = (hfovDegrees * Math.PI) / 180;
    const slantRange = resolutionX / (2 * ppmThreshold * Math.tan(hfovRad / 2));

    // D = sqrt(S^2 - (H1-H2)^2)
    const heightDiff = Math.max(0, installHeight - targetHeight);
    if (slantRange < heightDiff) return 0;

    return Math.sqrt(Math.pow(slantRange, 2) - Math.pow(heightDiff, 2));
}

/**
 * Gets DORI category based on PPM
 */
export function getDORICategory(ppm: number) {
    for (const level of DORI_LEVELS) {
        if (ppm >= level.minPpm) return level;
    }
    return { label: 'None', minPpm: 0, color: '#999' };
}

/**
 * Maps UI Rotation to Compass Heading
 * UI Rotation: 0 = East (Right), 90 = South (Down) - Clockwise
 * Compass Heading: 0 = North (Up), 90 = East (Right) - Clockwise
 * 
 * Formula: Heading = (Rotation + 90) % 360
 */
export function mapRotationToHeading(uiRotation: number): number {
    return (uiRotation + 90) % 360;
}

/**
 * Generates Google Street View Static API URL
 */
export function getStreetViewUrl(
    lat: number,
    lng: number,
    heading: number,
    fov: number,
    pitch: number = 0,
    apiKey: string = ''
): string {
    const size = '640x480';
    const base = 'https://maps.googleapis.com/maps/api/streetview';
    const hFix = (Number(heading) || 0).toFixed(2);
    const fFix = (Math.max(10, Math.min(120, Number(fov) || 90))).toFixed(2);
    const pFix = (Number(pitch) || 0).toFixed(2);

    const params = new URLSearchParams({
        size,
        location: `${lat},${lng}`,
        heading: hFix,
        fov: fFix,
        pitch: pFix,
        source: 'outdoor'
    });

    if (apiKey) {
        params.append('key', apiKey);
    }

    return `${base}?${params.toString()}`;
}

/**
 * Generates Google Maps Embed API URL for Street View
 */
export function getStreetViewEmbedUrl(
    lat: number,
    lng: number,
    heading: number,
    fov: number,
    pitch: number = 0,
    apiKey: string = ''
): string {
    const base = 'https://www.google.com/maps/embed/v1/streetview';
    const params = new URLSearchParams({
        location: `${lat},${lng}`,
        heading: (Number(heading) || 0).toFixed(2),
        fov: (Math.max(10, Math.min(120, Number(fov) || 90))).toFixed(2),
        pitch: (Number(pitch) || 0).toFixed(2),
        key: apiKey
    });
    return `${base}?${params.toString()}`;
}

/**
 * Generates Google Maps Embed API URL for 3D Satellite View (Fallback)
 */
export function get3DFallbackUrl(
    lat: number,
    lng: number,
    apiKey: string = ''
): string {
    const base = 'https://www.google.com/maps/embed/v1/view';
    const params = new URLSearchParams({
        center: `${lat},${lng}`,
        zoom: '19',
        maptype: 'satellite',
        key: apiKey
    });
    return `${base}?${params.toString()}`;
}

/**
 * Calculates all DORI ranges for a camera configuration.
 * Returns an array of objects for map visualization.
 */
export function calculateDORIRanges(
    resolutionX: number,
    hfovDegrees: number,
    installHeight?: number,
    targetHeight: number = 1.7
) {
    const levels = [
        { label: 'Identification (ID)', ppm: 250, color: '#ef4444' }, // Red
        { label: 'Recognition (REC)', ppm: 125, color: '#f59e0b' },   // Yellow
        { label: 'Observation (OBS)', ppm: 63, color: '#10b981' },    // Green
        { label: 'Detection (DET)', ppm: 25, color: '#06b6d4' }       // Cyan
    ];

    return levels.map(level => ({
        ...level,
        distance: calculateDORIDistance(
            resolutionX,
            hfovDegrees,
            level.ppm,
            installHeight,
            targetHeight
        )
    }));
}

/**
 * Calculates the distance between two points in meters using Haversine formula.
 */
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculates PPM at a specific geographic point [lat, lng] relative to camera position.
 */
export function calculatePPMAtPoint(
    cameraLat: number,
    cameraLng: number,
    pointLat: number,
    pointLng: number,
    resolutionX: number,
    hfovDegrees: number,
    installHeight?: number,
    targetHeight: number = 1.7
): number {
    const distance = getDistance(cameraLat, cameraLng, pointLat, pointLng);
    return calculatePPM(resolutionX, distance, hfovDegrees, installHeight, targetHeight);
}

/**
 * Calculates a destination point given a starting point, distance (meters), and bearing (degrees).
 */
export function getDestination(lat: number, lng: number, distance: number, bearing: number): [number, number] {
    const R = 6371000; // Earth's radius in meters
    const radBearing = (bearing * Math.PI) / 180;
    const radLat = (lat * Math.PI) / 180;
    const radLng = (lng * Math.PI) / 180;

    const destLat = Math.asin(
        Math.sin(radLat) * Math.cos(distance / R) +
        Math.cos(radLat) * Math.sin(distance / R) * Math.cos(radBearing)
    );
    const destLng = radLng + Math.atan2(
        Math.sin(radBearing) * Math.sin(distance / R) * Math.cos(radLat),
        Math.cos(distance / R) - Math.sin(radLat) * Math.sin(destLat)
    );

    return [
        (destLat * 180) / Math.PI,
        (destLng * 180) / Math.PI
    ];
}

/**
 * Generates points for an arc representing a distance segment of the FOV.
 */
export function calculateArcPoints(
    lat: number,
    lng: number,
    distanceX: number,
    centerBearing: number,
    hfov: number,
    steps: number = 20
): [number, number][] {
    const points: [number, number][] = [];
    const halfFov = hfov / 2;
    for (let i = 0; i <= steps; i++) {
        const bearing = centerBearing - halfFov + (hfov * i) / steps;
        points.push(getDestination(lat, lng, distanceX, bearing));
    }
    return points;
}
