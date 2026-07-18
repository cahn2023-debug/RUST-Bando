import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ImportDialog } from "./ImportDialog";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  analyzePmpImport: vi.fn(),
  importPmpIntoProject: vi.fn(),
  analyzeFile: vi.fn(),
  startImport: vi.fn(),
  applyImportedRecords: vi.fn(),
  initialize: vi.fn(),
  requestStorageHealthRefresh: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
}));

vi.mock("@IMPLEMENT/services/importService", () => ({
  importService: {
    analyzePmpImport: mocks.analyzePmpImport,
    importPmpIntoProject: mocks.importPmpIntoProject,
    analyzeFile: mocks.analyzeFile,
    startImport: mocks.startImport,
  },
  applyImportedRecords: mocks.applyImportedRecords,
}));

vi.mock("@IMPLEMENT/stores/useDesignSync", () => ({
  useDesignSync: {
    getState: () => ({
      initialize: mocks.initialize,
    }),
  },
}));

vi.mock("@IMPLEMENT/services/projectStorageService", () => ({
  requestStorageHealthRefresh: mocks.requestStorageHealthRefresh,
}));

vi.mock("@IMPLEMENT/components/import/ImportReviewDialog", () => ({
  ImportReviewDialog: () => null,
}));

describe("ImportDialog PMP flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("analyzes a selected .pmp file and shows preview counts", async () => {
    mocks.open.mockResolvedValue("D:/demo/source.pmp");
    mocks.analyzePmpImport.mockResolvedValue({
      sourceProjectName: "Source Demo",
      regions: 1,
      layers: 2,
      groups: 3,
      features: 4,
      mediaAssets: 5,
      warnings: ["Preview warning"],
    });

    render(
      <ImportDialog
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        project={{ id: "project-1", name: "Target", path: "D:/demo/target.pmp" } as never}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Import from \.pmp/i }));

    await waitFor(() => {
      expect(mocks.analyzePmpImport).toHaveBeenCalledWith("D:/demo/source.pmp");
    });

    expect(screen.getByText("Source Demo")).toBeInTheDocument();
    expect(screen.getByText("Preview warning")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("imports the selected .pmp into the current project and refreshes design state", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    mocks.open.mockResolvedValue("D:/demo/source.pmp");
    mocks.analyzePmpImport.mockResolvedValue({
      sourceProjectName: "Source Demo",
      regions: 1,
      layers: 1,
      groups: 1,
      features: 2,
      mediaAssets: 1,
      warnings: [],
    });
    mocks.importPmpIntoProject.mockResolvedValue({
      importedRegions: 1,
      importedLayers: 1,
      importedGroups: 1,
      importedFeatures: 2,
      importedMediaAssets: 1,
      skippedMediaAssets: 0,
      importedAt: "2026-07-17T10:00:00+07:00",
    });

    render(
      <ImportDialog
        onClose={onClose}
        onSuccess={onSuccess}
        project={{ id: "project-1", name: "Target", path: "D:/demo/target.pmp" } as never}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Import from \.pmp/i }));

    await screen.findByText("Source Demo");
    fireEvent.click(screen.getByRole("button", { name: /Import PMP/i }));

    await waitFor(() => {
      expect(mocks.importPmpIntoProject).toHaveBeenCalledWith(
        "D:/demo/source.pmp",
        "project-1"
      );
    });
    expect(mocks.initialize).toHaveBeenCalledWith("project-1", "D:/demo/target.pmp");
    expect(mocks.requestStorageHealthRefresh).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("pmp_import_2");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows backend errors and keeps the dialog open when .pmp import fails", async () => {
    const onClose = vi.fn();

    mocks.open.mockResolvedValue("D:/demo/source.pmp");
    mocks.analyzePmpImport.mockResolvedValue({
      sourceProjectName: "Source Demo",
      regions: 1,
      layers: 1,
      groups: 1,
      features: 2,
      mediaAssets: 0,
      warnings: [],
    });
    mocks.importPmpIntoProject.mockRejectedValue(new Error("Import failed in backend"));

    render(
      <ImportDialog
        onClose={onClose}
        onSuccess={vi.fn()}
        project={{ id: "project-1", name: "Target", path: "D:/demo/target.pmp" } as never}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Import from \.pmp/i }));
    await screen.findByText("Source Demo");
    fireEvent.click(screen.getByRole("button", { name: /Import PMP/i }));

    await screen.findByText("Import failed in backend");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Import PMP/i })).toBeInTheDocument();
  });
});
