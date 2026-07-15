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
        <div className={hideHeader ? "w-full" : "flex-1 flex flex-col p-8 overflow-y-auto cad-scrollbar"}>
            <div className={hideHeader ? "w-full animate-fade-in" : "max-w-5xl mx-auto w-full"}>
                {!hideHeader && (
                    <div className="mb-8 flex items-center justify-between gap-4 border-b border-cad-border pb-4">
                        <div className="flex items-center gap-3">
                            <LayoutGrid className="text-cad-accent" size={24} />
                            <h2 className="text-xl font-display font-bold tracking-tight uppercase">RECENT WORKSPACES</h2>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => onOpenProject()} className="cad-button cad-button-secondary">
                                <FolderOpen size={14} /> OPEN PMP
                            </button>
                            <button onClick={onShowCreate} className="cad-button cad-button-primary">
                                <Plus size={14} /> NEW PROJECT
                            </button>
                        </div>
                    </div>
                )}

                {loadingProjects ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-24 cad-card animate-pulse" />
                        ))}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="cad-empty-state py-16 px-4">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-cad-border bg-cad-surface">
                            <Briefcase className="h-8 w-8 text-cad-text-secondary" />
                        </div>
                        <h3 className="mb-3 font-display font-bold uppercase tracking-widest text-cad-text-primary">WORKSPACES TRỐNG</h3>
                        <p className="mb-8 max-w-md text-xs leading-relaxed text-cad-text-secondary">
                            Danh sách dự án gần đây đã được làm mới. Dữ liệu của bạn vẫn an toàn trong tệp{" "}
                            <code className="text-cad-accent">.pmp</code> trên máy tính. Hãy nhấn nút bên dưới để mở lại.
                        </p>

                        <div className="flex gap-4">
                            <button onClick={() => onOpenProject()} className="cad-button cad-button-primary px-6 py-2">
                                <FileIcon size={12} />
                                MỞ TỆP .PMP ĐÃ CÓ
                            </button>

                            <button onClick={onRestoreFromConfig} className="cad-button cad-button-secondary px-6 py-2">
                                <Loader2 size={12} className="text-cad-accent" />
                                KHÔI PHỤC TỪ SYSTEM CONFIG
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {projects.map((p) => (
                            <div
                                key={`${p.id}-${p.path}`}
                                className="group cad-card flex cursor-pointer items-start gap-4 p-5 transition-all hover:border-cad-accent/50 hover:bg-cad-elevated"
                                onClick={() => onSelectProject(p)}
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-cad-border bg-cad-bg text-cad-accent transition-transform group-hover:scale-105">
                                    <HardDrive size={24} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <h4 className="truncate font-display text-sm font-black uppercase transition-colors group-hover:text-cad-accent">{p.name}</h4>
                                        <button
                                            onClick={(e) => onDeleteProject(e, p)}
                                            className="cad-icon-button h-7 w-7"
                                            title="Xóa dự án khỏi danh sách"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <p className="mt-1 truncate font-mono text-[10px] text-cad-text-muted" title={p.path}>
                                        {p.path}
                                    </p>
                                    <div className="mt-3 h-px w-full bg-cad-border transition-colors group-hover:bg-cad-accent/30" />
                                    <div className="mt-3 flex items-center justify-between">
                                        <span className="text-[9px] font-mono uppercase text-cad-text-muted">Status: OK</span>
                                        <span className="text-[9px] font-mono font-bold uppercase text-cad-accent opacity-0 transition-opacity group-hover:opacity-100">
                                            OPEN PROJECT
                                        </span>
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
