import { describe, expect, it } from 'vitest';
import { DEFAULT_PREVIEW_USER_CONFIG, downloadPreviewPackage, normalizePreviewUserConfig } from './previewBridge';

describe('preview user configuration', () => {
    it('uses safe defaults for missing or invalid values', () => {
        expect(normalizePreviewUserConfig({ layer: 'invalid' as never, httpPort: 70000, autoZoom: false })).toEqual({
            ...DEFAULT_PREVIEW_USER_CONFIG,
            autoZoom: false,
        });
    });

    it('keeps valid layer and integration settings', () => {
        expect(normalizePreviewUserConfig({
            layer: 'google-hybrid',
            packageRoot: 'C:/maps',
            downloadUrl: ' https://example.test/map.pdb ',
            watcherFolder: 'C:/objects',
            httpPort: 39000,
            autoZoom: true,
        })).toMatchObject({
            layer: 'google-hybrid',
            packageRoot: 'C:/maps',
            downloadUrl: 'https://example.test/map.pdb',
            watcherFolder: 'C:/objects',
            httpPort: 39000,
            autoZoom: true,
        });
    });

    it('rejects unsafe download links before any network request', async () => {
        await expect(downloadPreviewPackage('file:///outside/map.pdb', 'C:/maps')).rejects.toThrow(/HTTP\/HTTPS/);
        await expect(downloadPreviewPackage('https://example.test/map.zip', 'C:/maps')).rejects.toThrow(/\.pdb/);
    });
});
