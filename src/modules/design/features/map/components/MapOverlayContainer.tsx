import React from 'react';

export interface MapOverlayContainerProps {
    showPerformance?: boolean;
    children?: React.ReactNode;
}

export const MapOverlayContainer: React.FC<MapOverlayContainerProps> = ({ showPerformance, children }) => {
    return (
        <div className="absolute inset-0 pointer-events-none z-10">
            {showPerformance && (
                <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400 border border-emerald-500/20 shadow-lg pointer-events-auto">
                    🚀 Map Engine Active
                </div>
            )}
            {children}
        </div>
    );
};
