import React from "react";
import { Toolbar } from "@DESIGN/components/ui/Toolbar";
import { CADCanvas } from "@DESIGN/components/core/CADCanvas";
import { ContractAnalysisView } from "@IMPLEMENT/features/contract/ContractAnalysisView";
import { ContractManager } from "@IMPLEMENT/features/contract/ContractManager";
import { MaterialManager } from "@IMPLEMENT/features/inventory/MaterialManager";
import { DynamicContentManager } from "@IMPLEMENT/features/files/DynamicContentManager";
import { GlobalContextMenu } from "@DESIGN/components/ui/GlobalContextMenu";
import { Project, ContentType, Contract } from "@CONTRACT/types";
import { ContractMetadata, BOMItem } from "@IMPLEMENT/features/contract/ContractAnalysisView";
import { useTranslation } from "react-i18next";
import AnalyticsDashboard from "@ANALYTICS/AnalyticsDashboard";


type ViewMode = 'tasks' | 'kanban' | 'calendar' | 'search' | 'analysis' | 'global-bom' | 'global-summary' | 'manager' | string;

interface LocalMetadata {
    contract_number?: string;
    investor?: string;
    contractor?: string;
    signed_date?: string;
    duration?: string;
    end_date?: string;
    bom_table?: BOMItem[];
}

interface ProjectMainViewProps {
    project: Project;
    activeTab: string;
    viewMode: string;
    setViewMode: (mode: ViewMode) => void;
    analysisData: ContractMetadata | null;
    showRawFile: boolean;
    setShowRawFile: (show: boolean) => void;
    analyzing: boolean;
    localMetadata: LocalMetadata;
    globalBOMData: BOMItem[];
    handleBulkSync: () => Promise<void>;
    handleSaveCorrections: (data: ContractMetadata) => Promise<void>;
    handleProjectMetadataUpdate: (data: LocalMetadata & { bom_table?: BOMItem[] }) => Promise<void>;
    contracts: Contract[];
    handleCreateContract: (form: Partial<Contract>) => Promise<void>;
    handleDeleteContract: (id: string) => Promise<void>;
    handleFileSelect: (path: string, name: string, extension?: string) => void;
    contentTypes: ContentType[];
    contextMenu: { x: number; y: number; text: string } | null;
}

export const ProjectMainView: React.FC<ProjectMainViewProps> = ({
    project,
    activeTab,
    viewMode,
    setViewMode,
    analysisData,
    showRawFile,
    setShowRawFile,
    analyzing,
    localMetadata,
    globalBOMData,
    handleBulkSync,
    handleSaveCorrections,
    handleProjectMetadataUpdate,
    contracts,
    handleCreateContract,
    handleDeleteContract,
    handleFileSelect,
    contentTypes,
    contextMenu,
}) => {
    const { t } = useTranslation();

    const renderContent = () => {
        // Core tabs
        if (activeTab === 'DESIGN') return <CADCanvas />;
        if (activeTab === 'RESOURCES') return <MaterialManager projectId={project.id} />;

        // Contract domain
        if (activeTab === 'CONTRACT') {
            if (analyzing && !analysisData) {
                return (
                    <div className="flex-1 flex items-center justify-center bg-cad-bg font-sans">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-cad-accent border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-cad-accent font-black text-xs uppercase tracking-widest animate-pulse">ĐANG PHÂN TÍCH HỢP ĐỒNG...</p>
                        </div>
                    </div>
                );
            }

            if (viewMode === 'analysis' && analysisData && !showRawFile) {
                return (
                    <ContractAnalysisView
                        projectId={project.id}
                        data={analysisData}
                        projectName={project.name}
                        onViewRaw={() => setShowRawFile(true)}
                        onBulkSync={handleBulkSync}
                        onSaveCorrections={handleSaveCorrections}
                    />
                );
            }

            if (viewMode === 'global-bom' || viewMode === 'global-summary') {
                return (
                    <ContractAnalysisView
                        projectId={project.id}
                        projectName={project.name}
                        data={{
                            contract_number: localMetadata.contract_number || "",
                            investor: localMetadata.investor || "",
                            contractor: localMetadata.contractor || "",
                            signed_date: localMetadata.signed_date || "",
                            duration: localMetadata.duration || "",
                            end_date: localMetadata.end_date || "",
                            bom_table: globalBOMData
                        }}
                        viewType={viewMode === 'global-bom' ? 'dashboard' : 'groups'}
                        onViewRaw={() => { }}
                        onBulkSync={handleBulkSync}
                        onSaveCorrections={handleProjectMetadataUpdate}
                    />
                );
            }

            return (
                <ContractManager
                    contracts={contracts}
                    onAdd={handleCreateContract}
                    onDelete={handleDeleteContract}
                    onViewAnalysis={(c) => {
                        if (c.file_path) {
                            handleFileSelect(c.file_path, c.name, c.file_path.split('.').pop());
                        }
                    }}
                    featureCounts={{}}
                />
            );
        }

        // Dynamic content types
        const contentType = contentTypes.find(ct => ct.id === activeTab);
        if (contentType) {
            return <DynamicContentManager projectId={project.id} contentType={contentType} />;
        }

        // Analytics
        if (activeTab === 'ANALYTICS') {
            return (
                <div className="flex-1 overflow-y-auto p-8 bg-cad-bg scrollbar-hide">
                    <AnalyticsDashboard projectId={project.id} />
                </div>
            );
        }

        // Default / Empty state
        return (
            <div className="flex-1 flex flex-col overflow-hidden font-sans">
                <div className="flex-1 flex items-center justify-center bg-cad-bg text-cad-text-muted text-[10px] font-bold uppercase tracking-widest text-center px-8">
                    {t('common.select_view_or_tab')}
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-cad-bg relative font-sans">
            <Toolbar activeTab={activeTab} viewMode={viewMode as any} setViewMode={setViewMode as any} onAddTask={() => { }} />

            {renderContent()}

            {contextMenu && (
                <GlobalContextMenu
                    x={contextMenu.x} y={contextMenu.y} text={contextMenu.text}
                    onAddTask={() => { }}
                    onAddNote={() => { }}
                />
            )}
        </div>
    );
};
