import type maplibregl from 'maplibre-gl';

export type VietnamBasemapMode = 'online' | 'offline';

export interface VietnamBasemapStyleReference {
    id: string;
    label: string;
    path: string;
}

export interface VietnamBasemapAssets {
    tileArchive: string;
    fonts: string[];
    sprites: string[];
}

export interface VietnamBasemapManifest {
    id: string;
    name: string;
    version: string;
    contractVersion: string;
    schemaVersion: string;
    defaultStyle: string;
    styles: VietnamBasemapStyleReference[];
    assets: VietnamBasemapAssets;
    attribution: string;
}

export interface VietnamBasemapClient {
    readonly mode: VietnamBasemapMode;
    readonly manifest: VietnamBasemapManifest;
    styleUrl(styleId?: string): string;
    styleDocument(styleId?: string): Promise<maplibregl.StyleSpecification>;
    tileTemplate(): string;
    glyphsTemplate(): string;
    spriteUrl(): string;
    assetUrl(packagePath: string): string;
}

export interface VietnamBasemapProvider {
    client: VietnamBasemapClient;
    styleId?: string;
    sourceId?: string;
}

export function createVietnamBasemapClient(options: {
    mode: VietnamBasemapMode;
    baseUrl: string;
    manifest: VietnamBasemapManifest;
    fetchImpl?: typeof fetch;
}): VietnamBasemapClient {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const manifest = validateVietnamBasemapManifest(options.manifest);
    const fetchImpl = options.fetchImpl ?? fetch;

    return {
        mode: options.mode,
        manifest,
        styleUrl(styleId = manifest.defaultStyle) {
            const style = manifest.styles.find(candidate => candidate.id === styleId);
            if (!style) throw new Error('Unknown Vietnam basemap style: ' + styleId);
            if (options.mode === 'online') {
                return joinUrl(baseUrl, 'api/v1/basemap/styles/' + style.id);
            }
            return joinUrl(baseUrl, style.path);
        },
        async styleDocument(styleId = manifest.defaultStyle) {
            const style = manifest.styles.find(candidate => candidate.id === styleId);
            if (!style) throw new Error('Unknown Vietnam basemap style: ' + styleId);

            const url = options.mode === 'online'
                ? joinUrl(baseUrl, 'api/v1/basemap/styles/' + style.id)
                : joinUrl(baseUrl, style.path);
            const response = await fetchImpl(url, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                throw new Error('Vietnam basemap style request failed: ' + response.status);
            }

            const styleDocument = await response.json();
            if (!isRecord(styleDocument) || styleDocument.version !== 8) {
                throw new Error('Vietnam basemap style document is invalid');
            }
            if (containsExternalUrl(styleDocument)) {
                throw new Error('Vietnam basemap style contains an external URL');
            }

            return resolveStyleDocument(styleDocument, {
                tiles: baseUrl + '/tiles',
                glyphs: baseUrl + '/fonts',
                sprite: baseUrl + '/sprites',
            }) as maplibregl.StyleSpecification;
        },
        tileTemplate() {
            return baseUrl + '/tiles/{z}/{x}/{y}.mvt';
        },
        glyphsTemplate() {
            return baseUrl + '/fonts/{fontstack}/{range}.pbf';
        },
        spriteUrl() {
            return baseUrl + '/sprites/basemap';
        },
        assetUrl(packagePath: string) {
            if (!isSafePackagePath(packagePath)) {
                throw new Error('Unsafe basemap package path: ' + packagePath);
            }
            const path = options.mode === 'online' ? 'assets/' + packagePath : packagePath;
            return joinUrl(baseUrl, path);
        },
    };
}

function resolveStyleDocument(
    value: unknown,
    urls: { tiles: string; glyphs: string; sprite: string }
): unknown {
    if (typeof value === 'string') {
        return value
            .replace(/\{basemap-tiles\}/g, urls.tiles)
            .replace(/\{basemap-glyphs\}/g, urls.glyphs)
            .replace(/\{basemap-sprite\}/g, urls.sprite);
    }
    if (Array.isArray(value)) return value.map(item => resolveStyleDocument(item, urls));
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, resolveStyleDocument(item, urls)])
        );
    }
    return value;
}

export async function fetchVietnamBasemapManifest(
    baseUrl: string,
    fetchImpl: typeof fetch = fetch
): Promise<VietnamBasemapManifest> {
    const response = await fetchImpl(joinUrl(normalizeBaseUrl(baseUrl), 'api/v1/basemap/manifest'), {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
        throw new Error('Vietnam basemap manifest request failed: ' + response.status);
    }
    return validateVietnamBasemapManifest(await response.json());
}

export function validateVietnamBasemapManifest(value: unknown): VietnamBasemapManifest {
    if (!isRecord(value)) throw new Error('Vietnam basemap manifest must be an object');
    const manifest = value as Partial<VietnamBasemapManifest>;
    if (manifest.contractVersion !== '1' || manifest.schemaVersion !== '1') {
        throw new Error('Unsupported Vietnam basemap contract/schema version');
    }
    requireString(manifest, 'id');
    requireString(manifest, 'name');
    requireString(manifest, 'version');
    requireString(manifest, 'defaultStyle');
    requireString(manifest, 'attribution');
    if (!Array.isArray(manifest.styles) || manifest.styles.length === 0) {
        throw new Error('Vietnam basemap manifest must declare styles');
    }
    if (!manifest.styles.some(style => style.id === manifest.defaultStyle)) {
        throw new Error('Vietnam basemap defaultStyle is not declared');
    }
    for (const style of manifest.styles) {
        if (!isRecord(style) || typeof style.id !== 'string' || typeof style.path !== 'string') {
            throw new Error('Vietnam basemap style reference is invalid');
        }
        if (!isSafePackagePath(style.path)) throw new Error('Vietnam basemap style path is unsafe');
    }
    if (!isRecord(manifest.assets)) throw new Error('Vietnam basemap assets are missing');
    requireString(manifest.assets, 'tileArchive');
    if (!isSafePackagePath(manifest.assets.tileArchive)) throw new Error('Vietnam basemap tile path is unsafe');
    if (!Array.isArray(manifest.assets.fonts) || !Array.isArray(manifest.assets.sprites)) {
        throw new Error('Vietnam basemap font/sprite assets are invalid');
    }
    if (manifest.assets.fonts.some(path => !isSafePackagePath(path))) {
        throw new Error('Vietnam basemap font path is unsafe');
    }
    if (manifest.assets.sprites.some(path => !isSafePackagePath(path))) {
        throw new Error('Vietnam basemap sprite path is unsafe');
    }
    return manifest as VietnamBasemapManifest;
}

function normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (!normalized) throw new Error('Vietnam basemap baseUrl must not be empty');
    return normalized;
}

function joinUrl(baseUrl: string, path: string): string {
    return baseUrl + '/' + path.split('/').map(encodeURIComponent).join('/');
}

function isSafePackagePath(path: string): boolean {
    return Boolean(
        path &&
            !path.startsWith('/') &&
            !path.includes('\\') &&
            !path.includes(':') &&
            !path.split('/').some(segment => !segment || segment === '..')
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function containsExternalUrl(value: unknown): boolean {
    if (typeof value === 'string') {
        return /^https?:\/\//i.test(value);
    }
    if (Array.isArray(value)) return value.some(containsExternalUrl);
    if (isRecord(value)) return Object.values(value).some(containsExternalUrl);
    return false;
}

function requireString(value: Record<string, unknown>, key: string): void {
    if (typeof value[key] !== 'string' || !value[key].trim()) {
        throw new Error('Vietnam basemap manifest field is invalid: ' + key);
    }
}
