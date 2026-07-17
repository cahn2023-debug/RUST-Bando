import { describe, expect, it } from "vitest";
import { buildFeatureCreatedEvents } from "./importService";

describe("importService", () => {
  it("builds FeatureCreated events with point coordinates and metadata", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "7f4c6d4b-8a67-4c44-a5f2-3d1b0d3f1f11",
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
          id: "7f4c6d4b-8a67-4c44-a5f2-3d1b0d3f1f11",
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

  it("uses UUID-like ids for imported KML/KMZ records", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "ignored-for-kml-import",
          geom_type: "LineString",
          geometry: [[105.8, 21.0], [105.9, 21.1]],
          center_lat: 21.05,
          center_lon: 105.85,
          tile_id: "sample-row-1",
          properties: {
            name: "Polyline A",
          },
          source_format: "kml",
        },
      ],
      "group-1",
      "layer-1"
    );

    expect(events[0]?.payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("keeps the imported STT column merged with display_order", () => {
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
            STT: "21_4",
            display_order: "21_4",
          },
        },
      ],
      "group-1",
      "layer-1"
    );

    const metadata = JSON.parse((events[0] as any).payload.metadata);

    expect(metadata.display_order).toBe("21_4");
    expect(metadata.STT).toBe("21_4");
  });
});
