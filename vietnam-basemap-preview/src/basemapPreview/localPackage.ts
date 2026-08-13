import type maplibregl from 'maplibre-gl';
import type {
    PreviewFileReader,
    PreviewManifest,
    PreviewSourceAdapter,
    PreviewSourceMetadata,
    PreviewStyleId,
    PreviewTileError,
} from './types';

const LOCAL_METADATA: Omit<PreviewSourceMetadata, 'name' | 'version' | 'attribution'> = {
    mode: 'offline',
    external: false,
};

export async function createLocalPackageAdapter(reader: PreviewFileReader): Promise<PreviewSourceAdapter> {
    const manifest = validatePreviewManifest(await readJson(reader, 'manifest.json'));
    const declaredAssets = [
        ...manifest.styles.map(style => style.path),
        manifest.assets.tileArchive,
        ...manifest.assets.fonts,
        ...manifest.assets.sprites,
        ...(manifest.assets.streetViewCoverage ? [manifest.assets.streetViewCoverage] : []),
    ];
    await Promise.all(declaredAssets.map(path => reader.read(path)));

    let tileError: PreviewTileError | null = null;
    const metadata: PreviewSourceMetadata = {
        ...LOCAL_METADATA,
        name: manifest.name,
        version: manifest.version,
        attribution: manifest.attribution,
    };

    return {
        metadata,
        manifest,
        async styleDocument(styleId: PreviewStyleId): Promise<maplibregl.StyleSpecification> {
            const style = manifest.styles.find(candidate => candidate.id === styleId);
            if (!style) throw new Error(`Style không tồn tại trong package: ${styleId}`);
            const document = await readJson(reader, style.path);
            if (!isRecord(document) || document.version !== 8) {
                throw new Error(`Style không hợp lệ: ${style.path}`);
            }
            if (containsExternalUrl(document)) {
                throw new Error(`Style chứa external URL: ${style.path}`);
            }
            return resolveLocalStyle(document) as maplibregl.StyleSpecification;
        },
        recordTileError(error: unknown): void {
            const detail = error instanceof Error ? error.message : String(error);
            tileError = { source: 'Local package', message: `Không tải được local tile: ${detail}` };
        },
        getTileError(): PreviewTileError | null {
            return tileError;
        },
    };
}

export function validatePreviewManifest(value: unknown): PreviewManifest {
    if (!isRecord(value)) throw new Error('Manifest package phải là object');
    const manifest = value as Partial<PreviewManifest>;
    if (manifest.contractVersion !== '1' || manifest.schemaVersion !== '1') {
        throw new Error('Package không tương thích với Basemap contract/schema');
    }
    for (const field of ['id', 'name', 'version', 'defaultStyle', 'attribution'] as const) {
        if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
            throw new Error(`Manifest thiếu trường hợp lệ: ${field}`);
        }
    }
    if (!Array.isArray(manifest.styles) || manifest.styles.length === 0) {
        throw new Error('Manifest phải khai báo styles');
    }
    if (!manifest.styles.some(style => isRecord(style) && style.id === manifest.defaultStyle)) {
        throw new Error('Manifest defaultStyle không được khai báo');
    }
    for (const style of manifest.styles) {
        if (!isRecord(style) || typeof style.id !== 'string' || typeof style.path !== 'string') {
            throw new Error('Style reference không hợp lệ');
        }
        assertSafePackagePath(style.path);
    }
    if (!isRecord(manifest.assets)) throw new Error('Manifest thiếu assets');
    if (typeof manifest.assets.tileArchive !== 'string') throw new Error('Thiếu tileArchive');
    assertSafePackagePath(manifest.assets.tileArchive);
    if (manifest.assets.streetViewCoverage !== undefined) {
        if (typeof manifest.assets.streetViewCoverage !== 'string') throw new Error('streetViewCoverage không hợp lệ');
        assertSafePackagePath(manifest.assets.streetViewCoverage);
    }
    for (const key of ['fonts', 'sprites'] as const) {
        if (!Array.isArray(manifest.assets[key]) || manifest.assets[key].some(path => typeof path !== 'string')) {
            throw new Error(`Manifest ${key} không hợp lệ`);
        }
        manifest.assets[key].forEach(assertSafePackagePath);
    }
    return manifest as PreviewManifest;
}

async function readJson(reader: PreviewFileReader, path: string): Promise<unknown> {
    const bytes = await reader.read(path);
    return JSON.parse(new TextDecoder().decode(bytes));
}

function resolveLocalStyle(value: unknown): unknown {
    if (typeof value === 'string') {
        return value
            .replace(/\{basemap-tiles\}/g, 'pmtiles://package')
            .replace(/\{basemap-glyphs\}/g, 'basemap://package/fonts')
            .replace(/\{basemap-sprite\}/g, 'basemap://package/sprites');
    }
    if (Array.isArray(value)) return value.map(resolveLocalStyle);
    if (isRecord(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveLocalStyle(item)]));
    }
    return value;
}

function assertSafePackagePath(path: string): void {
    if (!path || path.startsWith('/') || path.includes('\\') || path.includes(':') || path.split('/').some(segment => !segment || segment === '..')) {
        throw new Error(`Package path không an toàn: ${path}`);
    }
}

function containsExternalUrl(value: unknown): boolean {
    if (typeof value === 'string') return /^https?:\/\//i.test(value);
    if (Array.isArray(value)) return value.some(containsExternalUrl);
    if (isRecord(value)) return Object.values(value).some(containsExternalUrl);
    return false;
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}
