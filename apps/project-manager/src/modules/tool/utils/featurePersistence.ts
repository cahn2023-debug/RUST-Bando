import type { FeatureCoordinates, FeatureMetadata, FeatureProperties, IconType } from '@CONTRACT/types';
import { syncDisplayOrderAliases } from './featureMapping';
import { canonicalizeObjectType, getObjectTypeForIcon, normalizeIconKey } from './featureDisplay';

type FeaturePayloadBase = {
  id: string;
  layer_id: string;
  group_id: string | null;
  name: string;
  geom_type: string;
};

type FeatureCreatePayloadInput = FeaturePayloadBase & {
  coordinates: FeatureCoordinates;
  metadata: FeatureMetadata;
  properties?: FeatureProperties;
};

const getExistingIcon = (properties?: FeatureProperties): IconType => (
  normalizeIconKey(properties?.icon ?? properties?.iconKey)
);

const hasMeaningfulValue = (value: unknown): boolean => (
  value !== undefined && value !== null && value !== ''
);

const getMetadataStyleValue = (metadata: FeatureMetadata, key: 'color' | 'size') => {
  const gis = metadata.gis && typeof metadata.gis === 'object' ? metadata.gis as Record<string, unknown> : null;
  const gisValue = gis?.[key];
  if (hasMeaningfulValue(gisValue)) return gisValue;
  return (metadata as Record<string, unknown>)[key];
};

const isLegacyPointType = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'point' || normalized === 'default';
};

const resolveTypeForPersistence = (
  metadataType: unknown,
  icon: IconType,
  existingType: string,
  hasMetadataIcon: boolean
): string => {
  if (typeof metadataType === 'string' && metadataType && !isLegacyPointType(metadataType)) {
    return canonicalizeObjectType(metadataType);
  }
  if (hasMetadataIcon) return getTypeForIcon(icon);
  return existingType || getTypeForIcon(icon);
};

export const getTypeForIcon = (icon: IconType): string => {
  return getObjectTypeForIcon(icon);
};

export const normalizeFeatureMetadataForPersistence = (
  metadata: FeatureMetadata,
  properties?: FeatureProperties
): FeatureMetadata => {
  const hasMetadataIcon = hasMeaningfulValue(metadata.icon);
  const hasMetadataType = hasMeaningfulValue(metadata.type);
  const normalizedIcon = hasMetadataIcon ? normalizeIconKey(metadata.icon) : getExistingIcon(properties);
  const existingType = typeof properties?.type === 'string' && properties.type ? properties.type : '';
  const nextType = hasMetadataType
    ? resolveTypeForPersistence(metadata.type, normalizedIcon, existingType, hasMetadataIcon)
    : hasMetadataIcon
      ? getTypeForIcon(normalizedIcon)
      : existingType || getTypeForIcon(normalizedIcon);

  return syncDisplayOrderAliases(
    {
      ...metadata,
      icon: normalizedIcon,
      type: nextType,
    },
    metadata.display_order ?? metadata.stt ?? metadata.STT,
    properties as Record<string, unknown> | undefined,
  ) as FeatureMetadata;
};

export const buildFeaturePropertiesForPersistence = (
  properties: FeatureProperties | undefined,
  metadata: FeatureMetadata
): FeatureProperties => {
  const normalizedMetadata = normalizeFeatureMetadataForPersistence(metadata, properties);
  const hasMetadataIcon = hasMeaningfulValue(metadata.icon);
  const hasMetadataType = hasMeaningfulValue(metadata.type);
  const nextIcon = hasMetadataIcon ? normalizeIconKey(metadata.icon) : getExistingIcon(properties);
  const existingType = typeof properties?.type === 'string' && properties.type ? properties.type : '';
  const nextType = hasMetadataType
    ? resolveTypeForPersistence(normalizedMetadata.type, nextIcon, existingType, hasMetadataIcon)
    : hasMetadataIcon
      ? getTypeForIcon(nextIcon)
      : existingType || getTypeForIcon(nextIcon);
  const nextColor = getMetadataStyleValue(normalizedMetadata, 'color');
  const nextSize = getMetadataStyleValue(normalizedMetadata, 'size');

  const nextProperties = {
    ...(properties || {}),
    icon: nextIcon,
    iconKey: nextIcon,
    type: nextType,
    ...(hasMeaningfulValue(nextColor) ? { color: nextColor as FeatureProperties[string] } : {}),
    ...(hasMeaningfulValue(nextSize) ? { size: nextSize as FeatureProperties[string] } : {}),
  };

  if (!hasMeaningfulValue(normalizedMetadata.mappingWarning)) {
    delete (nextProperties as Record<string, unknown>).mappingWarning;
    delete (nextProperties as Record<string, unknown>).unmappedIcon;
  }

  return nextProperties;
};

export const buildFeatureCreatedPayload = ({
  id,
  layer_id,
  group_id,
  name,
  geom_type,
  coordinates,
  metadata,
  properties,
}: FeatureCreatePayloadInput) => {
  const normalizedMetadata = normalizeFeatureMetadataForPersistence(metadata, properties);
  const nextProperties = buildFeaturePropertiesForPersistence(properties, normalizedMetadata);

  return {
    id,
    layer_id,
    group_id,
    name,
    geom_type,
    coordinates,
    metadata: JSON.stringify(normalizedMetadata),
    properties: nextProperties,
  };
};

export const isRenderableFeatureGeometry = (geomType: string | null | undefined, coordinates: FeatureCoordinates): boolean => {
  const normalizedGeomType = String(geomType || 'Point').toLowerCase();

  if (normalizedGeomType === 'point' || normalizedGeomType === 'default') {
    return Array.isArray(coordinates)
      && coordinates.length >= 2
      && Number.isFinite(Number(coordinates[0]))
      && Number.isFinite(Number(coordinates[1]));
  }

  if (normalizedGeomType === 'linestring' || normalizedGeomType === 'polyline' || normalizedGeomType === 'line') {
    return Array.isArray(coordinates)
      && coordinates.length >= 2
      && coordinates.every((point) => Array.isArray(point) && point.length >= 2);
  }

  if (normalizedGeomType === 'polygon') {
    return Array.isArray(coordinates)
      && coordinates.length > 0
      && coordinates.every(
        (ring) => Array.isArray(ring)
          && ring.length >= 3
          && ring.every((point) => Array.isArray(point) && point.length >= 2)
      );
  }

  return Array.isArray(coordinates) && coordinates.length > 0;
};
