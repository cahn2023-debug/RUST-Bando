import { StateCreator } from 'zustand';
import { DrawingSlice, DesignSyncStore } from './types';
import { emit } from '@/contracts/tauri-api/runtime';
import { getParsedCoordinates, getParsedMetadata, getPointCoordinates } from '../../../../tool/utils/featureUtils';
import type { LineStringCoordinates, PolygonCoordinates, FeatureState } from '@CONTRACT/types';
import { buildSnapLinks, isPolylineEndpointIndex } from '../network/networkTopology';

const isPolygonCoordinates = (coords: unknown): coords is PolygonCoordinates =>
    Array.isArray(coords) &&
    Array.isArray(coords[0]) &&
    Array.isArray((coords[0] as unknown[])[0]);

const isLineCoordinates = (coords: unknown): coords is LineStringCoordinates =>
    Array.isArray(coords) &&
    Array.isArray(coords[0]) &&
    !Array.isArray((coords[0] as unknown[])[0]);

export const isPointInPolygon = (point: [number, number], polygon: PolygonCoordinates): boolean => {
    const ring = polygon[0];
    if (!ring || ring.length < 3) return false;

    const x = point[0]; // lng
    const y = point[1]; // lat
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};

export const getIntersectionScope = (
    parentId: string | null,
    features: Record<string, FeatureState>
): PolygonCoordinates | null => {
    if (!parentId || !features) return null;

    const parentFeature = features[parentId];
    if (parentFeature && (parentFeature.geom_type || '').toLowerCase() === 'polygon') {
        const coords = getParsedCoordinates(parentFeature);
        if (isPolygonCoordinates(coords)) {
            return coords;
        }
    }

    for (const f of Object.values(features)) {
        const fMeta = getParsedMetadata(f);
        if (fMeta.parent_feature_id === parentId && (f.geom_type || '').toLowerCase() === 'polygon') {
            const coords = getParsedCoordinates(f);
            if (isPolygonCoordinates(coords)) {
                return coords;
            }
        }
    }

    return null;
};

export const isSignalLineFeature = (feature: FeatureState): boolean => {
    if (!feature) return false;
    const geomType = (feature.geom_type || '').toLowerCase();
    return geomType.includes('line');
};

