/**
 * Preservation Property Tests — Task 2
 * ======================================
 * Property 2: Preservation — Non-Large Project & Viewport Pipeline Behavior Không Đổi
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * METHODOLOGY: Observation-first — these tests capture EXISTING behavior on UNFIXED code.
 * All tests in this file MUST PASS on unfixed code (they establish the baseline to preserve).
 *
 * After fix is applied (Task 3), re-running these tests confirms no regressions.
 *
 * Observations on UNFIXED code:
 *   - FeatureCreated on non-large project → rawFeatures (state.features) is data source, viewportRevision increments
 *   - FeatureCreated/FeatureUpdated/FeatureDeleted on non-large project → viewportRevision unchanged for non-renderable or delete
 *   - setViewportFeatures() → populates visibleFeatures & increments viewportRevision (correct viewport pipeline)
 *   - FeatureCreated with out-of-viewport coords on large project → feature NOT in visibleFeatures (stays empty)
 *   - throttledSetState() → throttles 100ms correctly, does NOT bypass
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useDesignSync } from '../../../../implement/stores/useDesignSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal NON-large-project MapState. isLargeProject = false → rawFeatures mode. */
const buildNonLargeProjectState = () => ({
    regions: {},
    layers: {
        'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Main Layer', is_visible: true },
    },
    feature_groups: {
        'group-1': { id: 'group-1', layer_id: 'layer-1', name: 'Group 1' },
    },
    settings: {},
    features: {} as Record<string, any>,
    isLargeProject: false,  // <— rawFeatures mode
    featureCount: 10,
    mapRevision: 1,
    viewportFeatureLimit: 10000,
});

/** Build a minimal large-project MapState. isLargeProject = true → viewport-first mode. */
const buildLargeProjectState = () => ({
    regions: {},
    layers: {
        'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Main Layer', is_visible: true },
    },
    feature_groups: {
        'group-1': { id: 'group-1', layer_id: 'layer-1', name: 'Group 1' },
    },
    settings: {},
    features: {} as Record<string, any>,
    isLargeProject: true,   // <— viewport-first mode
    featureCount: 500,
    mapRevision: 1,
    viewportFeatureLimit: 10000,
});

/** Feature payload with in-viewport coordinates (HCM City area). */
const makeFeaturePayload = (id: string, coordinates = [106.660172, 10.762622]) => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: `Feature ${id}`,
    geom_type: 'POINT',
    coordinates,
    properties: { icon: 'camera', iconKey: 'camera', type: 'camera' },
    metadata: JSON.stringify({ specs: { hfov: 90 } }),
    is_visible: true,
});

/** Feature payload with OUT-OF-VIEWPORT coordinates (far from HCM City). */
const makeOutOfViewportPayload = (id: string) => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: `OOV Feature ${id}`,
    geom_type: 'POINT',
    coordinates: [2.3522, 48.8566], // Paris — outside HCM City viewport
    properties: { icon: 'default', iconKey: 'default', type: 'point' },
    metadata: JSON.stringify({}),
    is_visible: true,
});

// ---------------------------------------------------------------------------
// Reset store state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
    useDesignSync.setState({
        projectId: 'test-project',
        projectKey: 'test-project',
        state: buildNonLargeProjectState() as any,
        visibleFeatures: {},
        visibleFeatureIds: [],
        featureDetailsCache: {},
        viewportRevision: 0,
        viewportSignature: '',
        selectedFeatureId: null,
        hoverId: null,
        editingFeatureId: null,
        selectionSet: new Set(),
        boxSelection: null,
        previewMetadata: null,
    });
});

// ---------------------------------------------------------------------------
// Property 2.A — Non-Large Project: rawFeatures Data Source Preserved
// Validates: Requirements 3.1, 3.6, 3.8
// ---------------------------------------------------------------------------

