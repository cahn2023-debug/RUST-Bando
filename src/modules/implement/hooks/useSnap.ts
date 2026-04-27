import { useCallback, useMemo, useRef, useEffect } from 'react';
import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

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

export const useSnap = () => {
    const drawingMode = useDesignSync(s => s.drawingMode);
    const editingFeatureId = useDesignSync(s => s.editingFeatureId);
    const setSnappedPoint = useDesignSync(s => s.setSnappedPoint);
    const projectId = useDesignSync(s => s.projectId);
    const snappedPointRef = useRef<{ x: number, y: number, id?: string } | null>(null);

    // Use a manual subscription to update the Ref without triggering a re-render
    // only the DrawingLayer needs the reactive state to show the UI.
    useEffect(() => {
        const unsubscribe = useDesignSync.subscribe((state) => {
            snappedPointRef.current = state.snappedPoint;
        });
        return unsubscribe;
    }, []);

    const snapNow = useCallback(async (lat: number, lng: number, manualThreshold?: number) => {
        if (drawingMode === 'none' && !editingFeatureId) return null;
        try {
            const result = await invoke<any>('find_nearest_snap_point', {
                projectId: String(projectId),
                x: lng,
                y: lat,
                threshold: manualThreshold ?? 0.00002
            });
            return result ? { x: result.x, y: result.y, id: result.id } : null;
        } catch (error) {
            console.error('Snap check failed:', error);
            return null;
        }
    }, [drawingMode, editingFeatureId, projectId]);

    const performSnap = useMemo(() => throttle(async (lat: number, lng: number) => {
        const result = await snapNow(lat, lng);
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
