import React from 'react';

export interface MapCanvasViewProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    className?: string;
    children?: React.ReactNode;
}

export const MapCanvasView: React.FC<MapCanvasViewProps> = ({ containerRef, className, children }) => {
    return (
        <div
            ref={containerRef}
            className={className || "relative w-full h-full min-h-[400px] overflow-hidden bg-slate-900"}
            style={{ width: '100%', height: '100%' }}
        >
            {children}
        </div>
    );
};
