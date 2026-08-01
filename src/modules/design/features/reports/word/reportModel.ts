import { getFeatureDisplayInfo, getParsedMetadata, getFeatureMetadataValue, safeString, isNetworkLinkFeature, calculateFOVPoints } from "@TOOL/utils/featureUtils";

export type ReportSelection =
  | { type: "region"; id: string }
  | { type: "group"; id: string }
  | { type: "feature"; id: string };

export type ReportBounds = [number, number, number, number];

export interface ReportPhoto {
  id: string;
  label: string;
  dataUrl: string;
  assetId?: string;
  featureId?: string;
  projectId?: string;
  relativePath?: string;
  absolutePath?: string;
  mimeType?: string;
  isPrimary?: boolean;
  sortOrder?: number;
  status?: "pending" | "resolved" | "missing" | "invalid" | "processed";
  warning?: string;
  processedAsset?: {
    tempPath: string;
    mimeType: "image/jpeg" | "image/png";
    width?: number;
    height?: number;
    byteLength?: number;
  };
}

export type ReportCaptureMode = "intersection" | "route" | "feature";

export interface ReportFeatureDetail {
  feature: FeatureState;
  label: string;
  displayType: string;
  description: string;
  metadata: Record<string, unknown>;
  properties: Record<string, unknown>;
  photos: ReportPhoto[];
  bounds: ReportBounds | null;
  startPoint?: [number, number];
  endPoint?: [number, number];
  connectedNames: string[];
  photoWarnings: string[];
}

export interface ReportSection {
  id: string;
  anchor: string;
  title: string;
  displayType: string;
  feature: FeatureState;
  description: string;
  summary: string[];
  details: ReportFeatureDetail[];
  photos: ReportPhoto[];
  photoWarnings: string[];
  bounds: ReportBounds | null;
  captureMode: ReportCaptureMode;
  focusFeatureIds: string[];
  hiddenFeatureIds: string[];
  requiredFeatureIds: string[];
  requiredPoints: Array<[number, number]>;
  captureWarnings: string[];
}

export interface ReportModel {
  title: string;
  generatedAt: string;
  selectedItems: ReportSelection[];
  sections: ReportSection[];
}

const POINT_PADDING_DEGREES = 0.0009;
const CLUSTER_PADDING_DEGREES = 0.00006;
const LINE_PADDING_RATIO = 0.08;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
};

const getGroupKind = (group?: FeatureGroupState | null): string | undefined =>
  group?.type || group?.group_type;

