import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMovedFeatureUpdatePayload, useVirtualDrag } from "./useVirtualDrag";
import type { FeatureGroupState, FeatureState } from "@CONTRACT/types";

const makeCameraFeature = (overrides: Partial<FeatureState> = {}): FeatureState => ({
    id: "camera-1",
    layer_id: "layer-a",
    group_id: "group-a",
    name: "Camera 1",
    geom_type: "POINT",
    coordinates: [105.62984, 21.00289],
    properties: { icon: "cctv", iconKey: "cctv", type: "camera" },
    metadata: JSON.stringify({ specs: { hfov: 70 }, gis: { rotation: 45 } }),
    is_visible: true,
    ...overrides
});

describe("useVirtualDrag", () => {
    beforeEach(() => {
        vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    it("moves into an intersection without sending geometry or properties", async () => {
        const camera = makeCameraFeature();
        const intersection: FeatureState = {
            id: "intersection-1",
            layer_id: "layer-b",
            group_id: "group-b",
            name: "Intersection",
            geom_type: "POINT",
            coordinates: [105.63, 21.003],
            properties: { iconKey: "intersection", type: "intersection" },
            metadata: JSON.stringify({ type: "INTERSECTION" }),
            is_visible: true
        };
        const featuresRef = {
            current: {
                [camera.id]: camera,
                [intersection.id]: intersection
            }
        };
        const groupsRef = { current: {} as Record<string, FeatureGroupState> };
        const regionsRef = { current: {} };
        const dispatchEvents = vi.fn().mockResolvedValue(undefined);
        const clearSelection = vi.fn();
        const target = document.createElement("div");
        target.setAttribute("data-drag-id", intersection.id);
        target.setAttribute("data-drag-type", "feature");
        document.body.appendChild(target);
        const elementsFromPoint = vi.fn(() => [target]);
        Object.defineProperty(document, "elementsFromPoint", {
            configurable: true,
            value: elementsFromPoint
        });

        const { result } = renderHook(() => useVirtualDrag({
            featuresRef,
            groupsRef,
            regionsRef,
            dispatchEvents,
            selectionSet: new Set(),
            clearSelection
        }));

        act(() => {
            result.current.handleVirtualDragStart(
                { button: 0, clientX: 0, clientY: 0 } as React.MouseEvent,
                "feature",
                camera.id
            );
        });
        act(() => {
            window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 0 }));
        });
        await waitFor(() => expect(result.current.isVirtualDragging).toBe(true));
        act(() => {
            window.dispatchEvent(new MouseEvent("mouseup", { clientX: 10, clientY: 0 }));
        });

        await waitFor(() => expect(dispatchEvents).toHaveBeenCalledTimes(1));
        const [events] = dispatchEvents.mock.calls[0];
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("FeatureUpdated");
        expect(events[0].payload).toMatchObject({
            id: camera.id,
            layer_id: intersection.layer_id,
            group_id: intersection.group_id
        });
        expect(events[0].payload).not.toHaveProperty("geom_type");
        expect(events[0].payload).not.toHaveProperty("coordinates");
        expect(events[0].payload).not.toHaveProperty("properties");
        expect(JSON.parse(events[0].payload.metadata)).toMatchObject({
            parent_feature_id: intersection.id,
            specs: { hfov: 70 },
            gis: { rotation: 45 }
        });
        expect(clearSelection).toHaveBeenCalledTimes(1);

        target.remove();
    });

    it("does not dispatch move events before the drag threshold is passed", () => {
        const camera = makeCameraFeature();
        const featuresRef = { current: { [camera.id]: camera } };
        const groupsRef = { current: {} as Record<string, FeatureGroupState> };
        const regionsRef = { current: {} };
        const dispatchEvents = vi.fn().mockResolvedValue(undefined);
        const clearSelection = vi.fn();

        const { result } = renderHook(() => useVirtualDrag({
            featuresRef,
            groupsRef,
            regionsRef,
            dispatchEvents,
            selectionSet: new Set(),
            clearSelection
        }));

        act(() => {
            result.current.handleVirtualDragStart(
                { button: 0, clientX: 0, clientY: 0 } as React.MouseEvent,
                "feature",
                camera.id
            );
        });
        act(() => {
            window.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
        });

        expect(dispatchEvents).not.toHaveBeenCalled();
        expect(clearSelection).not.toHaveBeenCalled();
    });
});

describe("buildMovedFeatureUpdatePayload", () => {
    it("keeps parent_feature_id when moving within another intersection child list", () => {
        const child = makeCameraFeature({
            metadata: JSON.stringify({ parent_feature_id: "old-intersection", business: { code: "C1" } })
        });

        const payload = buildMovedFeatureUpdatePayload(
            child,
            { [child.id]: child },
            "layer-b",
            "group-b",
            "new-intersection"
        );

        expect(payload).toMatchObject({
            layer_id: "layer-b",
            group_id: "group-b"
        });
        expect(payload).not.toHaveProperty("geom_type");
        expect(payload).not.toHaveProperty("coordinates");
        expect(payload).not.toHaveProperty("properties");
        expect(JSON.parse(payload.metadata ?? '{}')).toMatchObject({
            parent_feature_id: "new-intersection",
            business: { code: "C1" }
        });
    });

    it("clears parent_feature_id when moving back to a normal group", () => {
        const child = makeCameraFeature({
            metadata: JSON.stringify({ parent_feature_id: "intersection-1", specs: { hfov: 80 } })
        });

        const payload = buildMovedFeatureUpdatePayload(
            child,
            { [child.id]: child },
            "layer-a",
            "normal-group",
            null
        );
        const metadata = JSON.parse(payload.metadata ?? '{}');

        expect(metadata.parent_feature_id).toBeUndefined();
        expect(metadata.specs).toEqual({ hfov: 80 });
        expect(payload).not.toHaveProperty("coordinates");
        expect(payload).not.toHaveProperty("properties");
    });
});
