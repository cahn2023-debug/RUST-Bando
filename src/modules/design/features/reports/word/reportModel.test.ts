import { describe, expect, it } from "vitest";
import type { MapState } from "@CONTRACT/types";
import {
  buildReportModel,
  expandReportSelections,
  getDefaultReportSelections,
  getFeatureBounds,
} from "./reportModel";

const state: MapState = {
  regions: {
    r1: { id: "r1", parent_id: null, name: "Khu A", description: null },
  },
  layers: {
    l1: { id: "l1", region_id: "r1", name: "Layer", is_visible: true },
  },
  feature_groups: {
    g1: { id: "g1", layer_id: "l1", parent_id: null, name: "Camera", group_type: "FOLDER" },
  },
  features: {
    intersection: {
      id: "intersection",
      layer_id: "l1",
      group_id: "g1",
      name: "Nút giao 1",
      geom_type: "Point",
      metadata: JSON.stringify({ icon: "intersection", display_order: "1" }),
      properties: {},
      coordinates: [106.1, 10.1],
    },
    camera: {
      id: "camera",
      layer_id: "l1",
      group_id: "g1",
      name: "Camera 1",
      geom_type: "Point",
      metadata: JSON.stringify({
        icon: "cctv",
        parent_feature_id: "intersection",
        display_order: "1_1",
        description: "Ghi chú camera",
        media: { imageUrls: ["data:image/png;base64,AAAA"] },
      }),
      properties: {},
      coordinates: [106.101, 10.101],
    },
    fiber: {
      id: "fiber",
      layer_id: "l1",
      group_id: "g1",
      name: "Cáp quang 1",
      geom_type: "LineString",
      metadata: JSON.stringify({
        display_order: "2",
        infrastructure: { type: "SignalLine", cable_type: "FO" },
      }),
      properties: {},
      coordinates: [[106.1, 10.1], [106.2, 10.2]],
    },
  },
  settings: {},
};

describe("reportModel", () => {
  it("defaults to explicit feature selection before full project", () => {
    const defaults = getDefaultReportSelections(state, {
      selectionSet: new Set(["camera"]),
      selectedFeatureId: "intersection",
      selectedGroupId: "g1",
    });

    expect(defaults).toEqual([{ type: "feature", id: "camera" }]);
  });

  it("expands region and feature children", () => {
    const features = expandReportSelections(state, [{ type: "region", id: "r1" }]);

    expect(features.map((feature) => feature.id)).toEqual(["intersection", "camera", "fiber"]);
  });

  it("builds intersection detail sections with child numbering and photos", () => {
    const model = buildReportModel(state, [{ type: "feature", id: "intersection" }], "Test");

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].summary).toContain("Số vị trí thuộc nút giao: 1");
    expect(model.sections[0].details[0].label).toBe("Đối tượng 1_1");
    expect(model.sections[0].details[0].photos[0].dataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("computes padded bounds for points and lines", () => {
    const pointBounds = getFeatureBounds(state.features.camera);
    const lineBounds = getFeatureBounds(state.features.fiber);

    expect(pointBounds?.[0]).toBeLessThan(10.101);
    expect(pointBounds?.[2]).toBeGreaterThan(10.101);
    expect(lineBounds).toEqual(expect.arrayContaining([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]));
  });
});