export const normalizeAnchor = (id: string): string =>
  `report_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;

export const getFeatureChildrenMap = (state: MapState): Map<string, FeatureState[]> => {
  const childrenMap = new Map<string, FeatureState[]>();
  Object.values(state.features || {}).forEach((feature) => {
    const metadata = getParsedMetadata(feature);
    const parentId = typeof metadata.parent_feature_id === "string" ? metadata.parent_feature_id : null;
    if (!parentId) return;
    const list = childrenMap.get(parentId) || [];
    list.push(feature);
    childrenMap.set(parentId, list);
  });
  childrenMap.forEach((items) => {
    items.sort(compareFeatures);
  });
  return childrenMap;
};

const compareFeatures = (left: FeatureState, right: FeatureState): number => {
  const leftMeta = getParsedMetadata(left);
  const rightMeta = getParsedMetadata(right);
  const leftOrder = safeString(leftMeta.display_order || left.properties?.display_order);
  const rightOrder = safeString(rightMeta.display_order || right.properties?.display_order);
  if (leftOrder || rightOrder) return leftOrder.localeCompare(rightOrder, undefined, { numeric: true });
  return (left.name || left.id).localeCompare(right.name || right.id, undefined, { numeric: true });
};

const getRegionLayerIds = (state: MapState, regionId: string): Set<string> => {
  const layerIds = new Set<string>();
  Object.values(state.layers || {}).forEach((layer) => {
    if (layer.region_id === regionId) layerIds.add(layer.id);
  });
  return layerIds;
};

const getGroupAndSubgroupIds = (state: MapState, groupId: string): Set<string> => {
  const ids = new Set<string>([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(state.feature_groups || {}).forEach((group) => {
      if (group.parent_id && ids.has(group.parent_id) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    });
  }
  return ids;
};

const collectFeatureAndChildren = (
  featureId: string,
  state: MapState,
  childrenMap: Map<string, FeatureState[]>,
  out: Map<string, FeatureState>,
): void => {
  const feature = state.features?.[featureId];
  if (!feature || out.has(feature.id)) return;
  out.set(feature.id, feature);
  (childrenMap.get(feature.id) || []).forEach((child) => collectFeatureAndChildren(child.id, state, childrenMap, out));
};

export const collectFeatureTree = (
  rootId: string,
  childrenMap: Map<string, FeatureState[]>,
  featureIdsFilter?: Set<string>,
): FeatureState[] => {
  const result: FeatureState[] = [];
  const visited = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (!featureIdsFilter || featureIdsFilter.has(child.id)) {
        result.push(child);
      }
      queue.push(child.id);
    }
  }
  return result;
};

export const expandReportSelections = (state: MapState, selections: ReportSelection[]): FeatureState[] => {
  const childrenMap = getFeatureChildrenMap(state);
  const selectedFeatures = new Map<string, FeatureState>();

  selections.forEach((selection) => {
    if (selection.type === "feature") {
      collectFeatureAndChildren(selection.id, state, childrenMap, selectedFeatures);
      return;
    }

    if (selection.type === "group") {
      const groupIds = getGroupAndSubgroupIds(state, selection.id);
      Object.values(state.features || {}).forEach((feature) => {
        if (feature.group_id && groupIds.has(feature.group_id)) {
          collectFeatureAndChildren(feature.id, state, childrenMap, selectedFeatures);
        }
      });
      return;
    }

    const layerIds = getRegionLayerIds(state, selection.id);
    Object.values(state.features || {}).forEach((feature) => {
      if (layerIds.has(feature.layer_id)) {
        collectFeatureAndChildren(feature.id, state, childrenMap, selectedFeatures);
      }
    });
  });

  return Array.from(selectedFeatures.values())
    .filter((feature) => !isNetworkLinkFeature(feature))
    .sort(compareFeatures);
};

export const getDefaultReportSelections = (state: MapState, options: {
  selectionSet?: Set<string>;
  selectedFeatureId?: string | null;
  selectedGroupId?: string | null;
}): ReportSelection[] => {
  const explicitSelections = Array.from(options.selectionSet || [])
    .filter((id) => state.features?.[id] && !isNetworkLinkFeature(state.features[id]))
    .map((id) => ({ type: "feature", id } as ReportSelection));
  if (explicitSelections.length > 0) return explicitSelections;
  if (options.selectedFeatureId && state.features?.[options.selectedFeatureId] && !isNetworkLinkFeature(state.features[options.selectedFeatureId])) {
    return [{ type: "feature", id: options.selectedFeatureId }];
  }
  if (options.selectedGroupId && state.feature_groups?.[options.selectedGroupId]) {
    return [{ type: "group", id: options.selectedGroupId }];
  }
  return Object.keys(state.regions || {}).map((id) => ({ type: "region", id }));
};

const parseCoordinates = (feature: FeatureState): unknown => {
  if (typeof feature.coordinates === "string") {
    try {
      return JSON.parse(feature.coordinates);
    } catch {
      return null;
    }
  }
  return feature.coordinates;
};

const collectPointsFromCoordinates = (coords: unknown, points: Array<[number, number]>): void => {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    points.push([coords[0], coords[1]]);
    return;
  }
  coords.forEach((child) => collectPointsFromCoordinates(child, points));
};

const getRepresentativePoint = (feature: FeatureState): [number, number] | null => {
  const points = getFeaturePoints(feature);
  if (points.length === 0) return null;
  const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lng, lat];
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const uniquePoints = (points: Array<[number, number]>): Array<[number, number]> => {
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  points.forEach((point) => {
    const key = `${point[0].toFixed(8)},${point[1].toFixed(8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(point);
  });
  return result;
};

