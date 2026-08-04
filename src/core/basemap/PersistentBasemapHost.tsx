import { useLayoutEffect, useRef } from 'react';
import { createBasemapRuntime } from './BasemapRuntime';
import { useBasemap } from './BasemapContext';
import type { BasemapController, BasemapLifecycleState, BasemapRuntimeConfig } from './types';
import './PersistentMapHost.css';

interface PersistentBasemapHostProps {
    config?: Partial<BasemapRuntimeConfig>;
    className?: string;
    onFirstFrameRendered?: () => void;
    onLifecycleState?: (state: BasemapLifecycleState) => void;
}

export function PersistentBasemapHost({
    config,
    className = 'persistent-map-host',
    onFirstFrameRendered,
    onLifecycleState,
}: PersistentBasemapHostProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const runtimeRef = useRef<BasemapController | null>(null);
    const firstFrameReportedRef = useRef(false);
    const { setController } = useBasemap();

    if (!runtimeRef.current) runtimeRef.current = createBasemapRuntime();

    useLayoutEffect(() => {
        const container = containerRef.current;
        const runtime = runtimeRef.current;
        if (!container || !runtime) return;

        const unsubscribe = runtime.subscribeLifecycle(state => {
            onLifecycleState?.(state);
            if ((state === 'first-frame' || state === 'interactive') && !firstFrameReportedRef.current) {
                firstFrameReportedRef.current = true;
                onFirstFrameRendered?.();
            }
        });
        setController(runtime);
        void runtime.initialize(container, config);

        return () => {
            unsubscribe();
            setController(null);
            runtime.destroy();
        };
    }, [config, onFirstFrameRendered, setController]);

    return (
        <section className={className} data-basemap-host="core">
            <div className="absolute inset-0 pointer-events-none bg-[#e5e7eb]" aria-hidden="true" />
            <div ref={containerRef} className="maplibre-host-container" data-basemap-canvas-host="maplibre" />
        </section>
    );
}
