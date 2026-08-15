import type { DesignEventType, FeatureMetadata, FeatureProperties, FeatureState } from '@CONTRACT/types';
import { normalizeFeatureMetadataForPersistence, buildFeaturePropertiesForPersistence } from './featurePersistence';
import { getParsedMetadata, safeString } from './featureMetadata';
import { getObjectTypeForIcon, isKnownIconValue, isKnownObjectType } from './featureSymbolStyle';
import { canonicalizeObjectType, normalizeFeatureSymbolData } from './featureDisplay';

export const ICON_MAPPING_SNAPSHOT_SCHEMA = 'design-icon-type-mapping';
export const ICON_MAPPING_SNAPSHOT_VERSION = 1;

export type IconMappingMigrationRecord = {
  feature: FeatureState;
  metadata: FeatureMetadata;
  properties: FeatureProperties;
  warning?: string;
};

export type IconMappingMigrationPlan = {
  affected: IconMappingMigrationRecord[];
  events: Extract<DesignEventType, { type: 'FeatureUpdated' }>[];
  warnings: Array<{ id: string; warning: string }>;
};

export type IconMappingSnapshot = {
  schema: typeof ICON_MAPPING_SNAPSHOT_SCHEMA;
  version: typeof ICON_MAPPING_SNAPSHOT_VERSION;
  projectId: string;
  createdAt: string;
  records: Array<{ id: string; feature: FeatureState }>;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
);

const parseProperties = (feature: FeatureState): FeatureProperties => {
  if (typeof feature.properties === 'string') {
    try {
      return asRecord(JSON.parse(feature.properties)) as FeatureProperties;
    } catch {
      return {};
    }
  }
  return asRecord(feature.properties) as FeatureProperties;
};

const firstMeaningful = (...values: unknown[]): string => {
  for (const value of values) {
    const result = safeString(value).trim();
    if (result) return result;
  }
  return '';
};

const isLegacyPointType = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'point' || normalized === 'default';
};

const isLine = (feature: FeatureState): boolean => {
  const geometry = safeString(feature.geom_type).trim().toLowerCase();
  return geometry === 'line' || geometry === 'linestring' || geometry === 'polyline';
};

const isPolygon = (feature: FeatureState): boolean => safeString(feature.geom_type).trim().toLowerCase() === 'polygon';

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
};

const sameValue = (left: unknown, right: unknown): boolean => (
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
);

const buildWarning = (rawIcon: string, rawType: string): string => {
  const source = rawIcon && !isKnownIconValue(rawIcon) ? rawIcon : rawType;
  return `Chưa ánh xạ biểu tượng/loại đối tượng: ${source || 'không xác định'}`;
};

const normalizeFeatureMapping = (
  feature: FeatureState,
  groupType?: string,
  groupName?: string,
): IconMappingMigrationRecord => {
  const metadata = getParsedMetadata(feature) as FeatureMetadata;
  const properties = parseProperties(feature);
  const rawIcon = firstMeaningful(metadata.icon, properties.icon, properties.iconKey);
  const rawObjectType = firstMeaningful(metadata.objectType, metadata.type, properties.objectType, properties.type);
  const canonicalType = canonicalizeObjectType(rawObjectType);
  const geometryFeature = isLine(feature) || isPolygon(feature);
  const unmappedIcon = !!rawIcon && !isKnownIconValue(rawIcon);
  const unmappedType = !!rawObjectType && !isLegacyPointType(canonicalType) && !isKnownObjectType(canonicalType);
  const warning = !geometryFeature && (unmappedIcon || unmappedType)
    ? buildWarning(rawIcon, rawObjectType)
    : undefined;

  const baseMetadata = normalizeFeatureMetadataForPersistence(metadata, properties);
  const baseProperties = buildFeaturePropertiesForPersistence(properties, baseMetadata);
  const displaySymbol = normalizeFeatureSymbolData(
    { ...feature, properties, metadata },
    groupType,
    groupName,
    metadata,
  );

  const icon = geometryFeature
    ? 'default'
    : warning
      ? 'default'
      : displaySymbol.iconKey;
  const objectType = isLine(feature)
    ? 'line'
    : isPolygon(feature)
      ? 'polygon'
      : warning
        ? (firstMeaningful(metadata.objectType, metadata.type, properties.objectType, properties.type) || 'point')
        : (displaySymbol.objectType || getObjectTypeForIcon(icon));
  const nextMetadata = {
    ...baseMetadata,
    icon,
    type: objectType,
    objectType,
    ...(warning ? { mappingWarning: warning, unmappedIcon: unmappedIcon ? rawIcon : undefined } : {}),
  } as FeatureMetadata;
  delete (nextMetadata as Record<string, unknown>).iconKey;

  const nextProperties = {
    ...baseProperties,
    icon,
    iconKey: icon,
    type: objectType,
    objectType,
    ...(warning ? { mappingWarning: warning, unmappedIcon: unmappedIcon ? rawIcon : undefined } : {}),
  } as FeatureProperties;

  return {
    feature,
    metadata: nextMetadata,
    properties: nextProperties,
    warning,
  };
};

