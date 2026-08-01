import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { ReportModel } from "./reportModel";
import { buildReportDocx } from "./reportDocx";

describe("reportDocx", () => {
  it("generates a docx buffer with internal TOC targets", async () => {
    const model: ReportModel = {
      title: "Báo cáo test",
      generatedAt: "2026-07-12T00:00:00.000Z",
      selectedItems: [{ type: "feature", id: "camera" }],
      sections: [{
        id: "camera",
        anchor: "report_camera",
        title: "1. Camera",
        displayType: "CCTV",
        feature: {
          id: "camera",
          layer_id: "l1",
          group_id: "g1",
          name: "Camera",
          geom_type: "Point",
          metadata: {},
          properties: {},
          coordinates: [106.1, 10.1],
        },
        description: "Mô tả",
        summary: ["CCTV: 1"],
        photos: [],
        photoWarnings: ["Camera: Chưa có ảnh site photo."],
        bounds: [10, 106, 10.2, 106.2],
        captureMode: "feature",
        focusFeatureIds: ["camera"],
        hiddenFeatureIds: [],
        requiredFeatureIds: ["camera"],
        requiredPoints: [[106.1, 10.1]],
        captureWarnings: [],
        details: [{
          feature: {
            id: "camera",
            layer_id: "l1",
            group_id: "g1",
            name: "Camera",
            geom_type: "Point",
            metadata: {},
            properties: {},
            coordinates: [106.1, 10.1],
          },
          label: "Đối tượng 1",
          displayType: "CCTV",
          description: "Mô tả",
          metadata: {},
          properties: {},
          photos: [],
          photoWarnings: ["Camera: Chưa có ảnh site photo."],
          bounds: [10, 106, 10.2, 106.2],
          startPoint: [106.1, 10.1],
          connectedNames: [],
        }],
      }],
    };

    const buffer = await buildReportDocx(model, {});
    expect(buffer.byteLength).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Báo cáo test");
    expect(documentXml).toContain("Chưa có ảnh site photo");
  });
});
