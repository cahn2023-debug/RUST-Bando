import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LayerPopover } from './LayerPopover';
import { GOOGLE_BASEMAP_LAYER_CAPABILITIES } from './basemapLayers';
import { DEFAULT_LAYER_VISIBILITY, type PreviewUserConfig } from './types';
import { DEFAULT_PREVIEW_USER_CONFIG } from './previewBridge';

function renderLayerPopover(overrides: Partial<Parameters<typeof LayerPopover>[0]> = {}): string {
    const props: Parameters<typeof LayerPopover>[0] = {
        open: true,
        layer: 'google-street',
        styleId: 'engineering',
        userConfig: DEFAULT_PREVIEW_USER_CONFIG,
        layerCapabilities: GOOGLE_BASEMAP_LAYER_CAPABILITIES,
        layerVisibility: DEFAULT_LAYER_VISIBILITY,
        layerUpdateState: 'idle',
        layerUpdateError: null,
        onClose: vi.fn(),
        onSelectLayer: vi.fn(),
        onSelectStyle: vi.fn(),
        onToggleLayer: vi.fn(),
        onRetryLayerUpdate: vi.fn(),
        onPickPackage: vi.fn(),
        onDownloadPackage: vi.fn(),
        onPickWatcherFolder: vi.fn(),
        onUpdateUserConfig: vi.fn(),
        onSaveUserConfig: vi.fn(),
        onOpenMetadata: vi.fn(),
        ...overrides,
    };
    return renderToStaticMarkup(createElement(LayerPopover, props));
}

describe('LayerPopover layer states', () => {
    it('renders only precisely controllable Google groups and hides boundary', () => {
        const html = renderLayerPopover();

        expect(html).toContain('Đường');
        expect(html).toContain('Nhãn');
        expect(html).toContain('POI');
        expect(html).not.toContain('Ranh giới');
        expect(html).not.toContain('Công trình');
    });

    it('locks layer controls while capabilities are loading', () => {
        const html = renderLayerPopover({ layerCapabilities: null });

        expect(html).toContain('Đang tải layer');
        expect(html).not.toContain('type="checkbox"');
    });

    it('retains the selected controls and exposes retry when updating fails', () => {
        const html = renderLayerPopover({
            layerUpdateState: 'error',
            layerUpdateError: 'Không lưu được cấu hình',
            layerVisibility: { ...DEFAULT_LAYER_VISIBILITY, roads: false },
        });

        expect(html).toContain('Không lưu được cấu hình');
        expect(html).toContain('Thử lại');
        expect(html).toContain('checked=""');
    });
});

describe('source-specific layer state', () => {
    it('does not collapse distinct Google and Local visibility states during normalization', async () => {
        const { normalizePreviewUserConfig } = await import('./previewBridge');
        const config = normalizePreviewUserConfig({
            layer: 'google-hybrid',
            layerVisibility: {
                googleStreet: { roads: false },
                googleHybrid: { roads: true, labels: false },
                localPackage: { water: false },
            },
        } as Partial<PreviewUserConfig>);

        expect(config.layerVisibility.googleStreet.roads).toBe(false);
        expect(config.layerVisibility.googleHybrid.roads).toBe(true);
        expect(config.layerVisibility.googleHybrid.labels).toBe(false);
        expect(config.layerVisibility.localPackage.water).toBe(false);
    });
});
