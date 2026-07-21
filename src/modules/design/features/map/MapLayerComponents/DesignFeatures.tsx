import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMap, useMapEvents, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useDesignSync, EMPTY_OBJ } from '@IMPLEMENT/stores/useDesignSync';
import { FeatureState } from '@CONTRACT/types';
import { useFeatureHierarchy, useFeatureNumbering, useVisibleFeatures } from '@IMPLEMENT/hooks/useDesignFeatures';


// Layer Components
import { PointLayer, SelectedFeaturePopupManager } from '@DESIGN/features/map/MapLayerComponents/PointLayer';
import { FOVLayer } from '@DESIGN/features/map/MapLayerComponents/FOVLayer';
import { VectorLayer } from '@DESIGN/features/map/MapLayerComponents/VectorLayer';
import { DrawingLayer } from '@DESIGN/features/map/MapLayerComponents/DrawingLayer';
import { VertexEditor } from '@DESIGN/features/map/MapLayerComponents/VertexEditor';
import { getParsedMetadata } from '@DESIGN/features/map/MapLayerComponents/SharedMapComponents';
import { getFeatureDisplayInfo, getParsedCoordinates } from '@TOOL/utils/featureUtils';
import { isRenderableFeatureGeometry } from '@TOOL/utils/featurePersistence';

const metadataString = (value: unknown) => (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : null
);

const ZOOM_THRESHOLD = 19;
const BOUNDS_DEBOUNCE_MS = 150;
const REPORT_CAPTURE_EVENT = 'design-report-map-capture';

const canReadMapBounds = (map: L.Map) => {
    try {
        return Boolean((map as any)?._loaded && map.getPane('mapPane'));
    } catch {
        return false;
    }
};

/**
 * Orchestrator component for Map Design Features.
 * Manages the high-level rendering of different map layers and their interactions.
 */
