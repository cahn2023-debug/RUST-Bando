import type { PreviewSourceMode } from './types';

export interface PreviewSourceOption {
    mode: PreviewSourceMode;
    label: string;
    description: string;
}

export const PREVIEW_SOURCE_OPTIONS: readonly PreviewSourceOption[] = [
    {
        mode: 'online',
        label: 'Online / LAN',
        description: 'Google raster external preview',
    },
    {
        mode: 'offline',
        label: 'Local package',
        description: 'Vietnam Basemap release package',
    },
];