const isFeatureLine = (feature: FeatureState, metadata = getParsedMetadata(feature)): boolean => {
  const groupKind = "";
  const info = getFeatureDisplayInfo(feature, groupKind, undefined, metadata);
  if (info.isLine) return true;
  const geomType = String(feature.geom_type || "").toLowerCase();
  return geomType.includes("line") || geomType.includes("polyline") || geomType.includes("route");
};

const isFeatureIntersection = (
  feature: FeatureState,
  state: MapState,
  metadata = getParsedMetadata(feature),
): boolean => {
  const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
  return getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata).isIntersection;
};

const pointToSegmentDistance = (
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number => {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

const pointTouchesRoute = (point: [number, number], routePoints: Array<[number, number]>): boolean => {
  if (routePoints.length < 2) return false;
  const lngValues = routePoints.map(([lng]) => lng);
  const latValues = routePoints.map(([, lat]) => lat);
  const extent = Math.max(
    Math.max(...lngValues) - Math.min(...lngValues),
    Math.max(...latValues) - Math.min(...latValues),
  );
  const tolerance = Math.max(0.0003, extent * 0.02);
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    if (pointToSegmentDistance(point, routePoints[index], routePoints[index + 1]) <= tolerance) return true;
  }
  return false;
};

const getRouteIntersectionFeatures = (route: FeatureState, state: MapState): FeatureState[] => {
  const routePoints = getFeaturePoints(route);
  if (routePoints.length < 2) return [];
  return Object.values(state.features || {})
    .filter((candidate) => candidate.id !== route.id)
    .filter((candidate) => isFeatureIntersection(candidate, state))
    .filter((candidate) => getFeaturePoints(candidate).some((point) => pointTouchesRoute(point, routePoints)))
    .sort(compareFeatures);
};

const makePhotoWarnings = (feature: FeatureState, photos: ReportPhoto[]): string[] => (
  photos.length === 0 ? [`${feature.name || feature.id}: Chưa có ảnh site photo.`] : []
);

export const getFeaturePoints = (feature: FeatureState): Array<[number, number]> => {
  const points: Array<[number, number]> = [];
  collectPointsFromCoordinates(parseCoordinates(feature), points);
  if (points.length === 1) {
    const metadata = getParsedMetadata(feature);
    const showFov = getFeatureMetadataValue(feature, "gis.show_fov", "show_fov", metadata) !== false;
    const fovRadius = Number(getFeatureMetadataValue(feature, "gis.fov_radius", "fov_radius", metadata) || 0);
    if (showFov && Number.isFinite(fovRadius) && fovRadius > 0) {
      const rotation = Number(getFeatureMetadataValue(feature, "gis.rotation", "rotation", metadata) || 0);
      const fovAngle = Number(getFeatureMetadataValue(feature, "gis.fov_angle", "fov_angle", metadata) || 60);
      const center = points[0];
      const fovPoints = calculateFOVPoints(center, fovRadius, rotation, fovAngle);
      fovPoints.forEach(([lat, lng]) => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          points.push([lng, lat]);
        }
      });
    }
  }
  return points;
};

export const sanitizeReportBounds = (bounds: ReportBounds | null | undefined): ReportBounds | null => {
  if (!bounds || !Array.isArray(bounds) || bounds.length !== 4) return null;
  const [minLat, minLng, maxLat, maxLng] = bounds.map(Number);
  if (![minLat, minLng, maxLat, maxLng].every((val) => Number.isFinite(val))) return null;

  let s = Math.min(minLat, maxLat);
  let n = Math.max(minLat, maxLat);
  let w = Math.min(minLng, maxLng);
  let e = Math.max(minLng, maxLng);

  if (Math.abs(n - s) < 0.0002) {
    const mid = (s + n) / 2;
    s = mid - 0.0005;
    n = mid + 0.0005;
  }

  if (Math.abs(e - w) < 0.0002) {
    const mid = (w + e) / 2;
    w = mid - 0.0005;
    e = mid + 0.0005;
  }

  return [s, w, n, e];
};

