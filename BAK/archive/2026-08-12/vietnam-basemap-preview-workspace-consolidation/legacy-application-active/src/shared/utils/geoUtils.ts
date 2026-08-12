/**
 * Geographic and Coordinate Utilities
 */

/**
 * Checks if a given latitude and longitude represent a valid point,
 * optionally constrained to Vietnam's approximate bounds.
 * 
 * @param lat Latitude (-90 to 90)
 * @param lng Longitude (-180 to 180)
 * @returns boolean
 */
export const isValidLatLng = (lat: number, lng: number): boolean => {
    // Basic global validity check
    const isBasicValid =
        Math.abs(lat) > 0.0001 &&
        Math.abs(lng) > 0.0001 &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;

    // Tighter Vietnam bounds approx: Lat [8, 24], Lng [102, 110]
    const isInRegion = (lat > 8 && lat < 24 && lng > 102 && lng < 110);

    return isBasicValid && isInRegion;
};
