import { Briefcase } from "lucide-react";
import { FolderTree, FileItem } from "./ProjectDetailPanels";
import { DrawingExplorer } from "@DESIGN/components/core/CADPanels/DrawingExplorer";
import { ContractSidebar } from "@IMPLEMENT/features/contract/ContractSidebar";
import { FileNode, ContentType, Project } from "@CONTRACT/types";

interface ProjectSidebarProps {
    activeTab: string;
    contractType?: 'INVESTOR' | 'SUBCONTRACTOR' | 'FINANCE';
    fileNodes: FileNode[];
    selectedFile: { path?: string } | null;
    onFileSelect: (path: string, name: string, extension?: string) => void;
    contentTypes?: ContentType[];
    project: Project;
}

export function ProjectSidebar({
    activeTab,
    contractType = 'INVESTOR',
    fileNodes,
    selectedFile,
    onFileSelect,
    contentTypes = [],
    project
}: ProjectSidebarProps) {

    const renderFileNodes = (nodes: FileNode[]) => {
        return nodes.map((node) => (
            node.is_dir ? (
                <FolderTree key={node.path} name={node.name} expanded={false}>
                    {node.children && renderFileNodes(node.children)}
                </FolderTree>
            ) : (
                <FileItem
                    key={node.path}
                    name={node.name}
                    isActive={selectedFile?.path === node.path}
                    onSelect={() => onFileSelect(node.path, node.name, node.extension || undefined)}
                />
            )
        ));
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {activeTab === 'DESIGN' ? (
                <DrawingExplorer />
            ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                    {activeTab === 'CONTRACT' ? (
                        <ContractSidebar
                            projectId={project.id}
                            contractType={contractType}
                            onFileSelect={(name, path) => onFileSelect(path || name, name, path?.split('.').pop())}
                        />
                    ) : (
                        <>
                            <FolderTree name={project.name.toUpperCase()} expanded>
                                {renderFileNodes(fileNodes)}
                            </FolderTree>
                            {contentTypes.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-cad-border/30">
                                    <div className="px-4 mb-2 text-[9px] font-black text-cad-accent uppercase tracking-widest">Metadata Modules</div>
                                    {contentTypes.map(ct => (
                                        <button
                                            key={ct.id}
                                            onClick={() => {
                                                // Logic for switching to metadata module view
                                                // This could be passed as a prop or handled via a shared state
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2 text-xs transition-colors text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-text-primary/5"
                                        >
                                            <Briefcase size={14} className="text-cad-text-muted" />
                                            <span className="truncate uppercase font-bold tracking-tight">{ct.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
