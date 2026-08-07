import { useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface FeatureChunkPayload {
    chunk_index: number;
    total_chunks: number;
    bbox?: [number, number, number, number];
    features_json: string;
}

export interface UseGisStreamCollectorReturn {
    chunksReceived: number;
    totalChunks: number;
    isStreaming: boolean;
    streamedFeatures: any[];
    resetStream: () => void;
}

export function useGisStreamCollector(): UseGisStreamCollectorReturn {
    const [chunksReceived, setChunksReceived] = useState(0);
    const [totalChunks, setTotalChunks] = useState(0);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamedFeatures, setStreamedFeatures] = useState<any[]>([]);

    const resetStream = useCallback(() => {
        setChunksReceived(0);
        setTotalChunks(0);
        setIsStreaming(false);
        setStreamedFeatures([]);
    }, []);

    useEffect(() => {
        let unlistenFn: (() => void) | undefined;

        const setupListener = async () => {
            unlistenFn = await listen<FeatureChunkPayload>('gis:features-chunk', (event) => {
                const payload = event.payload;
                if (!payload) return;

                setIsStreaming(true);
                setChunksReceived(payload.chunk_index + 1);
                setTotalChunks(payload.total_chunks);

                try {
                    const parsed = JSON.parse(payload.features_json);
                    const newFeatures = parsed.features || [];

                    setStreamedFeatures((prev) => [...prev, ...newFeatures]);
                } catch (e) {
                    console.error('[useGisStreamCollector] Failed to parse feature chunk JSON:', e);
                }

                if (payload.chunk_index + 1 >= payload.total_chunks) {
                    setIsStreaming(false);
                }
            });
        };

        setupListener();

        return () => {
            if (unlistenFn) unlistenFn();
        };
    }, []);

    return {
        chunksReceived,
        totalChunks,
        isStreaming,
        streamedFeatures,
        resetStream,
    };
}
