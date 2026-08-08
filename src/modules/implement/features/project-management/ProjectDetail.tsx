import { Project } from "@CONTRACT/types";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectMainView } from "./ProjectMainView";
import { ProjectOverlayLayer } from "./ProjectOverlayLayer";
import { useProjectDetailLogic } from "@IMPLEMENT/hooks/useProjectDetailLogic";
import { useSettingsStore } from "@CORE/stores/useSettingsStore";
import { useLayoutStore } from "@CORE/stores/useLayoutStore";
import { ResizeHandle } from "@DESIGN/components/ui/ResizeHandle";
import { cn } from "@SHARED/utils/cn";
import { invoke } from "@/contracts/tauri-api/runtime";
import { logger } from "@SHARED/utils/logger";

interface ProjectDetailProps {
  project: Project;
  activeTab: string;
  contractType?: 'INVESTOR' | 'SUBCONTRACTOR' | 'FINANCE';
  onProjectUpdate?: () => void;
}

export type ProjectDetailViewMode =
  | 'tasks'
  | 'contracts'
  | 'kanban'
  | 'search'
  | 'calendar'
  | 'analysis'
  | 'global-bom'
  | 'global-summary'
  | 'manager';

export function ProjectDetail({
  project,
  activeTab,
  contractType = 'INVESTOR',
  onProjectUpdate
}: ProjectDetailProps) {
  const {
    fileNodes,
    viewMode,
    setViewMode,
    selectedFile,
    setSelectedFile,
    fileContent,
    localMetadata,
    analysisData,
    analyzing,
    showRawFile,
    setShowRawFile,
    globalBOMData,
    contentTypes,
    handleFileSelect,
    contracts,
    handleCreateContract,
    handleDeleteContract,
    handleBulkSync,
    handleSaveCorrections,
    handleProjectMetadataUpdate
  } = useProjectDetailLogic(project, onProjectUpdate);

  const leftWidth = useLayoutStore(s => s.leftWidth);
  const updateLeftWidth = useLayoutStore(s => s.updateLeftWidth);
  const { lowPowerMode } = useSettingsStore();

  const handleLeftResize = (delta: number) => {
    updateLeftWidth(Math.max(200, Math.min(600, leftWidth + delta)));
  };

  const handleOpenExternally = async () => {
    if (selectedFile?.path) {
      try {
        await invoke("open_file_external", { path: selectedFile.path });
      } catch (err) {
        logger.error("Failed to open file externally:", err);
      }
    }
  };

  const isDesign = activeTab === "DESIGN";

  return (
    /*
      Pass-through: children below become grid items of the shell's
      `.workspace-grid`, each claiming its own area. The bottom dock's height no
      longer has to be subtracted from the siblings by hand — the grid rows do
      it. Note `display: contents` means this element has no box, so the
      low-power class goes on the child that actually paints.
    */
    <div className="workspace-pass">
      <div
        className={cn(
          "workspace-left pointer-events-auto border-r border-cad-border flex flex-col bg-cad-surface group/sidebar relative",
          lowPowerMode && "low-power-active"
        )}
        style={{ width: leftWidth }}
      >
        <ResizeHandle direction="left" onResize={handleLeftResize} />
        <ProjectSidebar
          activeTab={activeTab}
          contractType={contractType}
          fileNodes={fileNodes}
          selectedFile={selectedFile}
          onFileSelect={(path, name, ext) => handleFileSelect(path, name, ext, activeTab)}
          contentTypes={contentTypes}
          project={project}
        />
      </div>

      {/*
        On DESIGN the centre cell must let clicks reach the basemap beneath it,
        so the container is click-through and interactive children opt back in.
        On other tabs it owns its area outright and paints a background.
      */}
      <div
        className={cn(
          "workspace-center workspace-center--content flex flex-col overflow-hidden",
          isDesign ? "bg-transparent pointer-events-none" : "bg-cad-bg pointer-events-auto",
          lowPowerMode && "low-power-active"
        )}
      >
        <ProjectMainView
          project={project}
          activeTab={activeTab}
          viewMode={viewMode}
          setViewMode={setViewMode}
          analysisData={analysisData}
          showRawFile={showRawFile}
          setShowRawFile={setShowRawFile}
          analyzing={analyzing}
          localMetadata={localMetadata}
          globalBOMData={globalBOMData}
          handleBulkSync={handleBulkSync}
          handleSaveCorrections={handleSaveCorrections}
          handleProjectMetadataUpdate={handleProjectMetadataUpdate}
          contracts={contracts}
          handleCreateContract={(form: any) => handleCreateContract(form || {})}
          handleDeleteContract={handleDeleteContract}
          handleFileSelect={(path, name, ext) => handleFileSelect(path, name, ext, activeTab)}
          contentTypes={contentTypes}
        />
      </div>

      <ProjectOverlayLayer
        activeTab={activeTab}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        fileContent={fileContent}
        showRawFile={showRawFile}
        setShowRawFile={setShowRawFile}
        handleOpenExternally={handleOpenExternally}
      />
    </div>
  );
}
