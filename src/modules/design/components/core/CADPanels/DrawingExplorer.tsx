import React, { useState, useEffect, useRef } from "react";
import { Database, FolderPlus, Trash2, FileUp, Palette } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { open } from "@tauri-apps/plugin-dialog";

import { cn } from "@TOOL/utils/cn";
import { TreeItem } from "@DESIGN/components/core/CADPanels/TreeItem";
import { FeatureItem } from "@DESIGN/components/core/CADPanels/FeatureItem";
import { useDesignSync, EMPTY_OBJ } from "@IMPLEMENT/stores/useDesignSync";
import type { DesignEventType } from "@DESIGN/features/map/stores/types";
import { importFromExcel, importFromKML, getExcelHeaders, type ImportMapping } from "@IMPLEMENT/services/importService";
import {
  ExplorerHeader,
  ExplorerFilterBar,
  ExplorerModals,
  useFlattenedTree,
  useVirtualDrag
} from "./Explorer";
import { GroupIcon } from "@DESIGN/components/core/CADPanels/GroupIcon";
import type { RegionState, LayerState, FeatureGroupState, FeatureState } from "@CONTRACT/types";
import type { FlatTreeItem } from "@DESIGN/components/core/CADPanels/Explorer/useFlattenedTree";

interface MappingData {
  headers: string[];
  filename: string;
  groupId: string;
  filePath: string;
}

interface DeleteModalState {
  isOpen: boolean;
  type: 'region' | 'group' | 'layer' | 'feature' | null;
  id: string;
  name: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: string;
  id: string;
  data: FlatTreeItem['data'];
}

