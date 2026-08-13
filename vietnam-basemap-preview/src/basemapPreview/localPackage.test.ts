import { describe, expect, it } from 'vitest';
import { createLocalPackageAdapter, validatePreviewManifest } from './localPackage';
import type { PreviewFileReader } from './types';
import { filterStreetViewCoverage, loadLocalStreetViewCoverage, selectNearestStreetViewPanorama } from './streetViewCoverage';

const manifest = {
    id: 'vn-basemap', name: 'Vietnam Basemap', version: '1.0.0', contractVersion: '1', schemaVersion: '1',
    defaultStyle: 'engineering', attribution: '© OpenStreetMap contributors',
    styles: [{ id: 'engineering', label: 'Engineering', path: 'styles/engineering.json' }],
    assets: { tileArchive: 'tiles/vietnam.pmtiles', fonts: ['fonts/Noto Sans/0-255.pbf'], sprites: ['sprites/basemap.json'] },
};

function reader(files: Record<string, string | Uint8Array>): PreviewFileReader {
    return { read: async path => {
        const value = files[path];
        if (value === undefined) throw new Error(`missing ${path}`);
        return typeof value === 'string' ? new TextEncoder().encode(value) : value;
    } };
}

describe('local package adapter', () => {
    it('validates all declared assets before creating the adapter', async () => {
        const style = JSON.stringify({ version: 8, sources: { vn: { type: 'vector', tiles: ['{basemap-tiles}/{z}/{x}/{y}.mvt'] } }, layers: [] });
        const adapter = await createLocalPackageAdapter(reader({
            'manifest.json': JSON.stringify(manifest), 'styles/engineering.json': style,
            'tiles/vietnam.pmtiles': 'archive', 'fonts/Noto Sans/0-255.pbf': 'font', 'sprites/basemap.json': '{}',
        }));
        const document = await adapter.styleDocument('engineering');
        expect(JSON.stringify(document)).toContain('pmtiles://package');
        expect(adapter.metadata.external).toBe(false);
    });

    it('rejects incompatible contracts and unsafe paths', () => {
        expect(() => validatePreviewManifest({ ...manifest, contractVersion: '999' })).toThrow(/không tương thích/);
        expect(() => validatePreviewManifest({ ...manifest, styles: [{ ...manifest.styles[0], path: '../outside.json' }] })).toThrow(/không an toàn/);
    });

    it('rejects external style resources before render', async () => {
        const invalidStyle = JSON.stringify({ version: 8, glyphs: 'https://example.invalid/font.pbf', sources: {}, layers: [] });
        await expect(createLocalPackageAdapter(reader({
            'manifest.json': JSON.stringify(manifest), 'styles/engineering.json': invalidStyle,
            'tiles/vietnam.pmtiles': 'archive', 'fonts/Noto Sans/0-255.pbf': 'font', 'sprites/basemap.json': '{}',
        })).then(adapter => adapter.styleDocument('engineering'))).rejects.toThrow(/external URL/);
    });

    it('loads optional local Street View coverage and selects the nearest panorama in the viewport', async () => {
        const coverage = JSON.stringify({
            version: 1,
            segments: [{ id: 'road-1', path: [[105, 10], [105.2, 10.2]] }],
            panoramas: [
                { id: 'far', point: [105.2, 10.2] },
                { id: 'near', point: [105.01, 10.01], heading: 30 },
            ],
        });
        const coverageManifest = { ...manifest, assets: { ...manifest.assets, streetViewCoverage: 'streetview/coverage.json' } };
        const packageReader = reader({
            'manifest.json': JSON.stringify(coverageManifest),
            'styles/engineering.json': JSON.stringify({ version: 8, sources: {}, layers: [] }),
            'tiles/vietnam.pmtiles': 'archive',
            'fonts/Noto Sans/0-255.pbf': 'font',
            'sprites/basemap.json': '{}',
            'streetview/coverage.json': coverage,
        });
        const adapter = await createLocalPackageAdapter(packageReader);
        const loaded = await loadLocalStreetViewCoverage(adapter.manifest, packageReader);
        const viewport = filterStreetViewCoverage(loaded.coverage, { west: 104, south: 9, east: 106, north: 11 });
        expect(selectNearestStreetViewPanorama(viewport, [105, 10])).toMatchObject({ point: [105.01, 10.01], heading: 30 });
        expect(loaded.message).toContain('cục bộ');
    });

    it('keeps existing packages valid when no Street View coverage asset is declared', async () => {
        const loaded = await loadLocalStreetViewCoverage(null, null);
        expect(loaded).toEqual({ coverage: { version: 1, segments: [], panoramas: [] }, source: 'empty' });
    });
});
