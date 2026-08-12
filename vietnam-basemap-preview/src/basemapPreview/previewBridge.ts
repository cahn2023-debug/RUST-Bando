import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import JSZip from 'jszip';
import type { PreviewFileReader, PreviewUserConfig } from './types';
import type { NormalizedExtentPayload } from './extentPayload';
import {
    createStreetViewRouteUrl,
    PREVIEW_STREET_VIEW_SYNC_EVENT,
    PREVIEW_STREET_VIEW_WINDOW_LABEL,
    parseStreetViewSyncPayload,
    type StreetViewSyncPayload,
    type StreetViewViewpoint,
} from './streetView';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const watchedStreetViewWindows = new WeakSet<WebviewWindow>();

export interface PreviewLaunchConfig {
    packageRoot: string | null;
    source: 'online' | 'offline';
    configOrigin: string;
}

export interface PreviewIntegrationStatus {
    httpPort: number;
    error: string | null;
}

export const DEFAULT_PREVIEW_USER_CONFIG: PreviewUserConfig = {
    layer: 'google-street',
    packageRoot: null,
    downloadUrl: '',
    downloadDirectory: null,
    watcherFolder: null,
    httpPort: 38741,
    autoZoom: true,
};

export function isTauriPreview(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getPreviewLaunchConfig(): Promise<PreviewLaunchConfig> {
    if (isTauriPreview()) return invoke<PreviewLaunchConfig>('get_preview_launch_config');
    const packageRoot = new URLSearchParams(window.location.search).get('package');
    return {
        packageRoot,
        source: packageRoot ? 'offline' : 'online',
        configOrigin: packageRoot ? 'browser query' : 'mặc định',
    };
}

export async function getPreviewUserConfig(): Promise<PreviewUserConfig | null> {
    if (isTauriPreview()) {
        const config = await invoke<Partial<PreviewUserConfig> | null>('get_preview_user_config');
        return config ? normalizePreviewUserConfig(config) : null;
    }
    try {
        const raw = window.localStorage.getItem('vietnam-basemap-preview.config');
        return raw ? normalizePreviewUserConfig(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export async function getPreviewIntegrationStatus(): Promise<PreviewIntegrationStatus | null> {
    if (!isTauriPreview()) return null;
    return invoke<PreviewIntegrationStatus>('get_preview_integration_status');
}

export async function savePreviewUserConfig(config: PreviewUserConfig): Promise<void> {
    const normalized = normalizePreviewUserConfig(config);
    if (isTauriPreview()) {
        await invoke('save_preview_user_config', { config: normalized });
        return;
    }
    window.localStorage.setItem('vietnam-basemap-preview.config', JSON.stringify(normalized));
}

export function normalizePreviewUserConfig(value: Partial<PreviewUserConfig> | null | undefined): PreviewUserConfig {
    const candidate = value ?? {};
    const layer = candidate.layer === 'google-hybrid' || candidate.layer === 'local-package'
        ? candidate.layer
        : 'google-street';
    const port = typeof candidate.httpPort === 'number' && Number.isInteger(candidate.httpPort) && candidate.httpPort > 0 && candidate.httpPort < 65536
        ? candidate.httpPort
        : DEFAULT_PREVIEW_USER_CONFIG.httpPort;
    return {
        layer,
        packageRoot: typeof candidate.packageRoot === 'string' && candidate.packageRoot.trim() ? candidate.packageRoot : null,
        downloadUrl: typeof candidate.downloadUrl === 'string' ? candidate.downloadUrl.trim() : '',
        downloadDirectory: typeof candidate.downloadDirectory === 'string' && candidate.downloadDirectory.trim() ? candidate.downloadDirectory : null,
        watcherFolder: typeof candidate.watcherFolder === 'string' && candidate.watcherFolder.trim() ? candidate.watcherFolder : null,
        httpPort: port,
        autoZoom: candidate.autoZoom !== false,
    };
}

export async function pickDirectory(title: string): Promise<string | null> {
    if (!isTauriPreview()) return null;
    const selected = await open({ directory: true, multiple: false, title });
    return typeof selected === 'string' ? selected : null;
}

export async function registerPreviewPackageRoot(packageRoot: string): Promise<string> {
    if (!isTauriPreview()) return packageRoot;
    return invoke<string>('register_preview_package_root', { packageRoot });
}

export async function downloadPreviewPackage(url: string, directory: string): Promise<string> {
    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) throw new Error('Link download package phải là HTTP/HTTPS');
    if (!trimmedUrl.toLowerCase().endsWith('.pdb')) throw new Error('Link download phải trỏ tới file .pdb');
    if (!directory.trim()) throw new Error('Chưa chọn thư mục lưu package');
    if (!isTauriPreview()) throw new Error('Tải package chỉ khả dụng trong executable Windows preview');
    const response = await fetch(trimmedUrl);
    if (!response.ok) throw new Error(`Không tải được package (${response.status})`);
    const bytes = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.values(zip.files).filter(file => !file.dir);
    const manifestFile = files.find(file => file.name === 'manifest.json' || file.name.endsWith('/manifest.json'));
    if (!manifestFile) {
        throw new Error('Package .pdb không chứa manifest.json');
    }
    const manifestPrefix = manifestFile.name === 'manifest.json'
        ? ''
        : manifestFile.name.slice(0, -'manifest.json'.length);
    const packageRoot = await invoke<string>('prepare_preview_package_directory', { directory });
    for (const file of files) {
        if (manifestPrefix && !file.name.startsWith(manifestPrefix)) {
            throw new Error(`Package entry nằm ngoài package root: ${file.name}`);
        }
        const entryPath = file.name.startsWith(manifestPrefix) ? file.name.slice(manifestPrefix.length) : file.name;
        if (!isSafeArchivePath(entryPath)) throw new Error(`Package entry không an toàn: ${entryPath}`);
        const content = await file.async('uint8array');
        await invoke('write_preview_package_entry', { packageRoot, entryPath, bytes: Array.from(content) });
    }
    return packageRoot;
}

function isSafeArchivePath(path: string): boolean {
    return Boolean(path) && !path.startsWith('/') && !path.includes('\\') &&
        !path.split('/').some(segment => !segment || segment === '..');
}

export function createPreviewFileReader(packageRoot: string | null): PreviewFileReader {
    return {
        async read(path: string): Promise<Uint8Array> {
            if (isTauriPreview()) return Uint8Array.from(await invoke<number[]>('read_preview_package_file', { packagePath: path, packageRoot }));
            if (!packageRoot) throw new Error('Local package chưa được cấu hình');
            const response = await fetch(`${packageRoot.replace(/[\\/]$/, '')}/${path}`);
            if (!response.ok) throw new Error(`Không đọc được package asset (${response.status})`);
            return new Uint8Array(await response.arrayBuffer());
        },
        async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
            if (isTauriPreview()) return Uint8Array.from(await invoke<number[]>('read_preview_package_range', { packagePath: path, packageRoot, offset, length }));
            if (!packageRoot) throw new Error('Local package chưa được cấu hình');
            const response = await fetch(`${packageRoot.replace(/[\\/]$/, '')}/${path}`, {
                headers: { Range: `bytes=${offset}-${offset + length - 1}` },
            });
            if (!response.ok) throw new Error(`Không đọc được package range (${response.status})`);
            return new Uint8Array(await response.arrayBuffer());
        },
    };
}

export async function listenPreviewExtentEvents(
    onPayload: (payload: unknown) => void,
    onError: (error: unknown) => void,
): Promise<UnlistenFn> {
    if (!isTauriPreview()) return () => undefined;
    const [stopPayload, stopError] = await Promise.all([
        listen<NormalizedExtentPayload>('preview_extent_payload', event => onPayload(event.payload)),
        listen<unknown>('preview_extent_error', event => onError(event.payload)),
    ]);
    return () => {
        stopPayload();
        stopError();
    };
}

export async function openPreviewStreetView(viewpoint: StreetViewViewpoint): Promise<void> {
    if (isTauriPreview()) {
        const existing = await WebviewWindow.getByLabel(PREVIEW_STREET_VIEW_WINDOW_LABEL);
        if (existing) {
            watchStreetViewWindowClose(existing);
            await existing.show();
            await existing.setFocus();
            await emitStreetViewViewpoint(viewpoint);
            return;
        }

        const window = new WebviewWindow(PREVIEW_STREET_VIEW_WINDOW_LABEL, {
            url: createStreetViewRouteUrl(viewpoint),
            title: 'Google Street View',
            width: 1120,
            height: 760,
            minWidth: 720,
            minHeight: 480,
            resizable: true,
            center: true,
        });
        watchStreetViewWindowClose(window);
        await waitForWindowCreated(window);
        return;
    }

    const popup = window.open(createStreetViewRouteUrl(viewpoint), PREVIEW_STREET_VIEW_WINDOW_LABEL, 'popup,width=1120,height=760');
    if (!popup) throw new Error('Không thể mở cửa sổ Street View. Hãy cho phép popup của preview.');
    popup.focus();
    popup.postMessage({ type: 'preview-streetview-init', viewpoint }, window.location.origin);
}

function watchStreetViewWindowClose(window: WebviewWindow): void {
    if (watchedStreetViewWindows.has(window)) return;
    watchedStreetViewWindows.add(window);
    let emitted = false;
    const notifyClosed = () => {
        if (emitted) return;
        emitted = true;
        void emit(PREVIEW_STREET_VIEW_SYNC_EVENT, { status: 'closed' } satisfies StreetViewSyncPayload);
    };
    void window.onCloseRequested(notifyClosed);
    void window.once('tauri://destroyed', notifyClosed);
}

export async function listenPreviewStreetViewEvents(
    onPayload: (payload: StreetViewSyncPayload) => void,
    onError: (error: unknown) => void,
): Promise<UnlistenFn> {
    if (isTauriPreview()) {
        return listen<unknown>(PREVIEW_STREET_VIEW_SYNC_EVENT, event => {
            const payload = parseStreetViewSyncPayload(event.payload);
            if (payload) onPayload(payload);
            else onError(new Error('Payload đồng bộ Street View không hợp lệ'));
        });
    }
    const handler = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin || !isRecord(event.data) || event.data.type !== PREVIEW_STREET_VIEW_SYNC_EVENT) return;
        try {
            const payload = parseStreetViewSyncPayload(event.data.payload);
            if (payload) onPayload(payload);
            else onError(new Error('Payload đồng bộ Street View không hợp lệ'));
        } catch (error) {
            onError(error);
        }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
}

export async function emitStreetViewViewpoint(viewpoint: StreetViewViewpoint): Promise<void> {
    if (isTauriPreview()) {
        await emit('preview_streetview_init', viewpoint);
    }
}

export async function listenPreviewStreetViewInit(
    onViewpoint: (viewpoint: StreetViewViewpoint) => void,
): Promise<UnlistenFn> {
    if (!isTauriPreview()) return () => undefined;
    return listen<StreetViewViewpoint>('preview_streetview_init', event => onViewpoint(event.payload));
}

export async function sendPreviewStreetViewSync(payload: StreetViewSyncPayload): Promise<void> {
    if (isTauriPreview()) {
        await emit(PREVIEW_STREET_VIEW_SYNC_EVENT, payload);
        return;
    }
    window.opener?.postMessage({ type: PREVIEW_STREET_VIEW_SYNC_EVENT, payload }, window.location.origin);
}

function waitForWindowCreated(window: WebviewWindow): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            callback();
        };
        void window.once('tauri://created', () => finish(resolve));
        void window.once('tauri://error', event => finish(() => reject(new Error(`Street View window error: ${String(event.payload ?? event)}`))));
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
