import React, { useState, useEffect, useRef } from "react";
import { Database, FolderPlus, Trash2, FileUp, Palette, MapPin } from "lucide-react";
import { Virtuoso, type ListRange, type VirtuosoHandle } from "react-virtuoso";
import { open } from "@tauri-apps/plugin-dialog";

import { cn } from "@TOOL/utils/cn";
import { TreeItem } from "@DESIGN/components/core/CADPanels/TreeItem";
import { FeatureItem } from "@DESIGN/components/core/CADPanels/FeatureItem";
import { useDesignSync, EMPTY_OBJ } from "@IMPLEMENT/stores/useDesignSync";
import { useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";
import { importFromExcel, importFromKML, getExcelHeaders, applyImportedRecords, type ImportMapping } from "@IMPLEMENT/services/importService";
import { ImportReviewDialog } from "@IMPLEMENT/components/import/ImportReviewDialog";
import {
  ExplorerHeader,
  ExplorerFilterBar,
  ExplorerModals,
  useFlattenedTree,
  useVirtualDrag
} from "./Explorer";
import { GroupIcon } from "@DESIGN/components/core/CADPanels/GroupIcon";
import { getFeatureDisplayInfo, getParsedMetadata } from "@TOOL/utils/featureUtils";
import type { RegionState, LayerState, FeatureGroupState, FeatureState, FeatureCoordinates } from "@CONTRACT/types";
import type { FlatTreeItem } from "@DESIGN/components/core/CADPanels/Explorer/useFlattenedTree";

interface MappingData {
  headers: string[];
  filename: string;
  groupId: string;
  filePath: string;
}

interface ReviewData {
  fileName: string;
  groupId: string;
  sourceLabel: string;
  records: Awaited<ReturnType<typeof importFromExcel>>;
}

interface DeleteModalState {
  isOpen: boolean;
  type: 'region' | 'group' | 'layer' | 'feature' | 'featureChildren' | null;
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

interface CoordinateEditorState {
  featureId: string;
  name: string;
  geomType: string;
  value: string;
  error: string | null;
}

type SortField = 'name' | 'stt';

interface ExplorerViewState {
  expanded: Record<string, boolean>;
  treeSearchQuery: string;
  filterType: string | null;
  reverseOrder: boolean;
  sortField: SortField;
  topItemId: string | null;
  topItemIndex: number;
  selectedGroupId: string | null;
}

const defaultExplorerViewState: ExplorerViewState = {
  expanded: {},
  treeSearchQuery: "",
  filterType: null,
  reverseOrder: false,
  sortField: 'name',
  topItemId: null,
  topItemIndex: 0,
  selectedGroupId: null,
};

const getExplorerViewStateKey = (projectId: string | null | undefined) =>
  projectId ? `drawing-explorer-view-${projectId}` : null;

const hasSavedExplorerViewState = (projectId: string | null | undefined): boolean => {
  const viewStateKey = getExplorerViewStateKey(projectId);
  if (!viewStateKey || !projectId) return false;

  try {
    return localStorage.getItem(viewStateKey) !== null ||
      localStorage.getItem(`drawing-explorer-expanded-${projectId}`) !== null;
  } catch {
    return false;
  }
};

const readExplorerViewState = (projectId: string | null | undefined): ExplorerViewState => {
  const viewStateKey = getExplorerViewStateKey(projectId);
  if (!viewStateKey) return defaultExplorerViewState;

  try {
    const saved = localStorage.getItem(viewStateKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ExplorerViewState>;
      return {
        ...defaultExplorerViewState,
        ...parsed,
        expanded: parsed.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : {},
        sortField: parsed.sortField === 'stt' ? 'stt' : 'name',
        topItemIndex: typeof parsed.topItemIndex === 'number' ? parsed.topItemIndex : 0,
      };
    }

    const legacyExpanded = localStorage.getItem(`drawing-explorer-expanded-${projectId}`);
    return legacyExpanded
      ? { ...defaultExplorerViewState, expanded: JSON.parse(legacyExpanded) }
      : defaultExplorerViewState;
  } catch {
    return defaultExplorerViewState;
  }
};

const hasStringId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const formatCoordinateValue = (coordinates: FeatureCoordinates | string | null | undefined): string => {
  if (coordinates == null) return "";
  if (typeof coordinates === "string") return coordinates;
  return JSON.stringify(coordinates);
};

const isNumberPair = (value: unknown): value is [number, number] =>
  Array.isArray(value)
  && value.length === 2
  && typeof value[0] === "number"
  && typeof value[1] === "number"
  && Number.isFinite(value[0])
  && Number.isFinite(value[1]);

export const parseCoordinateInput = (input: string, geomType: string): FeatureCoordinates => {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Vui lòng nhập tọa độ.");

  const normalizedGeomType = geomType.toLowerCase();
  const isPoint = normalizedGeomType === "point";

  if (isPoint && !trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    const parts = trimmed.split(/[,\s]+/).filter(Boolean).map(part => Number(part));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return [parts[0], parts[1]];
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(isPoint ? "Tọa độ point cần dạng lng, lat hoặc [lng, lat]." : "Tọa độ cần là JSON array hợp lệ.");
  }

  if (isPoint) {
    if (isNumberPair(parsed)) return parsed;
    throw new Error("Tọa độ point cần đúng dạng [lng, lat].");
  }

  if (Array.isArray(parsed)) return parsed as FeatureCoordinates;
  throw new Error("Tọa độ line/polygon cần là JSON array.");
};

export const buildExpandedPathForFeature = (
  featureId: string,
  featuresMap: Record<string, FeatureState>,
  layersMap: Record<string, LayerState>,
  groupsMap: Record<string, FeatureGroupState>
): Record<string, boolean> => {
  const feature = featuresMap[featureId];
  if (!feature) return {};

  const nextExpanded: Record<string, boolean> = {};
  const visitedGroups = new Set<string>();
  const visitedFeatures = new Set<string>();

  const expandRegionForLayer = (layerId?: string | null) => {
    if (!layerId) return;
    const regionId = layersMap[layerId]?.region_id;
    if (regionId) nextExpanded[regionId] = true;
  };

  const expandGroupChain = (groupId?: string | null) => {
    let currentGroupId = groupId;
    while (currentGroupId && !visitedGroups.has(currentGroupId)) {
      visitedGroups.add(currentGroupId);
      const group = groupsMap[currentGroupId];
      if (!group) break;

      nextExpanded[group.id] = true;

      if (group.parent_id) {
        currentGroupId = group.parent_id;
      } else {
        expandRegionForLayer(group.layer_id);
        break;
      }
    }
  };

  let currentFeature: FeatureState | undefined = feature;
  while (currentFeature && !visitedFeatures.has(currentFeature.id)) {
    visitedFeatures.add(currentFeature.id);
    expandGroupChain(currentFeature.group_id);
    expandRegionForLayer(currentFeature.layer_id);

    const parentFeatureId: unknown = getParsedMetadata(currentFeature).parent_feature_id;
    if (!hasStringId(parentFeatureId)) break;

    nextExpanded[`feature-${parentFeatureId}`] = true;
    currentFeature = featuresMap[parentFeatureId];
  }

  return nextExpanded;
};

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
  const toggleSelection = useDesignSync(st => st.toggleSelection);
  const selectAll = useDesignSync(st => st.selectAll);
  const deleteSelectedFeatures = useDesignSync(st => st.deleteSelectedFeatures);
  const projectId = useDesignSync(st => st.projectId);
  const isLoading = useDesignSync(st => st.isLoading);
  const error = useDesignSync(st => st.error);
  const mapHiddenIds = useDesignSync(st => st.mapHiddenIds);
  const toggleMapHidden = useDesignSync(st => st.toggleMapHidden);
  const clearSelection = useDesignSync(st => st.clearSelection);
  const setPreview = useDesignSync(st => st.setPreview);
  const isReady = useDesignSync(st => !!st.state);
  const specPanelVisible = useLayoutStore(st => st.paletteConfigs['spec-panel']?.isVisible ?? false);
  const togglePalette = useLayoutStore(st => st.togglePalette);
  const expandPalette = useLayoutStore(st => st.expandPalette);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  
  const featuresRef = useRef(featuresMap);
  const groupsRef = useRef(groupsMap);
  const regionsRef = useRef(regionsMap);

  useEffect(() => { featuresRef.current = featuresMap; }, [featuresMap]);
  useEffect(() => { groupsRef.current = groupsMap; }, [groupsMap]);
  useEffect(() => { regionsRef.current = regionsMap; }, [regionsMap]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeSearchQuery, setTreeSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [reverseOrder, setReverseOrder] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [topItem, setTopItem] = useState<{ id: string | null; index: number }>({ id: null, index: 0 });
  const restoredProjectRef = useRef<string | null>(null);
  const isRestoringViewStateRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ id: string | null; index: number } | null>(null);
  const hasAutoExpanded = useRef(false);
  const lastSelectedFeatureIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId || restoredProjectRef.current === projectId) return;

    hasAutoExpanded.current = hasSavedExplorerViewState(projectId);
    const savedViewState = readExplorerViewState(projectId);
    isRestoringViewStateRef.current = true;
    setExpanded(savedViewState.expanded);
    setTreeSearchQuery(savedViewState.treeSearchQuery);
    setFilterType(savedViewState.filterType);
    setReverseOrder(savedViewState.reverseOrder);
    setSortField(savedViewState.sortField);
    setTopItem({ id: savedViewState.topItemId, index: savedViewState.topItemIndex });
    pendingScrollRestoreRef.current = { id: savedViewState.topItemId, index: savedViewState.topItemIndex };
    if (savedViewState.selectedGroupId) setSelectedGroup(savedViewState.selectedGroupId);
    restoredProjectRef.current = projectId;
  }, [projectId, setSelectedGroup]);

  useEffect(() => {
    const viewStateKey = getExplorerViewStateKey(projectId);
    if (!viewStateKey || restoredProjectRef.current !== projectId) return;
    if (isRestoringViewStateRef.current) {
      isRestoringViewStateRef.current = false;
      return;
    }

    const viewState: ExplorerViewState = {
      expanded,
      treeSearchQuery,
      filterType,
      reverseOrder,
      sortField,
      topItemId: topItem.id,
      topItemIndex: topItem.index,
      selectedGroupId,
    };

    localStorage.setItem(viewStateKey, JSON.stringify(viewState));
    localStorage.setItem(`drawing-explorer-expanded-${projectId}`, JSON.stringify(expanded));
  }, [expanded, filterType, projectId, reverseOrder, selectedGroupId, sortField, topItem, treeSearchQuery]);

  const { flattenedItems, filteredRegions, featureNumbers, featureChildrenMap } = useFlattenedTree({
    regionsMap, layersMap, groupsMap, featuresMap, expanded,
    treeSearchQuery, filterType, reverseOrder, sortField
  });

  const { isVirtualDragging: _isVirtualDragging, handleVirtualDragStart } = useVirtualDrag({
    featuresRef, groupsRef, regionsRef: regionsRef as any, dispatchEvents, selectionSet, clearSelection
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [themeGroupId, setThemeGroupId] = useState<string | null>(null);
  const [themeTargetFeatureIds, setThemeTargetFeatureIds] = useState<string[] | undefined>(undefined);
  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: null, id: '', name: '' });
  const [coordinateEditor, setCoordinateEditor] = useState<CoordinateEditorState | null>(null);

  useEffect(() => {
    if (!selectedFeatureId) return;

    const expandedPath = buildExpandedPathForFeature(selectedFeatureId, featuresMap, layersMap, groupsMap);
    const keysToOpen = Object.keys(expandedPath);
    if (keysToOpen.length === 0) return;

    setExpanded(prev => {
      let changed = false;
      const next = { ...prev };
      keysToOpen.forEach(key => {
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedFeatureId, featuresMap, layersMap, groupsMap]);

  useEffect(() => {
    if (!hasAutoExpanded.current && filteredRegions.length > 0 && !isLoading && !error) {
      setExpanded(prev => {
        const next = { ...prev };
        filteredRegions.forEach(r => { next[r.id] = true; });
        Object.keys(groupsMap).forEach(groupId => { next[groupId] = true; });
        return next;
      });
      hasAutoExpanded.current = true;
    }
  }, [filteredRegions, groupsMap, isLoading, error]);

  useEffect(() => {
    if (selectedFeatureId && flattenedItems.length > 0 && virtuosoRef.current) {
      const idx = flattenedItems.findIndex(item => item.type === 'feature' && item.id === selectedFeatureId);
      if (idx !== -1) {
        setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' }), 150);
      }
    }
  }, [selectedFeatureId, flattenedItems]);

  useEffect(() => {
    const pendingRestore = pendingScrollRestoreRef.current;
    if (!pendingRestore || flattenedItems.length === 0 || selectedFeatureId) return;

    const restoredIndex = pendingRestore.id
      ? flattenedItems.findIndex(item => item.id === pendingRestore.id)
      : pendingRestore.index;
    const index = restoredIndex >= 0
      ? Math.min(restoredIndex, flattenedItems.length - 1)
      : Math.min(pendingRestore.index, flattenedItems.length - 1);

    pendingScrollRestoreRef.current = null;
    setTimeout(() => virtuosoRef.current?.scrollToIndex({ index, align: 'start' }), 150);
  }, [flattenedItems, selectedFeatureId]);

  const handleRangeChanged = (range: ListRange) => {
    const item = flattenedItems[range.startIndex];
    const nextTopItem = { id: item?.id ?? null, index: range.startIndex };
    setTopItem(prev => (
      prev.id === nextTopItem.id && prev.index === nextTopItem.index ? prev : nextTopItem
    ));
  };

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
    const file = await open({ multiple: false, filters: [{ name: 'Data', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb', 'kml', 'kmz'] }] });
    if (!file) return;
    const filePath = typeof file === 'string' ? file : ((file as { path?: string }).path ?? '');
    if (!filePath) return;
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(ext!)) {
      const headers = await getExcelHeaders(filePath);
      setMappingData({ headers, filename: fileName, groupId, filePath });
    } else if (['kml', 'kmz'].includes(ext!)) {
      const records = await importFromKML(filePath);
      setReviewData({ fileName, groupId, sourceLabel: 'KML/KMZ', records });
    }
  };

  const handleMappingConfirm = async (mapping: ImportMapping) => {
    if (!mappingData) return;
    const records = await importFromExcel(mappingData.filePath, mapping);
    setMappingData(null);
    setReviewData({ fileName: mappingData.filename, groupId: mappingData.groupId, sourceLabel: 'Excel', records });
  };

  const handleReviewConfirm = async (records: ReviewData['records']) => {
    if (!reviewData) return;
    await applyImportedRecords(records, reviewData.groupId);
    setSelectedGroup(reviewData.groupId);
    setReviewData(null);
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

  const collectChildFeatureIds = (featureId: string): string[] => {
    const children = featureChildrenMap[featureId] || [];
    return children.flatMap(child => [child.id, ...collectChildFeatureIds(child.id)]);
  };

  const handleOpenFeatureChildrenTheme = (feature: FeatureState, e: React.MouseEvent) => {
    e.stopPropagation();
    const childIds = collectChildFeatureIds(feature.id);
    if (!childIds.length) return;
    setThemeTargetFeatureIds(childIds);
    setThemeGroupId(feature.id);
  };

  const handleToggleFeatureChildrenVisible = (featureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const childIds = collectChildFeatureIds(featureId);
    if (!childIds.length) return;

    const shouldHide = childIds.some(id => !mapHiddenIds.has(id));
    childIds.forEach(id => {
      if (mapHiddenIds.has(id) !== shouldHide) {
        toggleMapHidden(id);
      }
    });
  };

  const handleSelectFeatureFromPanel = (feature: FeatureState, itemIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedFeatureIdRef.current) {
      const featureItems = flattenedItems.filter(item => item.type === 'feature');
      const startIndex = featureItems.findIndex(item => item.id === lastSelectedFeatureIdRef.current);
      const endIndex = featureItems.findIndex(item => item.id === feature.id);

      if (startIndex !== -1 && endIndex !== -1) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        clearSelection();
        selectAll(featureItems.slice(from, to + 1).map(item => item.id));
        selectFeature(feature.id, true);
      } else {
        selectFeature(feature.id);
      }
    } else if (e.ctrlKey || e.metaKey) {
      const wasSelected = selectionSet.has(feature.id);
      toggleSelection(feature.id);
      if (wasSelected && selectedFeatureId === feature.id) {
        selectFeature(null, true);
      } else if (!wasSelected) {
        selectFeature(feature.id, true);
      }
    } else {
      selectFeature(feature.id);
    }

    if (feature.group_id) setSelectedGroup(feature.group_id);
    lastSelectedFeatureIdRef.current = feature.id;
    setTopItem({ id: feature.id, index: itemIndex });
  };

  const confirmDelete = async () => {
    if (!deleteModal.isOpen) return;
    const { type, id } = deleteModal;
    if (type === 'region') dispatchEvent({ type: 'RegionDeleted', payload: { id } });
    else if (type === 'group') dispatchEvent({ type: 'FeatureGroupDeleted', payload: { id } });
    else if (type === 'featureChildren') {
      const childIds = collectChildFeatureIds(id);
      await dispatchEvents(childIds.map(childId => ({ type: 'FeatureDeleted', payload: { id: childId } })));
    }
    else if (type === 'feature') id === 'selected' ? deleteSelectedFeatures() : dispatchEvent({ type: 'FeatureDeleted', payload: { id } });
    setDeleteModal({ isOpen: false, type: null, id: '', name: '' });
  };

  const openCoordinateEditor = (feature: FeatureState) => {
    setCoordinateEditor({
      featureId: feature.id,
      name: feature.name,
      geomType: feature.geom_type || feature.geometry_type || 'Point',
      value: formatCoordinateValue(feature.coordinates),
      error: null,
    });
  };

  const handleProperties = (feature: FeatureState) => {
    selectFeature(feature.id);
    if (feature.group_id) setSelectedGroup(feature.group_id);
    zoomTo(feature.id, 'feature');
    setPreview(feature.id, getParsedMetadata(feature), feature.name);
    if (!specPanelVisible) togglePalette('spec-panel');
    expandPalette('spec-panel');
  };

  const handleCoordinateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordinateEditor) return;

    try {
      const coordinates = parseCoordinateInput(coordinateEditor.value, coordinateEditor.geomType);
      await dispatchEvent({
        type: 'FeatureUpdated',
        payload: {
          id: coordinateEditor.featureId,
          coordinates,
        },
      });
      selectFeature(coordinateEditor.featureId);
      zoomTo(coordinateEditor.featureId, 'feature');
      setCoordinateEditor(null);
    } catch (error) {
      setCoordinateEditor(prev => prev ? {
        ...prev,
        error: error instanceof Error ? error.message : 'Tọa độ không hợp lệ.',
      } : prev);
    }
  };

  if (error) return <div className="p-6 text-center text-cad-danger">{error}</div>;
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
          rangeChanged={handleRangeChanged}
          itemContent={(index: number, item: FlatTreeItem) => (
            <div
              key={item.id}
              data-drag-id={item.type === 'region' || item.type === 'group' || item.type === 'feature' ? item.id : undefined}
              data-drag-type={item.type === 'region' || item.type === 'group' || item.type === 'feature' ? item.type : undefined}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: item.type, id: item.id, data: item.data }); }}
            >
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
                        className={cn("p-0.5 hover:bg-cad-danger rounded", isLoading && "opacity-20 cursor-not-allowed")}
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
                    selectedGroupId === item.id ? "bg-cad-accent/10 border-l-2 border-cad-accent" : ""
                  )}
                  icon={<GroupIcon type={(item.data as FeatureGroupState).type} name={item.data.name} color={(item.data as FeatureGroupState).is_visible === false ? "#94a3b8" : "#fbbf24"} />}
                  onRename={(newName) => dispatchEvent({ type: 'FeatureGroupUpdated', payload: { id: item.id, name: newName } })}
                  onToggleVisible={(e) => handleToggleVisible('group', item.id, item.data, e)}
                  visible={!mapHiddenIds.has(item.id)}
                  customAction={
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setThemeTargetFeatureIds(undefined); setThemeGroupId(item.id); }}
                        className="p-1 hover:bg-cad-accent/20 rounded text-cad-accent hover:text-cad-active transition-colors"
                        title="Theme"
                      >
                        <Palette size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImportToGroup(item.id); }}
                        className="p-1 hover:bg-cad-accent/20 rounded text-cad-accent hover:text-cad-active transition-colors"
                        title="Import"
                      >
                        <FileUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'group', id: item.id, name: item.data.name }); }}
                        className="p-1 hover:bg-cad-danger/20 rounded text-cad-danger/60 hover:text-cad-danger transition-colors"
                        title="Delete Group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  }
                />
              )}
              {item.type === 'feature' && (
                (() => {
                  const feature = item.data as FeatureState;
                  const childIds = collectChildFeatureIds(feature.id);
                  const hasChildren = childIds.length > 0;
                  const isIntersectionWithChildren = hasChildren && getFeatureDisplayInfo(feature).isIntersection;
                  const childrenVisible = childIds.some(id => !mapHiddenIds.has(id));

                  return (
                    <FeatureItem
                      feature={feature} level={item.level} levelOffset={item.levelOffset}
                      selected={selectionSet.has(item.id) || selectedFeatureId === item.id}
                      onSelect={(e) => handleSelectFeatureFromPanel(feature, index, e)}
                      onZoomTo={() => zoomTo(item.id, 'feature')}
                      onMouseDown={(e) => handleVirtualDragStart(e, 'feature', item.id)}
                      onDelete={() => setDeleteModal({
                        isOpen: true,
                        type: isIntersectionWithChildren ? 'featureChildren' : 'feature',
                        id: item.id,
                        name: feature.name
                      })}
                      index={featureNumbers[item.id] ?? (index + 1)}
                      expanded={!!expanded[`feature-${item.id}`]}
                      hasChildren={hasChildren}
                      onToggleExpand={() => setExpanded(p => ({ ...p, [`feature-${item.id}`]: !p[`feature-${item.id}`] }))}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'feature', id: item.id, data: item.data }); }}
                      visible={isIntersectionWithChildren ? childrenVisible : !mapHiddenIds.has(item.id)}
                      onToggleVisible={isIntersectionWithChildren ? (e) => handleToggleFeatureChildrenVisible(item.id, e) : (e) => handleToggleVisible('feature', item.id, item.data, e)}
                      customAction={isIntersectionWithChildren ? (
                        <button
                          onClick={(e) => handleOpenFeatureChildrenTheme(feature, e)}
                          className="p-0.5 hover:bg-cad-accent/20 rounded text-cad-accent hover:text-cad-active transition-colors"
                          title="Chỉnh giao diện đối tượng trong nút giao"
                        >
                          <Palette size={10} />
                        </button>
                      ) : null}
                    />
                  );
                })()
              )}
            </div>
          )}
        />
      </div>

      <ExplorerModals
        themeGroupId={themeGroupId}
        setThemeGroupId={(id) => {
          if (!id) setThemeTargetFeatureIds(undefined);
          setThemeGroupId(id);
        }}
        groupName={groupsMap[themeGroupId!]?.name || featuresMap[themeGroupId!]?.name}
        themeTargetFeatureIds={themeTargetFeatureIds}
        mappingData={mappingData} setMappingData={setMappingData}
        handleMappingConfirm={handleMappingConfirm}
        deleteModal={deleteModal}
        setDeleteModal={setDeleteModal}
        confirmDelete={confirmDelete}
      />
      {reviewData && (
        <ImportReviewDialog
          open={true}
          fileName={reviewData.fileName}
          sourceLabel={reviewData.sourceLabel}
          records={reviewData.records}
          onClose={() => setReviewData(null)}
          onConfirm={handleReviewConfirm}
        />
      )}

      {coordinateEditor && (
        <div className="fixed inset-0 z-cad-modal flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCoordinateSubmit}
            className="w-full max-w-sm rounded-md border border-cad-border bg-cad-surface shadow-2xl"
          >
            <div className="border-b border-cad-border px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
                <MapPin size={14} className="text-cad-accent" />
                Chỉnh sửa tọa độ
              </div>
              <div className="mt-1 truncate text-[9px] text-cad-text-muted">{coordinateEditor.name}</div>
            </div>

            <div className="space-y-2 px-4 py-3">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-cad-text-secondary">
                Tọa độ
              </label>
              <textarea
                value={coordinateEditor.value}
                onChange={(e) => setCoordinateEditor(prev => prev ? { ...prev, value: e.target.value, error: null } : prev)}
                className="h-24 w-full resize-none rounded border border-cad-border bg-cad-bg px-2 py-1.5 font-mono text-[10px] text-cad-text-primary outline-none focus:border-cad-accent"
                placeholder={coordinateEditor.geomType.toLowerCase() === 'point' ? "105.871928, 21.046998" : "[[105.871928,21.046998],[105.872,21.047]]"}
                autoFocus
              />
              <div className="text-[8px] text-cad-text-muted">
                Point: lng, lat hoặc [lng, lat]. Line/Polygon: JSON array.
              </div>
              {coordinateEditor.error && (
                <div className="rounded border border-cad-danger/40 bg-cad-danger/10 px-2 py-1 text-[9px] text-cad-danger">
                  {coordinateEditor.error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-cad-border px-4 py-3">
              <button
                type="button"
                onClick={() => setCoordinateEditor(null)}
                className="rounded border border-cad-border px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-cad-text-secondary hover:bg-cad-elevated"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-cad-accent px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-black hover:bg-cad-active"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Context Menu Overlay */}
      {contextMenu && (
        <div 
          className="fixed z-cad-dropdown bg-cad-surface border border-cad-border rounded-md shadow-2xl py-1 min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.type === 'feature' && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-[9px] text-cad-text-primary hover:bg-cad-elevated transition-colors uppercase tracking-wider font-bold"
                onClick={() => openCoordinateEditor(contextMenu.data as FeatureState)}
              >
                Chỉnh sửa tọa độ
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-[9px] text-cad-text-primary hover:bg-cad-elevated transition-colors uppercase tracking-wider font-bold"
                onClick={() => handleProperties(contextMenu.data as FeatureState)}
              >
                Properties
              </button>
            </>
          )}
          <button 
            className="w-full text-left px-3 py-1.5 text-[9px] hover:bg-cad-danger/10 text-cad-danger transition-colors uppercase tracking-wider font-bold"
            onClick={() => setDeleteModal({ isOpen: true, type: contextMenu.type as any, id: contextMenu.id, name: contextMenu.data.name })}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
