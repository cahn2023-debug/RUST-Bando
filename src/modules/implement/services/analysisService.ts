import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { save, open } from '@tauri-apps/plugin-dialog';
import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';
import { normalizeAnalysisColumnKey } from '@IMPLEMENT/features/analysis/analysisColumns';
import { syncDisplayOrderAliases } from '@TOOL/utils/featureMapping';
import type { DesignEventType, FeatureProperties } from '@CONTRACT/designTypes';
import type { FeatureState, FeatureGroupState, LayerState, MapState, RegionState } from '@CONTRACT/types';

type AnalysisRow = Record<string, unknown>;

type ParsedAnalysisRow = {
  sourceFeatureId: string;
  sourceParentFeatureId: string;
  sourceGroupId: string;
  sourceGroupType: string;
  sourceLayerId: string;
  sourceRegionId: string;
  sourceCoordinates: unknown;
  sourceTechnicalGeom: string;
  sourceIcon: string;
  sourceType: string;
  name: string;
  displayOrder: string;
  description: string;
  status: string;
  note: string;
  groupName: string;
  layerName: string;
  regionName: string;
  geomType: string;
  isVisible?: boolean;
  properties: FeatureProperties;
  metadata: Record<string, unknown>;
};

type PendingParentLink = {
  targetFeatureId: string;
  sourceParentFeatureId: string;
  metadata: Record<string, unknown>;
};

const IMPORT_METADATA_KEYS = new Set([
  'source_feature_id',
  'source_parent_feature_id',
  'source_group_id',
  'source_group_type',
  'source_layer_id',
  'source_region_id',
  'source_coordinates',
  'source_technical_geom',
  'source_icon',
  'source_type',
  'parent_intersection_name',
  'parent_intersection_display_order',
]);

const CORE_IMPORT_KEYS = new Set([
  'id',
  'name',
  'display_order',
  'description',
  'status',
  'note',
  'group',
  'layer',
  'region',
  'geom_type',
  'is_visible',
  ...IMPORT_METADATA_KEYS,
]);

const HEADER_ALIASES: Record<string, keyof ParsedAnalysisRow | 'skip'> = {
  id: 'sourceFeatureId',
  source_feature_id: 'sourceFeatureId',
  source_parent_feature_id: 'sourceParentFeatureId',
  source_group_id: 'sourceGroupId',
  source_group_type: 'sourceGroupType',
  source_layer_id: 'sourceLayerId',
  source_region_id: 'sourceRegionId',
  source_coordinates: 'sourceCoordinates',
  source_technical_geom: 'sourceTechnicalGeom',
  source_icon: 'sourceIcon',
  source_type: 'sourceType',
  parent_intersection_name: 'skip',
  parent_intersection_display_order: 'skip',
  name: 'name',
  ten: 'name',
  ten_doi_tuong: 'name',
  display_order: 'displayOrder',
  stt: 'displayOrder',
  ma_hieu: 'displayOrder',
  ma_hieu_stt: 'displayOrder',
  so_hieu: 'displayOrder',
  description: 'description',
  mo_ta: 'description',
  status: 'status',
  trang_thai: 'status',
  note: 'note',
  ghi_chu: 'note',
  notes: 'note',
  group: 'groupName',
  nhom: 'groupName',
  layer: 'layerName',
  lop_chinh: 'layerName',
  region: 'regionName',
  vung: 'regionName',
  geom_type: 'geomType',
  geo_type: 'geomType',
  hien_thi: 'isVisible',
  is_visible: 'isVisible',
};

