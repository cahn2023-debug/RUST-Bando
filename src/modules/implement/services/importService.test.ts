import { describe, expect, it } from "vitest";
import { buildFeatureCreatedEvents } from "./importService";

describe("importService", () => {
  it("builds FeatureCreated events with point coordinates and metadata", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "feature-1",
          geom_type: "Point",
          geometry: [105.8342, 21.0278],
          center_lat: 21.0278,
          center_lon: 105.8342,
          tile_id: "excel-row-2",
          properties: {
            name: "Camera A",
            description: "Nút giao chính",
            display_order: "1",
          },
        },
      ],
      "group-1",
      "layer-1"
    );

    expect(events).toEqual([
      {
        type: "FeatureCreated",
        payload: {
          id: "feature-1",
          layer_id: "layer-1",
          group_id: "group-1",
          name: "Camera A",
          geom_type: "Point",
          metadata: JSON.stringify({
            description: "Nút giao chính",
            display_order: "1",
            imported_from: "excel",
            imported_tile_id: "excel-row-2",
            source_properties: {
              name: "Camera A",
              description: "Nút giao chính",
              display_order: "1",
            },
          }),
          coordinates: [105.8342, 21.0278],
          properties: {
            name: "Camera A",
            description: "Nút giao chính",
            display_order: "1",
          },
        },
      },
    ]);
  });
});
