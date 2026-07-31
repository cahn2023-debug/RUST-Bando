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
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForMapIdle = (map: maplibregl.Map, timeoutMs = 1600): Promise<void> => (
  new Promise(resolve => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      map.off('idle', finish);
      window.setTimeout(resolve, 80);
    };
    map.once('idle', finish);
    window.setTimeout(finish, timeoutMs);
  })
);

const cropCanvas = (
  sourceCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1
) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
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
    canvas.width,
    canvas.height
  );
  return canvas;
};

export function MapCaptureHandler() {
  const { map } = useMapContext();

  useEffect(() => {
    if (!map) return;

    const setupListener = async () => {
      const unlisten = await listen<MapCaptureRequest>('request-map-capture', async (event) => {
        const mapContainer = map.getContainer();
        if (!mapContainer) {
          emit('map-capture-error', { captureId: event.payload.captureId, error: 'Map container not found' });
          return;
        }

        const { captureId, printArea, scale, fitToBounds, zoom } = event.payload;
        const originalCenter = map.getCenter();
        const originalZoom = map.getZoom();
        const originalPitch = map.getPitch();
        const originalBearing = map.getBearing();
        let captureModeEnabled = false;

        try {
          window.dispatchEvent(new CustomEvent(REPORT_CAPTURE_EVENT, { detail: { active: true } }));
          captureModeEnabled = true;
          await delay(120);

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
                padding: 5,
                maxZoom: Math.min(zoom ?? 19, MAX_CAPTURE_ZOOM),
              }
            );
            await waitForMapIdle(map);
          } else {
            await waitForMapIdle(map, 900);
          }

          await delay(80);
          const sourceCanvas = map.getCanvas();
          let canvas: HTMLCanvasElement = sourceCanvas;

          if (printArea && !fitToBounds) {
            const [minLat, minLng, maxLat, maxLng] = printArea;
            const nwPoint = map.project([minLng, maxLat]);
            const sePoint = map.project([maxLng, minLat]);
            const x = Math.max(0, Math.min(nwPoint.x, sePoint.x));
            const y = Math.max(0, Math.min(nwPoint.y, sePoint.y));
            const width = Math.min(sourceCanvas.width - x, Math.abs(nwPoint.x - sePoint.x));
            const height = Math.min(sourceCanvas.height - y, Math.abs(nwPoint.y - sePoint.y));
            canvas = cropCanvas(sourceCanvas, x, y, width, height, scale ?? 1);
          }

          const validation = validateMapCaptureCanvas(canvas);
          if (!validation.valid) {
            throw new Error(validation.reason || 'Ảnh bản đồ không hợp lệ.');
          }

          emit('map-capture-result', { captureId, dataUrl: canvas.toDataURL('image/png') });
        } catch (err) {
          emit('map-capture-error', { captureId, error: String(err) });
        } finally {
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
          }
        }
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
