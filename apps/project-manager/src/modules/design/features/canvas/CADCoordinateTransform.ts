/**
 * CADCoordinateTransform.ts
 * Bộ chuyển đổi tọa độ địa lý (WGS84 Lng/Lat) & Không gian CAD (Local Meters) sang Pixel màn hình
 * Hoàn toàn độc lập, không phụ thuộc vào bất kỳ thư viện Map ngoài nào.
 */

const EARTH_RADIUS = 6378137; // WGS84 Semi-major axis in meters
const EQUATOR_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;

export interface ViewportState {
  center: [number, number]; // [lat, lng]
  zoom: number;             // CAD zoom level (e.g. 13 - 22)
  width: number;            // Canvas width in CSS pixels
  height: number;           // Canvas height in CSS pixels
  pixelRatio: number;       // Window devicePixelRatio (e.g. 1, 2)
  rotation?: number;        // Rotation in degrees (optional)
}

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Tính số mét trên 1 pixel (Meters Per Pixel) ở vĩ độ và mức zoom hiện tại
 */
export function getMetersPerPixel(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (EQUATOR_CIRCUMFERENCE * Math.cos(rad)) / (256 * Math.pow(2, zoom));
}

/**
 * Chuyển đổi tọa độ [lng, lat] thành tọa độ phẳng Local Meters (tâm tại 0,0 là center của viewport)
 */
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): [number, number] {
  const radLat = (centerLat * Math.PI) / 180;
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLng = ((lng - centerLng) * Math.PI) / 180;
  const x = dLng * EARTH_RADIUS * Math.cos(radLat);
  const y = dLat * EARTH_RADIUS;
  return [x, y];
}

/**
 * Chuyển đổi tọa độ phẳng Local Meters thành tọa độ địa lý [lat, lng]
 */
export function localMetersToLatLng(
  x: number,
  y: number,
  centerLat: number,
  centerLng: number
): [number, number] {
  const radLat = (centerLat * Math.PI) / 180;
  const dLat = (y / EARTH_RADIUS) * (180 / Math.PI);
  const dLng = (x / (EARTH_RADIUS * Math.cos(radLat))) * (180 / Math.PI);
  return [centerLat + dLat, centerLng + dLng];
}

/**
 * Chiếu tọa độ địa lý [lng, lat] sang tọa độ pixel màn hình [screenX, screenY]
 */
export function projectToScreen(
  lng: number,
  lat: number,
  viewport: ViewportState
): [number, number] {
  const [centerLat, centerLng] = viewport.center;
  const mpp = getMetersPerPixel(centerLat, viewport.zoom);
  const [x, y] = latLngToLocalMeters(lat, lng, centerLat, centerLng);

  const screenX = viewport.width / 2 + x / mpp;
  const screenY = viewport.height / 2 - y / mpp; // Canvas Y goes downwards

  return [screenX, screenY];
}

/**
 * Chiếu ngược từ tọa độ pixel màn hình [screenX, screenY] sang tọa độ địa lý [lng, lat]
 */
export function unprojectFromScreen(
  screenX: number,
  screenY: number,
  viewport: ViewportState
): [number, number] {
  const [centerLat, centerLng] = viewport.center;
  const mpp = getMetersPerPixel(centerLat, viewport.zoom);

  const dx = (screenX - viewport.width / 2) * mpp;
  const dy = -(screenY - viewport.height / 2) * mpp;

  const [lat, lng] = localMetersToLatLng(dx, dy, centerLat, centerLng);
  return [lng, lat];
}

/**
 * Tính Bounding Box (vùng địa lý [minLng, minLat, maxLng, maxLat]) của khung nhìn hiện tại
 */
export function getViewportBoundingBox(viewport: ViewportState, bufferFactor = 0.2): BoundingBox {
  const bufW = viewport.width * bufferFactor;
  const bufH = viewport.height * bufferFactor;

  const [minLng, maxLat] = unprojectFromScreen(-bufW, -bufH, viewport);
  const [maxLng, minLat] = unprojectFromScreen(viewport.width + bufW, viewport.height + bufH, viewport);

  return {
    minLng: Math.min(minLng, maxLng),
    minLat: Math.min(minLat, maxLat),
    maxLng: Math.max(minLng, maxLng),
    maxLat: Math.max(minLat, maxLat),
  };
}

/**
 * Tính toán Center & Zoom tối ưu để hiển thị vừa vặn tất cả các tọa độ (Zoom Extend / Fit Bounds)
 */
export function computeFitBounds(
  points: Array<[number, number]>, // Array of [lng, lat]
  viewportWidth: number,
  viewportHeight: number,
  padding = 60
): { center: [number, number]; zoom: number } | null {
  if (!points || points.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of points) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (minLng === Infinity || minLat === Infinity) return null;

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Single point case
  if (minLng === maxLng && minLat === maxLat) {
    return { center: [centerLat, centerLng], zoom: 18 };
  }

  const [spanX, spanY] = latLngToLocalMeters(maxLat, maxLng, minLat, minLng);
  const absSpanX = Math.max(Math.abs(spanX), 10);
  const absSpanY = Math.max(Math.abs(spanY), 10);

  const availableWidth = Math.max(viewportWidth - padding * 2, 100);
  const availableHeight = Math.max(viewportHeight - padding * 2, 100);

  const targetMpp = Math.max(absSpanX / availableWidth, absSpanY / availableHeight);
  const rad = (centerLat * Math.PI) / 180;
  
  // mpp = (EQUATOR_CIRCUMFERENCE * Math.cos(rad)) / (256 * 2^zoom)
  // 2^zoom = (EQUATOR_CIRCUMFERENCE * Math.cos(rad)) / (256 * mpp)
  const zoomFactor = (EQUATOR_CIRCUMFERENCE * Math.cos(rad)) / (256 * targetMpp);
  const computedZoom = Math.log2(zoomFactor);

  const clampedZoom = Math.max(1, Math.min(23, computedZoom));

  return {
    center: [centerLat, centerLng],
    zoom: clampedZoom,
  };
}

/**
 * Tính khoảng cách thực tế giữa 2 điểm (Haversine formula in meters)
 */
export function calculateGeographicDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}
