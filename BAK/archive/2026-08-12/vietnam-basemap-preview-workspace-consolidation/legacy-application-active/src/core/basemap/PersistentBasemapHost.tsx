import { useEffect, useLayoutEffect, useRef } from 'react';
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
    const onFirstFrameRenderedRef = useRef(onFirstFrameRendered);
    const onLifecycleStateRef = useRef(onLifecycleState);
    const { setController } = useBasemap();

    useEffect(() => {
        onFirstFrameRenderedRef.current = onFirstFrameRendered;
        onLifecycleStateRef.current = onLifecycleState;
    }, [onFirstFrameRendered, onLifecycleState]);

    // eslint-disable-next-line react-hooks/refs
    if (!runtimeRef.current) runtimeRef.current = createBasemapRuntime();

    useLayoutEffect(() => {
        const container = containerRef.current;
        const runtime = runtimeRef.current;
        if (!container || !runtime) return;

        const unsubscribe = runtime.subscribeLifecycle(state => {
            onLifecycleStateRef.current?.(state);
            if ((state === 'first-frame' || state === 'interactive') && !firstFrameReportedRef.current) {
                firstFrameReportedRef.current = true;
                onFirstFrameRenderedRef.current?.();
            }
        });
        setController(runtime);
        void runtime.initialize(container, config);

        return () => {
            unsubscribe();
            setController(null);
            runtime.destroy();
        };
    }, [config, setController]);

    return (
        <section className={className} data-basemap-host="core">
            <div className="absolute inset-0 pointer-events-none bg-[#e5e7eb]" aria-hidden="true" />
            <div ref={containerRef} className="maplibre-host-container" data-basemap-canvas-host="maplibre" />
        </section>
    );
}
