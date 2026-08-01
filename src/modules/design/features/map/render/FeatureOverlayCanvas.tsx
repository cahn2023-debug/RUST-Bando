import React from 'react';
import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import { FeatureOverlayRenderer } from './FeatureOverlayRenderer';
import { OverlayScheduler } from './OverlayScheduler';
import type { CameraSnapshot, MapRenderFlags } from './overlayTypes';
import { DirtyFlag, resolveMapRenderFlags } from './overlayTypes';

export interface FeatureOverlayCanvasHandle {
    canvas: HTMLCanvasElement | null;
    schedule: (dirty: DirtyFlag) => void;
}

export const FeatureOverlayCanvas = React.forwardRef<FeatureOverlayCanvasHandle, {
    className?: string;
    camera?: CameraSnapshot | null;
    designFeatures?: MapLibreRenderFeatureCollection;
    renderFlags?: Partial<MapRenderFlags> | null;
    selectedIds?: Set<string>;
}>(({ camera = null, className, designFeatures, renderFlags, selectedIds }, ref) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const glRef = React.useRef<WebGL2RenderingContext | null>(null);
    const schedulerRef = React.useRef<OverlayScheduler | null>(null);
    const rendererRef = React.useRef<FeatureOverlayRenderer | null>(null);
    const renderFlagsRef = React.useRef<Partial<MapRenderFlags> | null | undefined>(renderFlags);

    React.useEffect(() => {
        renderFlagsRef.current = renderFlags;
    }, [renderFlags]);

    React.useImperativeHandle(ref, () => ({
        canvas: canvasRef.current,
        schedule: (dirty: DirtyFlag) => schedulerRef.current?.schedule(dirty),
    }), []);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        const parent = canvas?.parentElement;
        if (!canvas || !parent) return;
        if (!rendererRef.current) rendererRef.current = new FeatureOverlayRenderer();

        const getWebGl2Context = () => {
            const context = canvas.getContext('webgl2', {
                alpha: true,
                antialias: true,
                preserveDrawingBuffer: true,
            });
            if (!context || typeof (context as WebGL2RenderingContext).clearColor !== 'function') return null;
            return context as WebGL2RenderingContext;
        };

        const resize = () => {
            const rect = parent.getBoundingClientRect();
            const pixelRatio = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.round(rect.width * pixelRatio));
            const height = Math.max(1, Math.round(rect.height * pixelRatio));
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            canvas.style.width = `${Math.max(1, Math.round(rect.width))}px`;
            canvas.style.height = `${Math.max(1, Math.round(rect.height))}px`;
            glRef.current?.viewport?.(0, 0, width, height);
            schedulerRef.current?.schedule(DirtyFlag.Resize);
        };

        glRef.current = getWebGl2Context();
        schedulerRef.current = new OverlayScheduler(() => {
            const flags = resolveMapRenderFlags(renderFlagsRef.current);
            if (flags.overlayEnabled && flags.overlayPoints) {
                rendererRef.current?.draw(canvas);
                return;
            }
            const context = glRef.current;
            if (!context) return;
            context.clearColor(0, 0, 0, 0);
            context.clear(context.COLOR_BUFFER_BIT);
        });

        const onContextLost = (event: Event) => {
            event.preventDefault();
            glRef.current = null;
        };
        const onContextRestored = () => {
            glRef.current = getWebGl2Context();
            resize();
            schedulerRef.current?.schedule(DirtyFlag.Geometry | DirtyFlag.State);
        };

        canvas.addEventListener('webglcontextlost', onContextLost);
        canvas.addEventListener('webglcontextrestored', onContextRestored);

        const observer = new ResizeObserver(resize);
        observer.observe(parent);
        resize();

        return () => {
            observer.disconnect();
            schedulerRef.current?.dispose();
            schedulerRef.current = null;
            canvas.removeEventListener('webglcontextlost', onContextLost);
            canvas.removeEventListener('webglcontextrestored', onContextRestored);
        };
    }, []);

    React.useEffect(() => {
        const flags = resolveMapRenderFlags(renderFlags);
        if (!flags.overlayEnabled || !flags.overlayPoints || !designFeatures) return;
        rendererRef.current?.setCamera(camera);
        rendererRef.current?.setDesignFeatures(designFeatures, selectedIds);
        schedulerRef.current?.schedule(DirtyFlag.Geometry | DirtyFlag.State);
    }, [camera, designFeatures, renderFlags, selectedIds]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={className || 'design-feature-overlay-canvas'}
            data-map-overlay-canvas="features"
        />
    );
});

FeatureOverlayCanvas.displayName = 'FeatureOverlayCanvas';
