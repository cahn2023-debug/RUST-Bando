import React, { createContext, useContext, useMemo, useState } from 'react';
import type { BasemapController } from './types';

interface BasemapContextType {
    controller: BasemapController | null;
    setController: (controller: BasemapController | null) => void;
}

const BasemapContext = createContext<BasemapContextType | undefined>(undefined);

export function BasemapProvider({ children }: { children: React.ReactNode }) {
    const [controller, setController] = useState<BasemapController | null>(null);
    const value = useMemo(() => ({ controller, setController }), [controller]);
    return <BasemapContext.Provider value={value}>{children}</BasemapContext.Provider>;
}

export function useBasemap() {
    const context = useContext(BasemapContext);
    if (!context) throw new Error('useBasemap must be used within a BasemapProvider');
    return context;
}
