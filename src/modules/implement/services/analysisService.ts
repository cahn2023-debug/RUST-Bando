import { format } from 'date-fns';
import { save, open } from '@tauri-apps/plugin-dialog';
import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';
import { normalizeAnalysisColumnKey } from '@IMPLEMENT/features/analysis/analysisColumns';
import { syncDisplayOrderAliases, getParsedMetadata } from '@TOOL/utils/featureUtils';

import type { DesignEventType, FeatureProperties } from '@CONTRACT/designTypes';
import type { FeatureState, FeatureGroupState, LayerState, MapState, RegionState } from '@CONTRACT/types';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { buildAnalysisHierarchyRows } from '@IMPLEMENT/features/analysis/analysisHierarchy';


export interface WorkbookLink {
  projectId: string;
  fileName: string;
  filePath?: string;
  lastExportedAt: string;
  workbookId: string;
}

export interface WorkbookMetadata {
  schemaVersion: string;
  workbookId: string;
  projectId: string;
  exportedAt: string;
  columnMappings: Record<string, string>;
  baseline: Record<string, Record<string, any>>;
}

export type SyncChangeType = 'EXCEL_ONLY' | 'DESIGN_ONLY' | 'BOTH_CONFLICT' | 'NEW_IN_EXCEL' | 'UNCHANGED' | 'ERROR';

export interface SyncChange {
  id: string;
  featureId?: string;
  name?: string;
  changeType: SyncChangeType;
  field?: string;
  baselineValue?: any;
  designValue?: any;
  excelValue?: any;
  isConflict?: boolean;
}

export type ConflictResolution = Record<string, 'EXCEL' | 'DESIGN'>;

export interface SyncPreview {
  changes: SyncChange[];
  newItems: any[];
  updatedItems: any[];
  ignoredItems: any[];
  errors: string[];
  conflicts: SyncChange[];
  isValidWorkbook: boolean;
  errorMessage?: string;
}

export type DataSourceStatus = 'unlinked' | 'synced' | 'modified' | 'error';

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

// Delegated metadata parsing to canonical getParsedMetadata helper

const normalizeHeader = (key: string) => normalizeAnalysisColumnKey(String(key || ''));

const readString = (value: unknown) => {
  if (value == null) return '';
  return String(value as any).trim();
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
    return JSON.parse(String(value as any));
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

    const metadata = getParsedMetadata(feature);
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

      const currentMeta = getParsedMetadata(feature);
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
 * Service to handle data analysis CSV operations
 */
import ExcelJS from 'exceljs';

export const CURRENT_WORKBOOK_SCHEMA_VERSION = '1.0.0';

/**
 * Utility to generate Excel Column name from index (1 -> A, 2 -> B, 27 -> AA)
 */
export const getExcelColumnName = (colIndex: number): string => {
  let columnName = '';
  let index = colIndex;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    index = Math.floor((index - 1) / 26);
  }
  return columnName;
};

/**
 * Service to handle data analysis Excel (.xlsx) operations with ExcelJS
 */