describe('Preservation 2.A — Non-Large Project: rawFeatures Remains Data Source (Validates: Requirements 3.1, 3.6, 3.8)', () => {

    /**
     * Observation: FeatureCreated on non-large project → feature appears in state.features (rawFeatures).
     * visibleFeatures is NOT auto-populated from applyPatchToState on non-large project.
     * The data source for render is state.features (rawFeatures), not visibleFeatures.
     *
     * This confirms rawFeatures path is unaffected by any fix targeting large project.
     */
    it('Preservation 2.A.1: FeatureCreated on non-large project → feature in state.features (rawFeatures data source)', () => {
        const featureId = 'non-large-feature-1';

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-non-large-create-1',
            applied_event: {
                type: 'FeatureCreated',
                payload: makeFeaturePayload(featureId),
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // PRIMARY: feature must be in state.features (rawFeatures data source)
        expect(
            storeAfter.state?.features[featureId],
            `Feature ${featureId} must be in state.features on non-large project`
        ).toBeDefined();
        expect(storeAfter.state?.features[featureId]?.id).toBe(featureId);

        // Non-large project: isLargeProject must remain false (mode unchanged)
        expect(storeAfter.state?.isLargeProject).toBe(false);
    });

    /**
     * Observation: FeatureUpdated on non-large project → updated data in state.features.
     * rawFeatures path is the update source.
     * Validates Requirement 3.6: non-large project continues to update immediately from rawFeatures.
     */
    it('Preservation 2.A.2: FeatureUpdated on non-large project → updated feature in state.features (rawFeatures)', () => {
        const featureId = 'non-large-feature-update';
        const originalCoords = [106.660172, 10.762622];
        const updatedCoords = [106.670000, 10.770000];

        // Pre-populate with an existing feature
        useDesignSync.setState({
            state: {
                ...buildNonLargeProjectState(),
                features: {
                    [featureId]: makeFeaturePayload(featureId, originalCoords) as any,
                },
            } as any,
            viewportRevision: 0,
        });

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-non-large-update-1',
            applied_event: {
                type: 'FeatureUpdated',
                payload: { id: featureId, coordinates: updatedCoords },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Updated coordinates must be in state.features (rawFeatures)
        expect(
            storeAfter.state?.features[featureId]?.coordinates,
            `Updated coordinates must be reflected in state.features on non-large project`
        ).toEqual(updatedCoords);

        // Non-large project mode unchanged
        expect(storeAfter.state?.isLargeProject).toBe(false);
    });

    /**
     * Observation: FeatureDeleted on non-large project → feature removed from state.features.
     * rawFeatures path is unaffected.
     */
    it('Preservation 2.A.3: FeatureDeleted on non-large project → feature removed from state.features', () => {
        const featureId = 'non-large-feature-delete';

        // Pre-populate with an existing feature
        useDesignSync.setState({
            state: {
                ...buildNonLargeProjectState(),
                features: {
                    [featureId]: makeFeaturePayload(featureId) as any,
                },
            } as any,
            viewportRevision: 0,
        });

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-non-large-delete-1',
            applied_event: {
                type: 'FeatureDeleted',
                payload: { id: featureId },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Feature must be removed from state.features
        expect(
            storeAfter.state?.features[featureId],
            `Deleted feature ${featureId} must be absent from state.features`
        ).toBeUndefined();
    });

    /**
     * Observation: Multiple feature operations (Create, Update, Delete) on non-large project
     * all work through state.features — rawFeatures path always maintained.
     * Validates Requirements 3.1, 3.6 with variety of operations.
     */
    it('Preservation 2.A.4: All feature operations on non-large project maintain rawFeatures path', () => {
        const featureIds = ['op-feature-1', 'op-feature-2', 'op-feature-3'];

        // Create multiple features
        for (const id of featureIds) {
            useDesignSync.getState().applyPatchToState({
                success: true,
                event_id: `event-create-${id}`,
                applied_event: {
                    type: 'FeatureCreated',
                    payload: makeFeaturePayload(id),
                },
                side_effects: [],
            });
        }

        const afterCreate = useDesignSync.getState();
        // All features must be in state.features
        for (const id of featureIds) {
            expect(afterCreate.state?.features[id]).toBeDefined();
        }
        // isLargeProject unchanged — still non-large
        expect(afterCreate.state?.isLargeProject).toBe(false);

        // Update one feature
        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-update-op-feature-1',
            applied_event: {
                type: 'FeatureUpdated',
                payload: { id: 'op-feature-1', coordinates: [106.675000, 10.775000] },
            },
            side_effects: [],
        });

        const afterUpdate = useDesignSync.getState();
        expect(afterUpdate.state?.features['op-feature-1']?.coordinates).toEqual([106.675000, 10.775000]);

        // Delete one feature
        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-delete-op-feature-3',
            applied_event: {
                type: 'FeatureDeleted',
                payload: { id: 'op-feature-3' },
            },
            side_effects: [],
        });

        const afterDelete = useDesignSync.getState();
        expect(afterDelete.state?.features['op-feature-3']).toBeUndefined();
        expect(afterDelete.state?.features['op-feature-1']).toBeDefined();
        expect(afterDelete.state?.features['op-feature-2']).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Property 2.B — Viewport Pipeline: setViewportFeatures() Works Correctly
// Validates: Requirements 3.2, 3.5 (moveend → viewportRevision increments → queryVisibleFeaturesV2 → setViewportFeatures)
// ---------------------------------------------------------------------------

describe('Preservation 2.B — Viewport Pipeline: setViewportFeatures() Correctly Populates visibleFeatures (Validates: Requirements 3.2, 3.5)', () => {

    /**
     * Observation: setViewportFeatures() is the pipeline entry point for viewport queries.
     * It populates visibleFeatures and increments viewportRevision.
     *
     * On large project, moveend → publishCamera → viewportRevision increments →
     * external component calls queryVisibleFeaturesV2 (IPC) → calls setViewportFeatures().
     *
     * This preservation test verifies setViewportFeatures() behavior is unchanged.
     * Validates Requirement 3.5: moveend still increments viewportTick (viewportRevision).
     */
    it('Preservation 2.B.1: setViewportFeatures() populates visibleFeatures and increments viewportRevision', () => {
        // Set up a large project state
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            visibleFeatureIds: [],
            viewportRevision: 0,
        });

        const feature1 = makeFeaturePayload('viewport-feature-1');
        const feature2 = makeFeaturePayload('viewport-feature-2', [106.665, 10.765]);
        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        // Simulate result of queryVisibleFeaturesV2 (called after moveend)
        useDesignSync.getState().setViewportFeatures([feature1 as any, feature2 as any], 2, false);

        const storeAfter = useDesignSync.getState();

        // visibleFeatures must be populated
        expect(
            storeAfter.visibleFeatures['viewport-feature-1'],
            'setViewportFeatures must populate visibleFeatures'
        ).toBeDefined();
        expect(storeAfter.visibleFeatures['viewport-feature-2']).toBeDefined();
        expect(storeAfter.visibleFeatureIds).toContain('viewport-feature-1');
        expect(storeAfter.visibleFeatureIds).toContain('viewport-feature-2');

        // viewportRevision must increment (viewport pipeline updated)
        expect(
            storeAfter.viewportRevision,
            'viewportRevision must increment after setViewportFeatures()'
        ).toBeGreaterThan(viewportRevisionBefore);
    });

    /**
     * Observation: setViewportFeatures() with same features/signature does NOT re-increment viewportRevision.
     * This preserves the idempotent viewport signature check.
     * Validates Requirement 3.2: viewport update pipeline remains correct.
     */
    it('Preservation 2.B.2: setViewportFeatures() with identical signature does NOT double-increment viewportRevision', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            viewportRevision: 0,
        });

        const feature1 = makeFeaturePayload('vp-sig-1');

        // First call — should increment
        useDesignSync.getState().setViewportFeatures([feature1 as any], 1, false);
        const revisionAfterFirst = useDesignSync.getState().viewportRevision;
        expect(revisionAfterFirst).toBeGreaterThan(0);

        // Second call with same features/total/truncated — same signature, should NOT increment again
        useDesignSync.getState().setViewportFeatures([feature1 as any], 1, false);
        const revisionAfterSecond = useDesignSync.getState().viewportRevision;

        expect(
            revisionAfterSecond,
            'Identical viewport content must not increment viewportRevision again'
        ).toBe(revisionAfterFirst);
    });

    /**
     * Observation: applyPatchToState with FeatureCreated on large project increments viewportRevision.
     * This triggers the external listener that calls queryVisibleFeaturesV2.
     * Validates Requirement 3.5: viewportRevision (viewportTick) increments → pipeline triggered.
     */
    it('Preservation 2.B.3: FeatureCreated on large project increments viewportRevision (triggers pipeline)', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            viewportRevision: 3,
        });

        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-large-create-preserve',
            applied_event: {
                type: 'FeatureCreated',
                payload: makeFeaturePayload('large-preserve-1'),
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // viewportRevision must increment (triggers queryVisibleFeaturesV2)
        expect(
            storeAfter.viewportRevision,
            'FeatureCreated on large project must increment viewportRevision to trigger viewport pipeline'
        ).toBeGreaterThan(viewportRevisionBefore);
    });
});

