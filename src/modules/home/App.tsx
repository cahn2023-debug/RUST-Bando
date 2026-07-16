import { useEffect, useState, Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { Ribbon } from "@DESIGN/components/ui/Ribbon";
import { StatusBar } from "@DESIGN/components/ui/StatusBar";
import { TopToolbar } from "@DESIGN/components/ui/TopToolbar";
import { HomeDashboard } from "@IMPLEMENT/features/project-management/HomeDashboard";
import { useProjectManager } from "@IMPLEMENT/hooks/useProjectManager";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";

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
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";

const ProjectDetail = lazy(() =>
  import("@IMPLEMENT/features/project-management/ProjectDetail").then((module) => ({
    default: module.ProjectDetail,
  }))
);

export default function App() {
  const { loadSettings } = useSettingsStore();
  const { logout } = useAuthStore();
  const pendingSync = useDesignSync((state) => state.pendingSync);
  const syncStatus = useDesignSync((state) => state.syncStatus);
  const syncError = useDesignSync((state) => state.error);
  const flushPendingPersists = useDesignSync((state) => state.flushPendingPersists);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("HOME");
  const [contractType, setContractType] = useState<"INVESTOR" | "SUBCONTRACTOR" | "FINANCE">("INVESTOR");

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

  // Application bootstrap and side effects
  useAppBootstrap(handleOpenProject, () => setActiveTab("DESIGN"));

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveProject = async () => {
    if (!selectedProject) return;
    try {
      if (pendingSync && !syncError) {
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

  const handleForceSave = async () => {
    if (!selectedProject) return;
    try {
      if (pendingSync && !syncError) {
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
        await getCurrentWindow().setTitle(`[${statusText}] - ${projectText}`);
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
          window.location.reload();
          break;
        case "logout":
          logout();
          break;
        case "help":
          announce("Help documentation is currently unavailable.");
          break;
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [selectedProject, pendingSync, logout]);

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
        if (pendingSync && !syncError) {
          await flushPendingPersists();
        }

        // Real page reload to reset all states cleanly
        window.location.reload();
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingSync, syncError, flushPendingPersists, selectedProject]);

  const selectFeature = useDesignSync(s => s.selectFeature);
  const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);

  const handleTabChange = (newTab: string) => {
    if (newTab === "HOME") {
      void (async () => {
        if (selectedProject) {
          try {
            if (pendingSync && !syncError) {
              await flushPendingPersists();
            }
            await safeInvoke("save_project");
            requestStorageHealthRefresh();
          } catch (e) {
            console.error("[App] Auto-save before closing project failed:", e);
          }
        }
      })();
      selectFeature(null);
      setSelectedGroup(null);
      handleCloseProject();
    }
    setActiveTab(newTab);
  };

  return (
    <AppBootstrap>
      <div className="h-full w-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-cad-bg text-cad-text-primary font-sans">
        <TopToolbar
          onSave={handleSaveProject}
          onUndo={() => announce("Undo action triggered")}
          onRedo={() => announce("Redo action triggered")}
        />

        {selectedProject && (
          <div className="bg-[#2B2B2B] border-b border-[#1A1A1A] px-2 h-9 flex items-center">
            <TabContainer
              onTabSwitch={async (id: string) => {
                const tab = useTabStore.getState().tabs.find(t => t.id === id);
                if (tab) {
                  if (activeTab === 'HOME') {
                    setActiveTab('DESIGN');
                  }
                  const success = await handleOpenProject(tab.path);
                  if (!success && activeTab === 'HOME') {
                    setActiveTab('HOME');
                  }
                }
              }}
              onTabClose={() => {
                if (useTabStore.getState().tabs.length === 0) {
                  setActiveTab('HOME');
                  handleCloseProject();
                }
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
        />

        <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden relative">
          <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            {activeTab === "ADMIN" ? (
              <AdminPanel />
            ) : selectedProject && activeTab !== "HOME" ? (
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center border border-cad-border m-4 bg-cad-elevated/10">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="animate-spin text-cad-accent" size={20} />
                      <span className="text-[9px] font-mono text-cad-text-muted uppercase tracking-tighter">
                        Loading Workspace Module...
                      </span>
                    </div>
                  </div>
                }
              >
                <ProjectDetail
                  key={selectedProject.path}
                  project={selectedProject}
                  activeTab={activeTab}
                  contractType={contractType}
                  onProjectUpdate={refreshProject}
                />
              </Suspense>
            ) : (
              <HomeDashboard
                projects={projects}
                loadingProjects={loadingProjects}
                onOpenProject={handleOpenProject}
                onDeleteProject={handleDeleteProject}
                onSelectProject={async (project) => {
                  setActiveTab("DESIGN");
                  const success = await handleOpenProject(project.path);
                  if (!success) setActiveTab("HOME");
                }}
                onShowCreate={() => setShowCreate(true)}
                onRestoreFromConfig={handleRestoreFromConfig}
              />
            )}
          </main>
        </div>

        <StatusBar />

        <GlobalModals
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          loadProjects={loadProjects}
          handleOpenProject={handleOpenProject}
          setActiveTab={setActiveTab}
          isDeleteModalOpen={isDeleteModalOpen}
          setIsDeleteModalOpen={setIsDeleteModalOpen}
          confirmDelete={confirmDelete}
          projectToDelete={projectToDelete}
        />
      </div>
    </AppBootstrap>
  );
}
