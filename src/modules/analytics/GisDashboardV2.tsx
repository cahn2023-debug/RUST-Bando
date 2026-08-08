import React, { useEffect, useState } from 'react';
import { gisApi } from '@/contracts/tauri-api';

interface LandCategorySummary {
    land_type: String;
    count: number;
    total_area: number;
    total_length: number;
}

interface GisReportSummary {
    timestamp: number;
    categories: Record<string, LandCategorySummary>;
    overall_total_area: number;
    overall_total_length: number;
}

export const GisDashboardV2: React.FC = () => {
    const [report, setReport] = useState<GisReportSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const data = await gisApi.getActiveReport<GisReportSummary>();
            setReport(data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch GIS report:', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchReport();
    }, []);

    if (loading) return <div className="p-4">Loading GIS Report...</div>;
    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
    if (!report) return <div className="p-4">No data available.</div>;

    return (
        <div className="p-6 space-y-6 bg-slate-900 text-white min-h-dvh">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">GIS Analytics Dashboard (V2)</h1>
                <button
                    onClick={fetchReport}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                    Refresh Data
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 shadow-lg">
                    <p className="text-slate-400 text-sm">Total Area</p>
                    <p className="text-3xl font-mono text-green-400">{report.overall_total_area.toLocaleString()} m²</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 shadow-lg">
                    <p className="text-slate-400 text-sm">Total Length</p>
                    <p className="text-3xl font-mono text-blue-400">{report.overall_total_length.toLocaleString()} m</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 shadow-lg">
                    <p className="text-slate-400 text-sm">Land Categories</p>
                    <p className="text-3xl font-mono text-purple-400">{Object.keys(report.categories).length}</p>
                </div>
            </div>

            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-700 text-slate-300">
                        <tr>
                            <th className="p-4">Land Type</th>
                            <th className="p-4 text-right">Count</th>
                            <th className="p-4 text-right">Area (m²)</th>
                            <th className="p-4 text-right">Length (m)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {Object.entries(report.categories).sort().map(([key, cat]) => (
                            <tr key={key} className="hover:bg-slate-750">
                                <td className="p-4">{cat.land_type}</td>
                                <td className="p-4 text-right font-mono">{cat.count}</td>
                                <td className="p-4 text-right font-mono text-green-400">{cat.total_area.toFixed(2)}</td>
                                <td className="p-4 text-right font-mono text-blue-400">{cat.total_length.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="text-slate-500 text-xs text-right">
                Last updated: {new Date(report.timestamp * 1000).toLocaleString()}
            </div>
        </div>
    );
};
