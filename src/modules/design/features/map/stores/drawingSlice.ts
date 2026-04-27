import { StateCreator } from 'zustand';
import { DrawingSlice, DesignSyncStore } from './types';
import { emit } from '@tauri-apps/api/event';
import { getParsedCoordinates, getParsedMetadata } from '../../../../tool/utils/featureUtils';

export const createDrawingSlice: StateCreator<DesignSyncStore, [], [], DrawingSlice> = (set, get) => ({
    drawingMode: 'none',
    editingFeatureId: null,
    currentDrawingPoints: [],
    currentDrawingSnapIds: [],
    snappedPoint: null,
    activeParentFeatureId: null,

    setDrawingMode: (mode) => {
        const currentMode = get().drawingMode;
        if (currentMode !== mode) {
            set({ drawingMode: mode, currentDrawingPoints: [], currentDrawingSnapIds: [] });
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

    setDrawingPoint: async (index, lat, lng, snapId = null) => {
        const { state, editingFeatureId, dispatchEvent } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];
        const coords = getParsedCoordinates(feature);
        if (!coords || !Array.isArray(coords)) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords = [...coords];

        // V2 Fix: If snapped to a target, use the TARGET's actual coordinates
        // instead of the raw click position. This ensures geometric integrity.
        let actualLng = lng;
        let actualLat = lat;

        if (snapId && state.features[snapId]) {
            const targetFeature = state.features[snapId];
            const targetCoords = getParsedCoordinates(targetFeature);
            if (targetCoords && Array.isArray(targetCoords)) {
                // For Point targets, use [lng, lat] directly
                if ((targetFeature.geom_type || '').toLowerCase() === 'point') {
                    actualLng = targetCoords[0];
                    actualLat = targetCoords[1];
                } else if (Array.isArray(targetCoords[0])) {
                    // For line/polygon targets, use first vertex as snap point
                    actualLng = targetCoords[0][0];
                    actualLat = targetCoords[0][1];
                }
            }
        }

        if (isPolygon) {
            const ring = Array.isArray(newCoords[0]) ? [...newCoords[0]] : [...newCoords];
            ring[index] = [actualLng, actualLat];
            if (index === 0) ring[ring.length - 1] = [actualLng, actualLat];
            newCoords = [ring];
        } else {
            newCoords[index] = [actualLng, actualLat];
        }

        const currentMeta = { ...getParsedMetadata(feature) };
        let metaChanged = false;
        const isPolyline = (feature.geom_type || '').toUpperCase() === 'LINESTRING' || (feature.geom_type || '').toUpperCase() === 'POLYLINE';

        if (isPolyline) {
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
            if (snapId) {
                if (currentMeta.snap_links[key] !== snapId) {
                    currentMeta.snap_links[key] = snapId;
                    metaChanged = true;
                }
            } else if (currentMeta.snap_links[key]) {
                delete currentMeta.snap_links[key];
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
        const { editingFeatureId, state, dispatchEvent } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];
        let coords = getParsedCoordinates(feature);
        if (!coords) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords = [...coords];

        if (isPolygon) {
            const ring = Array.isArray(newCoords[0]) ? [...newCoords[0]] : [...newCoords];
            ring.splice(index, 0, [lng, lat]);
            newCoords = [ring];
        } else {
            newCoords.splice(index, 0, [lng, lat]);
        }

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload: {
                id: editingFeatureId,
                geom_type: feature.geom_type,
                coordinates: newCoords
            }
        });
    },

    deleteDrawingPoint: async (index) => {
        const { editingFeatureId, state, dispatchEvent } = get();
        if (!editingFeatureId || !state?.features[editingFeatureId]) return;

        const feature = state.features[editingFeatureId];
        let coords = getParsedCoordinates(feature);
        if (!coords) return;

        const isPolygon = (feature.geom_type || '').toLowerCase() === 'polygon';
        let newCoords = [...coords];

        if (isPolygon) {
            const ring = Array.isArray(newCoords[0]) ? [...newCoords[0]] : [...newCoords];
            if (ring.length <= 4) return;
            ring.splice(index, 1);
            if (index === 0) ring[ring.length - 1] = ring[0];
            newCoords = [ring];
        } else {
            if (newCoords.length <= 2) return;
            newCoords.splice(index, 1);
        }

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload: {
                id: editingFeatureId,
                geom_type: feature.geom_type,
                coordinates: newCoords
            }
        });
    }
});