export const getOverallReportBounds = (model: ReportModel): ReportBounds | null => {
  const allBounds = model.sections
    .map((s) => sanitizeReportBounds(s.bounds))
    .filter((b): b is ReportBounds => b !== null);
  if (allBounds.length === 0) return null;

  const minLat = Math.min(...allBounds.map((b) => b[0]));
  const minLng = Math.min(...allBounds.map((b) => b[1]));
  const maxLat = Math.max(...allBounds.map((b) => b[2]));
  const maxLng = Math.max(...allBounds.map((b) => b[3]));

  return sanitizeReportBounds([minLat, minLng, maxLat, maxLng]);
};

export const getFeatureClusterBounds = (feature: FeatureState, related: FeatureState[] = []): ReportBounds | null => {
  const allPoints = [feature, ...related].flatMap(getFeaturePoints);
  if (allPoints.length === 0) return null;

  let minLng = Math.min(...allPoints.map((point) => point[0]));
  let maxLng = Math.max(...allPoints.map((point) => point[0]));
  let minLat = Math.min(...allPoints.map((point) => point[1]));
  let maxLat = Math.max(...allPoints.map((point) => point[1]));

  if (Math.abs(maxLat - minLat) < 0.00002) {
    const midLat = (minLat + maxLat) / 2;
    minLat = midLat - 0.00001;
    maxLat = midLat + 0.00001;
  }
  if (Math.abs(maxLng - minLng) < 0.00002) {
    const midLng = (minLng + maxLng) / 2;
    minLng = midLng - 0.00001;
    maxLng = midLng + 0.00001;
  }

  return sanitizeReportBounds([minLat, minLng, maxLat, maxLng]);
};

export const getFeatureBounds = (feature: FeatureState, related: FeatureState[] = []): ReportBounds | null => {
  const allPoints = [feature, ...related].flatMap(getFeaturePoints);
  if (allPoints.length === 0) return null;

  let minLng = Math.min(...allPoints.map((point) => point[0]));
  let maxLng = Math.max(...allPoints.map((point) => point[0]));
  let minLat = Math.min(...allPoints.map((point) => point[1]));
  let maxLat = Math.max(...allPoints.map((point) => point[1]));

  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;

  const padLng = Math.max(spanLng * 0.05 + 0.0001, 0.0002);
  const padLat = Math.max(spanLat * 0.05 + 0.0001, 0.0002);

  minLng -= padLng;
  maxLng += padLng;
  minLat -= padLat;
  maxLat += padLat;

  return sanitizeReportBounds([minLat, minLng, maxLat, maxLng]);
};

const getFeatureDescription = (feature: FeatureState, metadata: Record<string, unknown>): string => {
  const propertyDescription = feature.properties?.description;
  return safeString(metadata.description || metadata.notes || metadata.note || propertyDescription || feature.note || "");
};

const tryParseJsonRecord = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return {};
};

