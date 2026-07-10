import React, { useState, useEffect, useRef } from "react";
import { Database, FolderPlus, Trash2, FileUp, Palette } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { open } from "@tauri-apps/plugin-dialog";

import { cn } from "@TOOL/utils/cn";
import { TreeItem } from "@DESIGN/components/core/CADPanels/TreeItem";
import { FeatureItem } from "@DESIGN/components/core/CADPanels/FeatureItem";
import { useDesignSync, EMPTY_OBJ } from "@IMPLEMENT/stores/useDesignSync";
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
  const regionsMap = useDesignSync(st => st.state?.regions) || (EMPTY_OBJ as Record<string, RegionState>);
  const layersMap = useDesignSync(st => st.state?.layers) || (EMPTY_OBJ as Record<string, LayerState>);
  const groupsMap = useDesignSync(st => st.state?.feature_groups) || (EMPTY_OBJ as Record<string, FeatureGroupState>);
  const featuresMap = useDesignSync(st => st.state?.features) || (EMPTY_OBJ as Record<string, FeatureState>);

  const selectedFeatureId = useDesignSync(st => st.selectedFeatureId);
  const selectedGroupId = useDesignSync(st => st.selectedGroupId);
  const selectFeature = useDesignSync(st => st.selectFeature);
  const setSelectedGroup = useDesignSync(st => st.setSelectedGroup);
  const dispatchEvent = useDesignSync(st => st.dispatchEvent);
  const dispatchEvents = useDesignSync(st => st.dispatchEvents);
  const zoomTo = useDesignSync(st => st.zoomTo);
  const selectionSet = useDesignSync(st => st.selectionSet);
  const deleteSelectedFeatures = useDesignSync(st => st.deleteSelectedFeatures);
  const projectId = useDesignSync(st => st.projectId);
  const isLoading = useDesignSync(st => st.isLoading);
  const error = useDesignSync(st => st.error);
  const mapHiddenIds = useDesignSync(st => st.mapHiddenIds);
  const toggleMapHidden = useDesignSync(st => st.toggleMapHidden);
  const clearSelection = useDesignSync(st => st.clearSelection);
  const isReady = useDesignSync(st => !!st.state);

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
    featuresRef, groupsRef, regionsRef: regionsRef as any, dispatchEvents, selectionSet, clearSelection
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [themeGroupId, setThemeGroupId] = useState<string | null>(null);
  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: null, id: '', name: '' });

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

  useEffect(() => {
    if (selectedFeatureId && flattenedItems.length > 0 && virtuosoRef.current) {
      const idx = flattenedItems.findIndex(item => item.type === 'feature' && item.id === selectedFeatureId);
      if (idx !== -1) {
        setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' }), 150);
      }
    }
  }, [selectedFeatureId, flattenedItems]);

  const handleCreateRegion = (e: React.MouseEvent) => {
    if (!isReady) return;
    e.stopPropagation();
    const name = prompt("Tên dự án mới:");
    if (!name) return;
    const regionId = crypto.randomUUID();
    const layerId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    dispatchEvents([
      { type: 'RegionCreated', payload: { id: regionId, parent_id: null, name } },
      { type: 'LayerCreated', payload: { id: layerId, region_id: regionId, name: 'Lớp mặc định' } },
      { type: 'FeatureGroupCreated', payload: { id: groupId, layer_id: layerId, parent_id: null, name: 'Nhóm mặc định', group_type: 'FOLDER' } }
    ]);
    setExpanded(prev => ({ ...prev, [regionId]: true, [groupId]: true }));
  };

  const handleCreateGroup = (regionId: string, e: React.MouseEvent, _parentGroupId?: string) => {
    if (!isReady) return;
    e.stopPropagation();
    const name = prompt("Tên nhóm mới:");
    if (!name) return;
    const layer = Object.values(layersMap).find((l: LayerState) => l.region_id === regionId);
    if (!layer) return;
    const groupId = crypto.randomUUID();
    dispatchEvent({ type: 'FeatureGroupCreated', payload: { id: groupId, layer_id: layer.id, parent_id: null, name, group_type: 'FOLDER' } });
    setExpanded(prev => ({ ...prev, [regionId]: true, [groupId]: true }));
  };

  const handleImportToGroup = async (groupId: string) => {
    const file = await open({ multiple: false, filters: [{ name: 'Data', extensions: ['xlsx', 'xls', 'csv', 'kml', 'kmz'] }] });
    if (!file) return;
    const filePath = typeof file === 'string' ? file : file.path;
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['xlsx', 'xls', 'csv'].includes(ext!)) {
      const headers = await getExcelHeaders(filePath);
      setMappingData({ headers, filename: fileName, groupId, filePath });
    } else if (['kml', 'kmz'].includes(ext!)) {
      await importFromKML(filePath);
      setSelectedGroup(groupId);
    }
  };

  const handleMappingConfirm = async (mapping: ImportMapping) => {
    if (!mappingData) return;
    await importFromExcel(mappingData.filePath);
    setSelectedGroup(mappingData.groupId);
    setMappingData(null);
  };

  const handleToggleVisible = (type: 'region' | 'group' | 'feature', id: string, _data: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'region') {
      const layer = Object.values(layersMap).find((l: LayerState) => l.region_id === id);
      if (layer) toggleMapHidden(layer.id);
    } else if (type === 'group' || type === 'feature') {
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
  if (isLoading) return <div className="p-6 text-center text-cad-accent animate-pulse">Syncing...</div>;
  if (!isReady) return <div className="p-6 text-center text-cad-text-muted">No design state loaded</div>;

  return (
    <div className="text-cad-text-primary px-3 py-2 text-[10px] font-mono flex flex-col h-full overflow-hidden">
      <ExplorerHeader 
        treeSearchQuery={treeSearchQuery} 
        setTreeSearchQuery={setTreeSearchQuery} 
        onCreateRegion={handleCreateRegion} 
        disabled={isLoading}
      />
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
                      <button 
                        onClick={isLoading ? undefined : (e) => handleCreateGroup(item.id, e)} 
                        className={cn("p-0.5 hover:bg-cad-accent rounded", isLoading && "opacity-20 cursor-not-allowed")}
                        disabled={isLoading}
                      >
                        <FolderPlus size={10} />
                      </button>
                      <button 
                        onClick={isLoading ? undefined : (e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'region', id: item.id, name: item.data.name }); }} 
                        className={cn("p-0.5 hover:bg-red-500 rounded", isLoading && "opacity-20 cursor-not-allowed")}
                        disabled={isLoading}
                      >
                        <Trash2 size={10} />
                      </button>
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
                        title="Theme"
                      >
                        <Palette size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImportToGroup(item.id); }}
                        className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Import"
                      >
                        <FileUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'group', id: item.id, name: item.data.name }); }}
                        className="p-1 hover:bg-red-500/20 rounded text-red-500/60 hover:text-red-500 transition-colors"
                        title="Delete Group"
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
      
      {/* Context Menu Overlay */}
      {contextMenu && (
        <div 
          className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl py-1 min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button className="w-full text-left px-3 py-1.5 text-[9px] hover:bg-white/5 transition-colors uppercase tracking-wider font-bold">Properties</button>
          <button 
            className="w-full text-left px-3 py-1.5 text-[9px] hover:bg-red-500/10 text-red-400 transition-colors uppercase tracking-wider font-bold" 
            onClick={() => setDeleteModal({ isOpen: true, type: contextMenu.type as any, id: contextMenu.id, name: contextMenu.data.name })}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
