import React, { useState } from "react";
import { CADCanvas } from "@DESIGN/components/core/CADCanvas";
import { ReportDashboard } from "./features/reports/ReportDashboard";
import { Map, BarChart3 } from "lucide-react";

export const DesignApp: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'map' | 'report'>('map');

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
            {/* Tab Navigation */}
            <div className="flex items-center px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <button
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'map'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                        }`}
                >
                    <Map size={16} /> Bản đồ
                </button>
                <button
                    onClick={() => setActiveTab('report')}
                    className={`ml-2 flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'report'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                        }`}
                >
                    <BarChart3 size={16} /> Báo cáo GIS
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col overflow-auto">
                {activeTab === 'map' ? (
                    <div className="flex-1 flex flex-col">
                        <CADCanvas />
                    </div>
                ) : (
                    <ReportDashboard />
                )}
            </div>
        </div>
    );
};

export default DesignApp;
