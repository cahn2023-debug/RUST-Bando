/**
 * Enhanced Analysis Dialog
 * Combines data grid, BOM summary, filtering, and technical specs
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Trash2,
  Eraser,
  Filter,
  Package,
  ListFilter
} from 'lucide-react';
import { AnalysisTable } from '@DESIGN/components/ui/AnalysisTable';
import { BOMSummaryPanel } from '@DESIGN/components/ui/BOMSummaryPanel';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { ColumnDef } from '@tanstack/react-table';
import { useDesignSync, DesignEventType } from '@IMPLEMENT/stores/useDesignSync';
import { flattenFeature } from '@TOOL/utils/dataFlattening';
import { removeVietnameseTones, matchesSearchQuery } from '@TOOL/utils/vietnameseSearch';
import { EditableCell, DropdownCell, GEOM_TYPES_OPTIONS } from '@IMPLEMENT/features/analysis/AnalysisCells';
import { cn } from '@TOOL/utils/cn';

interface AnalysisDialogProps {
  onClose: () => void;
}

interface FlatFeature {
  id: string;
  stt: string;
  name: string;
  group: string;
  layer: string;
  region: string;
  geom_type: string;
  coordinates: string;
  display_order?: string;
  description?: string;
  [key: string]: any;
}

type ViewMode = 'grid' | 'bom';

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

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Filter states
  const [filterGroup, setFilterGroup] = useState<string>('ALL');
  const [filterLayer, setFilterLayer] = useState<string>('ALL');
  const [filterRegion, setFilterRegion] = useState<string>('ALL');
  const [filterGeomType, setFilterGeomType] = useState<string>('ALL');

  // 1. Data Flattening with Filtering
  const allData = useMemo(() => {
    if (!state) return [];
    const processedFeatures = Object.values(state.features).map(f => {
      let meta: any = {};
      try {
        meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : (f.metadata || {});
      } catch (e) {
        console.error(`[Analysis] Error parsing metadata for ${f.id}:`, e);
      }
      return { feature: f, metadata: meta, displayOrder: meta.display_order || '', name: f.name || '' };
    });

    processedFeatures.sort((a, b) => {
      if (a.displayOrder && b.displayOrder) return a.displayOrder.localeCompare(b.displayOrder, undefined, { numeric: true });
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return processedFeatures.map((item, idx) => ({
      ...flattenFeature(item.feature, state, item.metadata),
      index_stt: (idx + 1).toString(),
    })) as FlatFeature[];
  }, [state]);

  // Available filter options
  const filterOptions = useMemo(() => {
    const groups = new Set<string>();
    const layers = new Set<string>();
    const regions = new Set<string>();
    const geomTypes = new Set<string>();

    allData.forEach(f => {
      if (f.group) groups.add(f.group);
      if (f.layer) layers.add(f.layer);
      if (f.region) regions.add(f.region);
      if (f.geom_type) geomTypes.add(f.geom_type);
    });

    return {
      groups: Array.from(groups).sort(),
      layers: Array.from(layers).sort(),
      regions: Array.from(regions).sort(),
      geomTypes: Array.from(geomTypes).sort()
    };
  }, [allData]);

  // Apply filters
  const data = useMemo(() => {
    return allData.filter(f => {
      if (filterGroup !== 'ALL' && f.group !== filterGroup) return false;
      if (filterLayer !== 'ALL' && f.layer !== filterLayer) return false;
      if (filterRegion !== 'ALL' && f.region !== filterRegion) return false;
      if (filterGeomType !== 'ALL' && f.technical_geom !== filterGeomType) return false;
      return true;
    });
  }, [allData, filterGroup, filterLayer, filterRegion, filterGeomType]);

  // 2. Event Handlers
  const handleUpdate = useCallback(async (id: string, key: string, value: any) => {
    const f = state?.features[id];
    if (!f) return;

    const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : { ...(f.metadata as any) };
    const props = typeof f.properties === 'object' ? { ...(f.properties as any) } : {};

    if (key === 'name') {
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, name: value } });
    } else if (['display_order', 'description', 'geom_type'].includes(key) || key.toLowerCase().includes('stt')) {
      const targetKey = (key.toLowerCase().includes('stt') || key === 'display_order') ? 'display_order' : (key === 'geom_type' ? 'type' : key);
      meta[targetKey] = value;
      if (key === 'geom_type') {
        const lowerVal = value.toLowerCase();
        if (['cctv', 'ptz', 'speed', 'lpr'].includes(lowerVal)) meta.icon = lowerVal;
        else if (lowerVal.includes('nút giao')) meta.icon = 'intersection';
      }
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
    } else if (key === 'latitude' || key === 'longitude') {
      try {
        const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : [...f.coordinates];
        const val = parseFloat(value);
        if (!isNaN(val)) {
          if (f.geom_type.toUpperCase() === 'POINT') {
            if (key === 'latitude') coords[1] = val; else coords[0] = val;
          } else if (Array.isArray(coords[0])) {
            if (key === 'latitude') coords[0][1] = val; else coords[0][0] = val;
          }
          await dispatchEvent({ type: 'FeatureUpdated', payload: { id, coordinates: JSON.stringify(coords) } });
        }
      } catch (e) { console.error("Coord update error:", e); }
    } else {
      props[key] = value;
      await dispatchEvent({ type: 'FeatureUpdated', payload: { id, properties: props } });
    }
  }, [state, dispatchEvent]);

  const onBatchUpdate = useCallback(async (selectedIds: string[], field: string, value: any) => {
    if (!state) return;
    const events: DesignEventType[] = [];
    selectedIds.forEach(id => {
      const f = state.features[id];
      if (!f) return;
      const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : { ...(f.metadata as any) };
      const props = typeof f.properties === 'object' ? { ...(f.properties as any) } : {};

      if (['geom_type', 'type', 'category', 'technical', 'display_order', 'description'].includes(field)) {
        const targetKey = field === 'geom_type' ? 'type' : field;
        meta[targetKey] = value;
        if (field === 'geom_type') {
          const lowerVal = value.toLowerCase();
          if (['cctv', 'ptz', 'speed', 'lpr'].includes(lowerVal)) meta.icon = lowerVal;
          else if (lowerVal.includes('nút giao')) meta.icon = 'intersection';
        }
        events.push({ type: 'FeatureUpdated', payload: { id, metadata: JSON.stringify(meta) } });
      } else if (field === 'layer' || field === 'group') {
        events.push({ type: 'FeatureUpdated', payload: { id, [field]: value } });
      } else {
        props[field] = value;
        events.push({ type: 'FeatureUpdated', payload: { id, properties: props } });
      }
    });

    if (events.length > 0) {
      const { dispatchEvents } = useDesignSync.getState();
      await dispatchEvents(events);
    }
  }, [state]);

  const handleExport = async () => {
    try {
      const { analysisService } = await import('@IMPLEMENT/services/analysisService');
      await analysisService.exportToExcel(data, projectId?.toString() || 'default');
    } catch (error: any) { alert(`Export error: ${error.message}`); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !state) return;
    try {
      const { analysisService } = await import('@IMPLEMENT/services/analysisService');
      const events = await analysisService.importFromExcel(state);
      if (events.length > 0) {
        setDeleteModalConfig({
          isOpen: true, type: 'import', id: JSON.stringify(events),
          itemName: `${events.length} thay đổi`,
          message: `Tìm thấy ${events.length} thay đổi. Bạn có muốn cập nhật?`
        });
      } else alert("Không tìm thấy thay đổi.");
    } catch (error: any) { alert(`Import error: ${error.message}`); }
  };

  // 3. Columns Definition
  const columns = useMemo<ColumnDef<FlatFeature>[]>(() => [
    {
      id: 'select', size: 40,
      header: ({ table }) => (
        <input type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} className="accent-cad-accent w-4 h-4" />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} className="accent-cad-accent w-4 h-4" />
      )
    },
    { header: 'STT', accessorKey: 'index_stt', size: 60 },
    {
      header: 'MÃ HIỆU', accessorKey: 'display_order', size: 100,
      cell: info => <EditableCell value={info.getValue()} row={info.row} column={info.column} onUpdate={handleUpdate} />
    },
    {
      header: 'TÊN ĐỐI TƯỢNG', accessorKey: 'name', size: 200,
      cell: info => (
        <EditableCell
          value={info.getValue()} row={info.row} column={info.column} onUpdate={handleUpdate}
          className="font-bold text-cad-accent"
          onClick={() => {
            const f = state?.features[info.row.original.id];
            if (f) {
              const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
              const center = f.geom_type.toUpperCase() === 'POINT' ? (Array.isArray(coords[0]) ? coords[0] : coords) : coords[0][0] || coords[0];
              selectFeature(f.id); zoomTo(f.id, 'location', [center[1], center[0]]);
            }
          }}
        />
      )
    },
    { header: 'LOẠI', accessorKey: 'type', size: 100 },
    { header: 'PHÂN LOẠI', accessorKey: 'group', size: 120 },
    { header: 'VÙNG', accessorKey: 'region', size: 120 },
    { header: 'LỚP', accessorKey: 'layer', size: 120 },
    {
      header: 'GEO TYPE', accessorKey: 'geom_type', size: 140,
      cell: info => <DropdownCell value={info.getValue() as string} options={GEOM_TYPES_OPTIONS} row={info.row} column={info.column} onUpdate={handleUpdate} />
    },
    {
      header: 'MÔ TẢ', accessorKey: 'description', size: 250,
      cell: info => <EditableCell value={info.getValue()} row={info.row} column={info.column} onUpdate={handleUpdate} />
    },
    {
      id: 'Action', size: 80, header: 'Xóa',
      cell: ({ row }) => (
        <button onClick={() => deleteFeature(row.original.id)} className="p-1 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
      )
    }
  ], [state, zoomTo, handleUpdate]);

  const activeFiltersCount = [filterGroup, filterLayer, filterRegion, filterGeomType].filter(f => f !== 'ALL').length;

  return (
    <>
      <div className="flex flex-col h-full w-full bg-cad-bg">
        {/* View Mode Switcher */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-cad-border bg-cad-elevated">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all',
              viewMode === 'grid'
                ? 'bg-cad-accent text-white'
                : 'text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-surface'
            )}
          >
            <ListFilter size={14} />
            Bảng dữ liệu
          </button>
          <button
            onClick={() => setViewMode('bom')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all',
              viewMode === 'bom'
                ? 'bg-cad-accent text-white'
                : 'text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-surface'
            )}
          >
            <Package size={14} />
            BOM Summary
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Filter Controls */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-cad-surface border border-cad-border rounded-lg">
              <Filter size={14} className="text-cad-text-muted" />
              <span className="text-[10px] font-bold text-cad-text-muted uppercase">Lọc:</span>
              
              <select
                value={filterGroup}
                onChange={e => setFilterGroup(e.target.value)}
                className="bg-cad-bg border border-cad-border rounded px-2 py-0.5 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent max-w-[120px] truncate"
              >
                <option value="ALL">Tất cả nhóm</option>
                {filterOptions.groups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              <select
                value={filterLayer}
                onChange={e => setFilterLayer(e.target.value)}
                className="bg-cad-bg border border-cad-border rounded px-2 py-0.5 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent max-w-[120px] truncate"
              >
                <option value="ALL">Tất cả lớp</option>
                {filterOptions.layers.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              <select
                value={filterRegion}
                onChange={e => setFilterRegion(e.target.value)}
                className="bg-cad-bg border border-cad-border rounded px-2 py-0.5 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent max-w-[120px] truncate"
              >
                <option value="ALL">Tất cả vùng</option>
                {filterOptions.regions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <select
                value={filterGeomType}
                onChange={e => setFilterGeomType(e.target.value)}
                className="bg-cad-bg border border-cad-border rounded px-2 py-0.5 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent max-w-[120px] truncate"
              >
                <option value="ALL">Tất cả Geo</option>
                {filterOptions.geomTypes.map(gt => (
                  <option key={gt} value={gt}>{gt}</option>
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
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Xóa lọc ({activeFiltersCount})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'grid' ? (
            <AnalysisTable
              data={data}
              columns={columns}
              projectId={projectId ?? undefined}
              title={`BẢNG TỔNG HỢP GIS (${data.length} đối tượng)`}
              onClose={onClose}
              onUpdate={handleUpdate}
              batchFields={[
                { label: 'Layer', value: 'layer' },
                { label: 'Group', value: 'group' },
                { label: 'Note', value: 'note', options: ['Đã kiểm tra', 'Cần sửa', 'OK'] },
                { label: 'Geom Type', value: 'geom_type', options: GEOM_TYPES_OPTIONS }
              ]}
              onBatchUpdate={onBatchUpdate}
              onExport={handleExport}
              onImport={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls'; (input as any).onchange = handleImport; input.click(); return Promise.resolve(); }}
              renderExtraActions={() => (
                <button
                  onClick={() => deduplicate()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-600 rounded text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all"
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
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (deleteModalConfig.type === 'import' && deleteModalConfig.id) {
            const events = JSON.parse(deleteModalConfig.id);
            for (const e of events) await dispatchEvent(e);
          }
          setDeleteModalConfig(prev => ({ ...prev, isOpen: false }));
        }}
        title="Xác nhận"
        itemName={deleteModalConfig.itemName}
        message={deleteModalConfig.message}
      />
    </>
  );
};
