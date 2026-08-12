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
            layerVisibility: {
                googleStreet: {
                    landcover: true,
                    water: true,
                    boundaries: true,
                    roads: false,
                    labels: true,
                    pois: true,
                    buildings: false,
                    terrain: true,
                },
            },
        })).toMatchObject({
            layer: 'google-hybrid',
            packageRoot: 'C:/maps',
            downloadUrl: 'https://example.test/map.pdb',
            watcherFolder: 'C:/objects',
            httpPort: 39000,
            autoZoom: true,
            layerVisibility: {
                googleStreet: {
                    landcover: true,
                    water: true,
                    boundaries: true,
                    roads: false,
                    labels: true,
                    pois: true,
                    buildings: false,
                    terrain: true,
                },
                googleHybrid: expect.any(Object),
                localPackage: expect.any(Object),
            },
        });
    });

    it('migrates the previous five-group state into all source-specific visibility states', () => {
        expect(normalizePreviewUserConfig({
            layer: 'google-street',
            subLayers: {
                bordersLabels: false,
                roads: true,
                pois: false,
                buildings3d: true,
                terrain: true,
            },
        }).layerVisibility).toEqual({
            googleStreet: {
                landcover: true,
                water: true,
                boundaries: false,
                roads: true,
                labels: false,
                pois: false,
                buildings: true,
                terrain: true,
            },
            googleHybrid: {
                landcover: true,
                water: true,
                boundaries: false,
                roads: true,
                labels: false,
                pois: false,
                buildings: true,
                terrain: true,
            },
            localPackage: {
                landcover: true,
                water: true,
                boundaries: false,
                roads: true,
                labels: false,
                pois: false,
                buildings: true,
                terrain: true,
            },
        });
    });

    it('rejects unsafe download links before any network request', async () => {
        await expect(downloadPreviewPackage('file:///outside/map.pdb', 'C:/maps')).rejects.toThrow(/HTTP\/HTTPS/);
        await expect(downloadPreviewPackage('https://example.test/map.zip', 'C:/maps')).rejects.toThrow(/\.pdb/);
    });
});
