import { invoke } from '@/contracts/tauri-api/runtime';
import { useCallback, useState } from 'react';
import { FeatureState } from '@CONTRACT/types';

export interface TopologyError {
    id: string;
    type: 'OVERLAP' | 'GAP' | 'INTERSECT';
    description: string;
}

export const useTopology = () => {
    const [isValidating, setIsValidating] = useState(false);
    const [errors, setErrors] = useState<TopologyError[]>([]);

    const validate = useCallback(async (projectId: string, feature: FeatureState) => {
        setIsValidating(true);
        try {
            const rawResults = await invoke<string[]>('validate_topology', {
                projectId,
                feature
            });

            const parsedErrors: TopologyError[] = rawResults.map(raw => {
                const [id, type] = raw.split('|');
                return {
                    id,
                    type: type as any,
                    description: type === 'OVERLAP'
                        ? `Chồng lấn diện tích với đối tượng ${id}`
                        : `Giao cắt với đối tượng ${id}`
                };
            });

            setErrors(parsedErrors);
            return parsedErrors;
        } catch (err) {
            console.error('Topology validation failed:', err);
            return [];
        } finally {
            setIsValidating(false);
        }
    }, []);

    return {
        validate,
        errors,
        isValidating,
        clearErrors: () => setErrors([])
    };
};