export const DesignFeatures = () => {
    // 1. Data Subscriptions (Individual selectors for stability and performance)
    const rawFeatures = useDesignSync(state => state.state?.features || (EMPTY_OBJ as Record<string, FeatureState>));
    const feature_groups = useDesignSync(state => state.state?.feature_groups || (EMPTY_OBJ as Record<string, any>));
    const selectedFeatureId = useDesignSync(state => state.selectedFeatureId);
    const mapHiddenIds = useDesignSync(state => state.mapHiddenIds);
    const selectFeature = useDesignSync(state => state.selectFeature);
    const setSelectedGroup = useDesignSync(state => state.setSelectedGroup);
    const zoomTo = useDesignSync(state => state.zoomTo);
    const drawingMode = useDesignSync(state => state.drawingMode);
    const previewMetadata = useDesignSync(state => state.previewMetadata);
    const searchResultMarker = useDesignSync(state => state.searchResultMarker);
    const setSearchResultMarker = useDesignSync(state => state.setSearchResultMarker);
    const showFeatureGroups = useDesignSync(state => state.showFeatureGroups);
    const dispatchEvent = useDesignSync(state => state.dispatchEvent);




    // V65: [ARMORED] Harmonize features data. 
    // We keep 'features' as a Record for hooks that need ID-based lookup,
    // but ensured it's actually an Object if it was somehow an Array.
    const features = React.useMemo(() => {
        if (Array.isArray(rawFeatures)) {
            const record: Record<string, FeatureState> = {};
            rawFeatures.forEach(f => { if (f?.id) record[f.id] = f; });
            return record;
        }
        return rawFeatures;
    }, [rawFeatures]);

    const map = useMap();
    const clusterGroupRef = React.useRef<any>(null);
    const moveGroupRef = React.useRef<any>(null);
    const [currentZoom, setCurrentZoom] = useState(() => (canReadMapBounds(map) ? map.getZoom() : 0));
    const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => (canReadMapBounds(map) ? map.getBounds() : null));
    const [isReportCaptureActive, setIsReportCaptureActive] = useState(false);
    const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handler = (event: Event) => {
            setIsReportCaptureActive(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
        };
        window.addEventListener(REPORT_CAPTURE_EVENT, handler);
        return () => window.removeEventListener(REPORT_CAPTURE_EVENT, handler);
    }, []);

    const debouncedSetBounds = useCallback(() => {
        if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = setTimeout(() => {
            if (!canReadMapBounds(map)) return;
            const nextZoom = map.getZoom();
            const nextBounds = map.getBounds();

            // Only update if actually changed (with small epsilon for bounds)
            setCurrentZoom(nextZoom);
            setBounds(prev => {
                if (prev && prev.equals(nextBounds)) return prev;
                return nextBounds;
            });
        }, BOUNDS_DEBOUNCE_MS);
    }, [map]);

    const lastMoveTimeRef = useRef(0);
    const THROTTLE_MS = 100;

    const throttledMove = useCallback(() => {
        const now = Date.now();
        if (now - lastMoveTimeRef.current > THROTTLE_MS) {
            lastMoveTimeRef.current = now;
            if (!canReadMapBounds(map)) return;
            const nextBounds = map.getBounds();
            setBounds(prev => {
                if (prev && prev.equals(nextBounds)) return prev;
                return nextBounds;
            });
        }
    }, [map]);

    useEffect(() => {
        const syncTimer = window.setTimeout(() => {
            if (canReadMapBounds(map)) {
                setCurrentZoom(map.getZoom());
                setBounds(map.getBounds());
                return;
            }

            map.whenReady(() => {
                if (!canReadMapBounds(map)) return;
                setCurrentZoom(map.getZoom());
                setBounds(map.getBounds());
            });
        }, 0);
        return () => window.clearTimeout(syncTimer);
    }, [map]);

    useMapEvents({
        zoomend: debouncedSetBounds,
        moveend: debouncedSetBounds,
        move: throttledMove
    });

    // 3. Business Logic Hooks
    const featureHierarchy = useFeatureHierarchy(features);
    const featureNumberMap = useFeatureNumbering(features);

    // V60: Pre-compute parent-child mapping once per feature set change
    const parentChildMap = React.useMemo(() => {
        const map = new Map<string, string[]>();
        Object.values(features).forEach(f => {
            const meta = getParsedMetadata(f, previewMetadata);
            const pid = metadataString(meta.parent_feature_id);
            if (pid) {
                const children = map.get(pid) || [];
                map.set(pid, [...children, f.id]);
            }
        });
        return map;
    }, [features, previewMetadata]);

    const geoVisibleFeatures = useVisibleFeatures(features, bounds, selectedFeatureId, featureHierarchy.hasVirtualChildren);

    const visibleFeatures = React.useMemo(() => {
        // V2 Fix: ONLY hide features that user explicitly clicked the eye icon
        // All data from database should be visible by default
        const result = geoVisibleFeatures.filter(f => {
            if (!isRenderableFeatureGeometry(f.geom_type, getParsedCoordinates(f))) return false;

            // ONLY check mapHiddenIds (user clicked hide button in Project Explorer)
            // Do NOT check database is_visible - everything is visible by default
            if (mapHiddenIds.has(f.id)) return false;
            if (f.group_id && mapHiddenIds.has(f.group_id)) return false;
            const layerId = f.layer_id;
            if (layerId && mapHiddenIds.has(layerId)) return false;

            return true;
        });

        return result;
    }, [geoVisibleFeatures, mapHiddenIds]);

    // 4. Filtering Logic for Points (Clusters)
    const pointsToRender = React.useMemo(() => {
        const result = visibleFeatures.filter((f: FeatureState) => {
            if (f.geom_type?.toLowerCase() !== 'point' && f.geom_type !== undefined) return false;

            const group = f.group_id ? feature_groups[f.group_id] : null;

            // Hierarchy-based visibility
            const metadata = getParsedMetadata(f, previewMetadata);
            const depth = featureHierarchy.depthMap[f.id] || 0;
            const isParent = featureHierarchy.hasVirtualChildren.has(f.id);
            const expansionZoom = ZOOM_THRESHOLD + (depth * 2);
            const parentExpansionZoom = depth > 0 ? ZOOM_THRESHOLD + ((depth - 1) * 2) : 0;

            if (!isReportCaptureActive && depth > 0 && currentZoom < parentExpansionZoom) return false;

            const { isIntersection, iconKey } = getFeatureDisplayInfo(f, group?.type, group?.name, metadata);
            const isJunctionIcon = isIntersection && iconKey === 'intersection';
            const isSelected = f.id === selectedFeatureId;
            const hasContent = metadata.has_data || isParent;

            // Hide aggregate when zoomed in deep, unless selected
            if (!isReportCaptureActive && (isJunctionIcon || isParent) && currentZoom >= expansionZoom && hasContent && !isSelected) return false;

            // Hide details in Intersection groups when zoomed out, unless selected
            if (!isReportCaptureActive && !isJunctionIcon && group?.type === 'INTERSECTION' && currentZoom < expansionZoom && !isSelected) return false;

            return true;
        });
        return result;
    }, [visibleFeatures, feature_groups, previewMetadata, featureHierarchy, currentZoom, selectedFeatureId, isReportCaptureActive]);

    const renderedPointIds = React.useMemo(
        () => new Set(pointsToRender.map(f => f.id)),
        [pointsToRender]
    );

    return (
        <>
            {/* Search Result Layer */}
            {searchResultMarker && (
                <Marker
                    position={[searchResultMarker.lat, searchResultMarker.lng]}
                    icon={new L.DivIcon({
                        className: 'search-result-marker',
                        html: `<div class="relative flex flex-col items-center"><div class="bg-white px-2 py-1 rounded shadow-md border border-cyan-500 text-[10px] font-bold whitespace-nowrap mb-1 opacity-90">${searchResultMarker.name.split(',')[0]}</div><div class="w-10 h-10 flex items-center justify-center filter drop-shadow-lg"><svg viewBox="0 0 24 24" width="36" height="36" fill="#06b6d4" fill-opacity="0.2" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg></div></div>`,
                        iconSize: [100, 60],
                        iconAnchor: [50, 60]
                    })}
                >
                    <Popup>
                        <div className="p-1 max-w-[200px]">
                            <div className="font-bold text-cyan-700 text-sm mb-1">{searchResultMarker.name}</div>
                            <div className="text-[10px] text-gray-500 mb-2 italic">Địa chỉ từ tìm kiếm</div>
                            <button
                                onClick={() => setSearchResultMarker(null)}
                                className="w-full py-1 text-[10px] bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                            >
                                Xóa marker này
                            </button>
                        </div>
                    </Popup>
                </Marker>
            )}

            {/* Point & Cluster Layer */}
            <PointLayer
                features={pointsToRender}
                feature_groups={feature_groups}
                selectedFeatureId={selectedFeatureId}
                selectFeature={selectFeature}
                setSelectedGroup={setSelectedGroup}
                zoomTo={zoomTo}
                drawingMode={drawingMode}
                previewMetadata={previewMetadata}
                featureNumberMap={featureNumberMap}
                clusterGroupRef={clusterGroupRef}
                moveGroupRef={moveGroupRef}
                showFeatureGroups={showFeatureGroups && !isReportCaptureActive}
                dispatchEvent={dispatchEvent}
            />

            {/* FOV (Field of View) Layer for Cameras */}
            <FOVLayer
                features={visibleFeatures}
                feature_groups={feature_groups}
                previewMetadata={previewMetadata}
                currentZoom={isReportCaptureActive ? Math.max(currentZoom, 23) : currentZoom}
                renderedPointIds={renderedPointIds}
            />

            {/* Floating Popup Manager (Cluster-aware) */}
            <SelectedFeaturePopupManager
                visibleFeatures={visibleFeatures}
                selectedFeatureId={selectedFeatureId}
                feature_groups={feature_groups}
                previewMetadata={previewMetadata}
                clusterGroupRef={clusterGroupRef}
                moveGroupRef={moveGroupRef}
                featureNumberMap={featureNumberMap}
            />

            {/* Vector Layer (Lines & Polygons) */}
            <VectorLayer
                features={visibleFeatures}
                allFeatures={features}
                parentChildMap={parentChildMap}
                featureHierarchy={featureHierarchy}
                feature_groups={feature_groups}
                selectedFeatureId={selectedFeatureId}
                selectFeature={selectFeature}
                setSelectedGroup={setSelectedGroup}
                previewMetadata={previewMetadata}
                currentZoom={isReportCaptureActive ? Math.max(currentZoom, 23) : currentZoom}
                zoomTo={zoomTo}
            />

            {/* Editing Layer (Handles) */}
            <VertexEditor />

            {/* Drawing Layer (Snap Indicator) */}
            <DrawingLayer />
        </>
    );
};
