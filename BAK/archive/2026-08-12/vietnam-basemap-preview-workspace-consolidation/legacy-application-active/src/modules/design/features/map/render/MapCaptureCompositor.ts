export interface CompositeMapCaptureInput {
    basemapCanvas: HTMLCanvasElement;
    overlayCanvas?: HTMLCanvasElement | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    scale?: number;
    pixelBudget?: number;
}

const MAX_MAP_CAPTURE_WIDTH = 1600;
const DEFAULT_PIXEL_BUDGET = 1_800_000;

export const compositeMapCapture = ({
    basemapCanvas,
    overlayCanvas,
    x = 0,
    y = 0,
    width = basemapCanvas.width,
    height = basemapCanvas.height,
    scale = 1,
    pixelBudget = DEFAULT_PIXEL_BUDGET,
}: CompositeMapCaptureInput): HTMLCanvasElement => {
    const rawWidth = Math.max(1, Math.round(width * scale));
    const rawHeight = Math.max(1, Math.round(height * scale));
    const maxPixels = Math.max(320 * 240, pixelBudget);
    const widthScale = rawWidth > MAX_MAP_CAPTURE_WIDTH ? MAX_MAP_CAPTURE_WIDTH / rawWidth : 1;
    const pixelScale = rawWidth * rawHeight > maxPixels ? Math.sqrt(maxPixels / (rawWidth * rawHeight)) : 1;
    const downScale = Math.min(widthScale, pixelScale);
    const targetWidth = downScale < 1 ? Math.max(1, Math.round(rawWidth * downScale)) : rawWidth;
    const targetHeight = downScale < 1 ? Math.max(1, Math.round(rawHeight * downScale)) : rawHeight;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');

    context.drawImage(basemapCanvas, x, y, width, height, 0, 0, targetWidth, targetHeight);
    if (overlayCanvas) {
        context.drawImage(overlayCanvas, x, y, width, height, 0, 0, targetWidth, targetHeight);
    }

    return canvas;
};

