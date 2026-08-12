import { describe, expect, it, vi } from 'vitest';
import { compositeMapCapture } from './MapCaptureCompositor';

describe('compositeMapCapture', () => {
    it('draws basemap before overlay into a bounded target canvas', () => {
        const calls: unknown[][] = [];
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const element = originalCreateElement(tagName);
            if (tagName.toLowerCase() === 'canvas') {
                (element as HTMLCanvasElement).getContext = vi.fn(() => ({
                    drawImage: (...args: unknown[]) => calls.push(args),
                })) as any;
            }
            return element;
        });

        const basemap = originalCreateElement('canvas') as HTMLCanvasElement;
        basemap.width = 800;
        basemap.height = 600;
        const overlay = originalCreateElement('canvas') as HTMLCanvasElement;
        overlay.width = 800;
        overlay.height = 600;

        const result = compositeMapCapture({ basemapCanvas: basemap, overlayCanvas: overlay, scale: 2, pixelBudget: 800 * 600 });

        expect(result.width * result.height).toBeLessThanOrEqual(800 * 600);
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(basemap);
        expect(calls[1][0]).toBe(overlay);
    });
});

