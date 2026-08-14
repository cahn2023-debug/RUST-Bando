import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mocks = vi.hoisted(() => {
  const project = {
    id: "project-1",
    name: "Demo Project",
    path: "C:/workspace/demo.pmp",
    description: null,
    contract_number: null,
    investor: null,
    contractor: null,
    signed_date: null,
    duration: null,
    end_date: null,
    status: "active",
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
  };
  const designSyncState = {
    pendingSync: false,
    syncStatus: 0,
    error: null,
    selectedFeatureId: null,
    flushPendingPersists: vi.fn(),
    selectFeature: vi.fn(),
    setSelectedGroup: vi.fn(),
  };
  const useDesignSync = Object.assign(
    vi.fn((selector?: (state: typeof designSyncState) => unknown) =>
      selector ? selector(designSyncState) : designSyncState
    ),
    {
      getState: vi.fn(() => ({
        state: { features: {} },
      })),
      setState: vi.fn(),
    }
  );

  return {
    project,
    handleOpenProject: vi.fn(),
    refreshProject: vi.fn(),
    useDesignSync,
  };
});

vi.mock("@IMPLEMENT/features/project-management/ProjectDetail", () => ({
  ProjectDetail: ({ project, activeTab }: { project: typeof mocks.project; activeTab: string }) => (
    <div data-testid="project-detail">{project.name}:{activeTab}</div>
  ),
}));

vi.mock("@IMPLEMENT/hooks/useProjectManager", () => ({
  useProjectManager: () => ({
    projects: [mocks.project],
    selectedProject: mocks.project,
    loadingProjects: false,
    loadProjects: vi.fn(),
    refreshProject: mocks.refreshProject,
    handleOpenProject: mocks.handleOpenProject,
    handleCloseProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handleRestoreFromConfig: vi.fn(),
    isDeleteModalOpen: false,
    setIsDeleteModalOpen: vi.fn(),
    projectToDelete: null,
    confirmDelete: vi.fn(),
  }),
}));

vi.mock("@IMPLEMENT/hooks/useAppBootstrap", () => ({
  useAppBootstrap: vi.fn(),
}));

vi.mock("./AppBootstrap", () => ({
  AppBootstrap: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./GlobalModals", () => ({
  GlobalModals: () => null,
}));

vi.mock("@DESIGN/components/ui/TopToolbar", () => ({
  TopToolbar: () => <div data-testid="top-toolbar" />,
}));

vi.mock("@DESIGN/components/ui/StatusBar", () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock("@DESIGN/components/ui/Ribbon", () => ({
  Ribbon: ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => (
    <button type="button" onClick={() => onTabChange("DESIGN")}>
      Ribbon:{activeTab}
    </button>
  ),
}));

vi.mock("@IMPLEMENT/features/project-management/HomeDashboard", () => ({
  HomeDashboard: ({ onSelectProject }: { onSelectProject: (project: typeof mocks.project) => Promise<void> }) => (
    <button type="button" onClick={() => onSelectProject(mocks.project)}>
      Open Demo Project
    </button>
  ),
}));

vi.mock("@IMPLEMENT/features/admin/AdminPanel", () => ({
  AdminPanel: () => <div data-testid="admin-panel" />,
}));

vi.mock("@IMPLEMENT/TabInProgram/TabContainer", () => ({
  TabContainer: () => <div data-testid="tab-container" />,
}));

vi.mock("@IMPLEMENT/TabInProgram/useTabStore", () => ({
  useTabStore: {
    getState: () => ({
      tabs: [],
    }),
  },
}));

vi.mock("@CORE/stores/useSettingsStore", () => ({
  useSettingsStore: () => ({
    loadSettings: vi.fn(),
  }),
}));

vi.mock("@CORE/stores/useAuthStore", () => ({
  useAuthStore: () => ({
    logout: vi.fn(),
  }),
}));

vi.mock("@IMPLEMENT/stores/useDesignSync", () => ({
  useDesignSync: mocks.useDesignSync,
}));

vi.mock("@CORE/stores/useLayoutStore", () => ({
  useLayoutStore: (selector: (state: any) => unknown) =>
    selector({
      togglePalette: vi.fn(),
      paletteConfigs: {},
      layoutColumns: [],
      leftWidth: 280,
    }),
  PALETTE_SIDEBAR_WIDTH: 36,
}));

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@IMPLEMENT/services/projectStorageService", () => ({
  requestStorageHealthRefresh: vi.fn(),
}));

vi.mock("@TOOL/utils/accessibility", () => ({
  announce: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: vi.fn(),
  }),
}));

describe("App workspace rendering", () => {
  beforeEach(() => {
    mocks.handleOpenProject.mockReset();
    mocks.handleOpenProject.mockResolvedValue(true);
  });

  it("renders ProjectDetail directly instead of the workspace Suspense fallback", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("Open Demo Project"));

    await waitFor(() => {
      expect(screen.getByTestId("project-detail")).toHaveTextContent("Demo Project:DESIGN");
    });
    expect(screen.queryByText("Loading Workspace Module...")).not.toBeInTheDocument();
  });
});
