import type { FeatureCoordinates, FeatureMetadata, FeatureProperties, IconType } from '@CONTRACT/types';
import { syncDisplayOrderAliases } from './featureMapping';

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

const getNormalizedIcon = (icon: unknown): IconType => {
  switch (icon) {
    case 'cctv':
    case 'ptz':
    case 'speed':
    case 'lpr':
    case 'intersection':
      return icon;
    default:
      return 'default';
  }
};

export const getTypeForIcon = (icon: IconType): string => {
  switch (icon) {
    case 'cctv':
      return 'cctv';
    case 'ptz':
      return 'ptz';
    case 'speed':
      return 'speed';
    case 'lpr':
      return 'lpr';
    case 'intersection':
      return 'intersection';
    default:
      return 'point';
  }
};

export const normalizeFeatureMetadataForPersistence = (
  metadata: FeatureMetadata,
  properties?: FeatureProperties
): FeatureMetadata => {
  const normalizedIcon = getNormalizedIcon(metadata.icon);
  const nextType = typeof metadata.type === 'string' && metadata.type ? metadata.type : getTypeForIcon(normalizedIcon);

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
  const nextIcon = getNormalizedIcon(normalizedMetadata.icon);
  const nextType = typeof normalizedMetadata.type === 'string' && normalizedMetadata.type
    ? normalizedMetadata.type
    : getTypeForIcon(nextIcon);

  return {
    ...(properties || {}),
    icon: nextIcon,
    iconKey: nextIcon,
    type: nextType,
  };
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
    coordinates: JSON.stringify(coordinates),
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
