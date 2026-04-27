import { useEffect, useState, Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { TitleBar } from "@DESIGN/components/ui/TitleBar";
import { Ribbon } from "@DESIGN/components/ui/Ribbon";
import { StatusBar } from "@DESIGN/components/ui/StatusBar";
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
import { announce } from "@TOOL/utils/accessibility";

const ProjectDetail = lazy(() =>
  import("@IMPLEMENT/features/project-management/ProjectDetail").then((module) => ({
    default: module.ProjectDetail,
  }))
);

export default function App() {
  const { loadSettings } = useSettingsStore();
  const pendingSync = useDesignSync((state) => state.pendingSync);
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
      if (pendingSync) {
        await flushPendingPersists();
      }
      await safeInvoke("save_project");
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
      if (pendingSync) {
        await flushPendingPersists();
      }
      await safeInvoke("force_save_project");
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
        if (pendingSync) {
          await flushPendingPersists();
        }

        // Real page reload to reset all states cleanly
        window.location.reload();
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingSync, flushPendingPersists, selectedProject]);

  const selectFeature = useDesignSync(s => s.selectFeature);
  const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);

  const handleTabChange = (newTab: string) => {
    if (newTab === "HOME") {
      selectFeature(null);
      setSelectedGroup(null);
      handleCloseProject();
    }
    setActiveTab(newTab);
  };

  return (
    <AppBootstrap>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-cad-bg text-cad-text-primary font-sans">
        <TitleBar project={selectedProject} onSave={handleSaveProject} onForceSave={handleForceSave}>
          <TabContainer
            onTabSwitch={async (id: string) => {
              const tab = useTabStore.getState().tabs.find(t => t.id === id);
              if (tab) {
                const success = await handleOpenProject(tab.path);
                if (success && activeTab === 'HOME') {
                  setActiveTab('DESIGN');
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
        </TitleBar>
        <Ribbon
          activeTab={activeTab}
          onTabChange={handleTabChange}
          project={selectedProject}
          onForceSave={handleForceSave}
          contractType={contractType}
          onContractTypeChange={setContractType}
        />

        <div className="flex-1 flex overflow-hidden relative">
          <main className="flex-1 flex flex-col overflow-hidden">
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
                  const success = await handleOpenProject(project.path);
                  if (success) setActiveTab("DESIGN");
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
