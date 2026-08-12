const LOW_GPU_STORAGE_KEY = 'design.map.lowGpuRendering';

export const isLowGpuRenderingEnabled = () => {
    if (typeof window === 'undefined') return true;
    try {
        const saved = window.localStorage.getItem(LOW_GPU_STORAGE_KEY);
        return saved !== 'false';
    } catch {
        return true;
    }
};