export const buildFeatureMappingUpdateEvent = (
  record: Pick<IconMappingMigrationRecord, 'feature' | 'metadata' | 'properties'>,
): Extract<DesignEventType, { type: 'FeatureUpdated' }> => ({
  type: 'FeatureUpdated',
  payload: {
    id: record.feature.id,
    metadata: JSON.stringify(record.metadata),
    properties: record.properties,
  },
});

export const buildIconMappingMigrationPlan = (
  features: Iterable<FeatureState>,
  groups: Record<string, { type?: string; name?: string }> = {},
): IconMappingMigrationPlan => {
  const affected: IconMappingMigrationRecord[] = [];

  for (const feature of features) {
    const group = feature.group_id ? groups[feature.group_id] : undefined;
    const record = normalizeFeatureMapping(feature, group?.type, group?.name);
    const currentMetadata = getParsedMetadata(feature);
    const currentProperties = parseProperties(feature);
    if (sameValue(currentMetadata, record.metadata) && sameValue(currentProperties, record.properties)) continue;
    affected.push(record);
  }

  return {
    affected,
    events: affected.map(buildFeatureMappingUpdateEvent),
    warnings: affected
      .filter((record): record is IconMappingMigrationRecord & { warning: string } => !!record.warning)
      .map((record) => ({ id: record.feature.id, warning: record.warning })),
  };
};

export const buildIconMappingSnapshot = (
  projectId: string,
  records: Iterable<IconMappingMigrationRecord>,
  createdAt: string,
): IconMappingSnapshot => ({
  schema: ICON_MAPPING_SNAPSHOT_SCHEMA,
  version: ICON_MAPPING_SNAPSHOT_VERSION,
  projectId,
  createdAt,
  records: Array.from(records, (record) => ({ id: record.feature.id, feature: record.feature })),
});

export const validateIconMappingSnapshot = (value: unknown, projectId: string): IconMappingSnapshot => {
  const snapshot = value as Partial<IconMappingSnapshot> | null;
  if (!snapshot || snapshot.schema !== ICON_MAPPING_SNAPSHOT_SCHEMA || snapshot.version !== ICON_MAPPING_SNAPSHOT_VERSION) {
    throw new Error('Snapshot icon mapping không hợp lệ hoặc không tương thích.');
  }
  if (snapshot.projectId !== projectId || !Array.isArray(snapshot.records)) {
    throw new Error('Snapshot icon mapping không thuộc dự án hiện tại.');
  }
  if (snapshot.records.some((record) => !record || typeof record.id !== 'string' || !record.feature)) {
    throw new Error('Snapshot icon mapping thiếu dữ liệu bản ghi.');
  }
  return snapshot as IconMappingSnapshot;
};
