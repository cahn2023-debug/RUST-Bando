import type { FeatureState, FeatureGroupState, MapState, RegionState } from "@CONTRACT/types";
import { getFeatureDisplayInfo, getParsedMetadata, getFeatureMetadataValue, safeString, isNetworkLinkFeature } from "@TOOL/utils/featureUtils";

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
}

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
  bounds: ReportBounds | null;
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

export const getFeaturePoints = (feature: FeatureState): Array<[number, number]> => {
  const points: Array<[number, number]> = [];
  collectPointsFromCoordinates(parseCoordinates(feature), points);
  return points;
};

export const getFeatureClusterBounds = (feature: FeatureState, related: FeatureState[] = []): ReportBounds | null => {
  const allPoints = [feature, ...related]
    .map(getRepresentativePoint)
    .filter((point): point is [number, number] => point !== null);
  if (allPoints.length === 0) return getFeatureBounds(feature, related);

  let minLng = Math.min(...allPoints.map((point) => point[0]));
  let maxLng = Math.max(...allPoints.map((point) => point[0]));
  let minLat = Math.min(...allPoints.map((point) => point[1]));
  let maxLat = Math.max(...allPoints.map((point) => point[1]));

  const width = Math.max(maxLng - minLng, CLUSTER_PADDING_DEGREES);
  const height = Math.max(maxLat - minLat, CLUSTER_PADDING_DEGREES);
  const padLng = width * LINE_PADDING_RATIO + CLUSTER_PADDING_DEGREES;
  const padLat = height * LINE_PADDING_RATIO + CLUSTER_PADDING_DEGREES;

  minLng -= padLng;
  maxLng += padLng;
  minLat -= padLat;
  maxLat += padLat;

  return [minLat, minLng, maxLat, maxLng];
};

export const getFeatureBounds = (feature: FeatureState, related: FeatureState[] = []): ReportBounds | null => {
  const allPoints = [feature, ...related].flatMap(getFeaturePoints);
  if (allPoints.length === 0) return null;

  let minLng = Math.min(...allPoints.map((point) => point[0]));
  let maxLng = Math.max(...allPoints.map((point) => point[0]));
  let minLat = Math.min(...allPoints.map((point) => point[1]));
  let maxLat = Math.max(...allPoints.map((point) => point[1]));

  const metadata = getParsedMetadata(feature);
  const fovRadiusMeters = Number(getFeatureMetadataValue(feature, "gis.fov_radius", "fov_radius", metadata) || 0);
  const radiusPadding = Number.isFinite(fovRadiusMeters) && fovRadiusMeters > 0
    ? Math.min(fovRadiusMeters / 111_000, 0.02)
    : 0;

  const width = Math.max(maxLng - minLng, POINT_PADDING_DEGREES, radiusPadding);
  const height = Math.max(maxLat - minLat, POINT_PADDING_DEGREES, radiusPadding);
  const padLng = width * LINE_PADDING_RATIO + POINT_PADDING_DEGREES;
  const padLat = height * LINE_PADDING_RATIO + POINT_PADDING_DEGREES;

  minLng -= padLng;
  maxLng += padLng;
  minLat -= padLat;
  maxLat += padLat;

  return [minLat, minLng, maxLat, maxLng];
};

const getFeatureDescription = (feature: FeatureState, metadata: Record<string, unknown>): string => {
  const propertyDescription = feature.properties?.description;
  return safeString(metadata.description || metadata.notes || metadata.note || propertyDescription || feature.note || "");
};

const getFeaturePhotos = (feature: FeatureState, metadata: Record<string, unknown>): ReportPhoto[] => {
  const media = isRecord(metadata.media) ? metadata.media : {};
  const urls = [
    ...asStringArray(media.imageUrls),
    ...asStringArray(metadata.imageUrls),
  ];
  const singleUrl = safeString(media.imageUrl || metadata.imageUrl);
  if (singleUrl) urls.unshift(singleUrl);
  const assetIds = asStringArray(media.imageAssetIds);

  const legacyPhotos = Array.from(new Set(urls))
    .filter((url) => url.startsWith("data:image") || /^https?:\/\//i.test(url))
    .map((dataUrl, index) => ({
      id: `${feature.id}-photo-${index + 1}`,
      label: `Ảnh ${index + 1}`,
      dataUrl,
    }));

  const assetPhotos = assetIds.map((assetId, index) => ({
    id: `${feature.id}-asset-photo-${index + 1}`,
    label: `Ảnh ${legacyPhotos.length + index + 1}`,
    dataUrl: "",
    assetId,
  }));

  return [...legacyPhotos, ...assetPhotos];
};

const toPlainRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const makeFeatureDetail = (
  feature: FeatureState,
  state: MapState,
  childrenMap: Map<string, FeatureState[]>,
  label: string,
): ReportFeatureDetail => {
  const metadata = getParsedMetadata(feature);
  const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
  const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
  const points = getFeaturePoints(feature);
  const startPoint = points[0];
  const endPoint = points.length > 1 ? points[points.length - 1] : undefined;

  return {
    feature,
    label,
    displayType: info.label,
    description: getFeatureDescription(feature, metadata),
    metadata,
    properties: toPlainRecord(feature.properties),
    photos: getFeaturePhotos(feature, metadata),
    bounds: getFeatureBounds(feature, childrenMap.get(feature.id) || []),
    startPoint,
    endPoint,
    connectedNames: getConnectedNames(feature, state),
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
  feature: FeatureState,
  state: MapState,
  children: FeatureState[],
  metadata: Record<string, unknown>,
  childrenMap: Map<string, FeatureState[]>,
): string[] => {
  const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
  const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
  if (info.isIntersection) {
    const childDetails = children.map((child, index) => makeFeatureDetail(child, state, childrenMap, `Đối tượng 1_${index + 1}`));
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
    const detail = makeFeatureDetail(feature, state, childrenMap, feature.name);
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

export const buildReportModel = (state: MapState, selections: ReportSelection[], title = "Báo cáo thiết kế"): ReportModel => {
  const childrenMap = getFeatureChildrenMap(state);
  const expandedFeatures = expandReportSelections(state, selections);
  const featureIds = new Set(expandedFeatures.map((feature) => feature.id));
  const roots = expandedFeatures.filter((feature) => {
    const metadata = getParsedMetadata(feature);
    const parentId = typeof metadata.parent_feature_id === "string" ? metadata.parent_feature_id : null;
    return !parentId || !featureIds.has(parentId);
  });

  const sections = roots.map((feature, sectionIndex) => {
    const metadata = getParsedMetadata(feature);
    const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
    const info = getFeatureDisplayInfo(feature, getGroupKind(group), group?.name, metadata);
    const children = (childrenMap.get(feature.id) || []).filter((child) => featureIds.has(child.id));
    const details = info.isIntersection
      ? children.map((child, index) => makeFeatureDetail(child, state, childrenMap, `Đối tượng ${sectionIndex + 1}_${index + 1}`))
      : [makeFeatureDetail(feature, state, childrenMap, feature.name || `Đối tượng ${sectionIndex + 1}`)];

    return {
      id: feature.id,
      anchor: normalizeAnchor(feature.id),
      title: `${sectionIndex + 1}. ${feature.name || feature.id}`,
      displayType: info.label,
      feature,
      description: getFeatureDescription(feature, metadata),
      summary: makeSectionSummary(feature, state, children, metadata, childrenMap),
      details,
      photos: getFeaturePhotos(feature, metadata),
      bounds: info.isIntersection ? getFeatureClusterBounds(feature, children) : getFeatureBounds(feature, children),
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
