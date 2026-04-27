import React from 'react';
import { useGisReport } from './hooks/useGisReport';
import { GisMetricsCard } from './components/GisMetricsCard';
import { LandCategoryTable } from './components/LandCategoryTable';
import { Layers, Maximize, Ruler, RefreshCw, AlertCircle, FileText } from 'lucide-react';

export const ReportDashboard: React.FC = () => {
    const { report, loading, error, refresh } = useGisReport();

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/50">
                <AlertCircle className="text-red-500 mb-4" size={48} />
                <h3 className="text-lg font-bold text-red-900 dark:text-red-400">Lỗi tải báo cáo</h3>
                <p className="text-sm text-red-700 dark:text-red-500 mt-2 max-w-md">{error}</p>
                <button
                    onClick={refresh}
                    className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                    <RefreshCw size={16} /> Thử lại
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 p-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                        <FileText className="text-blue-500" /> Báo cáo GIS Chuyên sâu
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                        Tổng hợp số liệu không gian, diện tích và phân loại đất đai trong dự án.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'Đang cập nhật...' : 'Làm mới'}
                    </button>
                </div>
            </div>

            {/* Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <GisMetricsCard
                    title="Tổng số đối tượng"
                    value={report?.total_features.toLocaleString() || '0'}
                    description="Features trong Layer"
                    icon={Layers}
                    colorClass="text-blue-500"
                />
                <GisMetricsCard
                    title="Tổng diện tích"
                    value={`${report?.total_area.toLocaleString(undefined, { maximumFractionDigits: 1 }) || '0'} m²`}
                    description="Xác lập từ Topology"
                    icon={Maximize}
                    colorClass="text-emerald-500 text-green-500"
                />
                <GisMetricsCard
                    title="Tổng chu vi"
                    value={`${report?.total_perimeter.toLocaleString(undefined, { maximumFractionDigits: 1 }) || '0'} m`}
                    description="Độ dài biên đối tượng"
                    icon={Ruler}
                    colorClass="text-amber-500"
                />
                <GisMetricsCard
                    title="Số loại đất"
                    value={report?.categories.length.toString() || '0'}
                    description="Các phân nhóm đất đai"
                    icon={FileText}
                    colorClass="text-purple-500"
                />
            </div>

            {/* Detailed Table Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Thống kê theo loại đất</h2>
                </div>
                <LandCategoryTable categories={report?.categories || []} />
            </div>

            {/* Timestamp Footer */}
            {report && (
                <div className="text-right">
                    <p className="text-xs text-zinc-400">
                        Cập nhật lần cuối: {new Date(report.timestamp).toLocaleString('vi-VN')}
                    </p>
                </div>
            )}
        </div>
    );
};
