/**
 * Enhanced Analysis Dialog
 * Combines data grid, BOM summary, filtering, and technical specs
 */

import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Trash2, Eraser, Filter, Package, ListFilter } from 'lucide-react';
import { type ColumnDef, type SortingFn } from '@tanstack/react-table';
import { AnalysisTable } from '@DESIGN/components/ui/AnalysisTable';
import { BOMSummaryPanel } from '@DESIGN/components/ui/BOMSummaryPanel';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { useDesignSync, type DesignEventType } from '@IMPLEMENT/stores/useDesignSync';
import { EditableCell, DropdownCell, GEOM_TYPES_OPTIONS } from '@IMPLEMENT/features/analysis/AnalysisCells';
import {
  ANALYSIS_CORE_COLUMN_ORDER,
  ANALYSIS_EXPORT_COLUMN_ORDER,
  buildAnalysisExportRows,
  getAnalysisUserColumnKeys,
  getAnalysisSchemaColumnKeys,
  isAllowedAnalysisDynamicColumnKey,
  isAnalysisScalarValue,
  normalizeAnalysisColumnKey,
} from '@IMPLEMENT/features/analysis/analysisColumns';
import {
  buildAnalysisHierarchyRows,
} from '@IMPLEMENT/features/analysis/analysisHierarchy';
import { getAnalysisTemplateGroups, normalizeProjectSettings } from '@TOOL/utils/objectDataTemplates';
import { compareAnalysisHierarchyRows } from '@IMPLEMENT/features/analysis/analysisHierarchy';
import { cn } from '@TOOL/utils/cn';
import { getLineCoordinates, getPointCoordinates, getPolygonCoordinates } from '@TOOL/utils/featureUtils';

interface AnalysisDialogProps {
  onClose: () => void;
}

interface FlatFeature {
  id: string;
  stt: string;
  name: string;
  junction_scope: string;
  group: string;
  layer: string;
  region: string;
  geom_type: string;
  coordinates: string;
  display_order?: string;
  description?: string;
  __analysis_depth: number;
  __analysis_is_intersection: boolean;
  __analysis_parent_id: string | null;
  __analysis_root_id: string;
  __analysis_root_values: Record<string, unknown>;
  __analysis_sort_key: string;
  [key: string]: any;
}

type ViewMode = 'grid' | 'bom';

const CORE_COLUMN_TITLES: Record<string, string> = {
  id: 'ID',
  index_stt: 'STT',
  display_order: 'MÃ HIỆU',
  name: 'TÊN ĐỐI TƯỢNG',
  type: 'LOẠI',
  group: 'NHÓM',
  region: 'VÙNG',
  layer: 'LỚP CHÍNH',
  sub_layer: 'LỚP PHỤ',
  owner: 'ĐƠN VỊ QUẢN LÝ',
  geom_type: 'GEO TYPE',
  technical_geom: 'KỸ THUẬT',
  latitude: 'VĨ ĐỘ',
  longitude: 'KINH ĐỘ',
  status: 'TRẠNG THÁI',
  note: 'GHI CHÚ',
  description: 'MÔ TẢ',
  is_visible: 'HIỂN THỊ',
  length: 'CHIỀU DÀI',
  area: 'DIỆN TÍCH',
  coordinates_summary: 'TỌA ĐỘ',
};

const ANALYSIS_COLUMN_TITLES: Record<string, string> = {
  ...CORE_COLUMN_TITLES,
  junction_scope: 'NÚT GIAO',
};

const NON_EDITABLE_FIELDS = new Set([
  'id',
  'index_stt',
  'group',
  'region',
  'layer',
  'technical_geom',
  'coordinates_summary',
  'length',
  'area',
]);

const ANALYSIS_NON_EDITABLE_FIELDS = new Set([
  ...NON_EDITABLE_FIELDS,
  'junction_scope',
]);

const BATCH_NOTE_OPTIONS = ['Đã kiểm tra', 'Cần sửa', 'OK'];
const BOOLEAN_OPTIONS = ['Có', 'Không'];

