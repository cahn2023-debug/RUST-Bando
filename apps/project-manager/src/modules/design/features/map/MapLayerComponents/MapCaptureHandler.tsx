import { useEffect } from 'react';
import { listen, emit } from '@/contracts/tauri-api/runtime';
import { useMapContext } from '../MapContext';
import { validateMapCaptureCanvas } from './mapCaptureValidation';
import { compositeMapCapture } from '../render';

const MAX_CAPTURE_ZOOM = 36;
const REPORT_CAPTURE_EVENT = 'design-report-map-capture';

type MapCaptureRequest = {
  captureId?: string;
  printArea: [number, number, number, number] | null;
  scale?: number;
  fitToBounds?: boolean;
  zoom?: number;
  focusFeatureIds?: string[];
  hiddenFeatureIds?: string[];
  requiredFeatureIds?: string[];
  requiredPoints?: Array<[number, number]>;
  captureKind?: 'preview' | 'export';
  pixelBudget?: number;
};

type MapCaptureImage = {
  mimeType: 'image/jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
  warnings?: string[];
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForMapIdle = (map: maplibregl.Map, timeoutMs = 2500): Promise<void> => (
  new Promise(resolve => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      map.off('idle', finish);
      window.setTimeout(resolve, 80);
    };
    if (typeof map.areTilesLoaded === 'function' && map.areTilesLoaded() && map.isStyleLoaded?.()) {
      window.setTimeout(finish, 100);
      return;
    }
    map.once('idle', finish);
    window.setTimeout(finish, timeoutMs);
  })
);

const forceRenderFrame = (map: maplibregl.Map): Promise<void> => (
  new Promise((resolve) => {
    try {
      map.triggerRepaint();
    } catch {
      // Ignore if map was disposed
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  })
);

const DEFAULT_EXPORT_PIXEL_BUDGET = 1_800_000;
const DEFAULT_PREVIEW_PIXEL_BUDGET = 900_000;
const REQUIRED_POINT_MARGIN_PX = 24;

const canvasToJpegImage = (canvas: HTMLCanvasElement, quality = 0.82): Promise<MapCaptureImage> => (
  new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        resolve({ mimeType: 'image/jpeg', bytes, width: canvas.width, height: canvas.height });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Map capture encode failed'));
        return;
      }
      blob.arrayBuffer()
        .then((buffer) => resolve({
          mimeType: 'image/jpeg',
          bytes: new Uint8Array(buffer),
          width: canvas.width,
          height: canvas.height,
        }))
        .catch(reject);
    }, 'image/jpeg', quality);
  })
);

const validateRequiredPointsInViewport = (
  map: maplibregl.Map,
  points: Array<[number, number]> | undefined,
  marginPx = REQUIRED_POINT_MARGIN_PX
): string | null => {
  if (!points || points.length === 0) return null;
  const container = map.getContainer();
  const width = container.clientWidth || map.getCanvas().clientWidth || map.getCanvas().width;
  const height = container.clientHeight || map.getCanvas().clientHeight || map.getCanvas().height;
  const missingCount = points.reduce((count, [lng, lat]) => {
    const projected = map.project([lng, lat]);
    const inside = projected.x >= marginPx
      && projected.y >= marginPx
      && projected.x <= width - marginPx
      && projected.y <= height - marginPx;
    return inside ? count : count + 1;
  }, 0);
  return missingCount > 0 ? `${missingCount}/${points.length} required map points are outside the capture frame.` : null;
};

