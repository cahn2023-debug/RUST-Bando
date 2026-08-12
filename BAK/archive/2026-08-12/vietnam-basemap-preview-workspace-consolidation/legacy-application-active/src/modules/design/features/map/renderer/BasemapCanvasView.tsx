import React from 'react';
import { PersistentBasemapHost, BasemapControls } from '@/core/basemap';

export interface BasemapCanvasViewProps {
    onLifecycleState?: (state: string) => void;
    showControls?: boolean;
    className?: string;
}

export const BasemapCanvasView: React.FC<BasemapCanvasViewProps> = ({
    onLifecycleState,
    showControls = true,
    className = 'workspace-center workspace-center--map',
}) => {
    return (
        <div className={className}>
            <PersistentBasemapHost
                onLifecycleState={(state) => {
                    onLifecycleState?.(state);
                }}
            />
            {showControls && <BasemapControls />}
        </div>
    );
};
