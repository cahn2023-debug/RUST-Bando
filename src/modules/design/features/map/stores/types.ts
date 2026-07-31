import type { MapState } from '@CONTRACT/types';
import type {
    DesignEventType,
    DesignActionResponse,
    DesignBulkActionResponse,
    SelectionSummary
} from '@CONTRACT/designTypes';
import type { NetworkConnectionDraft } from '../network/NetworkEndpoint';
import type { ProjectBootstrap } from '@TOOL/utils/designIpc';

export type {
    DesignEventType,
    DesignActionResponse,
    DesignBulkActionResponse,
    SelectionSummary
};

export const EMPTY_OBJ = {};

export type MapRenderEngine = 'maplibre-fast';

export interface MapRenderMetrics {
    engine: MapRenderEngine;
    lodLevel: 'full' | 'detail' | 'summary';
    featureCount: number;
    viewportQueryMs: number;
    sourceBuildMs: number;
    mapLibreSetDataMs: number;
    frameMs: number;
    sampleCount: number;
    p50FrameMs: number;
    p95FrameMs: number;
}

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
    visibleFeatures: Record<string, MapState['features'][string]>;
    visibleFeatureIds: string[];
    featureDetailsCache: Record<string, MapState['features'][string]>;
    viewportRevision: number;
    isViewportLoading: boolean;
    viewportFeatureTotal: number;
    isViewportTruncated: boolean;
    mapRenderEngine: MapRenderEngine;
    renderMetrics: MapRenderMetrics | null;

    applyPatchToState: (response: DesignActionResponse | DesignBulkActionResponse) => void;
    applyQueuedAckToState: (response: DesignActionResponse | DesignBulkActionResponse) => void;
    applyEventsOptimistically: (events: DesignEventType[]) => void;
    throttledSetState: (newState: MapState) => void;
    updateSettings: (settings: any) => Promise<void>;
    setIsSaving: (isSaving: boolean) => void;
    setViewportFeatures: (features: MapState['features'][string][], total: number, truncated: boolean) => void;
    setViewportLoading: (isLoading: boolean) => void;
    setMapRenderEngine: (engine: MapRenderEngine) => void;
    setRenderMetrics: (metrics: MapRenderMetrics) => void;
    cacheFeatureDetail: (feature: MapState['features'][string]) => void;
    
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
    networkConnectionDraft: NetworkConnectionDraft | null;

    setDrawingMode: (mode: DrawingSlice['drawingMode']) => void;
    setEditingFeatureId: (id: string | null) => void;
    setActiveParentFeature: (id: string | null) => void;
    addDrawingPoint: (lat: number, lng: number, snapId?: string | null) => void;
    clearDrawingPoints: () => void;
    setSnappedPoint: (point: DrawingSlice['snappedPoint']) => void;
    setNetworkConnectionDraft: (draft: NetworkConnectionDraft | null) => void;
    clearNetworkConnectionDraft: () => void;

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
    previewMetadata: { id: string, metadata: any, name?: string } | null;
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
    setPreview: (id: string | null, metadata: any | null, name?: string) => void;
    setGroupThemePreview: (groupId: string | null, config: any | null) => void;
    setSearchResultMarker: (marker: UIControlSlice['searchResultMarker']) => void;
    setPrintArea: (bounds: [number, number, number, number] | null) => void;
};

export type InitializationSlice = {
    initialize: (projectId: string, projectPath?: string, options?: { forceReload?: boolean; bootstrap?: ProjectBootstrap }) => Promise<void>;
    reset: () => void;
    setMockState: (state: MapState, projectId: string, projectKey?: string) => void;
    unsubscribeFirestore: (() => void) | null;

    // Pegman status
    pegmanState: {
        active: boolean;
        location: [number, number] | null;
        heading: number;
        fov: number;
        windowOpen?: boolean;
        source?: 'map' | 'streetview';
        lastSyncAt?: number;
        featureId?: string | null;
    };
    setPegmanState: (state: Partial<InitializationSlice['pegmanState']>) => void;
};

export type UISyncSlice = {
    isOnline: boolean;
    pendingSync: boolean;
    isMigrating: boolean;
    isSaving: boolean;
    lastSync: number | null;
    syncStatus: number;
    error: string | null;
    unsubscribeFirestore: (() => void) | null;

    setIsSaving: (isSaving: boolean) => void;
    setPendingSync: (pending: boolean) => void;
    setError: (error: string | null) => void;
    setupSyncListeners: () => Promise<void>;
    syncWithBackend: (projectId: string, events: DesignEventType[]) => Promise<DesignBulkActionResponse | DesignActionResponse>;
    _internalBufferedSyncEvent: (event: DesignEventType) => Promise<DesignBulkActionResponse | DesignActionResponse | undefined>;
    _internalBufferedSyncEvents: (events: DesignEventType[]) => Promise<DesignBulkActionResponse | DesignActionResponse | undefined>;
    flushPendingPersists: () => Promise<void>;
    _undo: (projectId: string) => Promise<void>;
    _redo: (projectId: string) => Promise<void>;
    _deduplicate: (projectId: string) => Promise<void>;
    syncWithFirestore: (projectId: string, data: unknown) => Promise<void>;
};

export type DesignActionSlice = {
    dispatchEvent: (event: DesignEventType) => Promise<void>;
    dispatchEvents: (events: DesignEventType[]) => Promise<void>;
    queueEvent: (event: DesignEventType) => Promise<void>;
    queueEvents: (events: DesignEventType[]) => Promise<void>;
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
    DesignActionSlice &
    UISyncSlice;
