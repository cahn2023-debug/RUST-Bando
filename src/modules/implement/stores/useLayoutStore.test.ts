import { describe, expect, it } from 'vitest';

import { createDefaultLayoutState, migrateLayoutState } from './useLayoutStore';

describe('migrateLayoutState', () => {
    it('resets persisted layout to the new baseline on version 10', () => {
        const migrated = migrateLayoutState({
            layoutColumns: [['spec-panel']],
            activePaletteId: 'spec-panel',
            paletteConfigs: {
                'spec-panel': {
                    id: 'spec-panel',
                    title: 'Spec',
                    icon: 'Settings',
                    isPinned: true,
                    isVisible: true,
                    width: 777,
                    dockPosition: 'right',
                    isFloating: false,
                    position: { x: 12, y: 34 },
                },
            },
            draggingPaletteId: 'spec-panel',
            showPerformanceOverlay: true,
        }, 10);

        expect(migrated).toMatchObject(createDefaultLayoutState());
        expect(migrated.activePaletteId).toBeNull();
        expect(migrated.draggingPaletteId).toBeNull();
        expect(migrated.layoutColumns.some((column: string[]) => column.includes('network-graph'))).toBe(true);
        expect(migrated.paletteConfigs['network-graph']).toMatchObject({
            dockPosition: 'bottom',
            height: 320,
            isVisible: false,
            isFloating: false,
        });
    });

    it('falls back to the new baseline when persisted layout is malformed', () => {
        const migrated = migrateLayoutState({
            layoutColumns: null,
            paletteConfigs: null,
        }, 11);

        expect(migrated).toMatchObject(createDefaultLayoutState());
        expect(migrated.layoutColumns.some((column: string[]) => column.includes('network-graph'))).toBe(true);
    });

    it('normalizes persisted Vietnamese palette titles on version 11 upgrade', () => {
        const migrated = migrateLayoutState({
            layoutColumns: [['spec-panel', 'camera-view']],
            paletteConfigs: {
                'spec-panel': {
                    id: 'spec-panel',
                    title: 'broken title',
                    icon: 'Settings',
                    isPinned: true,
                    isVisible: true,
                    width: 350,
                    dockPosition: 'right',
                    isFloating: false,
                    position: { x: 0, y: 0 },
                },
                'camera-view': {
                    id: 'camera-view',
                    title: 'another broken title',
                    icon: 'Video',
                    isPinned: true,
                    isVisible: true,
                    width: 350,
                    dockPosition: 'right',
                    isFloating: false,
                    position: { x: 0, y: 0 },
                },
            },
        }, 11);

        expect(migrated.paletteConfigs['spec-panel'].title).toBe('Thông số thiết kế');
        expect(migrated.paletteConfigs['camera-view'].title).toBe('Góc nhìn');
    });
});