// ---------------------------------------------------------------------------
// Property 2.C — Out-of-Viewport Feature Not in visibleFeatures on Large Project
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------

describe('Preservation 2.C — Out-of-Viewport Feature Stays Absent from visibleFeatures (Validates: Requirement 3.3)', () => {

    /**
     * Observation: On large project, FeatureCreated with coordinates OUTSIDE current viewport
     * does NOT cause the feature to appear in visibleFeatures.
     * visibleFeatures is populated only by setViewportFeatures() — which reflects what
     * queryVisibleFeaturesV2 returns (only features inside the current map bounds).
     *
     * After fix, this behavior must be PRESERVED:
     * fix should NOT bypass viewport filtering by injecting out-of-viewport features into visibleFeatures.
     */
    it('Preservation 2.C.1: FeatureCreated with out-of-viewport coordinates on large project → NOT in visibleFeatures', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            visibleFeatureIds: [],
            viewportRevision: 0,
        });

        const oovFeatureId = 'oov-feature-1';

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-oov-create-1',
            applied_event: {
                type: 'FeatureCreated',
                payload: makeOutOfViewportPayload(oovFeatureId),
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Feature must be in state.features (backend data)
        expect(
            storeAfter.state?.features[oovFeatureId],
            'Out-of-viewport feature must still be stored in state.features'
        ).toBeDefined();

        // Feature must NOT be in visibleFeatures (viewport filtering preserved)
        expect(
            storeAfter.visibleFeatures[oovFeatureId],
            '[Preservation] Out-of-viewport feature must NOT appear in visibleFeatures on large project'
        ).toBeUndefined();
    });

    /**
     * Observation: FeatureUpdated with coordinates outside viewport on large project
     * → feature remains absent from visibleFeatures (if it wasn't visible before).
     * Validates Requirement 3.3.
     */
    it('Preservation 2.C.2: FeatureUpdated to out-of-viewport coordinates on large project → NOT auto-added to visibleFeatures', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            visibleFeatureIds: [],
            viewportRevision: 0,
        });

        const featureId = 'oov-update-feature-1';

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-oov-update-1',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: featureId,
                    coordinates: [2.3522, 48.8566], // Paris — out of viewport
                },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Feature must NOT be in visibleFeatures (viewport filtering)
        expect(
            storeAfter.visibleFeatures[featureId],
            '[Preservation] Feature updated to out-of-viewport coords must NOT appear in visibleFeatures'
        ).toBeUndefined();
    });

    /**
     * Property-style: multiple out-of-viewport features created on large project
     * → none appear in visibleFeatures.
     */
    it('Preservation 2.C.3: Multiple out-of-viewport FeatureCreated on large project → none in visibleFeatures', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            visibleFeatures: {},
            visibleFeatureIds: [],
            viewportRevision: 0,
        });

        const oovIds = ['oov-multi-1', 'oov-multi-2', 'oov-multi-3'];
        for (const id of oovIds) {
            useDesignSync.getState().applyPatchToState({
                success: true,
                event_id: `event-oov-multi-${id}`,
                applied_event: {
                    type: 'FeatureCreated',
                    payload: makeOutOfViewportPayload(id),
                },
                side_effects: [],
            });
        }

        const storeAfter = useDesignSync.getState();
        const visibleIds = Object.keys(storeAfter.visibleFeatures);

        const wronglyVisible = oovIds.filter(id => storeAfter.visibleFeatures[id]);
        expect(
            wronglyVisible,
            `[Preservation] These out-of-viewport features must NOT be in visibleFeatures: ${wronglyVisible.join(', ')}`
        ).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Property 2.D — throttledSetState() Applies 100ms Throttle Correctly
