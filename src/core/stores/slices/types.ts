export interface PaletteConfig {
    id: string;
    title: string;
    icon: string;
    isPinned: boolean;
    isVisible: boolean;
    width: number;
    height?: number;
    flex?: number;
    dockPosition?: 'right' | 'bottom' | 'floating';
    userClosed?: boolean;
    isFloating: boolean;
    position: { x: number; y: number };
}

export interface LayoutState {
    leftWidth: number;
    updateLeftWidth: (width: number) => void;
    layoutColumns: string[][];
    activePaletteId: string | null;
    paletteConfigs: Record<string, PaletteConfig>;
    togglePalette: (id: string) => void;
    setPinned: (id: string, isPinned: boolean) => void;
    updatePaletteWidth: (id: string, width: number) => void;
    updatePaletteHeight: (id: string, height: number) => void;
    updatePaletteFlex: (id: string, flex: number) => void;
    updatePaletteSizeAndPosition: (id: string, width: number, height: number, x: number, y: number) => void;
    closePalette: (id: string) => void;
    expandPalette: (id: string | null) => void;
    setFloating: (id: string, isFloating: boolean, position?: { x: number; y: number }) => void;
    updatePalettePosition: (id: string, x: number, y: number) => void;
    draggingPaletteId: string | null;
    setDraggingPalette: (id: string | null) => void;
    reorderPalettes: (sourceId: string, targetId: string) => void;
    showPerformanceOverlay: boolean;
    setShowPerformanceOverlay: (show: boolean) => void;
    registerPalette: (config: Partial<PaletteConfig> & { id: string }) => void;
}