export const createDrawingSlice: StateCreator<DesignSyncStore, [], [], DrawingSlice> = (set, get) => ({
    drawingMode: 'none',
    editingFeatureId: null,
    currentDrawingPoints: [],
    currentDrawingSnapIds: [],
    snappedPoint: null,
    activeParentFeatureId: null,
    networkConnectionDraft: null,

    setDrawingMode: (mode) => {
        const currentMode = get().drawingMode;
        if (currentMode !== mode) {
            set({ drawingMode: mode, currentDrawingPoints: [], currentDrawingSnapIds: [], networkConnectionDraft: null });
            emit('sync-drawing-mode', { mode });
        }
    },

    setEditingFeatureId: (id) => set({ editingFeatureId: id }),
    setActiveParentFeature: (id) => set({ activeParentFeatureId: id }),
    addDrawingPoint: (lat, lng, snapId = null) => {
        const newPoints: [number, number][] = [...get().currentDrawingPoints, [lng, lat]];
        const newSnapIds: (string | null)[] = [...get().currentDrawingSnapIds, snapId || null];
        set({ currentDrawingPoints: newPoints, currentDrawingSnapIds: newSnapIds });
    },
    clearDrawingPoints: () => set({ currentDrawingPoints: [], currentDrawingSnapIds: [] }),
    setSnappedPoint: (point) => set({ snappedPoint: point }),
    setNetworkConnectionDraft: (draft) => set({ networkConnectionDraft: draft }),
    clearNetworkConnectionDraft: () => set({ networkConnectionDraft: null }),

    setDrawingPoint: async (index, lat, lng, snapId = null) => {
        const { state, editingFeatureId, dispatchEvent, activeParentFeatureId } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];

        // ponytail: validate intersection scope boundary check for SignalLine edits
        if (isSignalLineFeature(feature)) {
            const parentId = activeParentFeatureId || (getParsedMetadata(feature).parent_feature_id as string | undefined);
            if (parentId) {
                const scope = getIntersectionScope(parentId, state.features);
                if (scope) {
                    let actualLng = lng;
                    let latVal = lat;
                    if (snapId && state.features[snapId]) {
                        const targetFeature = state.features[snapId];
                        const targetCoords = getPointCoordinates(targetFeature);
                        if (targetCoords) {
                            actualLng = targetCoords[0];
                            latVal = targetCoords[1];
                        }
                    }
                    if (!isPointInPolygon([actualLng, latVal], scope)) {
                        throw new Error("Point is outside intersection scope");
                    }
                }
            }
        }

        const coords = getParsedCoordinates(feature);
        if (!coords || !Array.isArray(coords)) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords: LineStringCoordinates | PolygonCoordinates = isPolygonCoordinates(coords)
            ? [...coords]
            : isLineCoordinates(coords)
                ? [...coords]
                : [];

        // V2 Fix: If snapped to a target, use the TARGET's actual coordinates
        // instead of the raw click position. This ensures geometric integrity.
        let actualLng = lng;
        let actualLat = lat;

        if (snapId && state.features[snapId]) {
            const targetFeature = state.features[snapId];
            const targetCoords = getPointCoordinates(targetFeature);
            if (targetCoords) {
                // For Point targets, use [lng, lat] directly
                actualLng = targetCoords[0];
                actualLat = targetCoords[1];
            }
        }

        if (isPolygon) {
            const ring = isPolygonCoordinates(newCoords) ? [...newCoords[0]] : [];
            ring[index] = [actualLng, actualLat];
            if (index === 0) ring[ring.length - 1] = [actualLng, actualLat];
            newCoords = [ring];
        } else {
            (newCoords as LineStringCoordinates)[index] = [actualLng, actualLat];
        }

        const currentMeta = { ...getParsedMetadata(feature) };
        let metaChanged = false;
        const isPolyline = (feature.geom_type || '').toUpperCase() === 'LINESTRING' || (feature.geom_type || '').toUpperCase() === 'POLYLINE';

        if (isPolyline) {
            if (currentMeta.manual_override !== true) {
                currentMeta.manual_override = true;
                metaChanged = true;
            }
        }

        if (isPolyline) {
            const isEndpoint = isPolylineEndpointIndex(feature, index);
            if (isEndpoint && !snapId) {
                const endpointLabel = index === 0 ? 'đầu bắt đầu' : 'đầu kết thúc';
                alert(`Không thể tách ${endpointLabel} khỏi đối tượng kết nối. Hãy snap sang một đối tượng hợp lệ khác.`);
                throw new Error(`Polyline endpoint ${index} requires a snap target.`);
            }

            if (index === 0 && currentMeta.start_node_id !== snapId) {
                currentMeta.start_node_id = snapId || null;
                metaChanged = true;
            }
            const lastIdx = isPolygon ? (Array.isArray(newCoords[0]) ? newCoords[0].length - 1 : newCoords.length - 1) : newCoords.length - 1;
            if (index === lastIdx && currentMeta.end_node_id !== snapId) {
                currentMeta.end_node_id = snapId || null;
                metaChanged = true;
            }

            if (!currentMeta.snap_links) currentMeta.snap_links = {};
            const key = `v${index}`;
            const snapLinks = currentMeta.snap_links as Record<string, string | null>;
            if (snapId) {
                if (snapLinks[key] !== snapId) {
                    snapLinks[key] = snapId;
                    metaChanged = true;
                }
            } else if (snapLinks[key]) {
                delete snapLinks[key];
                metaChanged = true;
            }

            const maxVertexIndex = isPolygon && Array.isArray(newCoords[0])
                ? (newCoords[0] as LineStringCoordinates).length - 1
                : newCoords.length - 1;
            const mergedSnapIds = Array.from({ length: maxVertexIndex + 1 }, (_, vertexIndex) => {
                if (vertexIndex === index) return snapId || null;
                return snapLinks[`v${vertexIndex}`] || null;
            });
            const nextSnapLinks = buildSnapLinks(mergedSnapIds);
            const currentSnapLinks = currentMeta.snap_links as Record<string, string> | undefined;
            if (JSON.stringify(currentSnapLinks || {}) !== JSON.stringify(nextSnapLinks || {})) {
                if (nextSnapLinks) currentMeta.snap_links = nextSnapLinks;
                else delete currentMeta.snap_links;
                metaChanged = true;
            }
        } else if ((feature.geom_type || '').toUpperCase() === 'POINT') {
            if (snapId) {
                if (currentMeta.snap_to_id !== snapId) {
                    currentMeta.snap_to_id = snapId;
                    metaChanged = true;
                }
            } else if (currentMeta.snap_to_id) {
                delete currentMeta.snap_to_id;
                metaChanged = true;
            }
        }

        const payload: any = {
            id: editingFeatureId,
            geom_type: feature.geom_type,
            coordinates: newCoords
        };

        if (metaChanged) {
            payload.metadata = JSON.stringify(currentMeta);
        }

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload
        });
    },

    insertDrawingPoint: async (index, lat, lng) => {
        const { editingFeatureId, state, dispatchEvent, activeParentFeatureId } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];

        // ponytail: validate intersection scope boundary check for SignalLine inserts
        if (isSignalLineFeature(feature)) {
            const parentId = activeParentFeatureId || (getParsedMetadata(feature).parent_feature_id as string | undefined);
            if (parentId) {
                const scope = getIntersectionScope(parentId, state.features);
                if (scope && !isPointInPolygon([lng, lat], scope)) {
                    throw new Error("Point is outside intersection scope");
                }
            }
        }

        const coords = getParsedCoordinates(feature);
        if (!coords) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords: LineStringCoordinates | PolygonCoordinates = isPolygonCoordinates(coords)
            ? [...coords]
            : isLineCoordinates(coords)
                ? [...coords]
                : [];

        if (isPolygon) {
            const ring = isPolygonCoordinates(newCoords) ? [...newCoords[0]] : [];
            ring.splice(index, 0, [lng, lat]);
            newCoords = [ring];
        } else {
            (newCoords as LineStringCoordinates).splice(index, 0, [lng, lat]);
        }

        const isPolyline = (feature.geom_type || '').toUpperCase() === 'LINESTRING' || (feature.geom_type || '').toUpperCase() === 'POLYLINE';
        const payload: any = {
            id: editingFeatureId,
            geom_type: feature.geom_type,
            coordinates: newCoords
        };
        if (isPolyline) {
            payload.metadata = JSON.stringify({
                ...getParsedMetadata(feature),
                manual_override: true
            });
        }

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload
        });
    },

    deleteDrawingPoint: async (index) => {
        const { editingFeatureId, state, dispatchEvent } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];
        const coords = getParsedCoordinates(feature);
        if (!coords) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords: LineStringCoordinates | PolygonCoordinates = isPolygonCoordinates(coords)
            ? [...coords]
            : isLineCoordinates(coords)
                ? [...coords]
                : [];

        if (isPolygon) {
            const ring = isPolygonCoordinates(newCoords) ? [...newCoords[0]] : [];
            if (ring.length <= 4) return;
            ring.splice(index, 1);
            if (index === 0) ring[ring.length - 1] = ring[0];
            newCoords = [ring];
        } else {
            if ((newCoords as LineStringCoordinates).length <= 2) return;
            (newCoords as LineStringCoordinates).splice(index, 1);
        }

        const isPolyline = (feature.geom_type || '').toUpperCase() === 'LINESTRING' || (feature.geom_type || '').toUpperCase() === 'POLYLINE';
        const payload: any = {
            id: editingFeatureId,
            geom_type: feature.geom_type,
            coordinates: newCoords
        };
        if (isPolyline) {
            payload.metadata = JSON.stringify({
                ...getParsedMetadata(feature),
                manual_override: true
            });
        }

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload
        });
    }
});
