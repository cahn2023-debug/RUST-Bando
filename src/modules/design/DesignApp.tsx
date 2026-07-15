import React, { useState } from "react";
import { CADCanvas } from "@DESIGN/components/core/CADCanvas";
import { ReportDashboard } from "./features/reports/ReportDashboard";
import { Map, BarChart3 } from "lucide-react";

export const DesignApp: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'map' | 'report'>('map');

    return (
        <div className="cad-shell-window">
            <div className="cad-tabbar px-4 pt-2">
                <button
                    onClick={() => setActiveTab('map')}
                    className={`cad-tab ${activeTab === 'map' ? 'cad-tab-active' : ''}`}
                >
                    <Map size={16} /> Bản đồ
                </button>
                <button
                    onClick={() => setActiveTab('report')}
                    className={`cad-tab ${activeTab === 'report' ? 'cad-tab-active' : ''}`}
                >
                    <BarChart3 size={16} /> Báo cáo GIS
                </button>
            </div>

            <div className="flex-1 overflow-auto">
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
