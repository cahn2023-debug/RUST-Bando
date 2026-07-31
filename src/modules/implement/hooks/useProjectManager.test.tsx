import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectManager } from "./useProjectManager";

const mockInvoke = vi.fn();
const mockOpenDialog = vi.fn();
const mockLoadSettings = vi.fn();
const mockAddTab = vi.fn();
const mockRemoveTab = vi.fn();
const mockResetDesign = vi.fn();
const mockInitializeDesign = vi.fn();
const mockAlert = vi.fn();

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
      initialize: mockInitializeDesign,
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

  const bootstrapFor = (project = backendProject, openRequestId = 1) => ({
    project,
    featureCount: 0,
    mapRevision: 0,
    initialBounds: null,
    settings: {},
    regions: {},
    layers: {},
    featureGroups: {},
    streamingMode: false,
    cacheStatus: { cachedTiles: 0, state: "missing" },
    openRequestId,
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    mockOpenDialog.mockReset();
    mockLoadSettings.mockReset();
    mockAddTab.mockReset();
    mockRemoveTab.mockReset();
    mockResetDesign.mockReset();
    mockInitializeDesign.mockReset();
    mockAlert.mockReset();
    vi.stubGlobal("alert", mockAlert);
    localStorage.clear();
  });

  it("hydrates recent projects from backend without dropping valid path data", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
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
    expect(mockInvoke).not.toHaveBeenCalledWith("get_app_config");
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
        case "open_project_bootstrap":
          expect(args).toMatchObject({
            path: backendProject.path,
            openRequestId: expect.any(Number),
            open_request_id: expect.any(Number),
          });
          return bootstrapFor(backendProject, args?.openRequestId as number);
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
    expect(mockResetDesign).not.toHaveBeenCalled();
    expect(mockAddTab).toHaveBeenCalledWith({
      id: backendProject.id,
      name: backendProject.name,
      path: backendProject.path,
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "open_project_bootstrap",
      expect.objectContaining({ path: backendProject.path })
    );
    expect(mockInvoke).toHaveBeenCalledWith("save_recent_projects", { projects: [backendProject] });
    expect(mockInvoke).toHaveBeenCalledWith("save_last_opened_project", { project: backendProject });
    expect(mockInitializeDesign).toHaveBeenCalledWith(
      backendProject.id,
      backendProject.path,
      expect.objectContaining({
        forceReload: true,
        bootstrap: expect.objectContaining({ project: backendProject }),
      })
    );
  });

  it("does not queue map tile build when bootstrap reports ready cache", async () => {
    const cachedBootstrap = {
      ...bootstrapFor(backendProject, 1),
      mapRevision: 9,
      cacheStatus: { cachedTiles: 12, state: "ready" },
    };
    mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [];
        case "open_project_bootstrap":
          return { ...cachedBootstrap, openRequestId: args?.openRequestId };
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
      expect(await result.current.handleOpenProject(backendProject.path)).toBe(true);
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "build_map_tiles_v2",
      expect.anything()
    );
  });

  it("waits for backend attach before opening a recent project", async () => {
    const attachedProject = {
      ...backendProject,
      name: "Existing Project Refreshed",
      updated_at: "2026-07-11T00:00:00Z",
    };
    const loadDeferred = createDeferred<ReturnType<typeof bootstrapFor>>();

    mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "open_project_bootstrap":
          expect(args).toMatchObject({
            path: backendProject.path,
            openRequestId: expect.any(Number),
            open_request_id: expect.any(Number),
          });
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
      const openPromise = result.current.handleOpenProject(backendProject.path);
      await Promise.resolve();
      expect(result.current.selectedProject).toBeNull();
      loadDeferred.resolve(bootstrapFor(attachedProject, 2));
      success = await openPromise;
    });

    expect(success).toBe(true);
    expect(result.current.selectedProject).toEqual(attachedProject);
    expect(mockAddTab).toHaveBeenCalledWith({
      id: attachedProject.id,
      name: attachedProject.name,
      path: attachedProject.path,
    });
    expect(mockInvoke).toHaveBeenCalledWith("save_last_opened_project", { project: attachedProject });
    expect(mockInitializeDesign).toHaveBeenCalledWith(
      attachedProject.id,
      attachedProject.path,
      expect.objectContaining({
        forceReload: true,
        bootstrap: expect.objectContaining({ project: attachedProject }),
      })
    );
  });

  it("does not open a recent project if backend attach fails", async () => {
    const loadDeferred = createDeferred<ReturnType<typeof bootstrapFor>>();

    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "open_project_bootstrap":
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
      const openPromise = result.current.handleOpenProject(backendProject.path);
      await Promise.resolve();
      loadDeferred.reject(new Error("locked"));
      const success = await openPromise;
      expect(success).toBe(false);
    });

    expect(result.current.selectedProject).toBeNull();
  });

  it("does not read openRequestId when bootstrap returns null", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_active_project":
          return null;
        case "get_recent_projects":
          return [backendProject];
        case "open_project_bootstrap":
          return null;
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

    let success = true;
    await act(async () => {
      success = await result.current.handleOpenProject(backendProject.path);
    });

    expect(success).toBe(false);
    expect(result.current.selectedProject).toBeNull();
    expect(mockInitializeDesign).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(expect.stringContaining("PMP"));
  });
});
