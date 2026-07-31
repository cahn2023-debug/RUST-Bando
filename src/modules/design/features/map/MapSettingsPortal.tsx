import React from 'react';

export const MapSettingsPortal = ({ children }: { children: React.ReactNode }) => {
    return (
        <div
            className="absolute top-4 right-4 z-cad-map-control bg-cad-bg/90 backdrop-blur-md border border-cad-border rounded shadow-lg pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
};
