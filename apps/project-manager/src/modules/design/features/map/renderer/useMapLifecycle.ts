import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CameraBridge, DirtyFlag } from '../render';

export interface UseMapLifecycleOptions {
    map: maplibregl.Map | null;
    cameraBridge?: CameraBridge;
    scheduleOverlay?: (dirty: DirtyFlag) => void;
    onFirstFrameRendered?: () => void;
}

export function useMapLifecycle({
    map,
    cameraBridge,
    scheduleOverlay,
    onFirstFrameRendered,
}: UseMapLifecycleOptions) {
    const hasReportedFirstFrame = useRef(false);

    useEffect(() => {
        if (!map) return;

        const handleRender = () => {
            if (!hasReportedFirstFrame.current) {
                hasReportedFirstFrame.current = true;
                onFirstFrameRendered?.();
            }
        };

        map.on('render', handleRender);

        return () => {
            map.off('render', handleRender);
        };
    }, [map, onFirstFrameRendered]);

    useEffect(() => {
        if (!map || !cameraBridge || !scheduleOverlay) return;

        const handleMove = () => {
            const canvas = map.getCanvas();
            cameraBridge.publish({
                matrix: new Float32Array(16),
                width: canvas.width,
                height: canvas.height,
                pixelRatio: window.devicePixelRatio || 1,
            });
            scheduleOverlay(DirtyFlag.Camera);
        };

        map.on('move', handleMove);
        map.on('moveend', handleMove);

        return () => {
            map.off('move', handleMove);
            map.off('moveend', handleMove);
        };
    }, [map, cameraBridge, scheduleOverlay]);
}