const parseFeatureMetadata = (metadata: unknown) => {
  if (!metadata) return {};
  if (typeof metadata === 'object') return { ...(metadata as Record<string, unknown>) };

  try {
    return JSON.parse(String(metadata) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

const normalizeHeader = (key: string) => normalizeAnalysisColumnKey(String(key || ''));

const readString = (value: unknown) => {
  if (value == null) return '';
  return String(value).trim();
};

const parseBoolean = (value: unknown): boolean | undefined => {
  const normalized = readString(value).toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'co', 'có', 'yes', 'y', 'x'].includes(normalized)) return true;
  if (['false', '0', 'khong', 'không', 'no', 'n'].includes(normalized)) return false;
  return undefined;
};

const parseCoordinates = (value: unknown) => {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const inferIntersectionMetadata = (row: ParsedAnalysisRow, metadata: Record<string, unknown>) => {
  const loweredGeom = `${row.sourceType || row.geomType || row.name}`.toLowerCase();
  if (loweredGeom.includes('intersection') || loweredGeom.includes('nut giao')) {
    metadata.type = metadata.type || 'INTERSECTION';
    metadata.icon = metadata.icon || 'intersection';
  }
};

const buildParsedAnalysisRow = (row: AnalysisRow): ParsedAnalysisRow => {
  const parsed: ParsedAnalysisRow = {
    sourceFeatureId: '',
    sourceParentFeatureId: '',
    sourceGroupId: '',
    sourceGroupType: '',
    sourceLayerId: '',
    sourceRegionId: '',
    sourceCoordinates: null,
    sourceTechnicalGeom: '',
    sourceIcon: '',
    sourceType: '',
    name: '',
    displayOrder: '',
    description: '',
    status: '',
    note: '',
    groupName: '',
    layerName: '',
    regionName: '',
    geomType: '',
    properties: {},
    metadata: {},
  };

  Object.entries(row).forEach(([rawKey, rawValue]) => {
    const key = normalizeHeader(rawKey);
    const alias = HEADER_ALIASES[key];
    const stringValue = readString(rawValue);

    if (rawKey.startsWith('SPEC_')) {
      const propKey = rawKey.replace('SPEC_', '');
      parsed.properties[propKey] = stringValue;
      return;
    }

    if (rawKey.startsWith('Biz_')) {
      const bizKey = rawKey.replace('Biz_', '');
      const business = (parsed.metadata.business as Record<string, unknown> | undefined) || {};
      business[bizKey] = rawValue;
      parsed.metadata.business = business;
      return;
    }

    if (rawKey.startsWith('GIS_')) {
      const gisKey = rawKey.replace('GIS_', '');
      const gis = (parsed.metadata.gis as Record<string, unknown> | undefined) || {};
      gis[gisKey] = rawValue;
      parsed.metadata.gis = gis;
      return;
    }

    if (alias && alias !== 'skip') {
      if (alias === 'sourceCoordinates') {
        parsed.sourceCoordinates = rawValue;
      } else if (alias === 'isVisible') {
        parsed.isVisible = parseBoolean(rawValue);
      } else {
        (parsed[alias] as unknown) = stringValue;
      }
      return;
    }

    if (!key || CORE_IMPORT_KEYS.has(key)) return;
    parsed.properties[key] = rawValue as FeatureProperties[string];
  });

  return parsed;
};

const buildExistingFeatureLookup = (state: MapState) => {
  const bySourceId = new Map<string, string>();

  Object.values(state.features || {}).forEach((feature) => {
    bySourceId.set(feature.id, feature.id);

    const metadata = parseFeatureMetadata(feature.metadata);
    const sourceFeatureId = readString(metadata.source_feature_id);
    if (sourceFeatureId) {
      bySourceId.set(sourceFeatureId, feature.id);
    }
  });

  return bySourceId;
};

const getNameKey = (name: string) => normalizeAnalysisColumnKey(name || '');

const buildExistingRegionLookup = (regions: Record<string, RegionState>) => {
  const byName = new Map<string, string>();
  Object.values(regions || {}).forEach((region) => {
    const key = getNameKey(region.name);
    if (key) byName.set(key, region.id);
  });
  return byName;
};

const buildExistingLayerLookup = (layers: Record<string, LayerState>) => {
  const byName = new Map<string, string>();
  Object.values(layers || {}).forEach((layer) => {
    const key = `${layer.region_id}::${getNameKey(layer.name)}`;
    byName.set(key, layer.id);
  });
  return byName;
};

const buildExistingGroupLookup = (groups: Record<string, FeatureGroupState>) => {
  const byName = new Map<string, string>();
  Object.values(groups || {}).forEach((group) => {
    const key = `${group.layer_id}::${getNameKey(group.name)}`;
    byName.set(key, group.id);
  });
  return byName;
};

const ensureRegion = (
  parsed: ParsedAnalysisRow,
  state: MapState,
  events: DesignEventType[],
  regionByName: Map<string, string>,
) => {
  if (parsed.sourceRegionId && state.regions?.[parsed.sourceRegionId]) return parsed.sourceRegionId;

  const regionName = parsed.regionName || 'Imported Region';
  const regionKey = getNameKey(regionName);
  const existingId = regionByName.get(regionKey);
  if (existingId) return existingId;

  const regionId = crypto.randomUUID();
  regionByName.set(regionKey, regionId);
  events.push({
    type: 'RegionCreated',
    payload: { id: regionId, parent_id: null, name: regionName },
  });
  return regionId;
};

const ensureLayer = (
  parsed: ParsedAnalysisRow,
  state: MapState,
  regionId: string,
  events: DesignEventType[],
  layerByName: Map<string, string>,
) => {
  if (parsed.sourceLayerId && state.layers?.[parsed.sourceLayerId]) return parsed.sourceLayerId;

  const layerName = parsed.layerName || 'Imported Layer';
  const layerKey = `${regionId}::${getNameKey(layerName)}`;
  const existingId = layerByName.get(layerKey);
  if (existingId) return existingId;

  const layerId = crypto.randomUUID();
  layerByName.set(layerKey, layerId);
  events.push({
    type: 'LayerCreated',
    payload: { id: layerId, region_id: regionId, name: layerName },
  });
  return layerId;
};

const ensureGroup = (
  parsed: ParsedAnalysisRow,
  state: MapState,
  layerId: string,
  events: DesignEventType[],
  groupByName: Map<string, string>,
) => {
  if (parsed.sourceGroupId && state.feature_groups?.[parsed.sourceGroupId]) return parsed.sourceGroupId;

  const groupName = parsed.groupName || 'Imported Group';
  const groupKey = `${layerId}::${getNameKey(groupName)}`;
  const existingId = groupByName.get(groupKey);
  if (existingId) return existingId;

  const groupId = crypto.randomUUID();
  groupByName.set(groupKey, groupId);
  events.push({
    type: 'FeatureGroupCreated',
    payload: {
      id: groupId,
      layer_id: layerId,
      name: groupName,
      group_type: parsed.sourceGroupType || 'GENERAL',
    },
  });
  return groupId;
};

const buildCreateMetadata = (parsed: ParsedAnalysisRow) => {
  const metadata = syncDisplayOrderAliases(
    {
      ...parsed.metadata,
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.note ? { note: parsed.note, notes: parsed.note } : {}),
      ...(parsed.isVisible !== undefined ? { is_visible: parsed.isVisible } : {}),
      ...(parsed.sourceIcon ? { icon: parsed.sourceIcon } : {}),
      ...(parsed.sourceType ? { type: parsed.sourceType } : {}),
      imported_from: 'analysis_excel',
      source_feature_id: parsed.sourceFeatureId,
      source_parent_feature_id: parsed.sourceParentFeatureId,
    },
    parsed.displayOrder,
    parsed.properties as Record<string, unknown>,
  );

  inferIntersectionMetadata(parsed, metadata);
  return metadata;
};

const inferFeatureGeometry = (parsed: ParsedAnalysisRow) => {
  const coordinates = parseCoordinates(parsed.sourceCoordinates);
  if (coordinates) {
    return {
      geomType: parsed.sourceTechnicalGeom || 'Point',
      coordinates,
    };
  }

  const latitude = Number(parsed.properties.latitude);
  const longitude = Number(parsed.properties.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      geomType: 'Point',
      coordinates: [longitude, latitude],
    };
  }

  return null;
};

