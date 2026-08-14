import React, { useEffect } from 'react';
import { useMapContext } from '../MapContext';
import { FeatureOverlayCanvas } from '../render';
import type { CameraSnapshot } from '../render';

export interface OverlayInteractionLayerProps {
    drawingSourceId?: string;
    editSourceId?: string;
    camera?: CameraSnapshot | null;
    renderFlags?: any;
    designFeatures?: any;
    selectedIds?: Set<string>;
}

export const OverlayInteractionLayer: React.FC<OverlayInteractionLayerProps> = ({
    drawingSourceId = 'design-fast-drawing',
    editSourceId = 'design-fast-edit-handles',
    camera = null,
    renderFlags,
    designFeatures,
    selectedIds,
}) => {
    const { map } = useMapContext();

    useEffect(() => {
        if (!map) return;

        const emptyOverlay = { type: 'FeatureCollection', features: [] };

        if (!map.getSource(drawingSourceId)) {
            map.addSource(drawingSourceId, { type: 'geojson', data: emptyOverlay as any });
        }
        if (!map.getSource(editSourceId)) {
            map.addSource(editSourceId, { type: 'geojson', data: emptyOverlay as any });
        }
    }, [map, drawingSourceId, editSourceId]);

    return (
        <>
            <FeatureOverlayCanvas
                camera={camera}
                designFeatures={designFeatures}
                renderFlags={renderFlags}
                selectedIds={selectedIds}
            />
        </>
    );
};
