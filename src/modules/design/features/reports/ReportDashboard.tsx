import React from 'react';
import { useGisReport } from './hooks/useGisReport';
import { GisMetricsCard } from './components/GisMetricsCard';
import { LandCategoryTable } from './components/LandCategoryTable';
import { Layers, Maximize, Ruler, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@DESIGN/components/ui/Button';

export const ReportDashboard: React.FC = () => {
    const { report, loading, error, refresh } = useGisReport();

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-cad-danger/10 rounded-xl border border-cad-danger/30">
                <AlertCircle className="text-cad-danger mb-4" size={48} />
                <h3 className="text-lg font-bold text-cad-danger">Lỗi tải báo cáo</h3>
                <p className="text-sm text-cad-danger/80 mt-2 max-w-md">{error}</p>
                <Button
                    variant="danger"
                    size="md"
                    icon={RefreshCw}
                    onClick={refresh}
                    className="mt-6"
                >
                    Thử lại
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 p-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-cad-border pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-cad-text-primary flex items-center gap-3">
                        <FileText className="text-blue-500" /> Báo cáo GIS Chuyên sâu
                    </h1>
                    <p className="text-cad-text-secondary mt-1">
                        Tổng hợp số liệu không gian, diện tích và phân loại đất đai trong dự án.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="md"
                        icon={RefreshCw}
                        loading={loading}
                        onClick={refresh}
                    >
                        {loading ? 'Đang cập nhật...' : 'Làm mới'}
                    </Button>
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
                    colorClass="text-cad-accent"
                />
                <GisMetricsCard
                    title="Tổng chu vi"
                    value={`${report?.total_perimeter.toLocaleString(undefined, { maximumFractionDigits: 1 }) || '0'} m`}
                    description="Độ dài biên đối tượng"
                    icon={Ruler}
                    colorClass="text-cad-warn"
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
                    <h2 className="text-xl font-bold text-cad-text-primary">Thống kê theo loại đất</h2>
                </div>
                <LandCategoryTable categories={report?.categories || []} />
            </div>

            {/* Timestamp Footer */}
            {report && (
                <div className="text-right">
                    <p className="text-xs text-cad-text-muted">
                        Cập nhật lần cuối: {new Date(report.timestamp).toLocaleString('vi-VN')}
                    </p>
                </div>
            )}
        </div>
    );
};
