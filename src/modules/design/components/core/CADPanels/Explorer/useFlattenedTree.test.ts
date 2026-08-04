import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFlattenedTree } from "./useFlattenedTree";
import type { RegionState, LayerState, FeatureGroupState, FeatureState } from "@CONTRACT/types";

describe("useFlattenedTree - Direct Intersection Nesting", () => {
    it("should nest children directly under the intersection node", () => {
        const regionsMap: Record<string, RegionState> = {
            "region-1": { id: "region-1", name: "Region 1", parent_id: null, description: null, is_visible: true }
        };
        const layersMap: Record<string, LayerState> = {
            "layer-1": { id: "layer-1", region_id: "region-1", name: "Layer 1", is_visible: true }
        };
        const groupsMap: Record<string, FeatureGroupState> = {};
        const featuresMap: Record<string, FeatureState> = {
            "feat-parent": {
                id: "feat-parent",
                layer_id: "layer-1",
                group_id: "virtual-intersection-region-1",
                name: "Nút giao A",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [0, 0],
                properties: {},
                metadata: JSON.stringify({ type: "INTERSECTION", display_order: 1 })
            },
            "feat-child": {
                id: "feat-child",
                layer_id: "layer-1",
                group_id: "virtual-intersection-region-1",
                name: "Con A",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [0, 0],
                properties: {},
                metadata: JSON.stringify({ parent_feature_id: "feat-parent", display_order: 2 })
            }
        };

        const expanded = {
            "region-1": true,
            "virtual-intersection-region-1": true,
            "feature-feat-parent": true
        };

        const { result } = renderHook(() => useFlattenedTree({
            regionsMap,
            layersMap,
            groupsMap,
            featuresMap,
            expanded,
            treeSearchQuery: "",
            filterType: null,
            reverseOrder: false,
            sortField: "name"
        }));

        const items = result.current.flattenedItems;
        
        // Assert Region exists
        expect(items[0].type).toBe("region");
        
        // Assert Virtual Group for Intersections
        expect(items[1].type).toBe("group");
        expect(items[1].id).toBe("virtual-intersection-region-1");
        
        // Assert Parent Intersection Feature
        expect(items[2].type).toBe("feature");
        expect(items[2].id).toBe("feat-parent");
        
        // Assert Child Feature is directly under parent intersection node
        expect(items[3].type).toBe("feature");
        expect(items[3].id).toBe("feat-child");
    });

    it("should filter nested objects across the project even when parents are collapsed", () => {
        const regionsMap: Record<string, RegionState> = {
            "region-1": { id: "region-1", name: "Region 1", parent_id: null, description: null, is_visible: true }
        };
        const layersMap: Record<string, LayerState> = {
            "layer-1": { id: "layer-1", region_id: "region-1", name: "Layer 1", is_visible: true }
        };
        const groupsMap: Record<string, FeatureGroupState> = {};
        const featuresMap: Record<string, FeatureState> = {
            "feat-parent": {
                id: "feat-parent",
                layer_id: "layer-1",
                group_id: null,
                name: "Nút giao A",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [0, 0],
                properties: {},
                metadata: JSON.stringify({ type: "INTERSECTION", display_order: 1 })
            },
            "feat-child": {
                id: "feat-child",
                layer_id: "layer-1",
                group_id: null,
                name: "Camera trong nút giao",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [0, 0],
                properties: {},
                metadata: JSON.stringify({ parent_feature_id: "feat-parent", icon: "cctv", display_order: 2 })
            }
        };

        const { result } = renderHook(() => useFlattenedTree({
            regionsMap,
            layersMap,
            groupsMap,
            featuresMap,
            expanded: {},
            treeSearchQuery: "",
            filterType: "CCTV",
            reverseOrder: false,
            sortField: "name"
        }));

        const ids = result.current.flattenedItems.map(item => item.id);

        expect(ids).toContain("region-1");
        expect(ids).toContain("virtual-intersection-region-1");
        expect(ids).toContain("feat-parent");
        expect(ids).toContain("feat-child");
    });

    it("should hide simulated NetworkLink features from the project tree", () => {
        const regionsMap: Record<string, RegionState> = {
            "region-1": { id: "region-1", name: "Region 1", parent_id: null, description: null, is_visible: true }
        };
        const layersMap: Record<string, LayerState> = {
            "layer-1": { id: "layer-1", region_id: "region-1", name: "Layer 1", is_visible: true }
        };
        const groupsMap: Record<string, FeatureGroupState> = {
            "group-1": { id: "group-1", layer_id: "layer-1", parent_id: null, name: "Group 1", group_type: "FOLDER", is_visible: true }
        };
        const featuresMap: Record<string, FeatureState> = {
            "device-1": {
                id: "device-1",
                layer_id: "layer-1",
                group_id: "group-1",
                name: "Device 1",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [0, 0],
                properties: {},
                metadata: JSON.stringify({ icon: "cctv" })
            },
            "network-link-1": {
                id: "network-link-1",
                layer_id: "layer-1",
                group_id: "group-1",
                name: "NetworkLink Device 1",
                is_visible: true,
                geom_type: "NetworkLink",
                coordinates: null,
                properties: {},
                metadata: JSON.stringify({
                    infrastructure: { type: "NetworkLink", status: "simulated" },
                    network: { from_feature_id: "device-1", to_feature_id: "device-2" }
                })
            }
        };

        const { result } = renderHook(() => useFlattenedTree({
            regionsMap,
            layersMap,
            groupsMap,
            featuresMap,
            expanded: { "region-1": true, "group-1": true },
            treeSearchQuery: "",
            filterType: null,
            reverseOrder: false,
            sortField: "name"
        }));

        const ids = result.current.flattenedItems.map(item => item.id);

        expect(ids).toContain("device-1");
        expect(ids).not.toContain("network-link-1");
    });

    it("should retain regions and auto-expand hierarchy when filterType is INTERSECTION", () => {
        const regionsMap: Record<string, RegionState> = {
            "region-1": { id: "region-1", name: "Dự án 269 Nút", parent_id: null, description: null, is_visible: true }
        };
        const layersMap: Record<string, LayerState> = {
            "layer-1": { id: "layer-1", region_id: "region-1", name: "Lớp Nút giao", is_visible: true }
        };
        const groupsMap: Record<string, FeatureGroupState> = {};
        const featuresMap: Record<string, FeatureState> = {
            "intersection-1": {
                id: "intersection-1",
                layer_id: "layer-1",
                group_id: null,
                name: "Nút giao 269",
                is_visible: true,
                geom_type: "POINT",
                coordinates: [105.8, 21.0],
                properties: {},
                metadata: JSON.stringify({ type: "INTERSECTION", display_order: 1 })
            }
        };

        const { result } = renderHook(() => useFlattenedTree({
            regionsMap,
            layersMap,
            groupsMap,
            featuresMap,
            expanded: {}, // Collapsed by default
            treeSearchQuery: "",
            filterType: "INTERSECTION",
            reverseOrder: false,
            sortField: "name"
        }));

        const items = result.current.flattenedItems;
        const types = items.map(item => item.type);
        const ids = items.map(item => item.id);

        expect(types).toContain("region");
        expect(types).toContain("group");
        expect(types).toContain("feature");
        expect(ids).toEqual(["region-1", "virtual-intersection-region-1", "intersection-1"]);
    });
});

