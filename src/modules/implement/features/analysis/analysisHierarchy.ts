import type { FeatureState, MapState } from '@CONTRACT/types';
import { flattenFeature } from '@TOOL/utils/dataFlattening';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureDisplay';
import { calculateFeatureNumbers } from '@TOOL/utils/featureMapping';

type ComparableValue = string | number | boolean | null | undefined;

type ProcessedFeature = {
  feature: FeatureState;
  metadata: Record<string, unknown>;
  flatRow: Record<string, unknown>;
  parentId: string | null;
  rootId: string;
  isIntersection: boolean;
};

export type AnalysisHierarchyRow = Record<string, unknown> & {
  id: string;
  name: string;
  junction_scope: string;
  __analysis_depth: number;
  __analysis_is_intersection: boolean;
  __analysis_parent_id: string | null;
  __analysis_root_id: string;
  __analysis_root_values: Record<string, unknown>;
  __analysis_sort_key: string;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const parseMetadata = (feature: FeatureState) => {
  try {
    return typeof feature.metadata === 'string'
      ? JSON.parse(feature.metadata || '{}') as Record<string, unknown>
      : ((feature.metadata || {}) as Record<string, unknown>);
  } catch {
    return {};
  }
};

const compareValues = (left: ComparableValue, right: ComparableValue) => {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return Number(Boolean(left)) - Number(Boolean(right));
  }

  return collator.compare(String(left), String(right));
};

const compareFeatures = (left: ProcessedFeature, right: ProcessedFeature) => {
  const leftDisplayOrder = String(left.flatRow.display_order || '');
  const rightDisplayOrder = String(right.flatRow.display_order || '');

  if (leftDisplayOrder && rightDisplayOrder) {
    const displayOrderComparison = collator.compare(leftDisplayOrder, rightDisplayOrder);
    if (displayOrderComparison !== 0) return displayOrderComparison;
  } else if (leftDisplayOrder || rightDisplayOrder) {
    return leftDisplayOrder ? -1 : 1;
  }

  const nameComparison = collator.compare(String(left.feature.name || ''), String(right.feature.name || ''));
  if (nameComparison !== 0) return nameComparison;

  return collator.compare(left.feature.id, right.feature.id);
};

const compareSortKeys = (leftKey: string, rightKey: string) => {
  const leftParts = leftKey.split('.').map((segment) => Number.parseInt(segment, 10));
  const rightParts = rightKey.split('.').map((segment) => Number.parseInt(segment, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? -1;
    const rightPart = rightParts[index] ?? -1;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }

  return 0;
};

const resolveRootId = (
  featureId: string,
  processedMap: Map<string, ProcessedFeature>,
  cache: Map<string, string>,
): string => {
  const cached = cache.get(featureId);
  if (cached) return cached;

  const current = processedMap.get(featureId);
  if (!current?.parentId) {
    cache.set(featureId, featureId);
    return featureId;
  }

  const parent = processedMap.get(current.parentId);
  if (!parent) {
    cache.set(featureId, featureId);
    return featureId;
  }

  const rootId = resolveRootId(parent.feature.id, processedMap, cache);
  cache.set(featureId, rootId);
  return rootId;
};

export const buildAnalysisHierarchyRows = (state: MapState): AnalysisHierarchyRow[] => {
  const featureNumbers = calculateFeatureNumbers(
    Object.values(state.features || {}),
    state.features || {},
  );

  const processedFeatures = Object.values(state.features || {}).map((feature) => {
    const metadata = parseMetadata(feature);
    const group = feature.group_id ? state.feature_groups?.[feature.group_id] : null;
    const displayInfo = getFeatureDisplayInfo(feature, group?.type || group?.group_type, group?.name, metadata);
    return {
      feature,
      metadata,
      flatRow: flattenFeature(feature, state, metadata, { featureNumbers }),
      parentId: typeof metadata.parent_feature_id === 'string' ? metadata.parent_feature_id : null,
      rootId: feature.id,
      isIntersection: displayInfo.isIntersection,
    } satisfies ProcessedFeature;
  });

  const processedMap = new Map(processedFeatures.map((item) => [item.feature.id, item]));
  const rootCache = new Map<string, string>();
  processedFeatures.forEach((item) => {
    item.rootId = resolveRootId(item.feature.id, processedMap, rootCache);
  });

  const childrenMap = new Map<string, ProcessedFeature[]>();
  processedFeatures.forEach((item) => {
    if (!item.parentId || !processedMap.has(item.parentId)) return;
    const currentChildren = childrenMap.get(item.parentId) || [];
    currentChildren.push(item);
    childrenMap.set(item.parentId, currentChildren);
  });
  childrenMap.forEach((items) => items.sort(compareFeatures));

  const roots = processedFeatures
    .filter((item) => !item.parentId || !processedMap.has(item.parentId))
    .sort(compareFeatures);

  const rows: AnalysisHierarchyRow[] = [];

  const walk = (
    current: ProcessedFeature,
    depth: number,
    sortKey: string,
    root: ProcessedFeature,
  ) => {
    const row = {
      ...(current.flatRow as Record<string, unknown>),
      junction_scope: current.parentId
        ? (root.feature.name || String(root.flatRow.name || ''))
        : (current.isIntersection ? String(current.feature.name || current.flatRow.name || '') : ''),
      __analysis_depth: depth,
      __analysis_is_intersection: current.isIntersection,
      __analysis_parent_id: current.parentId,
      __analysis_root_id: root.feature.id,
      __analysis_root_values: root.flatRow,
      __analysis_sort_key: sortKey,
    } as AnalysisHierarchyRow;

    rows.push(row);

    const children = childrenMap.get(current.feature.id) || [];
    children.forEach((child, index) => {
      walk(child, depth + 1, `${sortKey}.${String(index + 1).padStart(4, '0')}`, root);
    });
  };

  roots.forEach((root, index) => {
    walk(root, 0, String(index + 1).padStart(4, '0'), root);
  });

  return rows.map((row, index) => ({
    ...row,
    index_stt: String(index + 1),
  }));
};

export const compareAnalysisHierarchyRows = (
  left: AnalysisHierarchyRow,
  right: AnalysisHierarchyRow,
  columnId: string,
) => {
  const leftRootValue = left.__analysis_root_values?.[columnId] as ComparableValue;
  const rightRootValue = right.__analysis_root_values?.[columnId] as ComparableValue;
  const rootComparison = compareValues(
    leftRootValue ?? (left[columnId] as ComparableValue),
    rightRootValue ?? (right[columnId] as ComparableValue),
  );

  if (left.__analysis_root_id !== right.__analysis_root_id) {
    if (rootComparison !== 0) return rootComparison;

    const leftRootDisplayOrder = left.__analysis_root_values?.display_order as ComparableValue;
    const rightRootDisplayOrder = right.__analysis_root_values?.display_order as ComparableValue;
    const displayOrderComparison = compareValues(leftRootDisplayOrder, rightRootDisplayOrder);
    if (displayOrderComparison !== 0) return displayOrderComparison;

    const rootNameComparison = compareValues(
      left.__analysis_root_values?.name as ComparableValue,
      right.__analysis_root_values?.name as ComparableValue,
    );
    if (rootNameComparison !== 0) return rootNameComparison;

    return compareValues(left.__analysis_root_id, right.__analysis_root_id);
  }

  return compareSortKeys(left.__analysis_sort_key, right.__analysis_sort_key);
};
