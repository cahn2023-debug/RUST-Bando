import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/contracts/tauri-api/runtime';

export interface GisCategoryStat {
    category: string;
    count: number;
    total_area: number;
    total_perimeter: number;
}

export interface GisReport {
    timestamp: string;
    project_id: string;
    total_features: number;
    total_area: number;
    total_perimeter: number;
    categories: GisCategoryStat[];
}

export function useGisReport() {
    const [report, setReport] = useState<GisReport | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Note: Command name must match the one registered in Rust (lib.rs)
            const data = await invoke<GisReport>('get_gis_report_v2');
            setReport(data);
        } catch (err) {
            console.error('Failed to fetch GIS report:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch on mount
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchReport();
    }, [fetchReport]);

    return { report, loading, error, refresh: fetchReport };
}
