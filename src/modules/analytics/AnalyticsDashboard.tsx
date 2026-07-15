import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { HardDrive, Files, RefreshCw, BarChart3, AlertCircle } from 'lucide-react';
import StatCard from './components/StatCard';
import ExtensionDistribution, { ExtensionStat } from './components/ExtensionDistribution';
import TopFiles, { FileStat } from './components/TopFiles';

interface ProjectStats {
    total_files: number;
    total_size: number;
}

interface AnalyticsDashboardProps {
    projectId: string;
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ projectId }) => {
    const [stats, setStats] = useState<ProjectStats | null>(null);
    const [dist, setDist] = useState<ExtensionStat[]>([]);
    const [topFiles, setTopFiles] = useState<FileStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            const [statsData, distData, topFilesData] = await Promise.all([
                invoke<ProjectStats>('get_dashboard_project_stats', { projectId }),
                invoke<ExtensionStat[]>('get_dashboard_extension_dist', { projectId }),
                invoke<FileStat[]>('get_dashboard_top_files', { projectId, limit: 10 })
            ]);

            setStats(statsData);
            setDist(distData);
            setTopFiles(topFilesData);
        } catch (err) {
            console.error('Failed to fetch analytics data:', err);
            setError('Could not load analytics data. Please make sure the project is indexed.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectId]);

    if (loading && !stats) {
        return (
            <div className="cad-empty-state h-[400px] gap-4">
                <RefreshCw size={32} className="animate-spin text-cad-accent" />
                <p className="text-cad-text-muted animate-pulse text-sm">Aggregating project data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="cad-card flex h-[400px] flex-col items-center justify-center gap-4 p-8 text-center border-red-400/20 bg-red-400/5">
                <AlertCircle size={40} className="text-red-400 opacity-50" />
                <h4 className="font-medium text-cad-text-primary">Analytics Error</h4>
                <p className="max-w-sm text-sm text-cad-text-muted">{error}</p>
                <button
                    onClick={fetchData}
                    className="cad-button cad-button-secondary mt-4 px-6 py-2"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <BarChart3 className="text-cad-accent" size={24} />
                    <h2 className="text-xl font-bold tracking-tight text-cad-text-primary">Project Analytics</h2>
                </div>
                <button
                    onClick={fetchData}
                    className="cad-icon-button"
                    title="Refresh Data"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    title="Total Files"
                    value={stats?.total_files?.toLocaleString() || '0'}
                    icon={Files}
                    color="cad"
                    description="Total indexed files in this project"
                />
                <StatCard
                    title="Storage Usage"
                    value={formatSize(stats?.total_size || 0)}
                    icon={HardDrive}
                    color="cad"
                    description="Accumulated size of all project files"
                />
                <div className="hidden lg:block">
                    <StatCard
                        title="Analysis Status"
                        value="Active"
                        icon={BarChart3}
                        color="cad"
                        description="Project file indexing is currently available"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ExtensionDistribution data={dist} />
                <TopFiles files={topFiles} />
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
