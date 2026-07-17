import { describe, expect, it } from "vitest";
import { buildFeatureCreatedEvents } from "./importService";
import type { FeatureState } from "@CONTRACT/types";

const pointFeature = (id: string, coordinates: [number, number], metadata: Record<string, unknown> = {}): FeatureState => ({
  id,
  layer_id: "layer-1",
  group_id: "group-1",
  name: id,
  geom_type: "Point",
  metadata,
  properties: {},
  coordinates,
});

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

    expect((events[0] as any)?.payload.id).toMatch(
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

  it("enriches imported lines into SignalLine metadata when both endpoints snap to different nodes", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "line-1",
          geom_type: "LineString",
          geometry: [[105.00001, 21.00001], [105.01001, 21.01001]],
          center_lat: 21.005,
          center_lon: 105.005,
          tile_id: "kml-line-1",
          properties: { name: "Imported Line" },
          source_format: "kml",
        },
      ],
      "group-1",
      "layer-1",
      {
        featuresById: {
          cabinet: pointFeature("cabinet", [105, 21], { network: { role: "cabinet", is_origin: true } }),
          camera: pointFeature("camera", [105.01, 21.01], { network: { role: "device" } }),
        },
      }
    );

    const metadata = JSON.parse((events[0] as any).payload.metadata);
    expect(metadata.start_node_id).toBe("cabinet");
    expect(metadata.end_node_id).toBe("camera");
    expect(metadata.infrastructure).toMatchObject({ type: "SignalLine" });
    expect(metadata.network).toMatchObject({
      from_feature_id: "cabinet",
      to_feature_id: "camera",
      from_endpoint: { type: "feature", id: "cabinet" },
      to_endpoint: { type: "feature", id: "camera" },
      direction_mode: "auto",
    });
  });

  it("stores snap_links for middle vertices near existing objects", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "line-1",
          geom_type: "LineString",
          geometry: [[105.00001, 21.00001], [105.00501, 21.00501], [105.01001, 21.01001]],
          center_lat: 21.005,
          center_lon: 105.005,
          tile_id: "kml-line-2",
          properties: { name: "Imported Line" },
          source_format: "kml",
        },
      ],
      "group-1",
      "layer-1",
      {
        featuresById: {
          cabinet: pointFeature("cabinet", [105, 21], { network: { role: "cabinet", is_origin: true } }),
          midpoint: pointFeature("midpoint", [105.005, 21.005], { network: { role: "device" } }),
          camera: pointFeature("camera", [105.01, 21.01], { network: { role: "device" } }),
        },
      }
    );

    const metadata = JSON.parse((events[0] as any).payload.metadata);
    expect(metadata.snap_links).toEqual({
      v0: "cabinet",
      v1: "midpoint",
      v2: "camera",
    });
  });

  it("keeps a line ordinary when only one endpoint snaps", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "line-1",
          geom_type: "LineString",
          geometry: [[105.00001, 21.00001], [106, 22]],
          center_lat: 21.5,
          center_lon: 105.5,
          tile_id: "kml-line-3",
          properties: { name: "Imported Line" },
          source_format: "kml",
        },
      ],
      "group-1",
      "layer-1",
      {
        featuresById: {
          cabinet: pointFeature("cabinet", [105, 21], { network: { role: "cabinet", is_origin: true } }),
        },
      }
    );

    const metadata = JSON.parse((events[0] as any).payload.metadata);
    expect(metadata.start_node_id).toBe("cabinet");
    expect(metadata.end_node_id).toBeUndefined();
    expect(metadata.infrastructure).toBeUndefined();
    expect(metadata.network).toBeUndefined();
  });

  it("avoids turning a line into a self-loop when both endpoints snap to the same node", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "line-1",
          geom_type: "LineString",
          geometry: [[105.00001, 21.00001], [105.00001, 21.00001]],
          center_lat: 21,
          center_lon: 105,
          tile_id: "kml-line-4",
          properties: { name: "Imported Line" },
          source_format: "kml",
        },
      ],
      "group-1",
      "layer-1",
      {
        featuresById: {
          cabinet: pointFeature("cabinet", [105, 21], { network: { role: "cabinet", is_origin: true } }),
        },
      }
    );

    const metadata = JSON.parse((events[0] as any).payload.metadata);
    expect(metadata.start_node_id).toBe("cabinet");
    expect(metadata.end_node_id).toBe("cabinet");
    expect(metadata.infrastructure).toBeUndefined();
    expect(metadata.network).toBeUndefined();
  });

  it("allows imported lines to snap against points created in the same batch", () => {
    const events = buildFeatureCreatedEvents(
      [
        {
          id: "cabinet-import",
          geom_type: "Point",
          geometry: [105, 21],
          center_lat: 21,
          center_lon: 105,
          tile_id: "batch-1",
          properties: { name: "Cabinet Import" },
          metadata: { network: { role: "cabinet", is_origin: true } },
        },
        {
          id: "camera-import",
          geom_type: "Point",
          geometry: [105.01, 21.01],
          center_lat: 21.01,
          center_lon: 105.01,
          tile_id: "batch-2",
          properties: { name: "Camera Import" },
          metadata: { network: { role: "device" } },
        },
        {
          id: "line-import",
          geom_type: "LineString",
          geometry: [[105.00001, 21.00001], [105.01001, 21.01001]],
          center_lat: 21.005,
          center_lon: 105.005,
          tile_id: "batch-3",
          properties: { name: "Batch Line" },
        },
      ],
      "group-1",
      "layer-1"
    );

    const importedCabinetId = (events[0] as any).payload.id;
    const importedCameraId = (events[1] as any).payload.id;
    const metadata = JSON.parse((events[2] as any).payload.metadata);
    expect(metadata.network).toMatchObject({
      from_feature_id: importedCabinetId,
      to_feature_id: importedCameraId,
    });
    expect(metadata.infrastructure).toMatchObject({ type: "SignalLine" });
  });
});
