import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Ribbon } from "./Ribbon";

const mocks = vi.hoisted(() => ({
  setAnyDialogOpen: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@IMPLEMENT/stores/useDesignSync", () => {
  const store = {
    undo: vi.fn(),
    redo: vi.fn(),
    isCoordinatePanelOpen: false,
    toggleCoordinatePanel: vi.fn(),
    drawingMode: "none",
    setDrawingMode: vi.fn(),
    selectedGroupId: "group-1",
    setAnyDialogOpen: mocks.setAnyDialogOpen,
    state: {
      regions: { r1: { id: "r1", parent_id: null, name: "Region", description: null } },
      layers: { l1: { id: "l1", region_id: "r1", name: "Layer", is_visible: true } },
      feature_groups: {},
      features: {},
      settings: {},
    },
    selectedFeatureId: null,
    selectionSet: new Set<string>(),
    activeParentFeatureId: null,
    dispatchEvent: vi.fn(),
    addDrawingPoint: vi.fn(),
    currentDrawingPoints: [] as [number, number][],
    currentDrawingSnapIds: [] as (string | null)[],
    networkConnectionDraft: null,
    clearNetworkConnectionDraft: vi.fn(),
    dispatchEvents: vi.fn(),
    queueEvent: vi.fn(),
    queueEvents: vi.fn(),
  };
  const useDesignSync = (selector?: (state: typeof store) => unknown) => {
    if (typeof selector === "function") {
      return selector(store);
    }
    return store;
  };
  useDesignSync.getState = () => store;
  return { useDesignSync };
});

vi.mock("@CORE/stores/useSettingsStore", () => ({
  useSettingsStore: () => ({ enableAi: false, setEnableAi: vi.fn() }),
}));

vi.mock("@CORE/stores/useLayoutStore", () => ({
  useLayoutStore: () => ({ togglePalette: vi.fn(), activePaletteId: null }),
}));

vi.mock("@CORE/stores/useAuthStore", () => ({
  useAuthStore: () => ({ user: null }),
}));

vi.mock("@IMPLEMENT/hooks/useRibbonActions", () => ({
  useRibbonActions: () => ({ openStandaloneWindow: vi.fn(), onReleaseAiMemory: vi.fn() }),
}));

vi.mock("@IMPLEMENT/hooks/useClickOutside", () => ({
  useClickOutside: vi.fn(),
}));

vi.mock("@IMPLEMENT/services/exportService", () => ({
  exportProjectData: vi.fn(),
}));

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@IMPLEMENT/features/files/ImportDialog", () => ({
  ImportDialog: () => <div>Import dialog</div>,
}));

vi.mock("@DESIGN/features/reports/word/ReportExportDialog", () => ({
  ReportExportDialog: () => <div role="dialog">Report export dialog</div>,
}));

vi.mock("@DESIGN/features/map/MapLayerComponents/VisibilityTool", () => ({
  VisibilityTool: () => <button>Visibility</button>,
}));

vi.mock("@DESIGN/features/map/Palette/SystemConfigPanel", () => ({
  SystemConfigPanel: () => <div>System config</div>,
}));

vi.mock("@DESIGN/features/map/Palette/PaletteContext", () => ({
  PaletteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Ribbon report action", () => {
  it("opens the report dialog from the Design data group", () => {
    render(<Ribbon activeTab="DESIGN" onTabChange={vi.fn()} project={{ id: 1, name: "Demo" } as never} />);

    fireEvent.click(screen.getByRole("button", { name: /BÁO CÁO/i }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Report export dialog");
  });
});
