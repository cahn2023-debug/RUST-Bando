import { useState, useEffect } from "react";
import { FolderTree } from "@IMPLEMENT/features/project-management/ProjectDetailPanels/FolderTree";
import { FileItem } from "@IMPLEMENT/features/project-management/ProjectDetailPanels/FileItem";
import { TrendingUp, FileSearch, ExternalLink, FolderOpen } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Contract } from "@CONTRACT/types";

interface ContractSidebarProps {
    projectId: string | number;
    contractType: 'INVESTOR' | 'SUBCONTRACTOR' | 'FINANCE';
    onFileSelect?: (name: string, path?: string) => void;
}

export function ContractSidebar({ projectId, contractType, onFileSelect }: ContractSidebarProps) {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'folder' | 'file', path?: string } | null>(null);
    const [linkedContract, setLinkedContract] = useState<{ name: string, path: string } | null>(null);

    const loadContracts = async () => {
        try {
            const contracts: Contract[] = await invoke("get_contracts", { projectId });
            if (contracts && contracts.length > 0) {
                // Find the first contract that has a file_path
                const mainContract = contracts.find(c => c.file_path);
                if (mainContract && mainContract.file_path) {
                    setLinkedContract({ name: mainContract.name, path: mainContract.file_path });
                }
            }
        } catch (err) {
            console.error("Failed to load contracts:", err);
        }
    };

    useEffect(() => {
        loadContracts();

        // Listen for metadata updates to refresh sidebar
        let unlisten: any;
        const setupListener = async () => {
            try {
                const { listen } = await import("@tauri-apps/api/event");
                unlisten = await listen<any>("metadata-updated", (event) => {
                    const payload = event.payload;
                    // id safety
                    if (String(payload.project_id) === String(projectId)) {
                        console.log("[Sidebar] Refreshing contracts due to metadata update for project:", projectId);
                        loadContracts();
                    }
                });
            } catch (err) {
                console.error("Failed to setup metadata listener:", err);
            }
        };
        setupListener();

        return () => {
            if (unlisten && typeof unlisten === 'function') unlisten();
        };
    }, [projectId]);

    const handleOpenLinkContract = async () => {
        setContextMenu(null);
        try {
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls'] }]
            });
            if (selected && typeof selected === 'string') {
                const fileName = selected.split(/[/\\]/).pop() || 'Contract';

                // Save to database
                await invoke("create_contract", {
                    projectId,
                    name: fileName,
                    filePath: selected
                });

                setLinkedContract({ name: fileName, path: selected });
                onFileSelect?.(fileName, selected);
            }
        } catch (err) {
            console.error("Failed to open contract file:", err);
        }
    };

    const handleOpenFile = async (path: string) => {
        setContextMenu(null);
        try {
            await invoke("open_file_external", { path });
        } catch (err) {
            console.error("Failed to open file:", err);
        }
    };

    const handleOpenFolder = async (path: string) => {
        setContextMenu(null);
        try {
            await invoke("open_containing_folder", { path });
        } catch (err) {
            console.error("Failed to open containing folder:", err);
        }
    };

    const renderInvestorTree = () => (
        <FolderTree name="INVESTOR MANAGEMENT" expanded>
            <FolderTree
                name="Hợp đồng"
                expanded={!!linkedContract}
                onContextMenu={(e: React.MouseEvent) => setContextMenu({ x: e.pageX, y: e.pageY, type: 'folder' })}
            >
                {linkedContract && (
                    <FileItem
                        name={linkedContract.name}
                        path={linkedContract.path}
                        onSelect={() => onFileSelect?.(linkedContract.name, linkedContract.path)}
                        onContextMenu={(e: React.MouseEvent) => setContextMenu({ x: e.pageX, y: e.pageY, type: 'file', path: linkedContract.path })}
                        isActive={true}
                    />
                )}
            </FolderTree>
            <FileItem
                name="Bảng dữ liệu hợp đồng"
                onSelect={() => onFileSelect?.("Bảng dữ liệu hợp đồng")}
            />
            <FileItem
                name="Tổng hợp chi tiết (Local)"
                onSelect={() => onFileSelect?.("Tổng hợp chi tiết (Local)")}
            />
        </FolderTree>
    );

    const renderSubcontractorTree = () => (
        <FolderTree name="SUBCONTRACTOR MANAGEMENT" expanded>
            <FileItem
                name="Danh sách Hợp đồng"
                onSelect={() => onFileSelect?.("Danh sách Hợp đồng")}
            />
            <FileItem
                name="Financial report"
                onSelect={() => onFileSelect?.("Financial report")}
            />
            <FileItem
                name="Subcontractor tracking"
                onSelect={() => onFileSelect?.("Subcontractor tracking")}
            />
        </FolderTree>
    );

    const renderFinanceTree = () => (
        <FolderTree name="FINANCIAL OVERSIGHT" expanded>
            <FileItem
                name="Bảng giá trị chi tiết hợp đồng"
                onSelect={() => onFileSelect?.("Bảng giá trị chi tiết hợp đồng")}
            />
            <FileItem
                name="Đối ứng giá trị nhà thầu"
                onSelect={() => onFileSelect?.("Đối ứng giá trị nhà thầu")}
            />
        </FolderTree>
    );

    return (
        <div className="flex flex-col py-1 px-1 relative h-full" onClick={() => setContextMenu(null)}>
            {contractType === 'INVESTOR' && renderInvestorTree()}
            {contractType === 'SUBCONTRACTOR' && renderSubcontractorTree()}
            {contractType === 'FINANCE' && renderFinanceTree()}

            {contextMenu && (
                <div
                    className="fixed z-[250] bg-cad-surface border border-cad-border rounded-lg shadow-2xl flex flex-col min-w-[200px] overflow-hidden backdrop-blur-md bg-opacity-95"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'folder' ? (
                        <button
                            className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase tracking-wider"
                            onClick={handleOpenLinkContract}
                        >
                            <FileSearch size={14} className="text-cad-accent group-hover:text-black" /> Open link contract
                        </button>
                    ) : (
                        <>
                            <button
                                className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase tracking-wider group"
                                onClick={() => contextMenu.path && handleOpenFile(contextMenu.path)}
                            >
                                <ExternalLink size={14} className="text-cad-accent group-hover:text-black" /> Open file
                            </button>
                            <button
                                className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase tracking-wider group border-t border-cad-border/30"
                                onClick={() => contextMenu.path && handleOpenFolder(contextMenu.path)}
                            >
                                <FolderOpen size={14} className="text-cad-accent group-hover:text-black" /> Open contain folder
                            </button>
                        </>
                    )}
                </div>
            )}

            <div className="mt-8 px-4 py-2 border-t border-cad-border/30">
                <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={12} className="text-cad-accent" />
                    <span className="text-[9px] font-black text-cad-text-muted uppercase tracking-widest">Quick Insight</span>
                </div>
                <div className="bg-cad-elevated/30 rounded p-2 border border-cad-border/50">
                    <p className="text-[10px] text-cad-text-secondary leading-tight">
                        Module {contractType} đang hoạt động độc lập và link trực tiếp với kho dữ liệu CAD.
                    </p>
                </div>
            </div>
        </div>
    );
}