export const buildAnalysisImportEvents = (rows: AnalysisRow[], state: MapState): DesignEventType[] => {
  const events: DesignEventType[] = [];
  const pendingParentLinks: PendingParentLink[] = [];
  const sourceToTargetFeatureId = buildExistingFeatureLookup(state);
  const regionByName = buildExistingRegionLookup(state.regions || {});
  const layerByName = buildExistingLayerLookup(state.layers || {});
  const groupByName = buildExistingGroupLookup(state.feature_groups || {});

  rows.forEach((row) => {
    const parsed = buildParsedAnalysisRow(row);
    const targetFeatureId = sourceToTargetFeatureId.get(parsed.sourceFeatureId);

    if (targetFeatureId) {
      const feature = state.features[targetFeatureId];
      if (!feature) return;

      const currentMeta = parseFeatureMetadata(feature.metadata);
      const currentProps = { ...(feature.properties || {}) };
      const nextMeta = syncDisplayOrderAliases(
        {
          ...currentMeta,
          ...parsed.metadata,
          ...(parsed.description ? { description: parsed.description } : {}),
          ...(parsed.status ? { status: parsed.status } : {}),
          ...(parsed.note ? { note: parsed.note, notes: parsed.note } : {}),
          ...(parsed.isVisible !== undefined ? { is_visible: parsed.isVisible } : {}),
          ...(parsed.sourceIcon ? { icon: parsed.sourceIcon } : {}),
          ...(parsed.sourceType ? { type: parsed.sourceType } : {}),
          source_feature_id: parsed.sourceFeatureId || targetFeatureId,
          ...(parsed.sourceParentFeatureId ? { source_parent_feature_id: parsed.sourceParentFeatureId } : {}),
        },
        parsed.displayOrder,
        currentProps,
      );

      inferIntersectionMetadata(parsed, nextMeta);
      const nextProps = { ...currentProps, ...parsed.properties };
      const hasNameChange = parsed.name && parsed.name !== feature.name;
      const hasMetaChange = JSON.stringify(nextMeta) !== JSON.stringify(currentMeta);
      const hasPropsChange = JSON.stringify(nextProps) !== JSON.stringify(currentProps);

      if (hasNameChange || hasMetaChange || hasPropsChange) {
        events.push({
          type: 'FeatureUpdated',
          payload: {
            id: targetFeatureId,
            ...(hasNameChange ? { name: parsed.name } : {}),
            ...(hasMetaChange ? { metadata: JSON.stringify(nextMeta) } : {}),
            ...(hasPropsChange ? { properties: nextProps } : {}),
          },
        });
      }

      if (parsed.sourceParentFeatureId) {
        pendingParentLinks.push({
          targetFeatureId,
          sourceParentFeatureId: parsed.sourceParentFeatureId,
          metadata: nextMeta,
        });
      }

      sourceToTargetFeatureId.set(parsed.sourceFeatureId || targetFeatureId, targetFeatureId);
      return;
    }

    const geometry = inferFeatureGeometry(parsed);
    if (!geometry) return;

    const regionId = ensureRegion(parsed, state, events, regionByName);
    const layerId = ensureLayer(parsed, state, regionId, events, layerByName);
    const groupId = ensureGroup(parsed, state, layerId, events, groupByName);
    const createdFeatureId = crypto.randomUUID();
    const metadata = buildCreateMetadata(parsed);

    events.push({
      type: 'FeatureCreated',
      payload: {
        id: createdFeatureId,
        layer_id: layerId,
        group_id: groupId,
        name: parsed.name || `Imported ${geometry.geomType}`,
        geom_type: geometry.geomType,
        metadata: JSON.stringify(metadata),
        coordinates: geometry.coordinates as FeatureState['coordinates'],
        properties: parsed.properties,
      },
    });

    sourceToTargetFeatureId.set(parsed.sourceFeatureId || createdFeatureId, createdFeatureId);

    if (parsed.sourceParentFeatureId) {
      pendingParentLinks.push({
        targetFeatureId: createdFeatureId,
        sourceParentFeatureId: parsed.sourceParentFeatureId,
        metadata,
      });
    }
  });

  pendingParentLinks.forEach((link) => {
    const parentTargetId = sourceToTargetFeatureId.get(link.sourceParentFeatureId);
    if (!parentTargetId || parentTargetId === link.targetFeatureId) return;

    const nextMetadata = {
      ...link.metadata,
      parent_feature_id: parentTargetId,
      source_parent_feature_id: link.sourceParentFeatureId,
    };

    events.push({
      type: 'FeatureUpdated',
      payload: {
        id: link.targetFeatureId,
        metadata: JSON.stringify(nextMetadata),
      },
    });
  });

  return events;
};

/**
 * Service to handle data analysis Excel operations
 */
export const analysisService = {
  /**
   * Exports current analysis data to Excel
   */
  exportToExcel: async (data: AnalysisRow[], projectId: string) => {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const defaultPath = `Analysis_${projectId}_${timestamp}.xlsx`;

      const filePath = await save({
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        defaultPath,
      });

      if (!filePath) return;

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Analysis Data');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

      await invoke('save_binary_file', {
        path: filePath,
        data: Array.from(new Uint8Array(excelBuffer)),
      });

      return true;
    } catch (error) {
      console.error('Export analysis error:', error);
      throw error;
    }
  },

  /**
   * Imports Excel data and generates update/create events.
   */
  importFromExcel: async (state: MapState): Promise<DesignEventType[]> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
      });

      if (!selected || Array.isArray(selected)) return [];

      const fileContent = await invoke<number[]>('read_binary_file', { path: selected });
      const data = new Uint8Array(fileContent);

      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as AnalysisRow[];

      return buildAnalysisImportEvents(jsonData, state);
    } catch (error) {
      console.error('Import analysis error:', error);
      throw error;
    }
  },
};
