import { describe, expect, it, vi } from 'vitest';
import {
    createVietnamBasemapClient,
    fetchVietnamBasemapManifest,
    validateVietnamBasemapManifest,
    type VietnamBasemapManifest,
} from './vietnamBasemapClient';

const manifest: VietnamBasemapManifest = {
    id: 'vn-basemap',
    name: 'Vietnam Basemap',
    version: '1.0.0',
    contractVersion: '1',
    schemaVersion: '1',
    defaultStyle: 'engineering',
    styles: [
        { id: 'light', label: 'Light', path: 'styles/light.json' },
        { id: 'dark', label: 'Dark', path: 'styles/dark.json' },
        { id: 'engineering', label: 'Engineering', path: 'styles/engineering.json' },
    ],
    assets: {
        tileArchive: 'tiles/vietnam.pmtiles',
        fonts: ['fonts/Noto Sans/0-255.pbf'],
        sprites: ['sprites/basemap.json', 'sprites/basemap.png'],
    },
    attribution: '© OpenStreetMap contributors',
};

describe('Vietnam basemap client contract', () => {
    it('resolves online endpoints from the shared manifest', () => {
        const client = createVietnamBasemapClient({
            mode: 'online',
            baseUrl: 'http://basemap.local/',
            manifest,
        });

        expect(client.styleUrl()).toBe('http://basemap.local/api/v1/basemap/styles/engineering');
        expect(client.tileTemplate()).toBe('http://basemap.local/tiles/{z}/{x}/{y}.mvt');
        expect(client.glyphsTemplate()).toBe('http://basemap.local/fonts/{fontstack}/{range}.pbf');
        expect(client.spriteUrl()).toBe('http://basemap.local/sprites/basemap');
        expect(client.assetUrl('styles/engineering.json')).toBe(
            'http://basemap.local/assets/styles/engineering.json'
        );
    });

    it('resolves offline package paths without changing the manifest semantics', () => {
        const client = createVietnamBasemapClient({
            mode: 'offline',
            baseUrl: 'basemap://release/1.0.0',
            manifest,
        });

        expect(client.styleUrl('dark')).toBe('basemap://release/1.0.0/styles/dark.json');
        expect(client.tileTemplate()).toBe('basemap://release/1.0.0/tiles/{z}/{x}/{y}.mvt');
        expect(client.assetUrl('fonts/Noto Sans/0-255.pbf')).toBe(
            'basemap://release/1.0.0/fonts/Noto%20Sans/0-255.pbf'
        );
    });

    it('loads an offline style through the same manifest contract', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                version: 8,
                sources: { 'vn-basemap': { type: 'vector', tiles: ['{basemap-tiles}/{z}/{x}/{y}.mvt'] } },
                layers: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
        const client = createVietnamBasemapClient({
            mode: 'offline',
            baseUrl: 'basemap://release/1.0.0',
            manifest,
            fetchImpl,
        });

        const style = await client.styleDocument('dark');

        expect(style.sources['vn-basemap']).toMatchObject({
            tiles: ['basemap://release/1.0.0/tiles/{z}/{x}/{y}.mvt'],
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'basemap://release/1.0.0/styles/dark.json',
            expect.objectContaining({ headers: { Accept: 'application/json' } })
        );
    });

    it('fetches and validates the online manifest', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(manifest), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const loaded = await fetchVietnamBasemapManifest('http://basemap.local', fetchImpl);
        expect(loaded.version).toBe('1.0.0');
        expect(fetchImpl).toHaveBeenCalledWith(
            'http://basemap.local/api/v1/basemap/manifest',
            expect.objectContaining({ headers: { Accept: 'application/json' } })
        );
    });

    it('loads a style and resolves package placeholders for MapLibre', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                version: 8,
                sources: {
                    'vn-basemap': { type: 'vector', tiles: ['{basemap-tiles}/{z}/{x}/{y}.mvt'] },
                },
                glyphs: '{basemap-glyphs}/{fontstack}/{range}.pbf',
                sprite: '{basemap-sprite}/basemap',
                layers: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
        const client = createVietnamBasemapClient({ mode: 'online', baseUrl: 'http://basemap.local', manifest, fetchImpl });

        const style = await client.styleDocument();

        expect(style.sources['vn-basemap']).toMatchObject({
            tiles: ['http://basemap.local/tiles/{z}/{x}/{y}.mvt'],
        });
        expect(style.glyphs).toBe('http://basemap.local/fonts/{fontstack}/{range}.pbf');
        expect(style.sprite).toBe('http://basemap.local/sprites/basemap');
        expect(fetchImpl).toHaveBeenCalledWith(
            'http://basemap.local/api/v1/basemap/styles/engineering',
            expect.objectContaining({ headers: { Accept: 'application/json' } })
        );
    });

    it('rejects incompatible manifests and unsafe paths', () => {
        expect(() =>
            validateVietnamBasemapManifest({ ...manifest, contractVersion: '999' })
        ).toThrow(/Unsupported/);
        expect(() =>
            validateVietnamBasemapManifest({
                ...manifest,
                styles: manifest.styles.map((style, index) =>
                    index === 0 ? { ...style, path: '../outside.json' } : style
                ),
            })
        ).toThrow(/unsafe/);
    });
});