const toColumnLabel = (key: string) => {
  if (
    key.startsWith('source_')
    || key === 'parent_intersection_name'
    || key === 'parent_intersection_display_order'
  ) {
    return key;
  }
  if (ANALYSIS_COLUMN_TITLES[key]) return ANALYSIS_COLUMN_TITLES[key];
  return key.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
};

const getColumnWidth = (key: string) => {
  if (['name', 'description', 'coordinates_summary'].includes(key)) return 220;
  if (['note', 'status', 'type', 'group', 'region', 'layer', 'geom_type', 'technical_geom'].includes(key)) return 140;
  if (['latitude', 'longitude', 'length', 'area'].includes(key)) return 120;
  if (['is_visible', 'id'].includes(key)) return 110;
  return 160;
};

const buildDisplayValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value ? 'Có' : 'Không';
  }
  return value;
};

const hasKeyInRows = (rows: FlatFeature[], key: string) => rows.some((row) => key in row);

const hierarchySortingFn: SortingFn<FlatFeature> = (rowA, rowB, columnId) => (
  compareAnalysisHierarchyRows(rowA.original, rowB.original, columnId)
);

const buildAnalysisFieldColumn = (
  key: string,
  handleUpdate: (id: string, field: string, value: any) => Promise<void>,
  options?: string[],
): ColumnDef<FlatFeature> => {
  if (key === 'name') {
    return {
      header: toColumnLabel(key),
      accessorKey: key,
      size: 220,
      sortingFn: hierarchySortingFn,
      cell: (info) => (
        <div
          className="flex items-center gap-2"
          style={{ paddingLeft: `${(info.row.original.__analysis_depth || 0) * 16}px` }}
        >
          {info.row.original.__analysis_is_intersection && (
            <span className="shrink-0 rounded border border-cad-accent/40 bg-cad-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cad-accent">
              Nút giao
            </span>
          )}
          {!!info.row.original.__analysis_parent_id && (
            <span className="shrink-0 rounded border border-cad-border bg-cad-surface/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cad-text-muted">
              Thuộc nút giao
            </span>
          )}
          <EditableCell
            value={info.getValue()}
            row={info.row}
            column={info.column}
            onUpdate={handleUpdate}
            className="font-bold text-cad-accent"
          />
        </div>
      ),
    };
  }

  if (key === 'geom_type') {
    return {
      header: toColumnLabel(key),
      accessorKey: key,
      size: getColumnWidth(key),
      sortingFn: hierarchySortingFn,
      meta: { options: GEOM_TYPES_OPTIONS },
      cell: (info) => (
        <DropdownCell
          value={String((info.getValue() as any) ?? '')}
          options={GEOM_TYPES_OPTIONS}
          row={info.row}
          column={info.column}
          onUpdate={handleUpdate}
        />
      ),
    };
  }

  if (options && options.length > 0) {
    return {
      header: toColumnLabel(key),
      accessorKey: key,
      size: getColumnWidth(key),
      sortingFn: hierarchySortingFn,
      meta: { options },
      cell: (info) => (
        <DropdownCell
          value={String((info.getValue() as any) ?? '')}
          options={options}
          row={info.row}
          column={info.column}
          onUpdate={handleUpdate}
        />
      ),
    };
  }

  if (ANALYSIS_NON_EDITABLE_FIELDS.has(key)) {
    return {
      header: toColumnLabel(key),
      accessorKey: key,
      size: getColumnWidth(key),
      sortingFn: hierarchySortingFn,
    };
  }

  return {
    header: toColumnLabel(key),
    accessorKey: key,
    size: getColumnWidth(key),
    sortingFn: hierarchySortingFn,
    cell: (info) => (
      <EditableCell
        value={buildDisplayValue(info.getValue())}
        row={info.row}
        column={info.column}
        onUpdate={handleUpdate}
      />
    ),
  };
};

