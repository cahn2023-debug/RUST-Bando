import { PaletteConfig } from './types';

export const DEFAULT_LAYOUT_COLUMNS = [
    ['spec-panel', 'summary-panel', 'camera-view', 'device-config', 'ai-assistant'],
    ['network-graph']
];

export const CANONICAL_PALETTE_TITLES: Record<string, string> = {
    'spec-panel': 'Thông số thiết kế',
    'summary-panel': 'Tổng hợp khối lượng',
    'device-config': 'Cấu hình thiết bị',
    'camera-view': 'Góc nhìn',
    'network-graph': 'Network',
    'ai-assistant': 'AI Assistant',
};

export const PALETTE_SIDEBAR_WIDTH = 36;

export const getCanonicalPaletteTitle = (id: string, fallback?: string) =>
    CANONICAL_PALETTE_TITLES[id] ?? fallback ?? 'Untitled Palette';

export const createDefaultPaletteConfigs = (): Record<string, PaletteConfig> => ({
    'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: true, isVisible: true, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
    'network-graph': { id: 'network-graph', title: 'Network', icon: 'Network', isPinned: true, isVisible: false, width: 900, height: 320, dockPosition: 'bottom', isFloating: false, position: { x: 0, y: 0 } },
    'ai-assistant': { id: 'ai-assistant', title: 'AI Assistant', icon: 'Zap', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } },
});

export const normalizePaletteConfigs = (paletteConfigs: Record<string, PaletteConfig>): Record<string, PaletteConfig> => {
    const normalized = { ...paletteConfigs };
    Object.entries(normalized).forEach(([id, config]) => {
        normalized[id] = {
            ...config,
            title: getCanonicalPaletteTitle(id, config.title),
        };
    });
    return normalized;
};

export const createDefaultLayoutState = () => ({
    leftWidth: 288,
    layoutColumns: DEFAULT_LAYOUT_COLUMNS.map((column) => [...column]),
    activePaletteId: null as string | null,
    paletteConfigs: normalizePaletteConfigs(createDefaultPaletteConfigs()),
    draggingPaletteId: null as string | null,
    showPerformanceOverlay: false,
});

export const isMalformedPersistedLayout = (state: any) => {
    if (!state || typeof state !== 'object') return true;
    if (!Array.isArray(state.layoutColumns) || state.layoutColumns.length === 0) return true;
    if (!state.paletteConfigs || typeof state.paletteConfigs !== 'object') return true;
    return false;
};

