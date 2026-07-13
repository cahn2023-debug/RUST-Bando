import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectManager } from "./useProjectManager";

const mockInvoke = vi.fn();
const mockOpenDialog = vi.fn();
const mockLoadSettings = vi.fn();
const mockAddTab = vi.fn();
const mockRemoveTab = vi.fn();
const mockResetDesign = vi.fn();

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: (...args: unknown[]) => mockInvoke(...args),
  safeOpenDialog: (...args: unknown[]) => mockOpenDialog(...args),
  IS_REAL_TAURI: true,
}));

vi.mock("@IMPLEMENT/stores/useSettingsStore", () => ({
  useSettingsStore: () => ({
    loadSettings: mockLoadSettings,
  }),
}));

vi.mock("@IMPLEMENT/TabInProgram/useTabStore", () => ({
  useTabStore: {
    getState: () => ({
      addTab: mockAddTab,
      removeTab: mockRemoveTab,
    }),
  },
}));

vi.mock("@IMPLEMENT/stores/useDesignSync", () => ({
  useDesignSync: {
    getState: () => ({
      reset: mockResetDesign,
    }),
  },
}));

describe("useProjectManager", () => {
  const backendProject = {
    id: "project-1",
    name: "Existing Project",
    path: "C:/workspace/existing-project.pmp",
    description: "Stored in backend",
    contract_number: null,
    investor: null,
    contractor: null,
    signed_date: null,
    duration: null,
    end_date: null,
    status: "active" as const,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
  };

  beforeEach(() => {
    mockInvoke.mockReset();
    mockOpenDialog.mockReset();
    mockLoadSettings.mockReset();
    mockAddTab.mockReset();
    mockRemoveTab.mockReset();
    mockResetDesign.mockReset();
    localStorage.clear();
  });

  it("hydrates recent projects from backend without dropping valid path data", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "get_app_config":
          return { recent_pmps: [backendProject] };
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useProjectManager());

    await waitFor(() => {
      expect(result.current.loadingProjects).toBe(false);
      expect(result.current.projects).toEqual([backendProject]);
    });

    expect(mockLoadSettings).toHaveBeenCalled();
  });

  it("opens a direct .pmp path and persists recent projects only after backend success", async () => {
    mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [];
        case "get_app_config":
          return { recent_pmps: [] };
        case "load_pmp_file":
          expect(args).toEqual({ path: backendProject.path });
          return backendProject;
        case "save_recent_projects":
          return null;
        case "save_last_opened_project":
          return null;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useProjectManager());

    await waitFor(() => {
      expect(result.current.loadingProjects).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleOpenProject(backendProject.path);
    });

    expect(success).toBe(true);
    expect(result.current.selectedProject).toEqual(backendProject);
    expect(result.current.projects).toEqual([backendProject]);
    expect(mockResetDesign).toHaveBeenCalled();
    expect(mockAddTab).toHaveBeenCalledWith({
      id: backendProject.id,
      name: backendProject.name,
      path: backendProject.path,
    });
    expect(mockInvoke).toHaveBeenCalledWith("load_pmp_file", { path: backendProject.path });
    expect(mockInvoke).toHaveBeenCalledWith("save_recent_projects", { projects: [backendProject] });
    expect(mockInvoke).toHaveBeenCalledWith("save_last_opened_project", { project: backendProject });
  });

  it("opens a recent project optimistically before backend attach finishes", async () => {
    const attachedProject = {
      ...backendProject,
      name: "Existing Project Refreshed",
      updated_at: "2026-07-11T00:00:00Z",
    };
    const loadDeferred = createDeferred<typeof attachedProject>();

    mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "get_app_config":
          return { recent_pmps: [backendProject] };
        case "load_pmp_file":
          expect(args).toEqual({ path: backendProject.path });
          return loadDeferred.promise;
        case "save_recent_projects":
        case "save_last_opened_project":
          return null;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useProjectManager());

    await waitFor(() => {
      expect(result.current.loadingProjects).toBe(false);
      expect(result.current.projects).toEqual([backendProject]);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleOpenProject(backendProject.path);
    });

    expect(success).toBe(true);
    expect(result.current.selectedProject).toEqual(backendProject);
    expect(result.current.projects).toEqual([backendProject]);
    expect(mockAddTab).toHaveBeenCalledWith({
      id: backendProject.id,
      name: backendProject.name,
      path: backendProject.path,
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("save_last_opened_project", { project: backendProject });

    await act(async () => {
      loadDeferred.resolve(attachedProject);
      await loadDeferred.promise;
    });

    await waitFor(() => {
      expect(result.current.selectedProject).toEqual(attachedProject);
      expect(mockInvoke).toHaveBeenCalledWith("save_last_opened_project", { project: attachedProject });
    });
  });

  it("keeps an optimistically opened recent project if backend attach fails", async () => {
    const loadDeferred = createDeferred<typeof backendProject>();

    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "get_app_config":
          return { recent_pmps: [backendProject] };
        case "load_pmp_file":
          return loadDeferred.promise;
        case "save_recent_projects":
        case "save_last_opened_project":
          return null;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useProjectManager());

    await waitFor(() => {
      expect(result.current.loadingProjects).toBe(false);
    });

    await act(async () => {
      const success = await result.current.handleOpenProject(backendProject.path);
      expect(success).toBe(true);
    });

    expect(result.current.selectedProject).toEqual(backendProject);

    await act(async () => {
      loadDeferred.reject(new Error("locked"));
      await loadDeferred.promise.catch(() => null);
    });

    await waitFor(() => {
      expect(result.current.selectedProject).toEqual(backendProject);
    });
  });
});
