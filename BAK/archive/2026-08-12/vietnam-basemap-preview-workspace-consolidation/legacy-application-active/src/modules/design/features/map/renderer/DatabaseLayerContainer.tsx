import React, { useEffect } from 'react';
import { useMapContext } from '../MapContext';
import { useGisStreamCollector } from '../hooks/useGisStreamCollector';

export interface DatabaseLayerContainerProps {
    sourceId?: string;
    clusterSourceId?: string;
    showLabels?: boolean;
    clusterPoints?: boolean;
}

export const DatabaseLayerContainer: React.FC<DatabaseLayerContainerProps> = ({
    sourceId = 'design-fast-features',
    clusterSourceId = 'design-fast-point-clusters-source',
    showLabels = true,
    clusterPoints = false,
}) => {
    const { map } = useMapContext();
    const { streamedFeatures, isStreaming, chunksReceived, totalChunks } = useGisStreamCollector();

    useEffect(() => {
        if (!map) return;

        // Ensure source exists
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] } as any,
                promoteId: 'id',
            });
        }

        if (!map.getSource(clusterSourceId)) {
            map.addSource(clusterSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] } as any,
                promoteId: 'id',
                cluster: clusterPoints,
                clusterRadius: 48,
            });
        }

        const labelLayerId = 'design-fast-labels';
        if (map.getLayer(labelLayerId)) {
            map.setLayoutProperty(labelLayerId, 'visibility', showLabels ? 'visible' : 'none');
        }
    }, [map, sourceId, clusterSourceId, clusterPoints, showLabels]);

    useEffect(() => {
        if (!map || streamedFeatures.length === 0) return;

        const mainSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (mainSource) {
            mainSource.setData({
                type: 'FeatureCollection',
                features: streamedFeatures,
            } as any);
        }
    }, [map, sourceId, streamedFeatures]);

    return (
        <div style={{ display: 'none' }} data-streaming-status={isStreaming ? `Chunk ${chunksReceived}/${totalChunks}` : 'ready'} />
    );
};
