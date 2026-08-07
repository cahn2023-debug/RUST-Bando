import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BasemapProvider } from './BasemapContext';
import { PersistentBasemapHost } from './PersistentBasemapHost';
import type { BasemapController, BasemapLifecycleState, BasemapPreferences, BasemapPresetId } from './types';

const runtimeMock = vi.hoisted(() => {
    const listeners = new Set<(state: BasemapLifecycleState) => void>();
    const runtime: BasemapController = {
        initialize: vi.fn(async () => {}),
        destroy: vi.fn(),
        resize: vi.fn(),
        getLifecycleState: vi.fn((): BasemapLifecycleState => 'uninitialized'),
        getCamera: vi.fn(() => ({
            center: [105.8, 21.02] as [number, number],
            zoom: 13,
            bearing: 0,
            pitch: 0,
            matrix: new Float32Array(16),
            width: 0,
            height: 0,
            pixelRatio: 1,
            version: 0,
        })),
        getMap: vi.fn(() => null),
        setCamera: vi.fn(),
        fitBounds: vi.fn(),
        setPreset: vi.fn(),
        getPresetId: vi.fn((): BasemapPresetId => 'street'),
        getPreferences: vi.fn((): BasemapPreferences => ({
            presetId: 'street' as BasemapPresetId,
            roads: true,
            roadNames: true,
            buildings: true,
            pois: true,
            labels: true,
            locale: 'vi',
            region: 'VN',
        })),
        zoomBy: vi.fn(),
        setVisibility: vi.fn(),
        subscribeCamera: vi.fn(() => () => {}),
        subscribeLifecycle: vi.fn((listener: (state: BasemapLifecycleState) => void) => {
            listeners.add(listener);
            listener('uninitialized');
            return () => listeners.delete(listener);
        }),
        subscribePreset: vi.fn(() => () => {}),
    };

    return {
        runtime,
        emit: (state: BasemapLifecycleState) => listeners.forEach(listener => listener(state)),
        reset: () => {
            listeners.clear();
            Object.values(runtime).forEach(value => {
                if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
            });
        },
    };
});

vi.mock('./BasemapRuntime', () => ({
    createBasemapRuntime: vi.fn(() => runtimeMock.runtime),
}));

describe('PersistentBasemapHost', () => {
    afterEach(() => {
        runtimeMock.reset();
    });

    it('initializes the basemap runtime once and destroys it on unmount', () => {
        const onFirstFrameRendered = vi.fn();
        const onLifecycleState = vi.fn();

        const { unmount } = render(
            <BasemapProvider>
                <PersistentBasemapHost
                    onFirstFrameRendered={onFirstFrameRendered}
                    onLifecycleState={onLifecycleState}
                />
            </BasemapProvider>
        );

        expect(runtimeMock.runtime.initialize).toHaveBeenCalledTimes(1);
        expect(runtimeMock.runtime.initialize).toHaveBeenCalledWith(expect.any(HTMLElement), undefined);

        runtimeMock.emit('map-created');
        runtimeMock.emit('first-frame');
        runtimeMock.emit('interactive');

        expect(onLifecycleState).toHaveBeenCalledWith('map-created');
        expect(onFirstFrameRendered).toHaveBeenCalledTimes(1);

        unmount();

        expect(runtimeMock.runtime.destroy).toHaveBeenCalledTimes(1);
    });

    it('renders persistent basemap section with core data attributes', () => {
        const { container } = render(
            <BasemapProvider>
                <PersistentBasemapHost />
            </BasemapProvider>
        );

        const host = container.querySelector('[data-basemap-host="core"]');
        const canvasHost = container.querySelector('[data-basemap-canvas-host="maplibre"]');

        expect(host).toBeTruthy();
        expect(canvasHost).toBeTruthy();
    });
});