const getGeomIconValue = (value: unknown) => {
  const lowerVal = String((value as any) ?? '').toLowerCase();
  if (['cctv', 'ptz', 'speed', 'lpr'].includes(lowerVal)) return lowerVal;
  if (lowerVal.includes('nut giao')) return 'intersection';
  return null;
};

export const AnalysisDialog = ({ onClose }: AnalysisDialogProps) => {
  const { state, selectFeature, zoomTo, dispatchEvent, deleteFeature, deduplicate } = useDesignSync();
  const projectId = useDesignSync.getState().projectId;
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    type: 'feature' | 'column' | 'import' | null;
    id: string | null;
    itemName: string;
    message: string;
  }>({ isOpen: false, type: null, id: null, itemName: '', message: '' });
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterGroup, setFilterGroup] = useState<string>('ALL');
  const [filterLayer, setFilterLayer] = useState<string>('ALL');
  const [filterRegion, setFilterRegion] = useState<string>('ALL');
  const [filterGeomType, setFilterGeomType] = useState<string>('ALL');
  const [manualColumnKeys, setManualColumnKeys] = useState<string[]>([]);

  const allData = useMemo(() => {
    if (!state) return [];
    return buildAnalysisHierarchyRows(state) as FlatFeature[];
  }, [state]);

  const filterOptions = useMemo(() => {
    const groups = new Set<string>();
    const layers = new Set<string>();
    const regions = new Set<string>();
    const geomTypes = new Set<string>();

    allData.forEach((feature) => {
      if (feature.group) groups.add(feature.group);
      if (feature.layer) layers.add(feature.layer);
      if (feature.region) regions.add(feature.region);
      if (feature.geom_type) geomTypes.add(feature.geom_type);
    });

    return {
      groups: Array.from(groups).sort(),
      layers: Array.from(layers).sort(),
      regions: Array.from(regions).sort(),
      geomTypes: Array.from(geomTypes).sort(),
    };
  }, [allData]);

  const data = useMemo(() => {
    return allData.filter((feature) => {
      if (filterGroup !== 'ALL' && feature.group !== filterGroup) return false;
      if (filterLayer !== 'ALL' && feature.layer !== filterLayer) return false;
      if (filterRegion !== 'ALL' && feature.region !== filterRegion) return false;
      if (filterGeomType !== 'ALL' && feature.geom_type !== filterGeomType) return false;
      return true;
    });
  }, [allData, filterGroup, filterLayer, filterRegion, filterGeomType]);

  const projectSettings = useMemo(() => normalizeProjectSettings(state?.settings), [state?.settings]);
  const schemaColumnKeys = useMemo(() => getAnalysisSchemaColumnKeys(projectSettings), [projectSettings]);
  const userColumnKeys = useMemo(() => (
    getAnalysisUserColumnKeys(Object.values(state?.features || {}), manualColumnKeys)
  ), [manualColumnKeys, state]);

  const analysisColumnKeys = useMemo(() => {
    const coreKeys = ANALYSIS_CORE_COLUMN_ORDER.filter((key) => hasKeyInRows(allData, key));
    const schemaKeys = schemaColumnKeys.filter((key) => hasKeyInRows(allData, key));
    const dynamicKeys = userColumnKeys.filter((key) => !coreKeys.includes(key as (typeof coreKeys)[number]));
    return [...coreKeys, ...schemaKeys, ...dynamicKeys];
  }, [allData, schemaColumnKeys, userColumnKeys]);

  const exportColumnKeys = useMemo(() => (
    [
      ...analysisColumnKeys,
      ...ANALYSIS_EXPORT_COLUMN_ORDER.filter((key) => !analysisColumnKeys.includes(key)),
    ].filter((key) => hasKeyInRows(data, key))
  ), [analysisColumnKeys, data]);

  const exportRows = useMemo(() => (
    buildAnalysisExportRows(data, exportColumnKeys, toColumnLabel)
  ), [data, exportColumnKeys]);

  const handleGoToFeatureLocation = useCallback((row: FlatFeature) => {
    const feature = state?.features[row.id];
    if (!feature) return;

    selectFeature(feature.id);

    try {
      const point = getPointCoordinates(feature);
      const line = getLineCoordinates(feature);
      const polygon = getPolygonCoordinates(feature)?.[0];
      const center = point || polygon?.[0] || line?.[0];

      if (center) {
        zoomTo(feature.id, 'location', [center[1], center[0]]);
        return;
      }
    } catch (error) {
      console.error('Go to feature location error:', error);
    }

    zoomTo(feature.id, 'feature');
  }, [selectFeature, state, zoomTo]);

  const handleUpdate = useCallback(async (id: string, key: string, value: any) => {
    const feature = state?.features[id];
    if (!feature) return;

    const meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : { ...(feature.metadata as any) };
    const props = typeof feature.properties === 'object' ? { ...(feature.properties as any) } : {};

    if (key === 'name') {
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, name: value } });
      return;
    }

    if (key === 'is_visible') {
      meta.is_visible = Boolean(value);
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
      return;
    }

    if (['display_order', 'description', 'geom_type', 'status', 'note'].includes(key) || key.toLowerCase().includes('stt')) {
      const targetKey = key.toLowerCase().includes('stt') || key === 'display_order'
        ? 'display_order'
        : (key === 'geom_type' ? 'type' : key);
      meta[targetKey] = value;
      if (key === 'note') meta.notes = value;
      if (key === 'geom_type') {
        const nextIcon = getGeomIconValue(value);
        if (nextIcon) meta.icon = nextIcon;
      }
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
      return;
    }

    if (key === 'latitude' || key === 'longitude') {
      try {
        const nextCoord = parseFloat(value);
        if (!Number.isNaN(nextCoord)) {
          const point = getPointCoordinates(feature);
          const line = getLineCoordinates(feature);
          const polygon = getPolygonCoordinates(feature)?.[0];

          if (point) {
            const coords = [...point] as [number, number];
            if (key === 'latitude') coords[1] = nextCoord;
            else coords[0] = nextCoord;
            await dispatchEvent({ type: 'FeatureUpdated', payload: { id, coordinates: coords } });
          } else if (polygon?.[0]) {
            const coords = polygon.map((coord) => [...coord] as [number, number]);
            if (key === 'latitude') coords[0][1] = nextCoord;
            else coords[0][0] = nextCoord;
            await dispatchEvent({ type: 'FeatureUpdated', payload: { id, coordinates: [coords] } });
          } else if (line?.[0]) {
            const coords = line.map((coord) => [...coord] as [number, number]);
            if (key === 'latitude') coords[0][1] = nextCoord;
            else coords[0][0] = nextCoord;
            await dispatchEvent({ type: 'FeatureUpdated', payload: { id, coordinates: coords } });
          }
        }
      } catch (error) {
        console.error('Coord update error:', error);
      }
      return;
    }

    props[key] = value;
    await dispatchEvent({ type: 'FeatureUpdated', payload: { id, properties: props } });
  }, [state, dispatchEvent]);

  const onBatchUpdate = useCallback(async (selectedIds: string[], field: string, value: any) => {
    if (!state) return;

    const events: DesignEventType[] = [];
    selectedIds.forEach((id) => {
      const feature = state.features[id];
      if (!feature) return;

      const meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : { ...(feature.metadata as any) };
      const props = typeof feature.properties === 'object' ? { ...(feature.properties as any) } : {};

      if (field === 'is_visible') {
        meta.is_visible = value === true || value === 'Co';
        events.push({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
        return;
      }

      if (['geom_type', 'type', 'category', 'technical', 'display_order', 'description', 'status', 'note'].includes(field)) {
        const targetKey = field === 'geom_type' ? 'type' : field;
        meta[targetKey] = value;
        if (field === 'note') meta.notes = value;
        if (field === 'geom_type') {
          const nextIcon = getGeomIconValue(value);
          if (nextIcon) meta.icon = nextIcon;
        }
        events.push({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
        return;
      }

      if (field === 'layer' || field === 'group') {
        events.push({ type: 'FeatureUpdated', payload: { id, [field]: value } });
        return;
      }

      props[field] = value;
      events.push({ type: 'FeatureUpdated', payload: { id, properties: props } });
    });

    if (events.length > 0) {
      const { dispatchEvents } = useDesignSync.getState();
      await dispatchEvents(events);
    }
  }, [state]);

  const handleAddColumn = useCallback(async () => {
    if (!state || data.length === 0) {
      alert('Không có đối tượng để thêm cột.');
      return;
    }

    const label = window.prompt('Nhập tên cột mới');
    if (!label) return;

    const columnKey = normalizeAnalysisColumnKey(label);
    if (!columnKey || !isAllowedAnalysisDynamicColumnKey(columnKey)) {
      alert('Tên cột không hợp lệ hoặc trùng với cột hệ thống.');
      return;
    }

    if (analysisColumnKeys.includes(columnKey)) {
      alert('Cột này đã tồn tại.');
      return;
    }

    const { dispatchEvents } = useDesignSync.getState();
    const events: DesignEventType[] = data
      .map((row) => state.features[row.id])
      .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))
      .map((feature) => ({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          properties: {
            ...(typeof feature.properties === 'object' ? feature.properties : {}),
            [columnKey]: '',
          },
        },
      }));

    if (events.length > 0) {
      await dispatchEvents(events);
    }

    setManualColumnKeys((prev) => (
      prev.includes(columnKey) ? prev : [...prev, columnKey]
    ));
  }, [analysisColumnKeys, data, state]);

  const handleExport = async () => {
    try {
      const { analysisService } = await import('@IMPLEMENT/services/analysisService');
      await analysisService.exportToExcel(exportRows, projectId?.toString() || 'default');
    } catch (error: any) {
      alert(`Export error: ${error.message}`);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !state) return;

    try {
      const { analysisService } = await import('@IMPLEMENT/services/analysisService');
      const events = await analysisService.importFromExcel(state);
      if (events.length > 0) {
        setDeleteModalConfig({
          isOpen: true,
          type: 'import',
          id: JSON.stringify(events),
          itemName: `${events.length} thay đổi`,
          message: `Tìm thấy ${events.length} thay đổi. Bạn có muốn cập nhật?`,
        });
      } else {
        alert('Không tìm thấy thay đổi.');
      }
    } catch (error: any) {
      alert(`Import error: ${error.message}`);
    }
  };

  const columns = useMemo<ColumnDef<FlatFeature>[]>(() => {
    const coreColumns: ColumnDef<FlatFeature>[] = ANALYSIS_CORE_COLUMN_ORDER
      .filter((key) => hasKeyInRows(allData, key))
      .map((key) => buildAnalysisFieldColumn(
        key,
        handleUpdate,
        key === 'geom_type' ? GEOM_TYPES_OPTIONS : key === 'note' ? BATCH_NOTE_OPTIONS : undefined
      ));

    const schemaColumns: ColumnDef<FlatFeature>[] = getAnalysisTemplateGroups(projectSettings)
      .flatMap((typeGroup) => {
        const groupColumns = typeGroup.groups
          .map((group) => {
            const fields = typeGroup.fields
              .filter((field) => field.groupId === group.id && hasKeyInRows(allData, field.key))
              .sort((left, right) => left.order - right.order);

            if (fields.length === 0) return null;

            return {
              header: group.label,
              columns: fields.map((field) => buildAnalysisFieldColumn(
                field.key,
                handleUpdate,
                field.type === 'select' ? field.options : undefined
              )),
            } as { header: string; columns: ColumnDef<FlatFeature>[] };
          })
          .filter(Boolean) as Array<{ header: string; columns: ColumnDef<FlatFeature>[] }>;

        if (groupColumns.length === 0) return [];

        return [{
          header: typeGroup.label,
          columns: groupColumns,
        } as ColumnDef<FlatFeature>];
      });

    const extraColumns: ColumnDef<FlatFeature>[] = userColumnKeys.map((key) => ({
      header: toColumnLabel(key),
      accessorKey: key,
      size: getColumnWidth(key),
      sortingFn: hierarchySortingFn,
      cell: (info) => {
        const value = info.getValue();
        if (!isAnalysisScalarValue(value)) {
          return <span className="text-cad-text-muted">N/A</span>;
        }

        if (ANALYSIS_NON_EDITABLE_FIELDS.has(key)) {
          return <span>{String((buildDisplayValue(value) as any) ?? '')}</span>;
        }

        return (
          <EditableCell
            value={buildDisplayValue(value)}
            row={info.row}
            column={info.column}
            onUpdate={handleUpdate}
          />
        );
      },
    }));

    return [
      {
        id: 'select',
        size: 40,
        header: ({ table }) => (
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              className="peer appearance-none w-4 h-4 rounded border border-cad-border hover:border-cad-accent checked:bg-cad-accent checked:border-cad-accent outline-none cursor-pointer transition-all"
            />
            <svg
              className="absolute w-2.5 h-2.5 pointer-events-none stroke-black stroke-[3.5] fill-none opacity-0 peer-checked:opacity-100 transition-opacity"
              viewBox="0 0 24 24"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        ),
        cell: ({ row }) => (
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              className="peer appearance-none w-4 h-4 rounded border border-cad-border hover:border-cad-accent checked:bg-cad-accent checked:border-cad-accent outline-none cursor-pointer transition-all"
            />
            <svg
              className="absolute w-2.5 h-2.5 pointer-events-none stroke-black stroke-[3.5] fill-none opacity-0 peer-checked:opacity-100 transition-opacity"
              viewBox="0 0 24 24"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        ),
      },
      {
        header: 'Core',
        columns: coreColumns,
      },
      ...schemaColumns,
      {
        header: 'Custom',
        columns: extraColumns,
      },
      {
        id: 'Action',
        size: 80,
        header: 'XOA',
        cell: ({ row }) => (
          <button onClick={() => deleteFeature(row.original.id)} className="p-1 hover:text-rose-500 transition-colors">
            <Trash2 size={14} />
          </button>
        ),
      },
    ];
  }, [allData, deleteFeature, handleUpdate, projectSettings, userColumnKeys]);

  const activeFiltersCount = [filterGroup, filterLayer, filterRegion, filterGeomType].filter((value) => value !== 'ALL').length;

  return (
    <>
      <div
        className="absolute inset-0 flex flex-col min-h-0 min-w-0 overflow-hidden bg-cad-bg"
      >
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-cad-border/50 bg-cad-elevated/70 backdrop-blur-md select-none gap-4">
          <div className="flex p-0.5 bg-cad-bg/60 border border-cad-border/60 rounded-lg h-9 items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-cad-surface text-cad-accent border border-cad-border/40 shadow-sm font-black'
                  : 'text-cad-text-secondary hover:text-cad-text-primary hover:bg-cad-surface/30 border border-transparent'
              )}
            >
              <ListFilter size={13} />
              Bảng dữ liệu
            </button>
            <button
              onClick={() => setViewMode('bom')}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer',
                viewMode === 'bom'
                  ? 'bg-cad-surface text-cad-accent border border-cad-border/40 shadow-sm font-black'
                  : 'text-cad-text-secondary hover:text-cad-text-primary hover:bg-cad-surface/30 border border-transparent'
              )}
            >
              <Package size={13} />
              BOM Summary
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-cad-surface/80 border border-cad-border/40 rounded-lg shadow-inner">
              <Filter size={12} className="text-cad-text-muted" />
              <span className="text-[10px] font-bold text-cad-text-secondary uppercase mr-1">Lọc:</span>

              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="bg-cad-bg/90 border border-cad-border/60 hover:border-cad-accent/50 focus:border-cad-accent text-[10px] font-semibold text-cad-text-primary rounded px-2.5 py-1 outline-none transition-all cursor-pointer max-w-[125px] truncate appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat"
              >
                <option value="ALL">Tất cả nhóm</option>
                {filterOptions.groups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>

              <select
                value={filterLayer}
                onChange={(e) => setFilterLayer(e.target.value)}
                className="bg-cad-bg/90 border border-cad-border/60 hover:border-cad-accent/50 focus:border-cad-accent text-[10px] font-semibold text-cad-text-primary rounded px-2.5 py-1 outline-none transition-all cursor-pointer max-w-[125px] truncate appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat"
              >
                <option value="ALL">Tất cả lớp</option>
                {filterOptions.layers.map((layer) => (
                  <option key={layer} value={layer}>{layer}</option>
                ))}
              </select>

              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="bg-cad-bg/90 border border-cad-border/60 hover:border-cad-accent/50 focus:border-cad-accent text-[10px] font-semibold text-cad-text-primary rounded px-2.5 py-1 outline-none transition-all cursor-pointer max-w-[125px] truncate appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat"
              >
                <option value="ALL">Tất cả vùng</option>
                {filterOptions.regions.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>

              <select
                value={filterGeomType}
                onChange={(e) => setFilterGeomType(e.target.value)}
                className="bg-cad-bg/90 border border-cad-border/60 hover:border-cad-accent/50 focus:border-cad-accent text-[10px] font-semibold text-cad-text-primary rounded px-2.5 py-1 outline-none transition-all cursor-pointer max-w-[125px] truncate appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat"
              >
                <option value="ALL">Tất cả geo</option>
                {filterOptions.geomTypes.map((geomType) => (
                  <option key={geomType} value={geomType}>{geomType}</option>
                ))}
              </select>

              {activeFiltersCount > 0 && (
                <button
                  onClick={() => {
                    setFilterGroup('ALL');
                    setFilterLayer('ALL');
                    setFilterRegion('ALL');
                    setFilterGeomType('ALL');
                  }}
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer px-1.5 py-0.5 hover:bg-rose-500/10 rounded"
                >
                  Xóa lọc ({activeFiltersCount})
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          {viewMode === 'grid' ? (
            <AnalysisTable
              data={data}
              columns={columns}
              projectId={projectId ?? undefined}
              title={`BẢNG TỔNG HỢP GIS (${data.length} ĐỐI TƯỢNG)`}
              isStandalone={true}
              showWindowControls={false}
              onClose={onClose}
              onUpdate={handleUpdate}
              onGoToRowLocation={handleGoToFeatureLocation}
              batchFields={[
                { label: 'Layer', value: 'layer' },
                { label: 'Group', value: 'group' },
                { label: 'Status', value: 'status', options: ['N/A', 'Đã kiểm tra', 'Cần sửa', 'OK'] },
                { label: 'Note', value: 'note', options: BATCH_NOTE_OPTIONS },
                { label: 'Geom Type', value: 'geom_type', options: GEOM_TYPES_OPTIONS },
                { label: 'Hiển thị', value: 'is_visible', options: BOOLEAN_OPTIONS },
              ]}
              onBatchUpdate={onBatchUpdate}
              onExport={handleExport}
              onAddColumn={handleAddColumn}
              onImport={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.xlsx,.xls';
                (input as any).onchange = handleImport;
                input.click();
                return Promise.resolve();
              }}
              renderExtraActions={() => (
                <button
                  onClick={() => deduplicate()}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 text-amber-500 hover:bg-amber-500 hover:text-black rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer"
                >
                  <Eraser size={14} /> Dọn trùng
                </button>
              )}
            />
          ) : (
            <BOMSummaryPanel />
          )}
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (deleteModalConfig.type === 'import' && deleteModalConfig.id) {
            const events = JSON.parse(deleteModalConfig.id);
            for (const event of events) await dispatchEvent(event);
          }
          setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }));
        }}
        title="Xác nhận"
        itemName={deleteModalConfig.itemName}
        message={deleteModalConfig.message}
      />
    </>
  );
};