const getFeaturePhotos = (feature: FeatureState, metadata: Record<string, unknown>): ReportPhoto[] => {
  const properties = isRecord(feature.properties) ? feature.properties : {};

  const propMedia = tryParseJsonRecord(properties.media);
  const metaMedia = tryParseJsonRecord(metadata.media);

  const singleUrl = safeString(metaMedia.imageUrl || propMedia.imageUrl || metadata.imageUrl || properties.imageUrl);
  const urls = [
    ...(singleUrl ? [singleUrl] : []),
    ...asStringArray(propMedia.imageUrls),
    ...asStringArray(metaMedia.imageUrls),
    ...asStringArray(metadata.imageUrls),
    ...asStringArray(properties.imageUrls),
    ...asStringArray(metadata.photos),
    ...asStringArray(properties.photos),
    ...asStringArray(metadata.sitePhotos),
    ...asStringArray(properties.sitePhotos),
  ];

  const singleAssetId = safeString(metaMedia.primaryImageAssetId || metaMedia.imageAssetId || propMedia.primaryImageAssetId || propMedia.imageAssetId || metadata.imageAssetId || properties.imageAssetId);
  const assetIds = [
    ...(singleAssetId ? [singleAssetId] : []),
    ...asStringArray(propMedia.imageAssetIds),
    ...asStringArray(metaMedia.imageAssetIds),
    ...asStringArray(metadata.imageAssetIds),
    ...asStringArray(properties.imageAssetIds),
    ...asStringArray(metadata.siteAssetIds),
    ...asStringArray(properties.siteAssetIds),
  ];

  const legacyPhotos = Array.from(new Set(urls))
    .filter((url) => url.startsWith("data:image") || /^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("asset:"))
    .map((dataUrl, index) => ({
      id: `${feature.id}-photo-${index + 1}`,
      label: `Ảnh ${index + 1}`,
      dataUrl,
    }));

  const assetPhotos = Array.from(new Set(assetIds)).map((assetId, index) => ({
    id: `${feature.id}-asset-photo-${index + 1}`,
    label: `Ảnh ${index + 1}`,
    dataUrl: "",
    assetId,
  }));

  return [
    ...assetPhotos,
    ...legacyPhotos.map((photo, index) => ({
      ...photo,
      label: `Ảnh ${assetPhotos.length + index + 1}`,
    })),
  ];
};

const toPlainRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const makeFeatureDetail = (
  featureInput: FeatureState,
  state: MapState,
  childrenMap: Map<string, FeatureState[]>,
  label: string,
  featureDetailsCache: Record<string, FeatureState> = {},
): ReportFeatureDetail => {
  const cachedFeature = featureDetailsCache[featureInput.id];
  const baseMeta = getParsedMetadata(featureInput);
  const cachedMeta = cachedFeature ? getParsedMetadata(cachedFeature) : {};
  const metadata = { ...baseMeta, ...cachedMeta };

  const baseProps = isRecord(featureInput.properties) ? featureInput.properties : {};
  const cachedProps = cachedFeature && isRecord(cachedFeature.properties) ? cachedFeature.properties : {};
  const properties = { ...baseProps, ...cachedProps };

  const feature: FeatureState = cachedFeature
    ? { ...featureInput, ...cachedFeature, properties }
    : { ...featureInput, properties };

  const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
  const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
  const points = getFeaturePoints(feature);
  const startPoint = points[0];
  const endPoint = points.length > 1 ? points[points.length - 1] : undefined;
  const photos = getFeaturePhotos(feature, metadata);

  return {
    feature,
    label,
    displayType: info.label,
    description: getFeatureDescription(feature, metadata),
    metadata,
    properties: toPlainRecord(properties),
    photos,
    bounds: getFeatureBounds(feature, childrenMap.get(feature.id) || []),
    startPoint,
    endPoint,
    connectedNames: getConnectedNames(feature, state),
    photoWarnings: makePhotoWarnings(feature, photos),
  };
};

const getConnectedNames = (feature: FeatureState, state: MapState): string[] => {
  const info = getFeatureDisplayInfo(feature);
  if (!info.isLine) return [];
  const lineBounds = getFeatureBounds(feature);
  if (!lineBounds) return [];
  const [minLat, minLng, maxLat, maxLng] = lineBounds;
  return Object.values(state.features || {})
    .filter((candidate) => candidate.id !== feature.id)
    .filter((candidate) => getFeaturePoints(candidate).some(([lng, lat]) => (
      lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    )))
    .map((candidate) => candidate.name || candidate.id);
};

