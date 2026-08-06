import React, { createContext, useContext, useMemo, useState } from 'react';
import type { BasemapController } from './types';

interface BasemapContextType {
    controller: BasemapController | null;
    setController: (controller: BasemapController | null) => void;
}

export const BasemapContext = createContext<BasemapContextType | undefined>(undefined);

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

/**
 * Read the controller without requiring a provider.
 *
 * For callers that must work both inside the app shell and in isolation (tests,
 * standalone map screens). Returns null instead of throwing, so they can fall
 * back to owning their own map rather than wrapping a hook in try/catch.
 */
export function useOptionalBasemapController(): BasemapController | null {
    return useContext(BasemapContext)?.controller ?? null;
}
