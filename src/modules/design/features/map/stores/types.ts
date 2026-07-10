import type { MapState } from '@CONTRACT/types';
import type {
    DesignEventType,
    DesignActionResponse,
    DesignBulkActionResponse,
    SelectionSummary
} from '@CONTRACT/designTypes';

export type {
    DesignEventType,
    DesignActionResponse,
    DesignBulkActionResponse,
    SelectionSummary
};

export const EMPTY_OBJ = {};

export type MapStateSlice = {
    state: MapState | null;
    projectId: string | null;
    projectPath: string | null;
    projectKey: string | null;
    isLoading: boolean;
    isHydrating: boolean;
    error: string | null;
    lastSync: number | null;
    isOnline: boolean;
    pendingSync: boolean;
    isMigrating: boolean;
    isSaving: boolean;
    lastDispatchTime: Record<string, number>;
    syncStatus: number;

    applyPatchToState: (response: DesignActionResponse | DesignBulkActionResponse) => void;
    applyQueuedAckToState: (response: DesignActionResponse | DesignBulkActionResponse) => void;
    applyEventsOptimistically: (events: DesignEventType[]) => void;
    throttledSetState: (newState: MapState) => void;
    updateSettings: (settings: any) => Promise<void>;
    setIsSaving: (isSaving: boolean) => void;
    
    // Giai đoạn 5: Optimistic UI
    pendingSyncEvents: Array<{ id: string, payload: any }>;
    updateEntityMetadataOptimistic: (entityType: string, entityId: string, metadata: any) => Promise<void>;
};

export type SelectionSlice = {
    selectedFeatureId: string | null;
    selectedGroupId: string | null;
    selectedPopupLocation: [number, number] | null;
    hoverId: string | null;
    selectionSet: Set<string>;
    boxSelection: SelectionSummary | null;

    selectFeature: (id: string | null, keepSelection?: boolean, location?: [number, number]) => void;
    setHoverId: (id: string | null) => void;
    setBoxSelection: (summary: SelectionSummary | null) => void;
    toggleSelection: (id: string) => void;
    selectAll: (ids: string[]) => void;
    clearSelection: () => void;
    setSelectedGroup: (id: string | null) => void;
};

export type DrawingSlice = {
    drawingMode: 'none' | 'point' | 'polyline' | 'image' | 'intersection' | 'move' | 'print_area';
    editingFeatureId: string | null;
    currentDrawingPoints: [number, number][];
    currentDrawingSnapIds: (string | null)[];
    snappedPoint: { x: number, y: number, id?: string } | null;
    activeParentFeatureId: string | null;

    setDrawingMode: (mode: DrawingSlice['drawingMode']) => void;
    setEditingFeatureId: (id: string | null) => void;
    setActiveParentFeature: (id: string | null) => void;
    addDrawingPoint: (lat: number, lng: number, snapId?: string | null) => void;
    clearDrawingPoints: () => void;
    setSnappedPoint: (point: DrawingSlice['snappedPoint']) => void;

    // High-level drawing actions
    setDrawingPoint: (index: number, lat: number, lng: number, snapId?: string | null) => Promise<void>;
    insertDrawingPoint: (index: number, lat: number, lng: number) => Promise<void>;
    deleteDrawingPoint: (index: number) => Promise<void>;
};

export type UIControlSlice = {
    isCoordinatePanelOpen: boolean;
    showDORILayers: boolean;
    showDORIHeatmap: boolean;
    showFeatureGroups: boolean;
    showNotes: boolean;
    showQr: boolean;
    showCode: boolean;
    isAnyDialogOpen: boolean;
    zoomExtendTrigger: number;
    zoomToTrigger: {
        id: string,
        type: 'feature' | 'group' | 'layer' | 'region' | 'location',
        location?: [number, number],
        timestamp: number
    } | null;
    previewMetadata: { id: string, metadata: any } | null;
    groupThemePreview: { groupId: string, config: any } | null;
    searchResultMarker: { lat: number, lng: number, name: string } | null;
    printArea: [number, number, number, number] | null;
    /** IDs of layers/groups hidden ON MAP ONLY (not hidden in Project Explorer tree) */
    mapHiddenIds: Set<string>;

    toggleCoordinatePanel: () => void;
    setShowDORILayers: (show: boolean) => void;
    setShowDORIHeatmap: (show: boolean) => void;
    setShowFeatureGroups: (show: boolean) => void;
    setShowNotes: (show: boolean) => void;
    setShowQr: (show: boolean) => void;
    setShowCode: (show: boolean) => void;
    setAnyDialogOpen: (open: boolean) => void;
    triggerZoomExtend: () => void;
    zoomTo: (id: string, type: 'feature' | 'group' | 'layer' | 'region' | 'location', location?: [number, number]) => void;
    /** Toggle map visibility for a layer/group (only affects map, not Explorer tree) */
    toggleMapHidden: (id: string) => void;
    setPreview: (id: string | null, metadata: any | null) => void;
    setGroupThemePreview: (groupId: string | null, config: any | null) => void;
    setSearchResultMarker: (marker: UIControlSlice['searchResultMarker']) => void;
    setPrintArea: (bounds: [number, number, number, number] | null) => void;
};

export type InitializationSlice = {
    initialize: (projectId: string, projectPath?: string) => Promise<void>;
    reset: () => void;
    setMockState: (state: MapState, projectId: string, projectKey?: string) => void;
    unsubscribeFirestore: (() => void) | null;

    // Pegman status
    pegmanState: {
        active: boolean;
        location: [number, number] | null;
        heading: number;
        fov: number;
    };
    setPegmanState: (state: Partial<InitializationSlice['pegmanState']>) => void;
};

export type DesignActionSlice = {
    dispatchEvent: (event: DesignEventType) => Promise<void>;
    dispatchEvents: (events: DesignEventType[]) => Promise<void>;
    queueEvent: (event: DesignEventType) => Promise<void>;
    queueEvents: (events: DesignEventType[]) => Promise<void>;
    flushPendingPersists: () => Promise<void>;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    deduplicate: () => Promise<void>;
    deleteFeature: (id: string) => Promise<void>;
    deleteSelectedFeatures: () => Promise<void>;
    syncDisplayOrderWithSTT: () => Promise<void>;
};

export type DesignSyncStore =
    MapStateSlice &
    SelectionSlice &
    DrawingSlice &
    UIControlSlice &
    InitializationSlice &
    DesignActionSlice;