const makeSectionSummary = (
  featureInput: FeatureState,
  state: MapState,
  children: FeatureState[],
  metadata: Record<string, unknown>,
  childrenMap: Map<string, FeatureState[]>,
  featureDetailsCache: Record<string, FeatureState> = {},
): string[] => {
  const feature = featureDetailsCache[featureInput.id] || featureInput;
  const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
  const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
  if (info.isIntersection) {
    const childDetails = children.map((child, index) => makeFeatureDetail(child, state, childrenMap, `Đối tượng 1_${index + 1}`, featureDetailsCache));
    const cameraCounts = childDetails.reduce<Record<string, number>>((acc, detail) => {
      if (["CCTV", "PTZ", "SPEED", "LPR"].includes(detail.displayType)) {
        acc[detail.displayType] = (acc[detail.displayType] || 0) + 1;
      }
      return acc;
    }, {});
    const cameraText = Object.entries(cameraCounts).map(([type, count]) => `${type}: ${count}`).join(", ") || "Không có camera";
    return [`Số vị trí thuộc nút giao: ${children.length}`, `Loại camera: ${cameraText}`];
  }

  if (info.isLine) {
    const detail = makeFeatureDetail(feature, state, childrenMap, feature.name, featureDetailsCache);
    const lineType = safeString(getFeatureMetadataValue(feature, "infrastructure.type", undefined, metadata));
    const summary = [`Điểm đầu: ${formatPoint(detail.startPoint)}`, `Điểm cuối: ${formatPoint(detail.endPoint)}`];
    if (lineType === "SignalLine") {
      summary.push(`Nút/đối tượng kết nối trên tuyến: ${detail.connectedNames.join(", ") || "Chưa xác định"}`);
    }
    return summary;
  }

  return [getFeatureDescription(feature, metadata)].filter(Boolean);
};

export const formatPoint = (point?: [number, number]): string =>
  point ? `${point[1].toFixed(6)}, ${point[0].toFixed(6)}` : "Chưa có tọa độ";

export const getIntersectionSpatialFeatures = (
  intersection: FeatureState,
  linkedChildren: FeatureState[],
  state: MapState,
): FeatureState[] => {
  const allDirectChildren = [intersection, ...linkedChildren];
  const initialBounds = getFeatureBounds(intersection, linkedChildren);
  const minPadding = 0.0009; // ~100m radius
  let minLat = -90;
  let minLng = -180;
  let maxLat = 90;
  let maxLng = 180;

  if (initialBounds) {
    [minLat, minLng, maxLat, maxLng] = initialBounds;
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    if (latSpan < minPadding) {
      const midLat = (minLat + maxLat) / 2;
      minLat = midLat - minPadding;
      maxLat = midLat + minPadding;
    }
    if (lngSpan < minPadding) {
      const midLng = (minLng + maxLng) / 2;
      minLng = midLng - minPadding;
      maxLng = midLng + minPadding;
    }
  }

  const existingIds = new Set(allDirectChildren.map((c) => c.id));
  const result: FeatureState[] = [...linkedChildren];

  Object.values(state.features || {}).forEach((candidate) => {
    if (existingIds.has(candidate.id)) return;
    if (isNetworkLinkFeature(candidate)) return;
    if (isFeatureLine(candidate)) return;
    const points = getFeaturePoints(candidate);
    const isInside = points.some(([lng, lat]) => (
      lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
    ));
    if (isInside) {
      result.push(candidate);
      existingIds.add(candidate.id);
    }
  });

  return result.sort(compareFeatures);
};

