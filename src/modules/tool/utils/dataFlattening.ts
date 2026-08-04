import { MapState, FeatureState } from '@CONTRACT/types';
import { getFeatureDisplayType } from '@TOOL/utils/featureUtils';
import { formatToIntegerString } from '@TOOL/utils/featureMapping';

type FlattenFeatureOptions = {
  featureNumbers?: Record<string, string>;
};

/**
 * Safely truncates strings to avoid Excel/UI overflow
 */
export const safeTruncate = (val: any, limit: number = 30000) => {
  if (val === undefined || val === null) return 'N/A';
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  if (str.length > limit) {
    return str.substring(0, limit) + "... (Dữ liệu quá dài)";
  }
  return str;
};

/**
 * System fields to exclude from prefixing in SPEC_ or Biz_
 */
export const SYSTEM_FIELDS = [
  'gis', 'media', 'business', 'ai', 'vertexMetadata',
  'description', 'status', 'display_order', 'stt', 'STT', 'note', 'notes',
  'technical_specs', 'properties', 'specs', 'type', 'icon', 'color', 'size'
];

/**
 * Standardizes flattening a feature into a row object for consistent use in Analysis and Export
 */
export const flattenFeature = (
  f: FeatureState,
  state: MapState,
  preParsedMetadata?: any,
  options?: FlattenFeatureOptions,
) => {

  let metadata: any = preParsedMetadata;
  if (!metadata) {
    try {
      metadata = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : (f.metadata || {});
    } catch (e) {
      metadata = {};
    }
  }

  const group = f.group_id && state.feature_groups ? state.feature_groups[f.group_id] : null;
  const layer = group ? state.layers[group.layer_id] : null;
  const region = layer ? state.regions[layer.region_id] : null;
  const runtimeParentFeatureId = typeof metadata?.parent_feature_id === 'string'
    ? metadata.parent_feature_id
    : '';
  const parentFeature = runtimeParentFeatureId ? state.features?.[runtimeParentFeatureId] : null;
  let parentMetadata: any = {};

  if (parentFeature) {
    try {
      parentMetadata = typeof parentFeature.metadata === 'string'
        ? JSON.parse(parentFeature.metadata || '{}')
        : (parentFeature.metadata || {});
    } catch {
      parentMetadata = {};
    }
  }

  const normalizeSourceCoordinates = () => {
    if (typeof f.coordinates === 'string') {
      try {
        return JSON.stringify(JSON.parse(f.coordinates));
      } catch {
        return f.coordinates;
      }
    }
    return JSON.stringify(f.coordinates ?? null);
  };

  // Optimized key finding with basic caching for current object
  const findValue = (obj: any, targetKeys: string[]) => {
    if (!obj || typeof obj !== 'object') return null;
    const normalizedTargets = targetKeys.map(k => k.trim().normalize('NFC').toLowerCase());

    // Simple iteration but without excessive re-normalization if possible
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const normalizedKey = key.trim().normalize('NFC').toLowerCase();
      if (normalizedTargets.includes(normalizedKey)) {
        return obj[key];
      }
    }
    return null;
  };

  // 1. Core technical fields
  const sttKeys = ['STT', 'stt', 'Mã hiệu', 'Số hiệu', 'Mã', 'Mã hiệu (STT)'];
  const sttFromProps = findValue(f.properties, sttKeys);
  const sttFromMeta = findValue(metadata, sttKeys);
  const calculatedDisplayOrder = options?.featureNumbers?.[f.id] || '';
  const parentDisplayOrder = runtimeParentFeatureId
    ? (options?.featureNumbers?.[runtimeParentFeatureId] || '')
    : '';

  const row: any = {
    'id': f.id,
    'name': f.name,
    'display_order': formatToIntegerString(calculatedDisplayOrder || metadata.display_order || sttFromProps || sttFromMeta || ''),
    'icon': metadata.icon || f.properties?.icon || '',
    'group': group?.name || 'Unknown',
    'layer': layer?.name || 'Unknown',
    'region': region?.name || 'Unknown',
    'description': metadata.description || '',
    'status': metadata.status || 'N/A',
    'geom_type': getFeatureDisplayType(f, group?.type, group?.name), // Unified display type
    'technical_geom': f.geom_type,
    'is_visible': metadata.is_visible ?? f.is_visible ?? true,
    'length': f.length ?? '',
    'area': f.area ?? '',
    'source_feature_id': String(metadata.source_feature_id || f.id),
    'source_group_id': f.group_id || '',
    'source_group_type': group?.type || group?.group_type || '',
    'source_layer_id': layer?.id || f.layer_id || '',
    'source_region_id': region?.id || '',
    'source_parent_feature_id': String(metadata.source_parent_feature_id || runtimeParentFeatureId || ''),
    'source_coordinates': normalizeSourceCoordinates(),
    'source_technical_geom': f.geom_type,
    'source_icon': metadata.icon || '',
    'source_type': metadata.type || '',
    'parent_intersection_name': parentFeature?.name || '',
    'parent_intersection_display_order': parentDisplayOrder || parentMetadata.display_order || '',
  };

  // 2. Extract Latitude and Longitude
  try {
    const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
    if (Array.isArray(coords)) {
      if (f.geom_type === 'Point' || f.geom_type === 'POINT') {
        const p = Array.isArray(coords[0]) ? coords[0] : coords;
        row['latitude'] = p[1];
        row['longitude'] = p[0];
      }
      row['coordinates_summary'] = safeTruncate(coords, 500);
    }
  } catch (e) {
    // Silently ignore coord errors for flattening
  }

  // 3. Process root feature properties
  if (f.properties && typeof f.properties === 'object') {
    Object.assign(row, f.properties);
  }

  // 4. Process root metadata (custom fields)
  Object.entries(metadata).forEach(([key, val]) => {
    if (!SYSTEM_FIELDS.includes(key) && (typeof val !== 'object' || val === null)) {
      row[key] = val;
    }
  });

  // 5. Specific sub-objects
  const specFields = ['technical_specs', 'properties', 'specs'];
  specFields.forEach(field => {
    if (metadata[field] && typeof metadata[field] === 'object') {
      Object.assign(row, metadata[field]);
    }
  });

  // 6. GIS metadata
  if (metadata.gis && typeof metadata.gis === 'object') {
    Object.entries(metadata.gis).forEach(([key, val]) => {
      if (typeof val !== 'object' || val === null) {
        row[`GIS_${key}`] = val;
      }
    });
  }

  row['note'] = metadata.note || metadata.notes || '';

  return row;
};