// Validates: Requirement 3.4
// ---------------------------------------------------------------------------

describe('Preservation 2.D — throttledSetState() Applies 100ms Throttle (Validates: Requirement 3.4)', () => {

    beforeEach(() => {
        vi.useFakeTimers({ now: 0 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * Observation: throttledSetState() with no previous calls updates state immediately.
     * The first call (when enough time has passed since lastUpdateTimestamp) sets state synchronously.
     * Validates Requirement 3.4: throttle behavior unchanged.
     */
    it('Preservation 2.D.1: throttledSetState() applies state immediately when no recent previous call', () => {
        useDesignSync.setState({
            state: buildNonLargeProjectState() as any,
        });

        const newState = {
            ...buildNonLargeProjectState(),
            mapRevision: 99,
        };

        // Advance time to ensure lastUpdateTimestamp threshold is met (fake timers start at 0)
        vi.setSystemTime(200);

        useDesignSync.getState().throttledSetState(newState as any);

        const storeAfter = useDesignSync.getState();

        // State should be applied immediately (no pending timer needed)
        expect(
            storeAfter.state?.mapRevision,
            'throttledSetState() must apply state immediately when not throttled'
        ).toBe(99);
    });

    /**
     * Observation: throttledSetState() buffers rapid successive calls.
     * When called twice in quick succession, only the latest state is applied after 100ms.
     * Fix must NOT bypass this throttle behavior.
     * Validates Requirement 3.4.
     */
    it('Preservation 2.D.2: throttledSetState() buffers rapid calls and applies latest after 100ms', () => {
        useDesignSync.setState({
            state: buildNonLargeProjectState() as any,
        });

        // Set time well past any throttle window so first call is always immediate
        vi.setSystemTime(5000);

        // First call — applied immediately (time gap > 100ms since lastUpdateTimestamp = 0)
        const firstState = { ...buildNonLargeProjectState(), mapRevision: 10 };
        useDesignSync.getState().throttledSetState(firstState as any);
        expect(useDesignSync.getState().state?.mapRevision).toBe(10);

        // Now advance time only by 20ms — second call is within throttle window
        vi.setSystemTime(5020);

        // Second call — rapid succession, should be buffered (not applied yet)
        const secondState = { ...buildNonLargeProjectState(), mapRevision: 20 };
        useDesignSync.getState().throttledSetState(secondState as any);

        // Immediately after second call: state should still be the first (throttled)
        expect(
            useDesignSync.getState().state?.mapRevision,
            'Second call must be throttled — state not yet updated immediately'
        ).toBe(10);

        // Third rapid call at 30ms
        vi.setSystemTime(5030);
        const thirdState = { ...buildNonLargeProjectState(), mapRevision: 30 };
        useDesignSync.getState().throttledSetState(thirdState as any);

        // Before throttle expires: still first state
        expect(useDesignSync.getState().state?.mapRevision).toBe(10);

        // Advance time past throttle window — latest buffered state should be applied
        vi.advanceTimersByTime(150);

        expect(
            useDesignSync.getState().state?.mapRevision,
            'After throttle expires, latest buffered state (mapRevision=30) must be applied'
        ).toBe(30);
    });

    /**
     * Observation: throttledSetState() respects the 100ms threshold.
     * A call after 100ms+ since last update should apply immediately.
     * Validates that fix does not shorten or remove the throttle window.
     */
    it('Preservation 2.D.3: throttledSetState() after 100ms+ gap applies immediately', () => {
        useDesignSync.setState({
            state: buildNonLargeProjectState() as any,
        });

        // Set time well past any throttle window for first call
        vi.setSystemTime(10000);
        const stateA = { ...buildNonLargeProjectState(), mapRevision: 5 };
        useDesignSync.getState().throttledSetState(stateA as any);
        expect(useDesignSync.getState().state?.mapRevision).toBe(5);

        // Advance 150ms — well past 100ms throttle window
        vi.setSystemTime(10150);

        const stateB = { ...buildNonLargeProjectState(), mapRevision: 15 };
        useDesignSync.getState().throttledSetState(stateB as any);

        expect(
            useDesignSync.getState().state?.mapRevision,
            'After 100ms+ gap, throttledSetState() must apply state immediately'
        ).toBe(15);
    });
});

// ---------------------------------------------------------------------------
// Property 2.E — Non-Feature Events on Large Project: No Unintended Side Effects
// Validates: Requirements 3.2, 3.5 (other event types must not be affected by fix)
// ---------------------------------------------------------------------------

describe('Preservation 2.E — Non-Feature Events: No Unintended Side Effects (Validates: Requirements 3.2, 3.5)', () => {

    /**
     * Observation: LayerCreated/Updated/Deleted, FeatureGroupCreated/Updated/Deleted,
     * RegionCreated/Updated/Deleted → these events must NOT cause viewportRevision changes
     * beyond what the original code does. The fix targets FeatureCreated/FeatureUpdated only.
     */
    it('Preservation 2.E.1: LayerCreated on large project does NOT increment viewportRevision unexpectedly', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            viewportRevision: 5,
        });

        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-layer-create',
            applied_event: {
                type: 'LayerCreated',
                payload: { id: 'layer-2', region_id: 'region-1', name: 'New Layer', is_visible: true },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Layer was added to state
        expect(storeAfter.state?.layers?.['layer-2']).toBeDefined();

        // viewportRevision must NOT increment for LayerCreated (fix scope is FeatureCreated/FeatureUpdated only)
        expect(
            storeAfter.viewportRevision,
            'LayerCreated must NOT increment viewportRevision — fix only targets FeatureCreated/FeatureUpdated'
        ).toBe(viewportRevisionBefore);
    });

    /**
     * Observation: FeatureGroupCreated on large project → no unintended viewportRevision change.
     */
    it('Preservation 2.E.2: FeatureGroupCreated on large project does NOT increment viewportRevision', () => {
        useDesignSync.setState({
            state: buildLargeProjectState() as any,
            viewportRevision: 7,
        });

        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-group-create',
            applied_event: {
                type: 'FeatureGroupCreated',
                payload: { id: 'group-2', layer_id: 'layer-1', name: 'New Group' },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();
        expect(storeAfter.state?.feature_groups?.['group-2']).toBeDefined();

        expect(
            storeAfter.viewportRevision,
            'FeatureGroupCreated must NOT increment viewportRevision'
        ).toBe(viewportRevisionBefore);
    });

    /**
     * Observation: SettingsUpdated event → settings updated in state, no viewport side effects.
     */
    it('Preservation 2.E.3: SettingsUpdated does NOT affect viewportRevision or visibleFeatures', () => {
        useDesignSync.setState({
            state: {
                ...buildLargeProjectState(),
                settings: { theme: 'dark' },
            } as any,
            viewportRevision: 2,
            visibleFeatures: { 'existing-1': makeFeaturePayload('existing-1') as any },
        });

        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;
        const visibleBefore = useDesignSync.getState().visibleFeatures;

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-settings',
            applied_event: {
                type: 'SettingsUpdated',
                payload: { settings: { theme: 'light', mapStyle: 'satellite' } },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Settings updated
        expect((storeAfter.state?.settings as any)?.theme).toBe('light');

        // viewportRevision unchanged
        expect(storeAfter.viewportRevision).toBe(viewportRevisionBefore);

        // visibleFeatures unchanged
        expect(Object.keys(storeAfter.visibleFeatures)).toEqual(Object.keys(visibleBefore));
    });
});

// ---------------------------------------------------------------------------
// Property 2.F — FOVLayer/DORIOverlay: Non-Large Project Uses rawFeatures
// Validates: Requirements 3.7, 3.8
// ---------------------------------------------------------------------------

describe('Preservation 2.F — FOVLayer/DORIOverlay: Non-Large Project Uses rawFeatures (Validates: Requirements 3.7, 3.8)', () => {

    /**
     * Observation: On non-large project, camera features are in state.features (rawFeatures).
     * FOVLayer and DORIOverlay on non-large project read from rawFeatures, not visibleFeatures.
     * Validates Requirement 3.8: FOVLayer on non-large project continues using rawFeatures.
     */
    it('Preservation 2.F.1: Camera feature on non-large project available via state.features (rawFeatures for FOVLayer)', () => {
        const cameraId = 'camera-non-large-1';

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-camera-non-large',
            applied_event: {
                type: 'FeatureCreated',
                payload: {
                    id: cameraId,
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'CCTV Non-Large',
                    geom_type: 'POINT',
                    coordinates: [106.660172, 10.762622],
                    properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                    metadata: JSON.stringify({ specs: { hfov: 90, vfov: 60, range: 50 } }),
                    is_visible: true,
                },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Camera must be in state.features (rawFeatures — data source for FOVLayer on non-large)
        expect(
            storeAfter.state?.features[cameraId],
            `Camera feature must be in state.features (rawFeatures) on non-large project for FOVLayer/DORIOverlay`
        ).toBeDefined();

        // Camera must have correct properties for FOV/DORI rendering
        const feature = storeAfter.state?.features[cameraId] as any;
        expect(feature?.properties?.type).toBe('camera');

        // isLargeProject must remain false (rawFeatures mode preserved)
        expect(storeAfter.state?.isLargeProject).toBe(false);
    });

    /**
     * Observation: DORI ranges depend on camera specs in metadata.
     * After FeatureUpdated on non-large project, updated metadata description must be in state.features.
     * Validates Requirement 3.7: feature metadata continues to be updated for DORI computation.
     *
     * NOTE: normalizeMetadataObject maps metadata through a normalized schema; specs.focal_length
     * is a supported field that survives normalization and can be accessed for DORI computation.
     */
    it('Preservation 2.F.2: Camera FeatureUpdated on non-large project → updated metadata in state.features for DORI', () => {
        const cameraId = 'camera-dori-1';
        // Use focal_length — a field supported in normalizeMetadataObject's specs schema
        const originalMetadata = JSON.stringify({ specs: { focal_length: 4 } });
        const updatedMetadata = JSON.stringify({ specs: { focal_length: 8 } });

        // Pre-populate with camera feature
        useDesignSync.setState({
            state: {
                ...buildNonLargeProjectState(),
                features: {
                    [cameraId]: {
                        id: cameraId,
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'CCTV DORI Test',
                        geom_type: 'POINT',
                        coordinates: [106.660172, 10.762622],
                        properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                        metadata: originalMetadata,
                        is_visible: true,
                    } as any,
                },
            } as any,
            viewportRevision: 0,
        });

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-camera-dori-update',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: cameraId,
                    metadata: updatedMetadata,
                },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();
        const updatedFeature = storeAfter.state?.features[cameraId] as any;

        // Feature must still be in state.features after FeatureUpdated
        expect(updatedFeature).toBeDefined();
        expect(updatedFeature?.id).toBe(cameraId);

        // Feature metadata must reflect the update (metadata was changed)
        // After normalization, metadata is an object. focal_length survives normalization in specs.
        const meta = updatedFeature?.metadata;
        const parsedMeta = typeof meta === 'string' ? JSON.parse(meta) : meta;
        expect(
            parsedMeta?.specs?.focal_length,
            'Updated camera specs (focal_length) must be in state.features for DORI computation'
        ).toBe(8);

        // isLargeProject unchanged
        expect(storeAfter.state?.isLargeProject).toBe(false);
    });
});