export const buildReportModel = (
  state: MapState,
  selections: ReportSelection[],
  title = "Báo cáo thiết kế",
  featureDetailsCache: Record<string, FeatureState> = {},
): ReportModel => {
  const childrenMap = getFeatureChildrenMap(state);
  const expandedFeatures = expandReportSelections(state, selections);
  const featureIds = new Set(expandedFeatures.map((feature) => feature.id));
  const roots = expandedFeatures.filter((feature) => {
    const metadata = getParsedMetadata(feature);
    const parentId = typeof metadata.parent_feature_id === "string" ? metadata.parent_feature_id : null;
    return !parentId || !featureIds.has(parentId);
  });

  const sections = roots.map((featureInput, sectionIndex) => {
    const cachedFeature = featureDetailsCache[featureInput.id];
    const baseMeta = getParsedMetadata(featureInput);
    const cachedMeta = cachedFeature ? getParsedMetadata(cachedFeature) : {};
    const metadata = { ...baseMeta, ...cachedMeta };

    const baseProps = isRecord(featureInput.properties) ? featureInput.properties : {};
    const cachedProps = cachedFeature && isRecord(cachedFeature.properties) ? cachedFeature.properties : {};
    const properties = { ...baseProps, ...cachedProps };

    const feature: FeatureState = cachedFeature
      ? { ...featureInput, ...cachedFeature, properties }
      : { ...featureInput, properties };

    const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
    const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
    const children = collectFeatureTree(feature.id, childrenMap);
    const intersectionRelated = info.isIntersection
      ? getIntersectionSpatialFeatures(feature, children, state)
      : children;

    const details = info.isIntersection
      ? intersectionRelated.map((child, index) => makeFeatureDetail(child, state, childrenMap, `Đối tượng ${sectionIndex + 1}_${index + 1}`, featureDetailsCache))
      : [makeFeatureDetail(feature, state, childrenMap, feature.name || `Đối tượng ${sectionIndex + 1}`, featureDetailsCache)];
    const routeIntersections = info.isLine ? getRouteIntersectionFeatures(feature, state) : [];
    const captureMode: ReportCaptureMode = info.isIntersection ? "intersection" : info.isLine ? "route" : "feature";
    const focusFeatureIds = captureMode === "route"
      ? unique([feature.id, ...routeIntersections.map((item) => item.id)])
      : unique([feature.id, ...intersectionRelated.map((item) => item.id)]);
    const hiddenFeatureIds = captureMode === "route"
      ? Object.values(state.features || {})
        .filter((candidate) => candidate.id !== feature.id && isFeatureLine(candidate))
        .map((candidate) => candidate.id)
      : [];
    const captureRelated = captureMode === "route" ? routeIntersections : intersectionRelated;
    const requiredFeatures = captureMode === "route"
      ? [feature, ...routeIntersections]
      : [feature, ...intersectionRelated];
    const requiredFeatureIds = unique(requiredFeatures.map((item) => item.id));
    const requiredPoints = uniquePoints(requiredFeatures.flatMap(getFeaturePoints));
    const photoWarnings = details.flatMap((detail) => detail.photoWarnings);

    return {
      id: feature.id,
      anchor: normalizeAnchor(feature.id),
      title: `${sectionIndex + 1}. ${feature.name || feature.id}`,
      displayType: info.label,
      feature,
      description: getFeatureDescription(feature, metadata),
      summary: makeSectionSummary(feature, state, children, metadata, childrenMap, featureDetailsCache),
      details,
      photos: getFeaturePhotos(feature, metadata),
      photoWarnings,
      bounds: info.isIntersection ? getFeatureClusterBounds(feature, intersectionRelated) : getFeatureBounds(feature, captureRelated),
      captureMode,
      focusFeatureIds,
      hiddenFeatureIds,
      requiredFeatureIds,
      requiredPoints,
      captureWarnings: [],
    } satisfies ReportSection;
  });

  return {
    title,
    generatedAt: new Date().toISOString(),
    selectedItems: selections,
    sections,
  };
};

export const getSelectableReportItems = (state: MapState): Array<{
  key: string;
  selection: ReportSelection;
  name: string;
  level: number;
}> => {
  const items: Array<{ key: string; selection: ReportSelection; name: string; level: number }> = [];
  const regions = Object.values(state.regions || {}).sort((a: RegionState, b: RegionState) => a.name.localeCompare(b.name));
  const childrenMap = getFeatureChildrenMap(state);

  const addFeature = (feature: FeatureState, level: number) => {
    if (isNetworkLinkFeature(feature)) return;
    items.push({
      key: `feature:${feature.id}`,
      selection: { type: "feature", id: feature.id },
      name: feature.name || feature.id,
      level,
    });
    (childrenMap.get(feature.id) || []).forEach((child) => addFeature(child, level + 1));
  };

  const isChildFeature = (feature: FeatureState): boolean => {
    const metadata = getParsedMetadata(feature);
    return typeof metadata.parent_feature_id === "string" && metadata.parent_feature_id.length > 0;
  };

  regions.forEach((region) => {
    items.push({ key: `region:${region.id}`, selection: { type: "region", id: region.id }, name: region.name, level: 0 });
    const layerIds = getRegionLayerIds(state, region.id);
    const topGroups = Object.values(state.feature_groups || {})
      .filter((group) => layerIds.has(group.layer_id) && !group.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name));

    const addGroup = (group: FeatureGroupState, level: number) => {
      items.push({ key: `group:${group.id}`, selection: { type: "group", id: group.id }, name: group.name, level });
      Object.values(state.feature_groups || {})
        .filter((child) => child.parent_id === group.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((child) => addGroup(child, level + 1));
      Object.values(state.features || {})
        .filter((feature) => feature.group_id === group.id)
        .filter((feature) => !isChildFeature(feature))
        .sort(compareFeatures)
        .forEach((feature) => addFeature(feature, level + 1));
    };

    topGroups.forEach((group) => addGroup(group, 1));
    Object.values(state.features || {})
      .filter((feature) => layerIds.has(feature.layer_id) && !feature.group_id)
      .filter((feature) => !isChildFeature(feature))
      .sort(compareFeatures)
      .forEach((feature) => addFeature(feature, 1));
  });

  return items;
};

