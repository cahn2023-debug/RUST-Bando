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
});
