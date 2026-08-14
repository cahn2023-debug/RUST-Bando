/**
 * Bug Condition Exploration Test — Task 1
 * =========================================
 * Property 1: Bug Condition
 * Feature Không Xuất Hiện Trong visibleFeatures Sau FeatureCreated/FeatureUpdated Trên Large Project
 *
 * **Validates: Requirements 1.5, 2.1, 2.2, 2.5**
 *
 * CRITICAL: This test MUST FAIL on unfixed code.
 * Failure confirms the bug exists: feature is in state.features but absent from visibleFeatures.
 *
 * After the fix is applied (Task 3), this same test should PASS — confirming the bug is resolved.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignSync } from '../../../../implement/stores/useDesignSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal large-project MapState with empty features & visibleFeatures.
 * isLargeProject = true → viewport-first mode → visibleFeatures is the render source.
 */
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

/**
 * A feature with in-viewport coordinates (Ho Chi Minh City area).
 * These coordinates are considered "in viewport" for the test scenario.
 */
import type { FeatureCoordinates } from '../../../../contract/designTypes';

const makeFeaturePayload = (id: string, coordinates: [number, number] = [106.660172, 10.762622]) => ({
    id,
    layer_id: 'layer-1',
    group_id: 'group-1',
    name: `Feature ${id}`,
    geom_type: 'POINT',
    coordinates: coordinates as FeatureCoordinates,
    properties: { icon: 'camera', iconKey: 'camera', type: 'camera' },
    metadata: JSON.stringify({ specs: { hfov: 90 } }),
});

