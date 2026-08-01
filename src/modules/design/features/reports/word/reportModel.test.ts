import { describe, expect, it } from "vitest";
import type { MapState } from "@CONTRACT/types";
import {
  buildReportModel,
  expandReportSelections,
  getDefaultReportSelections,
  getFeatureBounds,
  getSelectableReportItems,
  sanitizeReportBounds,
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
    otherFiber: {
      id: "otherFiber",
      layer_id: "l1",
      group_id: "g1",
      name: "Cáp quang khác",
      geom_type: "LineString",
      metadata: JSON.stringify({
        display_order: "3",
        infrastructure: { type: "SignalLine", cable_type: "FO" },
      }),
      properties: {},
      coordinates: [[106.3, 10.3], [106.4, 10.4]],
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

    expect(features.map((feature) => feature.id)).toEqual(["intersection", "camera", "fiber", "otherFiber"]);
  });

  it("builds intersection detail sections with child numbering and photos", () => {
    const model = buildReportModel(state, [{ type: "feature", id: "intersection" }], "Test");

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].summary).toContain("Số vị trí thuộc nút giao: 1");
    expect(model.sections[0].details[0].label).toBe("Đối tượng 1_1");
    expect(model.sections[0].details[0].photos[0].dataUrl).toBe("data:image/png;base64,AAAA");
    expect(model.sections[0].captureMode).toBe("intersection");
    expect(model.sections[0].focusFeatureIds).toEqual(["intersection", "camera"]);
  });

  it("builds report sections from a selected group", () => {
    const model = buildReportModel(state, [{ type: "group", id: "g1" }], "Test");

    expect(model.sections.map((section) => section.feature.id)).toEqual(["intersection", "fiber", "otherFiber"]);
    expect(model.sections[0].details.map((detail) => detail.feature.id)).toEqual(["camera"]);
  });

  it("builds route capture scope with route intersections and hides unrelated routes", () => {
    const model = buildReportModel(state, [{ type: "feature", id: "fiber" }], "Route Report");
    const section = model.sections[0];

    expect(section.captureMode).toBe("route");
    expect(section.focusFeatureIds).toEqual(["fiber", "intersection"]);
    expect(section.hiddenFeatureIds).toContain("otherFiber");
    expect(section.hiddenFeatureIds).not.toContain("fiber");
    expect(section.bounds?.[0]).toBeLessThan(10.1);
    expect(section.bounds?.[2]).toBeGreaterThan(10.2);
  });

  it("reports missing site photos without dropping resolved photos", () => {
    const model = buildReportModel(state, [{ type: "feature", id: "fiber" }], "Photo Report");

    expect(model.sections[0].details[0].photos).toEqual([]);
    expect(model.sections[0].details[0].photoWarnings[0]).toContain("site photo");
    expect(model.sections[0].photoWarnings[0]).toContain("site photo");
  });

  it("nests intersection children under their parent in selectable items", () => {
    const items = getSelectableReportItems(state);
    const intersection = items.find((item) => item.key === "feature:intersection");
    const camera = items.find((item) => item.key === "feature:camera");

    expect(intersection?.level).toBe(2);
    expect(camera?.level).toBe(3);
    expect(items.findIndex((item) => item.key === "feature:camera")).toBe(
      (items.findIndex((item) => item.key === "feature:intersection")) + 1,
    );
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

  it("sanitizes invalid or zero-span bounds correctly", () => {
    expect(sanitizeReportBounds(null)).toBeNull();
    expect(sanitizeReportBounds([NaN, 106, 10, 107] as any)).toBeNull();
    const sanitized = sanitizeReportBounds([10.1, 106.1, 10.1, 106.1]);
    expect(sanitized).not.toBeNull();
    expect(sanitized![2]).toBeGreaterThan(sanitized![0]);
    expect(sanitized![3]).toBeGreaterThan(sanitized![1]);
  });
});
