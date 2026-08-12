import { invoke } from '@tauri-apps/api/core';
import type { PreviewFileReader } from './types';

export interface PreviewLaunchConfig {
    packageRoot: string | null;
    source: 'online' | 'offline';
    configOrigin: string;
}

export function isTauriPreview(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getPreviewLaunchConfig(): Promise<PreviewLaunchConfig> {
    if (isTauriPreview()) {
        return invoke<PreviewLaunchConfig>('get_preview_launch_config');
    }
    const packageRoot = new URLSearchParams(window.location.search).get('package');
    return {
        packageRoot,
        source: packageRoot ? 'offline' : 'online',
        configOrigin: packageRoot ? 'browser query' : 'mặc định',
    };
}

export function createPreviewFileReader(packageRoot: string | null): PreviewFileReader {
    return {
        async read(path: string): Promise<Uint8Array> {
            if (isTauriPreview()) {
                const bytes = await invoke<number[]>('read_preview_package_file', {
                    packagePath: path,
                });
                return Uint8Array.from(bytes);
            }
            if (!packageRoot) throw new Error('Local package chưa được cấu hình');
            const response = await fetch(`${packageRoot.replace(/[\\/]$/, '')}/${path}`);
            if (!response.ok) throw new Error(`Không đọc được package asset (${response.status})`);
            return new Uint8Array(await response.arrayBuffer());
        },
        async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
            if (isTauriPreview()) {
                const bytes = await invoke<number[]>('read_preview_package_range', {
                    packagePath: path,
                    offset,
                    length,
                });
                return Uint8Array.from(bytes);
            }
            if (!packageRoot) throw new Error('Local package chưa được cấu hình');
            const response = await fetch(`${packageRoot.replace(/[\\/]$/, '')}/${path}`, {
                headers: { Range: `bytes=${offset}-${offset + length - 1}` },
            });
            if (!response.ok) throw new Error(`Không đọc được package range (${response.status})`);
            return new Uint8Array(await response.arrayBuffer());
        },
    };
}