export function DrawingExplorer() {
  const state = useDesignSync(s => s.state);
  const regionsMap = state?.regions || (EMPTY_OBJ as Record<string, RegionState>);
  const layersMap = state?.layers || (EMPTY_OBJ as Record<string, LayerState>);
  const groupsMap = state?.feature_groups || (EMPTY_OBJ as Record<string, FeatureGroupState>);
  const featuresMap = state?.features || (EMPTY_OBJ as Record<string, FeatureState>);

  const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
  const selectedGroupId = useDesignSync(s => s.selectedGroupId);
  const selectFeature = useDesignSync(s => s.selectFeature);
  const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);
  const dispatchEvent = useDesignSync(s => s.dispatchEvent);
  const dispatchEvents = useDesignSync(s => s.dispatchEvents);
  const zoomTo = useDesignSync(s => s.zoomTo);
  const selectionSet = useDesignSync(s => s.selectionSet);
  const deleteSelectedFeatures = useDesignSync(s => s.deleteSelectedFeatures);
  const projectId = useDesignSync(s => s.projectId);
  const isLoading = useDesignSync(s => s.isLoading);
  const error = useDesignSync(s => s.error);
  const mapHiddenIds = useDesignSync(s => s.mapHiddenIds);
  const toggleMapHidden = useDesignSync(s => s.toggleMapHidden);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const featuresRef = useRef(featuresMap);
  const groupsRef = useRef(groupsMap);
  const regionsRef = useRef(regionsMap);

  useEffect(() => { featuresRef.current = featuresMap; }, [featuresMap]);
  useEffect(() => { groupsRef.current = groupsMap; }, [groupsMap]);
  useEffect(() => { regionsRef.current = regionsMap; }, [regionsMap]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`drawing-explorer-expanded-${projectId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (projectId) localStorage.setItem(`drawing-explorer-expanded-${projectId}`, JSON.stringify(expanded));
  }, [expanded, projectId]);

  const [treeSearchQuery, setTreeSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [reverseOrder, setReverseOrder] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'stt'>('name');

  const { flattenedItems, filteredRegions, featureNumbers } = useFlattenedTree({
    regionsMap, layersMap, groupsMap, featuresMap, expanded,
    treeSearchQuery, filterType, reverseOrder, sortField
  });

  const { isVirtualDragging: _isVirtualDragging, handleVirtualDragStart } = useVirtualDrag({
    featuresRef, groupsRef, regionsRef: regionsRef as any, dispatchEvents, selectionSet, clearSelection: useDesignSync(s => s.clearSelection)
  });

  const [, setContextMenu] = useState<ContextMenuState | null>(null);
  const [themeGroupId, setThemeGroupId] = useState<string | null>(null);
  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: null, id: '', name: '' });

  // Auto-expand logic (keep core orchestration here)
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (!hasAutoExpanded.current && filteredRegions.length > 0 && !isLoading && !error) {
      setExpanded(prev => {
        const next = { ...prev };
        filteredRegions.forEach(r => { next[r.id] = true; });
        return next;
      });
      hasAutoExpanded.current = true;
    }
  }, [filteredRegions, isLoading, error]);

  // Virtualization Scroll
  useEffect(() => {
    if (selectedFeatureId && flattenedItems.length > 0 && virtuosoRef.current) {
      const idx = flattenedItems.findIndex(item => item.type === 'feature' && item.id === selectedFeatureId);
      if (idx !== -1) {
        setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' }), 150);
      }
    }
  }, [selectedFeatureId, flattenedItems]);

  const handleCreateRegion = (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("Tên dự án mới:");
    if (!name) return;
    const regionId = crypto.randomUUID();
    const layerId = crypto.randomUUID();
    dispatchEvents([
      { type: 'RegionCreated', payload: { id: regionId, parent_id: null, name } },
      { type: 'LayerCreated', payload: { id: layerId, region_id: regionId, name: 'Lớp mặc định' } }
    ]);
    setExpanded(prev => ({ ...prev, [regionId]: true }));
  };

  const handleCreateGroup = (regionId: string, e: React.MouseEvent, parentGroupId?: string) => {
    e.stopPropagation();
    const layer = Object.values(layersMap).find(l => l.region_id === regionId);
    if (!layer) return;

    const typeChoice = prompt("Chọn loại nhóm (1-8): Intersection, Polyline, CCTV, PTZ, Speed, LPR, Folder, Default", "1");
    const group_type = (['INTERSECTION', 'POLYLINE', 'CCTV', 'PTZ', 'SPEED', 'LPR', 'FOLDER', 'default'] as const)[parseInt(typeChoice || '8') - 1];
    const name = prompt("Tên nhóm mới:", group_type === 'INTERSECTION' ? 'Nút giao mới' : 'Nhóm mới');
    if (!name) return;

    const id = crypto.randomUUID();
    dispatchEvent({
      type: 'FeatureGroupCreated',
      payload: {
        id,
        layer_id: layer.id,
        parent_id: parentGroupId || null,
        name,
        group_type
      }
    });
    setExpanded(prev => ({ ...prev, [id]: true }));
  };

  const handleImportToGroup = async (groupId: string) => {
    const selected = await open({ multiple: false, filters: [{ name: 'GIS Data', extensions: ['xlsx', 'xls', 'kml', 'kmz'] }] });
    if (!selected || typeof selected !== 'string') return;
    const fileName = selected.split(/[\\/]/).pop() || "";
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const headers = await getExcelHeaders(selected);
      setMappingData({ headers, filename: fileName, groupId, filePath: selected });
    } else {
      const records = await importFromKML(selected);
      const events: DesignEventType[] = records.map(r => ({
        type: 'FeatureCreated',
        payload: {
          id: r.id,
          layer_id: groupsMap[groupId]?.layer_id || "",
          group_id: groupId,
          name: r.properties.name || "KML Feature",
          geom_type: r.geom_type,
          coordinates: r.geometry,
          properties: r.properties,
          metadata: JSON.stringify({})
        }
      }));
      await dispatchEvents(events);
    }
  };

  const handleMappingConfirm = async (mapping: ImportMapping) => {
    if (!mappingData) return;
    const records = await importFromExcel(mappingData.filePath, mapping);
    const events: DesignEventType[] = records.map(r => ({
      type: 'FeatureCreated',
      payload: {
        id: r.id,
        layer_id: groupsMap[mappingData.groupId]?.layer_id || "",
        group_id: mappingData.groupId,
        name: r.properties.name || "Imported",
        geom_type: r.geom_type,
        coordinates: r.geometry?.coordinates ?? r.geometry,
        properties: r.properties,
        metadata: JSON.stringify({})
      }
    }));
    await dispatchEvents(events);
    setMappingData(null);
  };

  const handleToggleVisible = (type: string, id: string, _data: FlatTreeItem['data'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'region') {
      const layer = Object.values(layersMap).find((l: LayerState) => l.region_id === id);
      if (layer) toggleMapHidden(layer.id);
    } else if (type === 'group') {
      toggleMapHidden(id);
    } else if (type === 'feature') {
      toggleMapHidden(id);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.isOpen) return;
    const { type, id } = deleteModal;
    if (type === 'region') dispatchEvent({ type: 'RegionDeleted', payload: { id } });
    else if (type === 'group') dispatchEvent({ type: 'FeatureGroupDeleted', payload: { id } });
    else if (type === 'feature') id === 'selected' ? deleteSelectedFeatures() : dispatchEvent({ type: 'FeatureDeleted', payload: { id } });
    setDeleteModal({ isOpen: false, type: null, id: '', name: '' });
  };

  if (error) return <div className="p-6 text-center text-red-400">{error}</div>;
  if (isLoading || !state) return <div className="p-6 text-center text-cad-accent animate-pulse">Syncing...</div>;

  return (
    <div className="text-cad-text-primary px-3 py-2 text-[10px] font-mono flex flex-col h-full overflow-hidden">
      <ExplorerHeader treeSearchQuery={treeSearchQuery} setTreeSearchQuery={setTreeSearchQuery} onCreateRegion={handleCreateRegion} />
      <ExplorerFilterBar filterType={filterType} setFilterType={setFilterType} sortField={sortField} setSortField={setSortField} reverseOrder={reverseOrder} setReverseOrder={setReverseOrder} />

      <div className="flex-1 min-h-0 mt-2">
        <Virtuoso
          ref={virtuosoRef}
          data={flattenedItems}
          itemContent={(index: number, item: FlatTreeItem) => (
            <div key={item.id} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: item.type, id: item.id, data: item.data }); }}>
              {item.type === 'region' && (
                <TreeItem
                  name={item.data.name}
                  expanded={!!expanded[item.id]}
                  onClick={() => setExpanded(p => ({ ...p, [item.id]: !p[item.id] }))}
                  icon={<Database size={10} className="text-cad-accent/60" />}
                  onMouseDown={(e) => handleVirtualDragStart(e, 'region', item.id)}
                  dragId={item.id} dragType="region"
                  onRename={(newName) => dispatchEvent({ type: 'RegionUpdated', payload: { id: item.id, name: newName, description: (item.data as RegionState).description || null } })}
                  onToggleVisible={(e) => handleToggleVisible('region', item.id, item.data, e)}
                  visible={!mapHiddenIds.has((Object.values(layersMap).find((l: LayerState) => l.region_id === item.id) as LayerState | undefined)?.id ?? item.id)}
                  customAction={
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => handleCreateGroup(item.id, e)} className="p-0.5 hover:bg-cad-accent rounded"><FolderPlus size={10} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'region', id: item.id, name: item.data.name }); }} className="p-0.5 hover:bg-red-500 rounded"><Trash2 size={10} /></button>
                    </div>
                  }
                />
              )}
              {item.type === 'group' && (
                <TreeItem
                  name={item.data.name} level={item.level}
                  expanded={!!expanded[item.id]}
                  onClick={() => { setExpanded(p => ({ ...p, [item.id]: !p[item.id] })); setSelectedGroup(item.id); }}
                  onMouseDown={(e) => handleVirtualDragStart(e, 'group', item.id)}
                  dragId={item.id} dragType="group"
                  className={cn(
                    "transition-all",
                    selectedGroupId === item.id ? "bg-emerald-500/10 border-l-2 border-emerald-500" : ""
                  )}
                  icon={<GroupIcon type={(item.data as FeatureGroupState).type} name={item.data.name} color={(item.data as FeatureGroupState).is_visible === false ? "#94a3b8" : "#fbbf24"} />}
                  onRename={(newName) => dispatchEvent({ type: 'FeatureGroupUpdated', payload: { id: item.id, name: newName } })}
                  onToggleVisible={(e) => handleToggleVisible('group', item.id, item.data, e)}
                  visible={!mapHiddenIds.has(item.id)}
                  customAction={
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setThemeGroupId(item.id); }}
                        className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Khai báo đồng bộ (Theme)"
                      >
                        <Palette size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImportToGroup(item.id); }}
                        className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Import dữ liệu"
                      >
                        <FileUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'group', id: item.id, name: item.data.name }); }}
                        className="p-1 hover:bg-red-500/20 rounded text-red-500/60 hover:text-red-500 transition-colors"
                        title="Xóa nhóm"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  }
                />
              )}
              {item.type === 'feature' && (
                <FeatureItem
                  feature={item.data as FeatureState} level={item.level} levelOffset={item.levelOffset}
                  selected={selectedFeatureId === item.id}
                  onSelect={() => { selectFeature(item.id); setSelectedGroup((item.data as FeatureState).group_id!); }}
                  onZoomTo={() => zoomTo(item.id, 'feature')}
                  onMouseDown={(e) => handleVirtualDragStart(e, 'feature', item.id)}
                  onDelete={() => setDeleteModal({ isOpen: true, type: 'feature', id: item.id, name: item.data.name })}
                  index={featureNumbers[item.id] ?? (index + 1)}
                  expanded={!!expanded[item.id]}
                  hasChildren={false}
                  onToggleExpand={() => { }}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'feature', id: item.id, data: item.data }); }}
                />
              )}
            </div>
          )}
        />
      </div>

      <ExplorerModals
        themeGroupId={themeGroupId} setThemeGroupId={setThemeGroupId}
        groupName={groupsMap[themeGroupId!]?.name}
        mappingData={mappingData} setMappingData={setMappingData}
        handleMappingConfirm={handleMappingConfirm}
        deleteModal={deleteModal} setDeleteModal={setDeleteModal} confirmDelete={confirmDelete}
      />
    </div>
  );
}