export function MapCaptureHandler() {
  const { map } = useMapContext();

  useEffect(() => {
    if (!map) return;

    let captureQueue = Promise.resolve();

    const processRequest = async (payload: MapCaptureRequest) => {
      const mapContainer = map.getContainer();
      if (!mapContainer) {
        emit('map-capture-error', { captureId: payload.captureId, error: 'Map container not found' });
        return;
      }

      const {
        captureId,
        printArea: rawPrintArea,
        scale,
        fitToBounds,
        zoom,
        focusFeatureIds,
        hiddenFeatureIds,
        requiredFeatureIds,
        requiredPoints,
        captureKind,
        pixelBudget,
      } = payload;
      const originalCenter = map.getCenter();
      const originalZoom = map.getZoom();
      const originalPitch = map.getPitch();
      const originalBearing = map.getBearing();
      let captureModeEnabled = false;
      let canvas: HTMLCanvasElement | null = null;

      try {
        window.dispatchEvent(new CustomEvent(REPORT_CAPTURE_EVENT, {
          detail: {
            active: true,
            focusFeatureIds,
            hiddenFeatureIds,
            requiredFeatureIds,
            captureKind,
          },
        }));
        captureModeEnabled = true;
        await delay(100);

        let printArea = rawPrintArea;
        if (printArea && Array.isArray(printArea) && printArea.length === 4) {
          const [rMinLat, rMinLng, rMaxLat, rMaxLng] = printArea.map(Number);
          if ([rMinLat, rMinLng, rMaxLat, rMaxLng].every(Number.isFinite)) {
            let s = Math.min(rMinLat, rMaxLat);
            let n = Math.max(rMinLat, rMaxLat);
            let w = Math.min(rMinLng, rMaxLng);
            let e = Math.max(rMinLng, rMaxLng);

            if (Math.abs(n - s) < 0.0001) {
              const mid = (s + n) / 2;
              s = mid - 0.0005;
              n = mid + 0.0005;
            }
            if (Math.abs(e - w) < 0.0001) {
              const mid = (w + e) / 2;
              w = mid - 0.0005;
              e = mid + 0.0005;
            }
            printArea = [s, w, n, e];
          }
        }

        let requiredPointWarning: string | null = null;
        if (fitToBounds && printArea) {
          const [minLat, minLng, maxLat, maxLng] = printArea;
          const paddings = [40, 60, 80];
          for (let attempt = 0; attempt < paddings.length; attempt += 1) {
            map.resize();
            map.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              {
                animate: false,
                padding: paddings[attempt],
                maxZoom: Math.min((zoom ?? 19) - attempt, MAX_CAPTURE_ZOOM),
              }
            );
            await waitForMapIdle(map);
            await forceRenderFrame(map);
            requiredPointWarning = validateRequiredPointsInViewport(map, requiredPoints);
            if (!requiredPointWarning) break;
          }
        } else {
          await waitForMapIdle(map, 1000);
          requiredPointWarning = validateRequiredPointsInViewport(map, requiredPoints);
        }

        await forceRenderFrame(map);
        await delay(120);

        const sourceCanvas = map.getCanvas();
        const overlayCanvas = mapContainer.querySelector<HTMLCanvasElement>('[data-map-overlay-canvas="features"]');
        const activePixelBudget = pixelBudget
          ?? (captureKind === 'preview' ? DEFAULT_PREVIEW_PIXEL_BUDGET : DEFAULT_EXPORT_PIXEL_BUDGET);

        if (printArea) {
          const [minLat, minLng, maxLat, maxLng] = printArea;
          const nwPoint = map.project([minLng, maxLat]);
          const sePoint = map.project([maxLng, minLat]);
          const container = map.getContainer();
          const cssWidth = container?.clientWidth || sourceCanvas.width;
          const cssHeight = container?.clientHeight || sourceCanvas.height;
          const pixelRatioX = sourceCanvas.width / Math.max(1, cssWidth);
          const pixelRatioY = sourceCanvas.height / Math.max(1, cssHeight);

          const margin = 16;
          const rawMinX = (Math.min(nwPoint.x, sePoint.x) - margin) * pixelRatioX;
          const rawMinY = (Math.min(nwPoint.y, sePoint.y) - margin) * pixelRatioY;
          const rawMaxX = (Math.max(nwPoint.x, sePoint.x) + margin) * pixelRatioX;
          const rawMaxY = (Math.max(nwPoint.y, sePoint.y) + margin) * pixelRatioY;

          const x = Math.max(0, Math.min(sourceCanvas.width - 20, Math.floor(rawMinX)));
          const y = Math.max(0, Math.min(sourceCanvas.height - 20, Math.floor(rawMinY)));
          const maxX = Math.max(x + 20, Math.min(sourceCanvas.width, Math.ceil(rawMaxX)));
          const maxY = Math.max(y + 20, Math.min(sourceCanvas.height, Math.ceil(rawMaxY)));
          const width = maxX - x;
          const height = maxY - y;

          if (width > 50 && height > 50) {
            canvas = compositeMapCapture({
              mapCanvas: sourceCanvas,
              overlayCanvas,
              x,
              y,
              width,
              height,
              scale: scale ?? 1,
              pixelBudget: activePixelBudget,
            });
          } else {
            canvas = compositeMapCapture({
              mapCanvas: sourceCanvas,
              overlayCanvas,
              scale: scale ?? 1,
              pixelBudget: activePixelBudget,
            });
          }
        } else {
          canvas = compositeMapCapture({
            mapCanvas: sourceCanvas,
            overlayCanvas,
            scale: scale ?? 1,
            pixelBudget: activePixelBudget,
          });
        }

        let validation = validateMapCaptureCanvas(canvas);
        if (!validation.valid) {
          // Attempt double render fallback if initial check failed
          await forceRenderFrame(map);
          await delay(120);
          canvas = compositeMapCapture({ mapCanvas: sourceCanvas, overlayCanvas, scale: scale ?? 1, pixelBudget: activePixelBudget });
          validation = validateMapCaptureCanvas(canvas);
        }

        if (!validation.valid) {
          throw new Error(validation.reason || 'Ảnh bản đồ không hợp lệ.');
        }

        const image = await canvasToJpegImage(canvas, captureKind === 'preview' ? 0.84 : 0.90);
        const captureWarnings = [...(image.warnings || [])];
        if (requiredPointWarning) {
          console.warn('[MapCaptureHandler]', requiredPointWarning);
          captureWarnings.push(requiredPointWarning);
        }

        const result = {
          captureId,
          image,
          width: image.width,
          height: image.height,
          mimeType: image.mimeType,
          warnings: captureWarnings,
        };
        window.dispatchEvent(new CustomEvent('map-capture-result', { detail: result }));
        emit('map-capture-result', { captureId, width: image.width, height: image.height, mimeType: image.mimeType });
      } catch (err) {
        window.dispatchEvent(new CustomEvent('map-capture-error', {
          detail: { captureId, error: String(err), recoverable: true },
        }));
        emit('map-capture-error', { captureId, error: String(err) });
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        if (captureModeEnabled) {
          window.dispatchEvent(new CustomEvent(REPORT_CAPTURE_EVENT, { detail: { active: false } }));
        }
        if (fitToBounds) {
          map.jumpTo({
            center: originalCenter,
            zoom: originalZoom,
            pitch: originalPitch,
            bearing: originalBearing,
          });
          await delay(40);
        }
      }
    };

    const setupListener = async () => {
      const unlisten = await listen<MapCaptureRequest>('request-map-capture', (event) => {
        captureQueue = captureQueue
          .then(() => processRequest(event.payload))
          .catch(() => {});
      });

      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then(f => f());
    };
  }, [map]);

  return null;
}
