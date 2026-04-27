/**
 * BOM (Bill of Materials) Summary Utilities
 * Aggregates and summarizes project materials by categories
 */

import { MapState, FeatureState } from '@CONTRACT/types';
import { getFeatureDisplayType } from '@TOOL/utils/featureUtils';
import { flattenFeature } from '@TOOL/utils/dataFlattening';

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

/**
 * Generates BOM summary from project state
 */
export const generateBOMSummary = (state: MapState): BOMSummary => {
  if (!state) {
    return {
      items: [],
      totalFeatures: 0,
      totalGroups: 0,
      totalLayers: 0,
      totalRegions: 0,
      summary: { byType: {}, byGroup: {}, byLayer: {}, byRegion: {} }
    };
  }

  const features = Object.values(state.features);
  const typeCounts: Record<string, number> = {};
  const groupCounts: Record<string, number> = {};
  const layerCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  const bomMap: Record<string, BOMItem> = {};

  features.forEach(f => {
    const group = f.group_id ? state.feature_groups[f.group_id] : null;
    const layer = group ? state.layers[group.layer_id] : null;
    const region = layer ? state.regions[layer.region_id] : null;

    const displayType = getFeatureDisplayType(f, group?.type, group?.name);
    const groupName = group?.name || 'Không nhóm';
    const layerName = layer?.name || 'Không lớp';
    const regionName = region?.name || 'Không vùng';

    // Count by type
    typeCounts[displayType] = (typeCounts[displayType] || 0) + 1;

    // Count by group
    groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;

    // Count by layer
    layerCounts[layerName] = (layerCounts[layerName] || 0) + 1;

    // Count by region
    regionCounts[regionName] = (regionCounts[regionName] || 0) + 1;

    // Build BOM items
    const bomKey = `${displayType}::${groupName}`;
    if (!bomMap[bomKey]) {
      let meta: any = {};
      try {
        meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : (f.metadata || {});
      } catch (e) {
        // ignore
      }

      bomMap[bomKey] = {
        type: displayType,
        category: group?.type || 'GENERAL',
        count: 0,
        unit: f.geom_type?.toLowerCase() === 'point' ? 'cái' : 'm',
        group: groupName,
        layer: layerName,
        specs: extractTechnicalSpecs(meta)
      };
    }
    bomMap[bomKey].count++;
  });

  return {
    items: Object.values(bomMap).sort((a, b) => b.count - a.count),
    totalFeatures: features.length,
    totalGroups: Object.keys(state.feature_groups).length,
    totalLayers: Object.keys(state.layers).length,
    totalRegions: Object.keys(state.regions).length,
    summary: {
      byType: typeCounts,
      byGroup: groupCounts,
      byLayer: layerCounts,
      byRegion: regionCounts
    }
  };
};

/**
 * Extracts technical specifications from metadata
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
 * Filters BOM items by category
 */
export const filterBOMByCategory = (items: BOMItem[], category: string): BOMItem[] => {
  if (!category || category === 'ALL') return items;
  return items.filter(item => item.category === category);
};

/**
 * Filters BOM items by group
 */
export const filterBOMByGroup = (items: BOMItem[], group: string): BOMItem[] => {
  if (!group || group === 'ALL') return items;
  return items.filter(item => item.group === group);
};

/**
 * Generates Excel-compatible BOM data
 */
export const bomToExcelData = (summary: BOMSummary): any[] => {
  return summary.items.map((item, idx) => ({
    'STT': idx + 1,
    'Loại thiết bị': item.type,
    'Phân loại': item.category,
    'Nhóm': item.group || '',
    'Lớp': item.layer || '',
    'Số lượng': item.count,
    'Đơn vị': item.unit,
    ...Object.fromEntries(
      Object.entries(item.specs || {}).map(([k, v]) => [`SPEC_${k}`, v])
    )
  }));
};
