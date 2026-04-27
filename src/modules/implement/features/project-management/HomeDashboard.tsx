import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    LayoutGrid,
    FolderOpen,
    Plus,
    Briefcase,
    Clock,
    CheckCircle2,
    Activity,
    Calendar,
    Layers
} from "lucide-react";
import { Project } from "@CONTRACT/types";
import { StatsCard } from "./StatsCard";
import { RecentWorkspaces } from "./RecentWorkspaces";

interface HomeDashboardProps {
    projects: Project[];
    loadingProjects: boolean;
    onOpenProject: (path?: string) => Promise<boolean>;
    onDeleteProject: (e: React.MouseEvent, p: Project) => Promise<void>;
    onSelectProject: (p: Project) => Promise<void>;
    onShowCreate: () => void;
    onRestoreFromConfig: () => Promise<void>;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
    projects,
    loadingProjects,
    onOpenProject,
    onDeleteProject,
    onSelectProject,
    onShowCreate,
    onRestoreFromConfig,
}) => {
    const { t } = useTranslation();

    const stats = useMemo(() => {
        const total = projects.length;
        const active = projects.filter(p => (p.status as string) === 'active').length;
        const recentlyUpdated = [...projects]
            .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
            .slice(0, 1);

        return {
            total,
            active,
            lastProject: recentlyUpdated[0]?.name || "N/A",
            lastUpdate: recentlyUpdated[0]?.updated_at ? new Date(recentlyUpdated[0].updated_at).toLocaleDateString() : "N/A"
        };
    }, [projects]);

    const currentTime = new Date().toLocaleDateString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar bg-cad-bg">
            <div className="max-w-6xl mx-auto w-full space-y-8">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-cad-border pb-6 gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-cad-accent">
                            <Activity size={16} className="animate-pulse" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">{t('project.active')}</span>
                        </div>
                        <h1 className="text-3xl font-display font-black tracking-tighter uppercase">
                            {t('project.projectName')} <span className="text-cad-accent">{t('project.newProject')}</span>
                        </h1>
                        <div className="flex items-center gap-2 text-cad-text-muted">
                            <Calendar size={14} />
                            <span className="text-xs font-mono uppercase italic">{currentTime}</span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => onOpenProject()}
                            className="group px-5 py-2 bg-cad-surface hover:bg-cad-elevated border border-cad-border text-[10px] font-bold rounded-sm transition-all flex items-center gap-2 overflow-hidden relative"
                        >
                            <div className="absolute inset-0 bg-cad-accent/10 translate-y-full group-hover:translate-y-0 transition-transform" />
                            <FolderOpen size={14} className="relative z-10 group-hover:text-cad-accent" />
                            <span className="relative z-10">{t('project.openProject').toUpperCase()}</span>
                        </button>
                        <button
                            onClick={onShowCreate}
                            className="px-5 py-2 bg-cad-accent hover:bg-white text-black text-[10px] font-black rounded-sm transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                        >
                            <Plus size={14} /> {t('project.newProject').toUpperCase()}
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatsCard
                        icon={Briefcase}
                        label={t('project.status')}
                        value={stats.total}
                        description={t('project.projectName')}
                        color="text-cad-accent"
                    />
                    <StatsCard
                        icon={CheckCircle2}
                        label={t('project.active')}
                        value={stats.active}
                        description={t('project.created')}
                        color="text-emerald-500"
                    />
                    <StatsCard
                        icon={Clock}
                        label={t('project.updated')}
                        value={stats.lastUpdate}
                        description={stats.lastProject}
                        color="text-amber-500"
                    />
                    <StatsCard
                        icon={Layers}
                        label={t('project.description')}
                        value="4"
                        description={t('project.design')}
                        color="text-blue-500"
                    />
                </div>

                {/* Workspaces Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 border-l-4 border-cad-accent pl-4 py-1">
                        <LayoutGrid className="text-cad-text-secondary" size={18} />
                        <h2 className="font-display font-bold tracking-widest text-sm uppercase">{t('project.projectName')}</h2>
                    </div>

                    <div className="bg-cad-elevated/5 border border-cad-border p-2">
                        <RecentWorkspaces
                            projects={projects}
                            loadingProjects={loadingProjects}
                            onOpenProject={onOpenProject}
                            onDeleteProject={onDeleteProject}
                            onSelectProject={onSelectProject}
                            onShowCreate={onShowCreate}
                            onRestoreFromConfig={onRestoreFromConfig}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};
