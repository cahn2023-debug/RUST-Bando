import { useCallback, useEffect, useState } from "react";
import { Ribbon } from "@DESIGN/components/ui/Ribbon";
import { StatusBar } from "@DESIGN/components/ui/StatusBar";
import { TopToolbar } from "@DESIGN/components/ui/TopToolbar";
import { HomeDashboard } from "@IMPLEMENT/features/project-management/HomeDashboard";
import { ProjectDetail } from "@IMPLEMENT/features/project-management/ProjectDetail";
import { useProjectManager } from "@IMPLEMENT/hooks/useProjectManager";
import { useSettingsStore } from "@CORE/stores/useSettingsStore";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useLayoutStore } from "@CORE/stores/useLayoutStore";
import { AppMenu } from "@DESIGN/components/ui/AppMenu";
import { useKeytips } from "@DESIGN/hooks/useKeytips";

// Extracted components
import { AppBootstrap } from "./AppBootstrap";
import { GlobalModals } from "./GlobalModals";
import { useAppBootstrap } from "@IMPLEMENT/hooks/useAppBootstrap";
import { AdminPanel } from "@IMPLEMENT/features/admin/AdminPanel";
import { TabContainer } from "@IMPLEMENT/TabInProgram/TabContainer";
import { useTabStore } from "@IMPLEMENT/TabInProgram/useTabStore";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { requestStorageHealthRefresh } from "@IMPLEMENT/services/projectStorageService";
import { announce } from "@TOOL/utils/accessibility";
import { getCurrentWindow, listen } from "@/contracts/tauri-api/runtime";
import { useAuthStore } from "@CORE/stores/useAuthStore";
import { MapProvider } from "@DESIGN/features/map/MapContext";
import { confirmUserAction } from "@SHARED/utils/userConfirmation";
import "./WorkspaceGrid.css";

const UNSAVED_DESIGN_WARNING =
  "Màn hình DESIGN có thay đổi chưa lưu. Nếu tiếp tục mà không lưu, các đối tượng mới hoặc chỉnh sửa sẽ không có trong file .pmp và không hiển thị khi mở lại. Bạn có muốn tiếp tục mà không lưu không?";