export const hydrateReportSitePhotos = async (
  model: ReportModel,
  pmpPath: string,
  projectId: string,
  onProgress?: (current: number, total: number) => void
): Promise<ReportModel> => {
  if (!pmpPath || !projectId || model.sections.length === 0) {
    return model;
  }

  const { fetchSectionSitePhotos } = await import("./reportSitePhotoRepository");

  const updatedSections = [...model.sections];
  const totalSections = updatedSections.length;

  for (let sIdx = 0; sIdx < totalSections; sIdx += 1) {
    const section = updatedSections[sIdx];
    onProgress?.(sIdx + 1, totalSections);

    const sectionFeatureIds = [
      section.feature.id,
      ...section.details.map((d) => d.feature.id),
    ];

    const photoRefs = await fetchSectionSitePhotos(pmpPath, projectId, sectionFeatureIds);
    if (photoRefs.length === 0) continue;

    const photosByFeature = new Map<string, ReportPhoto[]>();

    photoRefs.forEach((ref, index) => {
      const warning = ref.warning || undefined;

      const photoItem: ReportPhoto = {
        id: `${ref.featureId}-${ref.assetId}-${index}`,
        label: ref.isPrimary ? "Ảnh đại diện" : `Ảnh ${ref.sortOrder || index + 1}`,
        dataUrl: "",
        assetId: ref.assetId,
        featureId: ref.featureId,
        projectId: ref.projectId,
        relativePath: ref.relativePath,
        absolutePath: ref.absolutePath,
        mimeType: ref.mimeType,
        isPrimary: ref.isPrimary,
        sortOrder: ref.sortOrder,
        status: ref.status as ReportPhoto["status"],
        warning: warning ? `${ref.featureId}: ${warning}` : undefined,
        processedAsset: ref.processedAsset,
      };

      const existing = photosByFeature.get(ref.featureId) || [];
      existing.push(photoItem);
      photosByFeature.set(ref.featureId, existing);
    });

    const updatedDetails = section.details.map((detail) => {
      const dbPhotos = photosByFeature.get(detail.feature.id) || [];
      const combinedPhotos = dbPhotos.length > 0 ? dbPhotos : detail.photos;
      const photoWarnings = combinedPhotos
        .filter((p) => !!p.warning)
        .map((p) => p.warning as string);

      return {
        ...detail,
        photos: combinedPhotos,
        photoWarnings: Array.from(new Set([...detail.photoWarnings, ...photoWarnings])),
      };
    });

    const rootDbPhotos = photosByFeature.get(section.feature.id) || [];
    const sectionPhotos = rootDbPhotos.length > 0 ? rootDbPhotos : section.photos;

    updatedSections[sIdx] = {
      ...section,
      details: updatedDetails,
      photos: sectionPhotos,
      photoWarnings: updatedDetails.flatMap((d) => d.photoWarnings),
    };
  }

  return {
    ...model,
    sections: updatedSections,
  };
};
