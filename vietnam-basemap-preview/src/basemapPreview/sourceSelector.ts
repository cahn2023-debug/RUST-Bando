import type { PreviewLayerId } from './types';

export interface PreviewSourceOption {
    mode: PreviewLayerId;
    label: string;
    description: string;
}

export const PREVIEW_SOURCE_OPTIONS: readonly PreviewSourceOption[] = [
    {
        mode: 'google-street',
        label: 'Google Street',
        description: 'Google raster external preview',
    },
    {
        mode: 'google-hybrid',
        label: 'Google Hybrid',
        description: 'Google satellite + labels preview',
    },
    {
        mode: 'local-package',
        label: 'Local package',
        description: 'Vietnam Basemap release package',
    },
];
