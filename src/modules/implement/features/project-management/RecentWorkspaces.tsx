import React from "react";
import { LayoutGrid, FolderOpen, Plus, HardDrive, Trash2, Briefcase, FileText as FileIcon, Loader2 } from "lucide-react";
import { Project } from "@CONTRACT/types";

interface RecentWorkspacesProps {
    projects: Project[];
    loadingProjects: boolean;
    onOpenProject: (path?: string) => Promise<boolean>;
    onDeleteProject: (e: React.MouseEvent, p: Project) => Promise<void>;
    onSelectProject: (p: Project) => Promise<void>;
    onShowCreate: () => void;
    onRestoreFromConfig: () => Promise<void>;
    hideHeader?: boolean;
}

export const RecentWorkspaces: React.FC<RecentWorkspacesProps> = ({
    projects,
    loadingProjects,
    onOpenProject,
    onDeleteProject,
    onSelectProject,
    onShowCreate,
    onRestoreFromConfig,
    hideHeader = false,
}) => {
    return (
        <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar">
            <div className="max-w-5xl mx-auto w-full">
                {!hideHeader && (
                    <div className="flex items-center justify-between border-b border-cad-border pb-4 mb-8">
                        <div className="flex items-center gap-3">
                            <LayoutGrid className="text-cad-accent" size={24} />
                            <h2 className="text-xl font-display font-bold tracking-tight">RECENT WORKSPACES</h2>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onOpenProject()}
                                className="px-4 py-1.5 bg-cad-surface hover:bg-cad-elevated border border-cad-border text-xs font-bold rounded-sm transition-colors flex items-center gap-2"
                            >
                                <FolderOpen size={14} /> OPEN PMP
                            </button>
                            <button
                                onClick={onShowCreate}
                                className="px-4 py-1.5 bg-cad-accent hover:bg-cad-accent/80 text-black text-xs font-black rounded-sm transition-colors flex items-center gap-2"
                            >
                                <Plus size={14} /> NEW PROJECT
                            </button>
                        </div>
                    </div>
                )}

                {loadingProjects ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-24 bg-cad-surface animate-pulse border border-cad-border rounded-sm"></div>
                        ))}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-cad-border/40 rounded-sm bg-cad-elevated/20">
                        <div className="w-16 h-16 bg-cad-surface rounded-full flex items-center justify-center mb-6 border border-cad-border">
                            <Briefcase className="text-cad-text-secondary w-8 h-8" />
                        </div>
                        <h3 className="text-cad-text font-display font-bold uppercase tracking-widest mb-3">WORKSPACES TRỐNG</h3>
                        <p className="text-cad-text-secondary text-xs max-w-md leading-relaxed mb-8">
                            Danh sách dự án gần đây đã được làm mới. Dữ liệu của bạn vẫn an toàn trong tệp <code className="text-cad-accent">.pmp</code> trên máy tính. Hãy nhấn nút bên dưới để mở lại.
                        </p>

                        <div className="flex gap-4">
                            <button
                                onClick={() => onOpenProject()}
                                className="px-6 py-2 bg-cad-accent text-black text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all flex items-center gap-2"
                            >
                                <FileIcon size={12} />
                                Mở tệp .PMP đã có
                            </button>

                            <button
                                onClick={onRestoreFromConfig}
                                className="px-6 py-2 bg-cad-surface border border-cad-border text-cad-text-primary text-[10px] font-black uppercase tracking-widest hover:bg-cad-elevated transition-all flex items-center gap-2"
                            >
                                <Loader2 size={12} className="text-cad-accent" />
                                Khôi phục từ System Config
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {projects.map((p) => (
                            <div
                                key={`${p.id}-${p.path}`}
                                className="group bg-cad-surface border border-cad-border hover:border-cad-accent p-5 flex items-start gap-4 cursor-pointer transition-all hover:bg-cad-elevated"
                                onClick={() => onSelectProject(p)}
                            >
                                <div className="p-3 bg-cad-bg rounded-sm text-cad-accent group-hover:scale-110 transition-transform border border-cad-border">
                                    <HardDrive size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-display font-black text-sm group-hover:text-cad-accent transition-colors truncate uppercase">{p.name}</h4>
                                        <button
                                            onClick={(e) => onDeleteProject(e, p)}
                                            className="p-1 text-cad-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                            title="Xóa dự án khỏi danh sách"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] font-mono text-cad-text-muted mt-1 truncate" title={p.path}>{p.path}</p>
                                    <div className="mt-3 h-[1px] bg-cad-border w-full group-hover:bg-cad-accent/30 transition-colors" />
                                    <div className="mt-3 flex justify-between items-center">
                                        <span className="text-[9px] font-mono text-cad-text-muted uppercase">Status: OK</span>
                                        <span className="text-[9px] font-mono text-cad-accent opacity-0 group-hover:opacity-100 transition-opacity font-bold underline">OPEN PROJECT</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
