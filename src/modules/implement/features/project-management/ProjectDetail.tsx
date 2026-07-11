import { Project } from "@CONTRACT/types";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectMainView } from "./ProjectMainView";
import { ProjectOverlayLayer } from "./ProjectOverlayLayer";
import { useProjectDetailLogic } from "@IMPLEMENT/hooks/useProjectDetailLogic";
import { useResizablePanels } from "@IMPLEMENT/hooks/useResizablePanels";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { ResizeHandle } from "@DESIGN/components/ui/ResizeHandle";
import { cn } from "@TOOL/utils/cn";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "@TOOL/utils/logger";

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

  const { leftWidth, handleLeftResize } = useResizablePanels();
  const { lowPowerMode } = useSettingsStore();

  const handleOpenExternally = async () => {
    if (selectedFile?.path) {
      try {
        await invoke("open_file_external", { path: selectedFile.path });
      } catch (err) {
        logger.error("Failed to open file externally:", err);
      }
    }
  };

  return (
    <div className={cn(
      "flex-1 min-h-0 min-w-0 flex overflow-hidden bg-cad-bg",
      lowPowerMode && "low-power-active"
    )}>
      <div className="border-r border-cad-border flex flex-col shrink-0 bg-cad-surface group/sidebar relative min-h-0" style={{ width: leftWidth }}>
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
        contextMenu={null}
      />

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
