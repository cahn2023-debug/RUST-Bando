import { waitFor } from '@testing-library/react';
import { create } from 'zustand';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitializationSlice } from './initializationSlice';
import type { DesignSyncStore } from './types';
import { loadDesignState } from '../../../../tool/utils/designIpc';

vi.mock('../../../../implement/lib/tauri', () => ({
    safeInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async () => vi.fn()),
}));

vi.mock('../../../../tool/utils/designIpc', async () => {
    const actual = await vi.importActual<typeof import('../../../../tool/utils/designIpc')>(
        '../../../../tool/utils/designIpc'
    );
    return {
        ...actual,
        loadDesignState: vi.fn(),
    };
});

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const bootstrapFor = (projectId: string, streamingMode = false, viewportFirst = false) => ({
    project: { id: projectId, name: projectId, path: `${projectId}.pmp` },
    featureCount: 1,
    mapRevision: 7,
    initialBounds: null,
    settings: {},
    regions: {},
    layers: {
        layer1: { id: 'layer1', name: 'Layer 1' },
    },
    featureGroups: {},
    streamingMode,
    viewportFirst,
    cacheStatus: { cachedTiles: 0, state: 'missing' },
});

const fullStateFor = (featureId: string) => ({
    regions: {},
    layers: {
        layer1: { id: 'layer1', name: 'Layer 1' },
    },
    feature_groups: {},
    features: {
        [featureId]: {
            id: featureId,
            layer_id: 'layer1',
            group_id: null,
            name: featureId,
            geom_type: 'Point',
            metadata: {},
            properties: {},
            coordinates: [105, 21],
        },
    },
    settings: {},
});

const createTestStore = () =>
    create<DesignSyncStore>()((set, get, store) => ({
        state: null,
        projectId: null,
        projectPath: null,
        projectKey: null,
        isLoading: false,
        isHydrating: false,
        error: null,
        lastSync: null,
        isOnline: true,
        pendingSync: false,
        isMigrating: false,
        isSaving: false,
        visibleFeatures: {},
        visibleFeatureIds: [],
        featureDetailsCache: {},
        viewportFeatureTotal: 0,
        isViewportLoading: false,
        isViewportTruncated: false,
        openMetrics: null,
        updateOpenMetrics: vi.fn(),
        selectionSet: new Set(),
        mapHiddenIds: new Set(),
        ...createInitializationSlice(set, get, store),
    } as unknown as DesignSyncStore));

describe('createInitializationSlice bootstrap hydration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('commits the bootstrap shell before full feature hydration resolves for non-streaming projects', async () => {
        const hydration = createDeferred<ReturnType<typeof fullStateFor>>();
        vi.mocked(loadDesignState).mockReturnValue(hydration.promise as any);
        const store = createTestStore();

        await store.getState().initialize('project-1', 'project-1.pmp', {
            forceReload: true,
            bootstrap: bootstrapFor('project-1'),
        });

        expect(store.getState().isLoading).toBe(false);
        expect(store.getState().isHydrating).toBe(true);
        expect(store.getState().state?.features).toEqual({});
        expect(store.getState().state?.isLargeProject).toBe(false);
        expect(loadDesignState).toHaveBeenCalledWith('project-1', {});

        hydration.resolve(fullStateFor('feature-1'));
        await waitFor(() => {
            expect(store.getState().state?.features['feature-1']).toBeTruthy();
            expect(store.getState().isHydrating).toBe(false);
        });
    });

    it('keeps viewport-first projects on visible feature hydration instead of committing full raw features', async () => {
        const store = createTestStore();

        await store.getState().initialize('project-1', 'project-1.pmp', {
            forceReload: true,
            bootstrap: bootstrapFor('project-1', true, true),
        });

        expect(store.getState().state?.features).toEqual({});
        expect(store.getState().isLoading).toBe(false);
        expect(store.getState().isHydrating).toBe(false);
        expect(store.getState().state?.isLargeProject).toBe(true);
        expect(loadDesignState).not.toHaveBeenCalled();
    });

    it('does not let stale background hydration overwrite a newer project', async () => {
        const firstHydration = createDeferred<ReturnType<typeof fullStateFor>>();
        const secondHydration = createDeferred<ReturnType<typeof fullStateFor>>();
        vi.mocked(loadDesignState)
            .mockReturnValueOnce(firstHydration.promise as any)
            .mockReturnValueOnce(secondHydration.promise as any);
        const store = createTestStore();

        await store.getState().initialize('project-1', 'project-1.pmp', {
            forceReload: true,
            bootstrap: bootstrapFor('project-1'),
        });
        await store.getState().initialize('project-2', 'project-2.pmp', {
            forceReload: true,
            bootstrap: bootstrapFor('project-2'),
        });

        firstHydration.resolve(fullStateFor('stale-feature'));
        await Promise.resolve();
        expect(store.getState().projectId).toBe('project-2');
        expect(store.getState().state?.features['stale-feature']).toBeUndefined();

        secondHydration.resolve(fullStateFor('current-feature'));
        await waitFor(() => {
            expect(store.getState().projectId).toBe('project-2');
            expect(store.getState().state?.features['current-feature']).toBeTruthy();
        });
    });
});
