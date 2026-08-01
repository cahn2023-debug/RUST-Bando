import { useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useMapContext } from '../MapContext';
import { validateMapCaptureCanvas } from './mapCaptureValidation';

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

const MAX_MAP_CAPTURE_WIDTH = 1600;

const cropCanvas = (
  sourceCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1
) => {
  const rawWidth = Math.max(1, Math.round(width * scale));
  const rawHeight = Math.max(1, Math.round(height * scale));

  let targetWidth = rawWidth;
  let targetHeight = rawHeight;
  if (targetWidth > MAX_MAP_CAPTURE_WIDTH) {
    const downScale = MAX_MAP_CAPTURE_WIDTH / targetWidth;
    targetWidth = MAX_MAP_CAPTURE_WIDTH;
    targetHeight = Math.max(1, Math.round(targetHeight * downScale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.drawImage(
    sourceCanvas,
    x,
    y,
    width,
    height,
    0,
    0,
    targetWidth,
    targetHeight
  );
  return canvas;
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

      const { captureId, printArea: rawPrintArea, scale, fitToBounds, zoom, focusFeatureIds, hiddenFeatureIds } = payload;
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

        if (fitToBounds && printArea) {
          const [minLat, minLng, maxLat, maxLng] = printArea;
          map.resize();
          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            {
              animate: false,
              padding: 10,
              maxZoom: Math.min(zoom ?? 19, MAX_CAPTURE_ZOOM),
            }
          );
          await waitForMapIdle(map);
        } else {
          await waitForMapIdle(map, 1000);
        }

        await forceRenderFrame(map);
        await delay(60);

        const sourceCanvas = map.getCanvas();

        if (printArea && !fitToBounds) {
          const [minLat, minLng, maxLat, maxLng] = printArea;
          const nwPoint = map.project([minLng, maxLat]);
          const sePoint = map.project([maxLng, minLat]);
          const x = Math.max(0, Math.min(nwPoint.x, sePoint.x));
          const y = Math.max(0, Math.min(nwPoint.y, sePoint.y));
          const width = Math.min(sourceCanvas.width - x, Math.abs(nwPoint.x - sePoint.x));
          const height = Math.min(sourceCanvas.height - y, Math.abs(nwPoint.y - sePoint.y));
          canvas = cropCanvas(sourceCanvas, x, y, width, height, scale ?? 1);
        } else {
          canvas = cropCanvas(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, scale ?? 1);
        }

        let validation = validateMapCaptureCanvas(canvas);
        if (!validation.valid) {
          // Attempt double render fallback if initial check failed
          await forceRenderFrame(map);
          await delay(120);
          canvas = printArea && !fitToBounds
            ? cropCanvas(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, scale ?? 1)
            : cropCanvas(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, scale ?? 1);
          validation = validateMapCaptureCanvas(canvas);
        }

        if (!validation.valid) {
          throw new Error(validation.reason || 'Ảnh bản đồ không hợp lệ.');
        }

        emit('map-capture-result', { captureId, dataUrl: canvas.toDataURL('image/jpeg', 0.88) });
      } catch (err) {
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
