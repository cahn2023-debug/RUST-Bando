/**
 * IconAtlasManager.ts
 * Bộ quản lý và cache bitmap cho toàn bộ biểu tượng Point / CAD Symbols (Camera, CCTV, LPR, Speed, Survey Point, Cabinet, Nút giao)
 * Pre-rasterize SVG sang Offscreen Canvas để render 60 FPS mà không bị nghẽn CPU/GPU.
 */

import { getIconSvgString } from '@DESIGN/components/icons/MapIcons';
import { normalizeFeatureColor, normalizeFeatureSize, normalizeIconKey } from '@TOOL/utils/featureSymbolStyle';

interface CachedSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  lastUsed: number;
}

const MAX_SPRITE_CACHE_SIZE = 512;
const spriteCache = new Map<string, CachedSprite>();
const pendingImages = new Map<string, Promise<HTMLImageElement>>();

function getSpriteKey(
  iconKey: string,
  color: string,
  size: number,
  rotation: number,
  index: string | number | undefined,
  dpr: number
): string {
  const normKey = normalizeIconKey(iconKey);
  const normColor = normalizeFeatureColor(color);
  const normSize = normalizeFeatureSize(size, 'point');
  const rot = Math.round(Number(rotation) || 0);
  const idx = index !== undefined && index !== null && index !== '' ? String(index) : '';
  return `${normKey}:${normColor}:${normSize}:${rot}:${idx}@${dpr}x`;
}

function rasterizeSvgToCanvas(
  svgString: string,
  width: number,
  height: number,
  dpr: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

export class IconAtlasManager {
  private static onSpriteReadyCallback: (() => void) | null = null;

  public static setOnSpriteReady(callback: () => void): void {
    this.onSpriteReadyCallback = callback;
  }

  public static clearCache(): void {
    spriteCache.clear();
    pendingImages.clear();
  }

  /**
   * Lấy Sprite Canvas đồng bộ. Nếu chưa có sẵn trong cache, hàm sẽ trả về null và kích hoạt tải bất đồng bộ.
   */
  public static getSprite(
    iconKey: string,
    color: string,
    size: number,
    rotation = 0,
    index?: string | number,
    dpr = 1
  ): HTMLCanvasElement | null {
    const key = getSpriteKey(iconKey, color, size, rotation, index, dpr);
    const cached = spriteCache.get(key);

    if (cached) {
      cached.lastUsed = Date.now();
      return cached.canvas;
    }

    // Trigger async rasterization if not already pending
    if (!pendingImages.has(key)) {
      const normKey = normalizeIconKey(iconKey);
      const normColor = normalizeFeatureColor(color);
      const normSize = normalizeFeatureSize(size, 'point');
      const rot = Math.round(Number(rotation) || 0);
      const idx = index !== undefined && index !== null && index !== '' ? String(index) : undefined;

      const svgString = getIconSvgString(normKey, normColor, normSize, idx, rot);
      
      const loadPromise = rasterizeSvgToCanvas(svgString, normSize, normSize, dpr)
        .then((canvas) => {
          // Add to LRU cache
          if (spriteCache.size >= MAX_SPRITE_CACHE_SIZE) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [k, v] of spriteCache.entries()) {
              if (v.lastUsed < oldestTime) {
                oldestTime = v.lastUsed;
                oldestKey = k;
              }
            }
            if (oldestKey) spriteCache.delete(oldestKey);
          }

          spriteCache.set(key, {
            canvas,
            width: normSize,
            height: normSize,
            dpr,
            lastUsed: Date.now(),
          });
          pendingImages.delete(key);

          // Notify renderer to trigger a repaint
          if (this.onSpriteReadyCallback) {
            this.onSpriteReadyCallback();
          }
          return canvas as any;
        })
        .catch((err) => {
          pendingImages.delete(key);
          console.warn('[IconAtlasManager] Failed to rasterize icon:', key, err);
        });

      pendingImages.set(key, loadPromise as any);
    }

    return null;
  }
}