export const analysisService = {
  /**
   * Export workbook with Data, BOM, Report, and _Sync (veryHidden) sheets
   */
  exportWorkbook: async (
    state: MapState,
    projectId: string,
    targetPath?: string,
  ): Promise<WorkbookLink | null> => {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const defaultPath = targetPath || `Phan-tich_${projectId}_${timestamp}.xlsx`;

      let filePath = targetPath;
      if (!filePath) {
        const selectedPath = await save({
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
          defaultPath,
        });
        if (!selectedPath) return null;
        filePath = selectedPath;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Antigravity DESIGN System';
      workbook.lastModifiedBy = 'Antigravity DESIGN System';
      workbook.created = new Date();
      workbook.modified = new Date();

      const workbookId = crypto.randomUUID();

      // 1. Generate Data Sheet
      const dataSheet = workbook.addWorksheet('Data', {
        views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }],
      });

      // Prepare Rows from MapState
      const flatRows = buildAnalysisHierarchyRows(state);

      // Define standard columns
      const headerGroups = [
        { label: 'Thông tin chung', columns: ['STT', 'TÊN ĐỐI TƯỢNG', 'LOẠI', 'NÚT GIAO'] },
        { label: 'Phân vùng & Lớp', columns: ['NHÓM', 'VÙNG', 'LỚP CHÍNH', 'GEO TYPE'] },
        { label: 'Thông số Kỹ thuật & Số lượng', columns: ['KÍCH THƯỚC', 'SỐ LƯỢNG', 'CHIỀU DÀI (m)', 'DIỆN TÍCH (m2)'] },
        { label: 'Quản lý & Ghi chú', columns: ['TRẠNG THÁI', 'HIỂN THỊ', 'GHI CHÚ', 'MÔ TẢ'] },
      ];

      // Multi-level Header Rows
      const row1 = dataSheet.getRow(1);
      const row2 = dataSheet.getRow(2);

      let colIdx = 1;
      headerGroups.forEach((group) => {
        const startCol = colIdx;
        group.columns.forEach((colName) => {
          row2.getCell(colIdx).value = colName;
          colIdx++;
        });
        const endCol = colIdx - 1;
        dataSheet.mergeCells(1, startCol, 1, endCol);
        row1.getCell(startCol).value = group.label;
      });

      // Styling Headers
      [row1, row2].forEach((row) => {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        row.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Column widths
      for (let i = 1; i < colIdx; i++) {
        dataSheet.getColumn(i).width = 18;
      }

      // Hidden Technical Columns for ID matching
      const hiddenFeatureIdCol = colIdx;
      dataSheet.getColumn(hiddenFeatureIdCol).hidden = true;
      row2.getCell(hiddenFeatureIdCol).value = '__technical_feature_id';

      const hiddenParentIdCol = colIdx + 1;
      dataSheet.getColumn(hiddenParentIdCol).hidden = true;
      row2.getCell(hiddenParentIdCol).value = '__technical_parent_id';

      // Map feature IDs to row index in Data Sheet for SUM formulas
      const featureRowMap = new Map<string, number>();
      const baseline: Record<string, Record<string, any>> = {};

      // Fill Data rows
      flatRows.forEach((item, idx) => {
        const excelRowIndex = idx + 3; // Headers take 2 rows
        featureRowMap.set(item.id, excelRowIndex);

        const dataRow = dataSheet.getRow(excelRowIndex);
        dataRow.outlineLevel = item.__analysis_depth || 0;

        const isJunction = item.__analysis_is_intersection;

        // Baseline snapshot
        baseline[item.id] = {
          name: item.name || '',
          geom_type: item.geom_type || '',
          status: item.status || '',
          note: item.note || '',
          length: item.length || 0,
          area: item.area || 0,
        };

        // Write row cells
        dataRow.getCell(1).value = String(item.stt || idx + 1);
        dataRow.getCell(2).value = String(item.name || '');
        dataRow.getCell(3).value = String(item.type || item.geom_type || '');
        dataRow.getCell(4).value = String(isJunction ? 'Giao điểm chính' : (item.junction_scope || ''));
        dataRow.getCell(5).value = String(item.group || '');
        dataRow.getCell(6).value = String(item.region || '');
        dataRow.getCell(7).value = String(item.layer || '');
        dataRow.getCell(8).value = String(item.geom_type || '');
        dataRow.getCell(9).value = Number(item.size) || 1;
        dataRow.getCell(10).value = Number(item.quantity) || 1;

        // SUM Formula for Junction rows if it has children
        if (isJunction) {
          // Find direct children rows
          const childRowIndices: number[] = [];
          flatRows.forEach((childItem, childIdx) => {
            if (childItem.__analysis_parent_id === item.id) {
              childRowIndices.push(childIdx + 3);
            }
          });

          if (childRowIndices.length > 0) {
            const minRow = Math.min(...childRowIndices);
            const maxRow = Math.max(...childRowIndices);
            dataRow.getCell(11).value = { formula: `SUM(K${minRow}:K${maxRow})` };
            dataRow.getCell(12).value = { formula: `SUM(L${minRow}:L${maxRow})` };
          } else {
            dataRow.getCell(11).value = Number(item.length) || 0;
            dataRow.getCell(12).value = Number(item.area) || 0;
          }
        } else {
          dataRow.getCell(11).value = Number(item.length) || 0;
          dataRow.getCell(12).value = Number(item.area) || 0;
        }

        dataRow.getCell(13).value = String(item.status || '');
        dataRow.getCell(14).value = String(item.is_visible !== false ? 'Có' : 'Không');
        dataRow.getCell(15).value = String(item.note || '');
        dataRow.getCell(16).value = String(item.description || '');

        // Technical ID columns
        dataRow.getCell(hiddenFeatureIdCol).value = String(item.id);
        dataRow.getCell(hiddenParentIdCol).value = String(item.__analysis_parent_id || '');
      });

      // Enable AutoFilter on Data Sheet
      dataSheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: colIdx - 1 },
      };

      // 2. Generate BOM Sheet
      const bomSheet = workbook.addWorksheet('BOM');
      const bomHeaderRow = bomSheet.getRow(1);
      bomHeaderRow.values = ['STT', 'NHÓM THIẾT BỊ', 'LOẠI VẬT TƯ / MÃ HIỆU', 'ĐƠN VỊ TÍNH', 'SỐ LƯỢNG TỔNG', 'GHI CHÚ'];
      bomHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      bomHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

      // Aggregate BOM (Exclude child features under junctions to avoid double counting)
      const bomMap = new Map<string, { group: string; name: string; unit: string; qty: number }>();
      flatRows.forEach((item) => {
        if (item.__analysis_parent_id) return; // Exclude child items from BOM
        const key = `${item.group || 'Chung'}::${item.name}`;
        const existing = bomMap.get(key);
        if (existing) {
          existing.qty += 1;
        } else {
          bomMap.set(key, {
            group: String(item.group || 'Chung'),
            name: String(item.name || ''),
            unit: item.geom_type === 'LineString' ? 'm' : item.geom_type === 'Polygon' ? 'm2' : 'Cái',
            qty: 1,
          });
        }
      });

      let bomRowIdx = 2;
      bomMap.forEach((val) => {
        const r = bomSheet.getRow(bomRowIdx);
        r.values = [bomRowIdx - 1, String(val.group), String(val.name), String(val.unit), Number(val.qty), 'Được tổng hợp từ Data'];
        bomRowIdx++;
      });
      bomSheet.columns.forEach((col) => { col.width = 20; });

      // 3. Generate Report Sheet
      const reportSheet = workbook.addWorksheet('Report');
      reportSheet.getRow(1).values = ['BÁO CÁO TỔNG HỢP KPI PROJECT', projectId];
      reportSheet.getRow(1).font = { bold: true, size: 14 };
      reportSheet.getRow(3).values = ['CHỈ SỐ KPI', 'GIÁ TRỊ'];
      reportSheet.getRow(3).font = { bold: true };

      reportSheet.getRow(4).values = ['Tổng số đối tượng GIS', { formula: 'COUNTA(Data!B3:B10000)' }];
      reportSheet.getRow(5).values = ['Tổng chiều dài cáp/tuyến (m)', { formula: 'SUM(Data!K3:K10000)' }];
      reportSheet.getRow(6).values = ['Tổng diện tích phủ (m2)', { formula: 'SUM(Data!L3:L10000)' }];

      reportSheet.columns.forEach((col) => { col.width = 28; });

      // 4. Generate _Sync Sheet (veryHidden)
      const syncSheet = workbook.addWorksheet('_Sync');
      syncSheet.state = 'veryHidden';

      const metadata: WorkbookMetadata = {
        schemaVersion: CURRENT_WORKBOOK_SCHEMA_VERSION,
        workbookId,
        projectId,
        exportedAt: new Date().toISOString(),
        columnMappings: {
          name: 'B',
          type: 'C',
          status: 'M',
          note: 'O',
        },
        baseline,
      };

      syncSheet.getRow(1).getCell(1).value = JSON.stringify(metadata);

      // Write Workbook to Binary Array & Save via Tauri Invoke or Node File write
      const buffer = await workbook.xlsx.writeBuffer();
      await invoke('save_binary_file', {
        path: filePath,
        data: Array.from(new Uint8Array(buffer)),
      });

      return {
        projectId,
        fileName: filePath.split(/[\\/]/).pop() || 'Workbook.xlsx',
        filePath,
        lastExportedAt: new Date().toISOString(),
        workbookId,
      };
    } catch (error) {
      console.error('Export workbook error:', error);
      throw error;
    }
  },

  /**
   * Inspect Workbook update and perform 3-way diff comparison
   */
  inspectWorkbookUpdate: async (
    state: MapState,
    filePath: string,
    expectedProjectId?: string,
  ): Promise<SyncPreview> => {
    try {
      const fileContent = await invoke<number[]>('read_binary_file', { path: filePath });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(new Uint8Array(fileContent)));

      // Verify _Sync sheet
      const syncSheet = workbook.getWorksheet('_Sync');
      if (!syncSheet) {
        return {
          changes: [],
          newItems: [],
          updatedItems: [],
          ignoredItems: [],
          errors: ['Workbook không có sheet kỹ thuật _Sync.'],
          conflicts: [],
          isValidWorkbook: false,
          errorMessage: 'Workbook thiếu sheet _Sync.',
        };
      }

      const metaCellVal = syncSheet.getRow(1).getCell(1).value;
      if (!metaCellVal) {
        return {
          changes: [],
          newItems: [],
          updatedItems: [],
          ignoredItems: [],
          errors: ['Metadata _Sync bị trống.'],
          conflicts: [],
          isValidWorkbook: false,
          errorMessage: 'Metadata _Sync bị trống.',
        };
      }

      const metadata: WorkbookMetadata = JSON.parse(String(metaCellVal));

      if (expectedProjectId && metadata.projectId !== expectedProjectId) {
        return {
          changes: [],
          newItems: [],
          updatedItems: [],
          ignoredItems: [],
          errors: [`Workbook thuộc project ID ${metadata.projectId}, không khớp với ${expectedProjectId}.`],
          conflicts: [],
          isValidWorkbook: false,
          errorMessage: 'Workbook không thuộc project này.',
        };
      }

      const dataSheet = workbook.getWorksheet('Data');
      if (!dataSheet) {
        return {
          changes: [],
          newItems: [],
          updatedItems: [],
          ignoredItems: [],
          errors: ['Không tìm thấy sheet Data.'],
          conflicts: [],
          isValidWorkbook: false,
          errorMessage: 'Thiếu sheet Data trong workbook.',
        };
      }

      const changes: SyncChange[] = [];
      const newItems: any[] = [];
      const updatedItems: any[] = [];
      const ignoredItems: any[] = [];
      const conflicts: SyncChange[] = [];
      const errors: string[] = [];

      const baseline = metadata.baseline || {};

      // Inspect rows in Data sheet
      dataSheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 2) return; // Skip headers

        const featureId = String(row.getCell(17).value || '').trim(); // Hidden technical feature ID
        const name = String(row.getCell(2).value || '').trim();
        const note = String(row.getCell(15).value || '').trim();
        const status = String(row.getCell(13).value || '').trim();

        if (!featureId) {
          if (name) {
            // New item created in Excel
            newItems.push({
              rowNumber,
              name,
              note,
              status,
              type: String(row.getCell(3).value || ''),
              group: String(row.getCell(5).value || ''),
              region: String(row.getCell(6).value || ''),
              layer: String(row.getCell(7).value || ''),
            });
          }
          return;
        }

        const designFeature = state.features[featureId];
        const baseSnapshot = baseline[featureId];

        if (!designFeature) {
          ignoredItems.push({ featureId, name });
          return;
        }

        const designMeta = getParsedMetadata(designFeature);
        const designName = designFeature.name || '';
        const designNote = String(designMeta.note || designMeta.notes || '');
        const designStatus = String(designMeta.status || '');

        // 3-way diff fields
        const fieldsToCompare = [
          { key: 'name', excelVal: name, designVal: designName, baseVal: baseSnapshot?.name || '' },
          { key: 'note', excelVal: note, designVal: designNote, baseVal: baseSnapshot?.note || '' },
          { key: 'status', excelVal: status, designVal: designStatus, baseVal: baseSnapshot?.status || '' },
        ];

        fieldsToCompare.forEach((f) => {
          const excelChanged = f.excelVal !== f.baseVal;
          const designChanged = f.designVal !== f.baseVal;

          if (excelChanged && !designChanged) {
            changes.push({
              id: `${featureId}::${f.key}`,
              featureId,
              name: designName,
              changeType: 'EXCEL_ONLY',
              field: f.key,
              baselineValue: f.baseVal,
              designValue: f.designVal,
              excelValue: f.excelVal,
              isConflict: false,
            });
            updatedItems.push({ featureId, field: f.key, nextVal: f.excelVal });
          } else if (!excelChanged && designChanged) {
            changes.push({
              id: `${featureId}::${f.key}`,
              featureId,
              name: designName,
              changeType: 'DESIGN_ONLY',
              field: f.key,
              baselineValue: f.baseVal,
              designValue: f.designVal,
              excelValue: f.excelVal,
              isConflict: false,
            });
          } else if (excelChanged && designChanged && f.excelVal !== f.designVal) {
            const conflictChange: SyncChange = {
              id: `${featureId}::${f.key}`,
              featureId,
              name: designName,
              changeType: 'BOTH_CONFLICT',
              field: f.key,
              baselineValue: f.baseVal,
              designValue: f.designVal,
              excelValue: f.excelVal,
              isConflict: true,
            };
            changes.push(conflictChange);
            conflicts.push(conflictChange);
          }
        });
      });

      return {
        changes,
        newItems,
        updatedItems,
        ignoredItems,
        errors,
        conflicts,
        isValidWorkbook: true,
      };
    } catch (error: any) {
      console.error('Inspect workbook error:', error);
      return {
        changes: [],
        newItems: [],
        updatedItems: [],
        ignoredItems: [],
        errors: [error.message || 'Lỗi không xác định khi đọc workbook.'],
        conflicts: [],
        isValidWorkbook: false,
        errorMessage: error.message,
      };
    }
  },

  /**
   * Build design events from resolved preview
   */
  buildWorkbookEvents: (
    preview: SyncPreview,
    resolutions: ConflictResolution,
  ): DesignEventType[] => {
    const events: DesignEventType[] = [];

    preview.changes.forEach((change) => {
      if (!change.featureId || !change.field) return;

      let applyVal: any = null;
      if (change.changeType === 'EXCEL_ONLY') {
        applyVal = change.excelValue;
      } else if (change.changeType === 'BOTH_CONFLICT') {
        const choice = resolutions[change.id];
        if (choice === 'EXCEL') {
          applyVal = change.excelValue;
        } else {
          return; // Keep DESIGN value, no event needed
        }
      } else {
        return;
      }

      if (change.field === 'name') {
        events.push({
          type: 'FeatureUpdated',
          payload: { id: change.featureId, name: String(applyVal) },
        });
      } else if (['note', 'status'].includes(change.field)) {
        events.push({
          type: 'FeatureUpdated',
          payload: {
            id: change.featureId,
            metadata: JSON.stringify({ [change.field]: applyVal }),
          },
        });
      }
    });

    return events;
  },

  /**
   * Refresh managed sheets (Data, BOM, Report, _Sync) in linked workbook after sync
   */
  refreshManagedSheets: async (state: MapState, filePath: string): Promise<void> => {
    try {
      const link = await analysisService.exportWorkbook(state, (state as any).project_id || (state as any).projectId || 'default', filePath);
      if (!link) {
        throw new Error('Không thể làm mới các sheet quản lý trong workbook.');
      }
    } catch (error) {
      console.error('Refresh managed sheets error:', error);
      throw error;
    }
  },

  /**
   * Legacy CSV export fallback
   */
  exportToExcel: async (_data: ParsedAnalysisRow[], projectId: string) => {
    const state = useDesignSync.getState().state;
    if (!state) return null;
    return analysisService.exportWorkbook(state, projectId);
  },

  /**
   * Legacy CSV import fallback
   */
  importFromExcel: async (state: MapState): Promise<DesignEventType[]> => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });
    if (!selected || Array.isArray(selected)) return [];

    const preview = await analysisService.inspectWorkbookUpdate(state, selected, (state as any).project_id || (state as any).projectId);
    return analysisService.buildWorkbookEvents(preview, {});
  },
};