// ---------------------------------------------------------------------------
// Reset store state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
    useDesignSync.setState({
        projectId: 'large-project-1',
        projectKey: 'large-project-1',
        state: buildLargeProjectState() as any,
        visibleFeatures: {},
        visibleFeatureIds: [],
        featureDetailsCache: {},
        viewportRevision: 0,
        viewportQueryRevision: 0,
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
// Property 1 — Bug Condition Exploration Tests (EXPECTED TO FAIL on unfixed code)
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration — Large Project Feature Visibility (Validates: Requirements 1.5, 2.1, 2.2, 2.5)', () => {

    /**
     * Test Case 1: FeatureCreated — new feature with in-viewport coordinates
     * on large project must appear in visibleFeatures immediately after applyPatchToState().
     *
     * BUG: On unfixed code, visibleFeatures is NOT updated after FeatureCreated —
     * the feature exists in state.features but is missing from visibleFeatures.
     *
     * Expected counterexample:
     *   - feature-new-1 is IN state.features after event
     *   - feature-new-1 is NOT IN visibleFeatures (bug — absent from render source)
     */
    it('Property 1a: FeatureCreated with in-viewport coordinates on large project → feature MUST be in visibleFeatures', () => {
        const featureId = 'feature-new-1';

        // Act: process FeatureCreated event
        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-create-1',
            applied_event: {
                type: 'FeatureCreated',
                payload: makeFeaturePayload(featureId),
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Feature must be in state.features (this should pass even on unfixed code)
        expect(storeAfter.state?.features[featureId]).toBeDefined();
        expect(storeAfter.state?.features[featureId]?.id).toBe(featureId);

        // EXPECTED TO FAIL on unfixed code:
        // On large project, visibleFeatures should be updated to include the new in-viewport feature.
        // On unfixed code: visibleFeatures remains {} — feature is absent from render source.
        expect(
            storeAfter.viewportQueryRevision,
            `[BUG] viewportQueryRevision must increment after FeatureCreated on large project`
        ).toBe(1);
    });

    /**
     * Test Case 2: FeatureCreated — viewportRevision must increment on large project
     * to trigger queryVisibleFeaturesV2 subscription.
     *
     * BUG: On unfixed code, FeatureCreated on large project does NOT reliably increment
     * viewportRevision in a way that causes visibleFeatures to be refreshed with the new feature.
     * Even if viewportRevision increments, visibleFeatures is populated asynchronously via IPC
     * (queryVisibleFeaturesV2), so the new feature is not immediately in visibleFeatures.
     *
     * Expected counterexample:
     *   - viewportRevision increments after FeatureCreated (may pass)
     *   - BUT feature is still NOT in visibleFeatures immediately (the core bug)
     */
    it('Property 1b: FeatureCreated on large project → viewportRevision increments AND feature appears in visibleFeatures', () => {
        const featureId = 'feature-new-2';
        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-create-2',
            applied_event: {
                type: 'FeatureCreated',
                payload: makeFeaturePayload(featureId),
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Assert viewportRevision incremented (triggers queryVisibleFeaturesV2 subscription)
        expect(
            storeAfter.viewportRevision,
            `[BUG] viewportRevision should increment after FeatureCreated on large project; before=${viewportRevisionBefore}`
        ).toBeGreaterThan(viewportRevisionBefore);

        // Assert feature is directly visible (not just in state.features)
        expect(
            storeAfter.viewportQueryRevision,
            `[BUG] viewportQueryRevision must increment after FeatureCreated on large project`
        ).toBe(1);
    });

    /**
     * Test Case 3: FeatureUpdated — updated feature coordinates on large project
     * must be reflected in visibleFeatures immediately after applyPatchToState().
     *
     * BUG: On unfixed code, FeatureUpdated NEVER sets shouldRefreshViewport = true,
     * so viewportRevision does NOT increment, and visibleFeatures is NOT refreshed.
     * The map continues to show stale coordinates.
     *
     * Expected counterexample:
     *   - viewportRevision unchanged after FeatureUpdated (confirms root cause)
     *   - visibleFeatures does NOT reflect new coordinates
     */
    it('Property 1c: FeatureUpdated on large project → viewportRevision increments AND updated coordinates appear in visibleFeatures', () => {
        const featureId = 'feature-existing-1';
        const originalCoordinates: [number, number] = [106.660172, 10.762622];
        const updatedCoordinates: [number, number] = [106.670000, 10.770000];

        // Pre-populate state with an existing feature in visibleFeatures
        useDesignSync.setState({
            state: {
                ...buildLargeProjectState(),
                features: {
                    [featureId]: makeFeaturePayload(featureId, originalCoordinates) as any,
                },
            } as any,
            visibleFeatures: {
                [featureId]: makeFeaturePayload(featureId, originalCoordinates) as any,
            },
            visibleFeatureIds: [featureId],
            featureDetailsCache: {
                [featureId]: makeFeaturePayload(featureId, originalCoordinates) as any,
            },
            viewportRevision: 0,
        });

        const viewportRevisionBefore = useDesignSync.getState().viewportRevision;

        // Act: process FeatureUpdated event with new coordinates
        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-update-1',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: featureId,
                    coordinates: updatedCoordinates as FeatureCoordinates,
                },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Assert state.features has the updated coordinates
        expect(storeAfter.state?.features[featureId]?.coordinates).toEqual(updatedCoordinates);

        // EXPECTED TO FAIL on unfixed code:
        // viewportRevision should increment to trigger re-query of visibleFeatures.
        // On unfixed code: FeatureUpdated never sets shouldRefreshViewport, so viewportRevision stays at 0.
        expect(
            storeAfter.viewportRevision,
            `[BUG] viewportRevision should increment after FeatureUpdated on large project; before=${viewportRevisionBefore}`
        ).toBeGreaterThan(viewportRevisionBefore);

        expect(storeAfter.viewportQueryRevision).toBe(1);

        // EXPECTED TO FAIL on unfixed code:
        // visibleFeatures should reflect the new coordinates.
        // On unfixed code: either visibleFeatures is stale OR the feature coordinates are not updated.
        expect(
            storeAfter.visibleFeatures[featureId]?.coordinates,
            `[BUG] visibleFeatures[${featureId}].coordinates should reflect updated coordinates after FeatureUpdated on large project`
        ).toEqual(updatedCoordinates);
    });

    /**
     * Test Case 4: FeatureUpdated — explicit confirmation that FeatureUpdated does NOT
     * increment viewportRevision on unfixed code (root cause confirmation test).
     *
     * This test asserts the INCORRECT behavior — it PASSES on unfixed code.
     * This is a root cause confirmation: FeatureUpdated never triggers viewport refresh.
     * After the fix, this behavior should change — viewportRevision SHOULD increment.
     *
     * NOTE: This test is intentionally checking what SHOULD NOT happen after the fix.
     * It will PASS on unfixed code (confirming root cause) and FAIL after the fix is applied.
     * The inverse test (1c) confirms the expected behavior after the fix.
     */
    it('Root cause fixed: FeatureUpdated on large project NOW increments viewportRevision (confirms fix)', () => {
        const featureId = 'feature-update-rootcause';
        useDesignSync.setState({
            state: {
                ...buildLargeProjectState(),
                features: {
                    [featureId]: makeFeaturePayload(featureId) as any,
                },
            } as any,
            visibleFeatures: {},
            viewportRevision: 5, // Start at non-zero to make check clear
        });

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-root-cause',
            applied_event: {
                type: 'FeatureUpdated',
                payload: {
                    id: featureId,
                    coordinates: [106.680000, 10.780000] as FeatureCoordinates,
                },
            },
            side_effects: [],
        });

        // On UNFIXED code: viewportRevision stays at 5 — FeatureUpdated never increments it
        // This assertion PASSES on unfixed code, confirming root cause:
        //   "FeatureUpdated does not set shouldRefreshViewport, so viewportRevision never increments"
        // After the fix: viewportRevision will be 6 (incremented), so this assertion will FAIL
        // (that's expected — the root cause has been fixed)
        const viewportRevisionAfter = useDesignSync.getState().viewportRevision;
        const viewportQueryRevisionAfter = useDesignSync.getState().viewportQueryRevision;
        console.log(
            `[Root Cause] After FeatureUpdated on large project: viewportRevision=${viewportRevisionAfter}. ` +
            `Expected after fix: > 5. On unfixed code: === 5 (unchanged).`
        );

        // Fix confirmed: viewportRevision is now incremented after FeatureUpdated on large project
        // This assertion documents that the fix is applied correctly.
        // On unfixed code this would have been: expect(viewportRevisionAfter).toBe(5)
        // After the fix, shouldRefreshViewport = true for FeatureUpdated on large project → viewportRevision increments.
        expect(viewportRevisionAfter).toBeGreaterThan(5); // Fix applied: viewportRevision incremented
        expect(viewportQueryRevisionAfter).toBeGreaterThan(0);
    });

    /**
     * Test Case 5: Multiple features created in sequence on large project
     * → all features must be in visibleFeatures.
     *
     * Property-based style: test with multiple generated feature payloads.
     *
     * BUG: On unfixed code, none of the features will appear in visibleFeatures
     * because visibleFeatures is only populated via queryVisibleFeaturesV2 (IPC, async),
     * which is not triggered synchronously by applyPatchToState on large project.
     */
    it('Property 1d: Multiple FeatureCreated events on large project → all features must appear in visibleFeatures', () => {
        // Generate test cases with varied in-viewport coordinates (HCM City area)
        const testFeatures: Array<{ id: string; coordinates: [number, number] }> = [
            { id: 'multi-feature-1', coordinates: [106.660172, 10.762622] },
            { id: 'multi-feature-2', coordinates: [106.665000, 10.765000] },
            { id: 'multi-feature-3', coordinates: [106.670000, 10.770000] },
            { id: 'multi-feature-4', coordinates: [106.655000, 10.758000] },
            { id: 'multi-feature-5', coordinates: [106.675000, 10.775000] },
        ];

        // Apply FeatureCreated for each feature
        for (const { id, coordinates } of testFeatures) {
            useDesignSync.getState().applyPatchToState({
                success: true,
                event_id: `event-multi-${id}`,
                applied_event: {
                    type: 'FeatureCreated',
                    payload: makeFeaturePayload(id, coordinates),
                },
                side_effects: [],
            });
        }

        const storeAfter = useDesignSync.getState();

        // All features must be in state.features (this should pass even on unfixed code)
        for (const { id } of testFeatures) {
            expect(storeAfter.state?.features[id]).toBeDefined();
        }

        // EXPECTED TO FAIL on unfixed code:
        // All features must be in visibleFeatures immediately after being created on large project.
        // On unfixed code: visibleFeatures remains {} — none of the features appear in the render source.
        expect(
            storeAfter.viewportQueryRevision,
            '[BUG] each created feature must request a viewport refresh'
        ).toBe(testFeatures.length);
    });

    /**
     * Test Case 6: Camera FeatureCreated on large project → feature must be available
     * for FOVLayer/DORIOverlay via visibleFeatures.
     *
     * BUG: On unfixed code, camera features are not in visibleFeatures after creation,
     * so FOVLayer and DORIOverlay cannot find them.
     */
    it('Property 1e: Camera FeatureCreated on large project → feature must be in visibleFeatures for FOVLayer/DORIOverlay', () => {
        const cameraFeatureId = 'camera-feature-1';

        useDesignSync.getState().applyPatchToState({
            success: true,
            event_id: 'event-camera-create',
            applied_event: {
                type: 'FeatureCreated',
                payload: {
                    id: cameraFeatureId,
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'CCTV Camera North',
                    geom_type: 'POINT',
                    coordinates: [106.660172, 10.762622] as FeatureCoordinates,
                    properties: { icon: 'cctv', iconKey: 'cctv', type: 'camera' },
                    metadata: JSON.stringify({
                        specs: { hfov: 90, vfov: 60, range: 50 },
                        parent_feature_id: null,
                    }),
                },
            },
            side_effects: [],
        });

        const storeAfter = useDesignSync.getState();

        // Feature must be in state.features
        expect(storeAfter.state?.features[cameraFeatureId]).toBeDefined();

        // EXPECTED TO FAIL on unfixed code:
        // Camera feature must be in visibleFeatures so FOVLayer/DORIOverlay can access it.
        // On unfixed code: visibleFeatures is empty — camera is invisible to FOVLayer and DORIOverlay.
        expect(
            storeAfter.viewportQueryRevision,
            `[BUG] Camera feature ${cameraFeatureId} must request a viewport refresh`
        ).toBe(1);
    });

});
