/**
 * BOM (Bill of Materials) Summary Utilities
 * Aggregates and summarizes project materials by categories.
 */

import { FeatureGroupState, MapState } from '@CONTRACT/types';
import { getFeatureDisplayType } from '@TOOL/utils/featureUtils';

export interface BOMItem {
  type: string;
  category: string;
  count: number;
  unit: string;
  group?: string;
  layer?: string;
  specs?: Record<string, any>;
  totalCost?: number;
}

export interface BOMSummary {
  items: BOMItem[];
  totalFeatures: number;
  totalGroups: number;
  totalLayers: number;
  totalRegions: number;
  summary: {
    byType: Record<string, number>;
    byGroup: Record<string, number>;
    byLayer: Record<string, number>;
    byRegion: Record<string, number>;
  };
}

const normalizeSearchText = (value: string) => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
);

const isIntersectionGroup = (group?: FeatureGroupState | null) => {
  if (!group) return false;

  const groupKind = normalizeSearchText(`${group.group_type || ''} ${group.type || ''} ${group.name || ''}`);
  return groupKind.includes('intersection') || groupKind.includes('nut giao');
};

const getBOMGroup = (state: MapState, group?: FeatureGroupState | null) => {
  if (!group) return { name: 'Không nhóm', category: 'GENERAL' };

  const parentGroup = group.parent_id ? state.feature_groups[group.parent_id] : null;
  if (parentGroup) {
    return {
      name: parentGroup.name || group.name || 'Không nhóm',
      category: parentGroup.type || parentGroup.group_type || group.type || group.group_type || 'GENERAL',
    };
  }

  return {
    name: group.name || 'Không nhóm',
    category: group.type || group.group_type || (isIntersectionGroup(group) ? 'INTERSECTION' : 'GENERAL'),
  };
};

/**
 * Generates BOM summary from project state.
 */
export const generateBOMSummary = (state: MapState): BOMSummary => {
  if (!state) {
    return {
      items: [],
      totalFeatures: 0,
      totalGroups: 0,
      totalLayers: 0,
      totalRegions: 0,
      summary: { byType: {}, byGroup: {}, byLayer: {}, byRegion: {} },
    };
  }

  const features = Object.values(state.features);
  const typeCounts: Record<string, number> = {};
  const groupCounts: Record<string, number> = {};
  const layerCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  const bomMap: Record<string, BOMItem> = {};

  features.forEach((feature) => {
    const group = feature.group_id ? state.feature_groups[feature.group_id] : null;
    const layer = group ? state.layers[group.layer_id] : null;
    const region = layer ? state.regions[layer.region_id] : null;

    const displayType = getFeatureDisplayType(feature, group?.type, group?.name);
    const bomGroup = getBOMGroup(state, group);
    const groupName = bomGroup.name;
    const layerName = layer?.name || 'Không lớp';
    const regionName = region?.name || 'Không vùng';

    typeCounts[displayType] = (typeCounts[displayType] || 0) + 1;
    groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
    layerCounts[layerName] = (layerCounts[layerName] || 0) + 1;
    regionCounts[regionName] = (regionCounts[regionName] || 0) + 1;

    const bomKey = `${groupName}::${displayType}`;
    if (!bomMap[bomKey]) {
      let meta: any = {};
      try {
        meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
      } catch {
        // ignore invalid metadata for BOM aggregation
      }

      bomMap[bomKey] = {
        type: displayType,
        category: bomGroup.category,
        count: 0,
        unit: feature.geom_type?.toLowerCase() === 'point' ? 'cái' : 'm',
        group: groupName,
        layer: layerName,
        specs: extractTechnicalSpecs(meta),
      };
    }
    bomMap[bomKey].count += 1;
  });

  return {
    items: Object.values(bomMap).sort((a, b) => {
      const groupCompare = String(a.group || '').localeCompare(String(b.group || ''), undefined, { numeric: true });
      return groupCompare || b.count - a.count || a.type.localeCompare(b.type, undefined, { numeric: true });
    }),
    totalFeatures: features.length,
    totalGroups: Object.keys(state.feature_groups).length,
    totalLayers: Object.keys(state.layers).length,
    totalRegions: Object.keys(state.regions).length,
    summary: {
      byType: typeCounts,
      byGroup: groupCounts,
      byLayer: layerCounts,
      byRegion: regionCounts,
    },
  };
};

/**
 * Extracts technical specifications from metadata.
 */
export const extractTechnicalSpecs = (metadata: any): Record<string, any> => {
  const specs: Record<string, any> = {};

  if (metadata.specs) {
    Object.assign(specs, metadata.specs);
  }

  if (metadata.gis) {
    const { fov_angle, fov_radius, lengthKm, rotation, ...rest } = metadata.gis;
    Object.assign(specs, rest);
  }

  if (metadata.infrastructure) {
    Object.assign(specs, metadata.infrastructure);
  }

  return specs;
};

/**
 * Filters BOM items by category.
 */
export const filterBOMByCategory = (items: BOMItem[], category: string): BOMItem[] => {
  if (!category || category === 'ALL') return items;
  return items.filter((item) => item.category === category);
};

/**
 * Filters BOM items by group.
 */
export const filterBOMByGroup = (items: BOMItem[], group: string): BOMItem[] => {
  if (!group || group === 'ALL') return items;
  return items.filter((item) => item.group === group);
};

/**
 * Generates Excel-compatible BOM data.
 */
export const bomToExcelData = (summary: BOMSummary): any[] => {
  return summary.items.map((item, idx) => ({
    STT: idx + 1,
    'Loại thiết bị': item.type,
    'Phân loại': item.category,
    'Nhóm': item.group || '',
    'Lớp': item.layer || '',
    'Số lượng': item.count,
    'Đơn vị': item.unit,
    ...Object.fromEntries(
      Object.entries(item.specs || {}).map(([key, value]) => [`SPEC_${key}`, value])
    ),
  }));
};
