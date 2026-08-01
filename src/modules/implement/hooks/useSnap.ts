import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import type { FeatureState } from '@CONTRACT/types';
import { getPointCoordinates } from '@TOOL/utils/featureMapping';
import { getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { getPolylineSnapCoordinate, isLineFeature, isNetworkEdgeFeature } from '@DESIGN/features/map/network/networkTopology';

function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function (this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

const EMPTY_OBJ = {};

export const useSnap = () => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const setSnappedPoint = useDesignSync(s => s.setSnappedPoint);
    const features = useDesignSync(s => s.state?.features || EMPTY_OBJ);
    const snappedPointRef = useRef<{ x: number, y: number, id?: string } | null>(null);

    // Use a manual subscription to update the Ref without triggering a re-render
    // only the DrawingLayer needs the reactive state to show the UI.
    useEffect(() => {
        const unsubscribe = useDesignSync.subscribe((state) => {
            snappedPointRef.current = state.snappedPoint;
        });
        return unsubscribe;
    }, []);

    const snapNow = useCallback((lat: number, lng: number, manualThreshold?: number) => {
        if (drawingMode === 'none' && !editingFeatureId) return null;
        try {
            const threshold = manualThreshold ?? 0.00002;
            const bound = threshold * 3;
            let bestResult: { x: number; y: number; id?: string } | null = null;
            let bestDistance = threshold;

            for (const feature of Object.values(features) as FeatureState[]) {
                if (feature.id === editingFeatureId) continue;

                const pointCoords = getPointCoordinates(feature);
                if (pointCoords) {
                    if (Math.abs(pointCoords[0] - lng) > bound || Math.abs(pointCoords[1] - lat) > bound) {
                        continue;
                    }
                    const distance = Math.hypot(pointCoords[0] - lng, pointCoords[1] - lat);
                    if (distance <= bestDistance) {
                        bestDistance = distance;
                        bestResult = { x: pointCoords[0], y: pointCoords[1], id: feature.id };
                    }
                    continue;
                }

                const metadata = getParsedMetadata(feature);

                if (isLineFeature(feature) || isNetworkEdgeFeature(feature, metadata as any)) {
                    const projectedPoint = getPolylineSnapCoordinate(feature, lng, lat);
                    if (!projectedPoint) continue;
                    if (Math.abs(projectedPoint[0] - lng) > bound || Math.abs(projectedPoint[1] - lat) > bound) {
                        continue;
                    }
                    const distance = Math.hypot(projectedPoint[0] - lng, projectedPoint[1] - lat);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestResult = { x: projectedPoint[0], y: projectedPoint[1], id: feature.id };
                    }
                }
            }

            return bestResult;
        } catch (error) {
            console.error('Snap check failed:', error);
            return null;
        }
    }, [drawingMode, editingFeatureId, features]);

    const performSnap = useMemo(() => throttle((lat: number, lng: number) => {
        const result = snapNow(lat, lng);
        const current = snappedPointRef.current;
        if (!current && !result) return;
        if (current && result && current.id === result.id && Math.abs(current.x - result.x) < 1e-7 && Math.abs(current.y - result.y) < 1e-7) {
            return;
        }
        setSnappedPoint(result);
    }, 50), [snapNow, setSnappedPoint]);

    const clearSnap = useCallback(() => {
        setSnappedPoint(null);
    }, [setSnappedPoint]);

    return {
        performSnap,
        snapNow,
        clearSnap,
        snappedPointRef
    };
};
