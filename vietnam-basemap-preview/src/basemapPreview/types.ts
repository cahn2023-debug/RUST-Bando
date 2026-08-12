import type maplibregl from 'maplibre-gl';

export type PreviewSourceMode = 'online' | 'offline';
export type PreviewStyleId = 'engineering' | 'light' | 'dark';

export interface PreviewStyleReference {
    id: string;
    label: string;
    path: string;
}

export interface PreviewManifest {
    id: string;
    name: string;
    version: string;
    contractVersion: string;
    schemaVersion: string;
    defaultStyle: string;
    styles: PreviewStyleReference[];
    assets: {
        tileArchive: string;
        fonts: string[];
        sprites: string[];
    };
    attribution: string;
}

export interface PreviewSourceMetadata {
    mode: PreviewSourceMode;
    name: string;
    version: string;
    attribution: string;
    external: boolean;
}

export interface PreviewTileError {
    message: string;
    source: string;
}

export interface PreviewSourceAdapter {
    readonly metadata: PreviewSourceMetadata;
    readonly manifest: PreviewManifest | null;
    styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification>;
    recordTileError(error: unknown): void;
    getTileError(): PreviewTileError | null;
}

export interface PreviewFileReader {
    read(path: string): Promise<Uint8Array>;
    readRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
}

export const PREVIEW_STYLES: readonly PreviewStyleId[] = ['engineering', 'light', 'dark'];