export const migrateLayoutState = (persistedState: any, version: number) => {
    let state = persistedState as any;

    const resetToDefaultLayout = () => {
        const baseline = createDefaultLayoutState();
        state = {
            ...state,
            ...baseline,
            activePaletteId: null,
            draggingPaletteId: null,
            showPerformanceOverlay: false,
        };
    };

    const ensureNetworkPalette = () => {
        if (!state.paletteConfigs) state.paletteConfigs = {};
        state.paletteConfigs['network-graph'] = {
            ...createDefaultPaletteConfigs()['network-graph'],
            ...(state.paletteConfigs['network-graph'] || {}),
        };

        Object.values(state.paletteConfigs).forEach((config: any) => {
            if (!config.dockPosition) {
                config.dockPosition = config.isFloating ? 'floating' : 'right';
            }
        });

        if (!state.layoutColumns || state.layoutColumns.length === 0) {
            state.layoutColumns = DEFAULT_LAYOUT_COLUMNS.map((column) => [...column]);
        }
        if (!state.layoutColumns.some((col: string[]) => col.includes('network-graph'))) {
            state.layoutColumns.push(['network-graph']);
        }
    };

    const stripBulkEditPalette = () => {
        if (state.paletteConfigs) {
            delete state.paletteConfigs['bulk-edit'];
        }
        if (state.layoutColumns) {
            state.layoutColumns = state.layoutColumns
                .map((col: string[]) => col.filter((id) => id !== 'bulk-edit'))
                .filter((col: string[]) => col.length > 0);
        }
        if (state.activePaletteId === 'bulk-edit') state.activePaletteId = null;
        if (state.draggingPaletteId === 'bulk-edit') state.draggingPaletteId = null;
    };

    const normalizePersistedPaletteTitles = () => {
        if (!state.paletteConfigs) return;
        state.paletteConfigs = normalizePaletteConfigs(state.paletteConfigs);
    };

    if (isMalformedPersistedLayout(state)) {
        resetToDefaultLayout();
        return state;
    }

    if (version === 0) {
        if (state.rightPalettes && state.rightPalettes.includes('property-manager')) {
            state.rightPalettes = state.rightPalettes.filter((id: string) => id !== 'property-manager');
            if (!state.rightPalettes.includes('spec-panel')) state.rightPalettes.unshift('spec-panel');
            if (!state.rightPalettes.includes('summary-panel')) state.rightPalettes.splice(1, 0, 'summary-panel');
        }
        if (state.paletteConfigs) {
            if (state.paletteConfigs['property-manager']) {
                const oldConfig = state.paletteConfigs['property-manager'];
                state.paletteConfigs['spec-panel'] = { ...oldConfig, id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings' };
                delete state.paletteConfigs['property-manager'];
            }
            if (!state.paletteConfigs['summary-panel']) {
                state.paletteConfigs['summary-panel'] = { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 100, y: 120 } };
            }
        }
        version = 1;
    }

    if (version === 1) {
        if (state.rightPalettes) {
            state.layoutColumns = [state.rightPalettes];
            delete state.rightPalettes;
        } else {
            state.layoutColumns = [['spec-panel'], ['summary-panel']];
        }
        version = 2;
    }

    if (version === 2) {
        const defaultConfigs: Record<string, PaletteConfig> = {
            'spec-panel': { id: 'spec-panel', title: 'Thông số thiết kế', icon: 'Settings', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'summary-panel': { id: 'summary-panel', title: 'Tổng hợp khối lượng', icon: 'Calculator', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'device-config': { id: 'device-config', title: 'Cấu hình thiết bị', icon: 'Camera', isPinned: false, isVisible: false, width: 350, isFloating: false, position: { x: 0, y: 0 } },
            'camera-view': { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } },
        };

        if (!state.paletteConfigs) state.paletteConfigs = {};

        Object.keys(defaultConfigs).forEach((id) => {
            if (!state.paletteConfigs[id]) {
                state.paletteConfigs[id] = defaultConfigs[id];
            }
        });

        if (!state.layoutColumns || state.layoutColumns.length === 0) {
            state.layoutColumns = [['spec-panel'], ['summary-panel']];
        }
        version = 3;
    }

    if (version === 3) {
        if (state.layoutColumns) {
            const hasCameraView = state.layoutColumns.some((col: string[]) => col.includes('camera-view'));
            if (!hasCameraView) {
                if (state.layoutColumns.length >= 2) {
                    state.layoutColumns[1].push('camera-view');
                } else if (state.layoutColumns.length >= 1) {
                    state.layoutColumns[0].push('camera-view');
                } else {
                    state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
                }
            }
        }

        if (state.paletteConfigs && state.paletteConfigs['camera-view']) {
            state.paletteConfigs['camera-view'].isVisible = true;
            state.paletteConfigs['camera-view'].title = 'Góc Nhìn';
        }
        version = 4;
    }

    if (version === 4) {
        const cameraViewConfig = { id: 'camera-view', title: 'Góc Nhìn', icon: 'Video', isPinned: false, isVisible: true, width: 350, isFloating: false, position: { x: 0, y: 0 } };

        if (!state.paletteConfigs) state.paletteConfigs = {};

        state.paletteConfigs['camera-view'] = {
            ...cameraViewConfig,
            ...(state.paletteConfigs['camera-view'] || {}),
        };
        state.paletteConfigs['camera-view'].isVisible = true;
        state.paletteConfigs['camera-view'].title = 'Góc Nhìn';

        if (state.layoutColumns) {
            const hasCameraView = state.layoutColumns.some((col: string[]) => col.includes('camera-view'));
            if (!hasCameraView) {
                if (state.layoutColumns.length >= 2) {
                    state.layoutColumns[1].push('camera-view');
                } else if (state.layoutColumns.length >= 1) {
                    state.layoutColumns[0].push('camera-view');
                } else {
                    state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
                }
            } else {
                state.layoutColumns = [['spec-panel'], ['summary-panel', 'camera-view']];
            }
        }
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 7) {
        if (state.paletteConfigs) {
            const standardIds = ['spec-panel', 'summary-panel', 'camera-view', 'device-config'];
            standardIds.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isPinned = true;
                    state.paletteConfigs[id].isVisible = id === 'spec-panel';
                    if (state.paletteConfigs[id].isFloating === undefined) state.paletteConfigs[id].isFloating = false;
                }
            });
        }

        state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config']];
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 8) {
        if (state.paletteConfigs) {
            const idsToHide = ['summary-panel'];
            const idsToShow = ['camera-view', 'device-config'];
            idsToHide.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = false;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
            idsToShow.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = true;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
            if (state.paletteConfigs['spec-panel']) {
                state.paletteConfigs['spec-panel'].isVisible = true;
                state.paletteConfigs['spec-panel'].isPinned = true;
            }
        }
        state.layoutColumns = [['spec-panel', 'summary-panel', 'camera-view', 'device-config']];
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 9) {
        if (state.paletteConfigs) {
            const palettesToEnable = ['camera-view', 'device-config'];
            palettesToEnable.forEach((id) => {
                if (state.paletteConfigs[id]) {
                    state.paletteConfigs[id].isVisible = true;
                    state.paletteConfigs[id].isPinned = true;
                }
            });
        }
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 10) {
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    if (version < 11) {
        resetToDefaultLayout();
        return state;
    }

    if (version < 12) {
        stripBulkEditPalette();
        ensureNetworkPalette();
        normalizePersistedPaletteTitles();
        return state;
    }

    stripBulkEditPalette();
    ensureNetworkPalette();
    
    if (!state.paletteConfigs) state.paletteConfigs = {};
    if (!state.paletteConfigs['ai-assistant']) {
        state.paletteConfigs['ai-assistant'] = { id: 'ai-assistant', title: 'AI Assistant', icon: 'Zap', isPinned: true, isVisible: false, width: 350, dockPosition: 'right', isFloating: false, position: { x: 0, y: 0 } };
    }
    if (state.layoutColumns && state.layoutColumns.length > 0) {
        if (!state.layoutColumns.some((col: string[]) => col.includes('ai-assistant'))) {
            state.layoutColumns[0].push('ai-assistant');
        }
    }

    normalizePersistedPaletteTitles();
    return state;
};
