import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import type { FeatureState } from "@CONTRACT/types";
import type { ReportModel } from "./reportModel";
import { buildReportDocx } from "./reportDocx";

const { invokeMock, resolveMediaAssetMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  resolveMediaAssetMock: vi.fn(),
}));

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: invokeMock,
}));

vi.mock("@IMPLEMENT/services/mediaAssetService", () => ({
  resolveMediaAsset: resolveMediaAssetMock,
}));

const pngBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9,
  251, 3, 253, 167, 138, 219, 69, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

const baseFeature: FeatureState = {
  id: "camera",
  layer_id: "l1",
  group_id: "g1",
  name: "Camera",
  geom_type: "Point",
  metadata: {},
  properties: {},
  coordinates: [106.1, 10.1],
};

const makeModel = (photos: ReportModel["sections"][number]["details"][number]["photos"] = []): ReportModel => ({
  title: "Bao cao test",
  generatedAt: "2026-07-12T00:00:00.000Z",
  selectedItems: [{ type: "feature", id: "camera" }],
  sections: [{
    id: "camera",
    anchor: "report_camera",
    title: "1. Camera",
    displayType: "CCTV",
    feature: baseFeature,
    description: "Mo ta",
    summary: ["CCTV: 1"],
    photos: [],
    photoWarnings: photos.length ? [] : ["Camera: Chua co anh site photo."],
    bounds: [10, 106, 10.2, 106.2],
    captureMode: "feature",
    focusFeatureIds: ["camera"],
    hiddenFeatureIds: [],
    requiredFeatureIds: ["camera"],
    requiredPoints: [[106.1, 10.1]],
    captureWarnings: [],
    details: [{
      feature: baseFeature,
      label: "Doi tuong 1",
      displayType: "CCTV",
      description: "Mo ta",
      metadata: {},
      properties: {},
      photos,
      photoWarnings: photos.length ? [] : ["Camera: Chua co anh site photo."],
      bounds: [10, 106, 10.2, 106.2],
      startPoint: [106.1, 10.1],
      connectedNames: [],
    }],
  }],
});

beforeEach(() => {
  invokeMock.mockReset();
  resolveMediaAssetMock.mockReset();
});

describe("reportDocx", () => {
  it("generates a docx buffer with internal TOC targets", async () => {
    const buffer = await buildReportDocx(makeModel(), {});
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toContain("Bao cao test");
    expect(documentXml).toContain("Chua co anh site photo");
  });

  it("embeds site photos resolved by project asset fallback", async () => {
    const model = makeModel([{
      id: "photo-1",
      label: "Photo 1",
      dataUrl: "",
      assetId: "asset-1",
      featureId: "camera",
      projectId: "project-1",
      absolutePath: "D:\\missing\\photo.png",
      relativePath: "assets\\photo.png",
      mimeType: "image/png",
      status: "resolved",
    }]);

    invokeMock.mockImplementation((_command, args) => {
      if (args.path === "D:\\missing\\photo.png") {
        throw new Error("missing");
      }
      return pngBytes;
    });
    resolveMediaAssetMock.mockResolvedValue({ path: "D:\\resolved\\photo.png" });

    const buffer = await buildReportDocx(model, {}, undefined, "project-1");
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));

    expect(resolveMediaAssetMock).toHaveBeenCalledWith("project-1", "asset-1");
    expect(mediaFiles.length).toBeGreaterThan(0);
  });
});
