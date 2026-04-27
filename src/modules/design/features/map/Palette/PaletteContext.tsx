import React, { createContext, useContext } from 'react';

interface PaletteContextType {
    id: string;
    isPinned: boolean;
    onPin: () => void;
    onClose: () => void;
    dragHandleProps: {
        onMouseDown: (e: React.MouseEvent) => void;
    };
}

const PaletteContext = createContext<PaletteContextType | null>(null);

export const PaletteProvider: React.FC<{ value: PaletteContextType; children: React.ReactNode }> = ({ value, children }) => (
    <PaletteContext.Provider value={value}>
        {children}
    </PaletteContext.Provider>
);

export const usePaletteContext = () => {
    const context = useContext(PaletteContext);
    if (!context) {
        throw new Error('usePaletteContext must be used within a PaletteProvider');
    }
    return context;
};
