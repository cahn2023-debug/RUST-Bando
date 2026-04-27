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
            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                <RefreshCw size={32} className="animate-spin text-blue-500" />
                <p className="text-white/40 animate-pulse text-sm">Aggregating project data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] gap-4 p-8 text-center bg-red-400/5 rounded-2xl border border-red-400/20">
                <AlertCircle size={40} className="text-red-400 opacity-50" />
                <h4 className="text-white font-medium">Analytics Error</h4>
                <p className="text-white/40 text-sm max-w-sm">{error}</p>
                <button
                    onClick={fetchData}
                    className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-sm transition-all border border-white/10"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <BarChart3 className="text-blue-500" size={24} />
                    <h2 className="text-xl font-bold text-white tracking-tight">Project Analytics</h2>
                </div>
                <button
                    onClick={fetchData}
                    className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all outline-none"
                    title="Refresh Data"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Total Files"
                    value={stats?.total_files?.toLocaleString() || '0'}
                    icon={Files}
                    color="blue"
                    description="Total indexed files in this project"
                />
                <StatCard
                    title="Storage Usage"
                    value={formatSize(stats?.total_size || 0)}
                    icon={HardDrive}
                    color="purple"
                    description="Accumulated size of all project files"
                />
                <div className="hidden lg:block">
                    <StatCard
                        title="Analysis Status"
                        value="Active"
                        icon={BarChart3}
                        color="green"
                        description="DuckDB indexing is currently live"
                    />
                </div>
            </div>

            {/* Detailed Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ExtensionDistribution data={dist} />
                <TopFiles files={topFiles} />
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