export default function App() {
  const { loadSettings } = useSettingsStore();
  const { logout } = useAuthStore();
  const pendingSync = useDesignSync((state) => state.pendingSync);
  const hasUnsavedChanges = useDesignSync((state) => state.hasUnsavedChanges);
  const syncStatus = useDesignSync((state) => state.syncStatus);
  const syncError = useDesignSync((state) => state.error);
  const flushPendingPersists = useDesignSync((state) => state.flushPendingPersists);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("HOME");
  const [contractType, setContractType] = useState<"INVESTOR" | "SUBCONTRACTOR" | "FINANCE">("INVESTOR");
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const { keytipsActive, dismissKeytips } = useKeytips();

  const {
    projects,
    selectedProject,
    loadingProjects,
    loadProjects,
    refreshProject,
    handleOpenProject,
    handleCloseProject,
    handleDeleteProject,
    handleRestoreFromConfig,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    projectToDelete,
    confirmDelete,
  } = useProjectManager();

  const confirmUnsavedDesignExit = useCallback(async () => {
    if (!hasUnsavedChanges) return true;
    return confirmUserAction(UNSAVED_DESIGN_WARNING);
  }, [hasUnsavedChanges]);

  const guardedHandleOpenProject = useCallback(async (path?: string) => {
    if (selectedProject && !(await confirmUnsavedDesignExit())) return false;
    return handleOpenProject(path);
  }, [confirmUnsavedDesignExit, handleOpenProject, selectedProject]);

  const handleSaveProject = async () => {
    if (!selectedProject) return;
    try {
      if ((pendingSync || hasUnsavedChanges) && !syncError) {
        await flushPendingPersists();
      }
      await safeInvoke("save_project");
      requestStorageHealthRefresh();
      announce("Project saved successfully");
      console.log("[App] Project saved successfully");
    } catch (e) {
      console.error("[App] Failed to save project:", e);
      announce("Failed to save project");
    }
  };

  useEffect(() => {
    if (!keytipsActive) return;

    const handleKeytipTrigger = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      switch (key) {
        case "F":
          setIsAppMenuOpen((prev) => !prev);
          dismissKeytips();
          break;
        case "H":
          setActiveTab("HOME");
          dismissKeytips();
          break;
        case "D":
          setActiveTab("DESIGN");
          dismissKeytips();
          break;
        case "I":
          setActiveTab("IMPLEMENT");
          dismissKeytips();
          break;
        case "C":
          setActiveTab("CONTRACT");
          dismissKeytips();
          break;
        case "R":
          setActiveTab("RESOURCES");
          dismissKeytips();
          break;
        case "Y":
          setActiveTab("ANALYTICS");
          dismissKeytips();
          break;
        case "A":
          setActiveTab("ADMIN");
          dismissKeytips();
          break;
        case "1":
          handleSaveProject();
          dismissKeytips();
          break;
      }
    };

    window.addEventListener("keydown", handleKeytipTrigger);
    return () => window.removeEventListener("keydown", handleKeytipTrigger);
  }, [keytipsActive, dismissKeytips]);

  // Application bootstrap and side effects
  useAppBootstrap(guardedHandleOpenProject, () => setActiveTab("DESIGN"));

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleForceSave = async () => {
    if (!selectedProject) return;
    try {
      if ((pendingSync || hasUnsavedChanges) && !syncError) {
        await flushPendingPersists();
      }
      await safeInvoke("force_save_project");
      requestStorageHealthRefresh();
      announce("Project force-saved and flushed successfully");
      console.log("[App] Project force-saved successfully");
    } catch (e) {
      console.error("[App] Failed to force-save project:", e);
      announce("Failed to force-save project");
    }
  };

  // V15: Auto-open Property Panel (spec-panel) when a feature is selected
  const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
  const togglePalette = useLayoutStore(s => s.togglePalette);
  const paletteConfigs = useLayoutStore(s => s.paletteConfigs);

  useEffect(() => {
    if (selectedFeatureId) {
      if (activeTab === 'HOME') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab('DESIGN');
      }

      // Ensure spec-panel is visible
      const specConfig = paletteConfigs['spec-panel'];
      if (specConfig && !specConfig.isVisible) {
        togglePalette('spec-panel');
      }
    }
  }, [selectedFeatureId, togglePalette, paletteConfigs, activeTab]);

  useEffect(() => {
    const updateTitle = async () => {
      const statusText = syncStatus === 0 ? "SAVED" : "CHANGES";
      const projectText = selectedProject ? `${selectedProject.name.toUpperCase()} [${selectedProject.path}]` : "READY";
      try {
        await getCurrentWindow()?.setTitle(`[${statusText}] - ${projectText}`);
      } catch (e) {
        console.warn("Failed to set window title:", e);
      }
    };
    updateTitle();
  }, [selectedProject, syncStatus]);

  useEffect(() => {
    const unlisten = listen<string>("menu-action", (event) => {
      const action = event.payload;
      console.log("[NativeMenu] Action received:", action);
      switch (action) {
        case "save":
          handleSaveProject();
          break;
        case "force_save":
          handleForceSave();
          break;
        case "refresh":
          void (async () => {
            if (await confirmUnsavedDesignExit()) window.location.reload();
          })();
          break;
        case "logout":
          void (async () => {
            if (await confirmUnsavedDesignExit()) logout();
          })();
          break;
        case "help":
          announce("Help documentation is currently unavailable.");
          break;
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [confirmUnsavedDesignExit, logout, pendingSync, selectedProject]);

  useEffect(() => {
    const unlisten = listen<{
      id: string;
      type: 'feature' | 'group' | 'layer' | 'region' | 'location';
      location?: [number, number];
      timestamp: number;
    }>("sync-zoom-to", (event) => {
      const trigger = event.payload;
      if (!trigger?.id) return;

      const store = useDesignSync.getState();
      const feature = store.state?.features?.[trigger.id];

      if (feature) {
        const geomType = (feature.geom_type || '').toUpperCase();
        const isVector = geomType === 'LINESTRING' || geomType === 'POLYLINE' || geomType === 'POLYGON';

        useDesignSync.setState({
          selectedFeatureId: feature.id,
          selectedGroupId: feature.group_id,
          selectedPopupLocation: trigger.type === 'location' ? trigger.location || null : null,
          editingFeatureId: isVector ? feature.id : null,
          previewMetadata: null,
          previewMetadataById: {},
          selectionSet: new Set([feature.id]),
          zoomToTrigger: trigger,
        });
        return;
      }

      useDesignSync.setState({ zoomToTrigger: trigger });
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+S for Force Save (Flush & Checkpoint)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleForceSave();
        return;
      }

      if (event.key !== "F5") {
        return;
      }

      event.preventDefault();

      void (async () => {
        if (!(await confirmUnsavedDesignExit())) return;

        // Real page reload to reset all states cleanly
        window.location.reload();
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmUnsavedDesignExit]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = UNSAVED_DESIGN_WARNING;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const selectFeature = useDesignSync(s => s.selectFeature);
  const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);

  const handleTabChange = (newTab: string) => {
    void (async () => {
      if (newTab === "HOME") {
        if (!(await confirmUnsavedDesignExit())) return;
        selectFeature(null);
        setSelectedGroup(null);
        await handleCloseProject();
      } else if (activeTab === "DESIGN" && newTab !== "DESIGN") {
        if (!(await confirmUnsavedDesignExit())) return;
      }

      setActiveTab(newTab);
    })();
  };

  const handleConfirmDelete = async () => {
    if (projectToDelete?.id === selectedProject?.id && !(await confirmUnsavedDesignExit())) return;
    await confirmDelete();
  };

  return (
    <AppBootstrap>
      <MapProvider>
        <div className="h-full w-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-cad-bg text-cad-text-primary font-sans">
          <TopToolbar
            onSave={handleSaveProject}
            onUndo={() => announce("Undo action triggered")}
            onRedo={() => announce("Redo action triggered")}
            onOpenAppMenu={() => setIsAppMenuOpen((prev) => !prev)}
            keytipsActive={keytipsActive}
          />

          {selectedProject && (
            <div className="bg-[#2B2B2B] border-b border-[#1A1A1A] px-2 h-9 flex items-center">
              <TabContainer
                onTabSwitch={async (id: string) => {
                  const tab = useTabStore.getState().tabs.find(t => t.id === id);
                  if (tab) {
                    const wasHome = activeTab === 'HOME';
                    if (wasHome) {
                      setActiveTab('DESIGN');
                    }
                    const success = await guardedHandleOpenProject(tab.path);
                    if (!success) {
                      useTabStore.getState().setActiveTab(selectedProject?.id ?? '');
                      if (wasHome) setActiveTab('HOME');
                      return false;
                    }
                    return true;
                  }
                  return false;
                }}
                onTabClose={async (id) => {
                  if (id === selectedProject?.id && !(await confirmUnsavedDesignExit())) return false;
                  if (useTabStore.getState().tabs.length === 1) {
                    setActiveTab('HOME');
                    await handleCloseProject();
                  }
                  return true;
                }}
              />
            </div>
          )}
          <Ribbon
            activeTab={activeTab}
            onTabChange={handleTabChange}
            project={selectedProject}
            onForceSave={handleForceSave}
            contractType={contractType}
            onContractTypeChange={setContractType}
            keytipsActive={keytipsActive}
          />

          <AppMenu
            isOpen={isAppMenuOpen}
            onClose={() => setIsAppMenuOpen(false)}
            projects={projects}
            selectedProject={selectedProject}
            onSave={handleSaveProject}
            onForceSave={handleForceSave}
            onOpenProject={guardedHandleOpenProject}
            onShowCreate={() => setShowCreate(true)}
            onNavigateTab={handleTabChange}
            onLogout={logout}
            keytipsActive={keytipsActive}
          />

          <div className="flex-1 workspace-grid">
            {activeTab === "ADMIN" ? (
              <main className="workspace-center workspace-center--content flex flex-col overflow-hidden">
                <AdminPanel />
              </main>
            ) : selectedProject && activeTab !== "HOME" ? (
              /*
                ProjectDetail spreads its own children across the left/center/
                right/bottom grid areas, so it must not introduce a box of its
                own — hence the pass-through wrapper.
              */
              <ProjectDetail
                key={selectedProject.path}
                project={selectedProject}
                activeTab={activeTab}
                contractType={contractType}
                onProjectUpdate={refreshProject}
              />
            ) : (
              <main className="workspace-center workspace-center--content flex flex-col overflow-hidden">
                <HomeDashboard
                  projects={projects}
                  loadingProjects={loadingProjects}
                  onOpenProject={guardedHandleOpenProject}
                  onDeleteProject={(event, project) => {
                    handleDeleteProject(event, project);
                    return Promise.resolve();
                  }}
                  onSelectProject={async (project) => {
                    setActiveTab("DESIGN");
                    const success = await guardedHandleOpenProject(project.path);
                    if (!success) setActiveTab("HOME");
                  }}
                  onShowCreate={() => setShowCreate(true)}
                  onRestoreFromConfig={handleRestoreFromConfig}
                />
              </main>
            )}
          </div>

          <StatusBar />

          <GlobalModals
            showCreate={showCreate}
            setShowCreate={setShowCreate}
            loadProjects={loadProjects}
            handleOpenProject={guardedHandleOpenProject}
            setActiveTab={setActiveTab}
            isDeleteModalOpen={isDeleteModalOpen}
            setIsDeleteModalOpen={setIsDeleteModalOpen}
            confirmDelete={handleConfirmDelete}
            projectToDelete={projectToDelete}
          />
        </div>
      </MapProvider>
    </AppBootstrap>
  );
}
