import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import html2canvas from 'html2canvas';

const MAX_CAPTURE_ZOOM = 36;
const REPORT_CAPTURE_EVENT = 'design-report-map-capture';
const tileDataUrlCache = new Map<string, string>();

type MapCaptureRequest = {
  captureId?: string;
  printArea: [number, number, number, number] | null;
  scale?: number;
  fitToBounds?: boolean;
  zoom?: number;
};

const waitForMapMove = (map: ReturnType<typeof useMap>, timeoutMs = 1200): Promise<void> => (
  new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      map.off('moveend', finish);
      window.setTimeout(resolve, 350);
    };
    map.once('moveend', finish);
    window.setTimeout(finish, timeoutMs);
  })
);

const waitForTiles = (container: HTMLElement, timeoutMs = 5000): Promise<void> => (
  new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const tiles = Array.from(container.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
      const loadingTiles = container.querySelectorAll('.leaflet-tile-loading').length;
      const ready = tiles.length > 0
        && loadingTiles === 0
        && tiles.every((tile) => tile.complete && tile.naturalWidth > 0);
      if (ready || Date.now() - startedAt > timeoutMs) {
        window.setTimeout(resolve, 250);
        return;
      }
      window.setTimeout(check, 120);
    };
    check();
  })
);

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const inlineVisibleTiles = async (container: HTMLElement): Promise<Array<() => void>> => {
  const tiles = Array.from(container.querySelectorAll<HTMLImageElement>('img.leaflet-tile'))
    .filter((tile) => /^https?:\/\//i.test(tile.src));
  const restorers: Array<() => void> = [];
  const queue = [...tiles];

  const inlineTile = async (tile: HTMLImageElement) => {
    const originalSrc = tile.src;
    try {
      let dataUrl = tileDataUrlCache.get(originalSrc);
      if (!dataUrl) {
        dataUrl = await invoke<string>('fetch_url_as_data_url', { url: originalSrc });
        tileDataUrlCache.set(originalSrc, dataUrl);
      }
      if (tile.src === originalSrc) {
        tile.src = dataUrl;
        restorers.push(() => {
          if (tile.src === dataUrl) tile.src = originalSrc;
        });
      }
    } catch (error) {
      console.warn('[MapCaptureHandler] Failed to inline map tile', originalSrc, error);
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const tile = queue.shift();
      if (tile) await inlineTile(tile);
    }
  }));

  return restorers;
};

export function MapCaptureHandler() {
  const map = useMap();

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<MapCaptureRequest>('request-map-capture', async (event) => {
        console.log('[MapCaptureHandler] Received request-map-capture', event.payload);
        const mapContainer = map.getContainer();
        if (!mapContainer) {
          console.error('[MapCaptureHandler] Map container not found');
          emit('map-capture-error', { captureId: event.payload.captureId, error: 'Map container not found' });
          return;
        }

        const { captureId, printArea, scale, fitToBounds, zoom } = event.payload;
        const captureMaxZoom = Math.min(zoom ?? 19, MAX_CAPTURE_ZOOM);
        const originalCenter = map.getCenter();
        const originalZoom = map.getZoom();
        let restoreTiles: Array<() => void> = [];
        let captureModeEnabled = false;

        try {
          window.dispatchEvent(new CustomEvent(REPORT_CAPTURE_EVENT, { detail: { active: true } }));
          captureModeEnabled = true;
          await delay(120);

          let captureOptions: any = {
            useCORS: false,
            allowTaint: false,
            scale: scale ?? 4,
            logging: false,
            ignoreElements: (el: any) => {
              const className = typeof el.className === 'string' ? el.className : "";
              return className.includes('leaflet-control-container') || 
                     className.includes('leaflet-draw-toolbar');
            }
          };

          if (fitToBounds && printArea) {
            const [minLat, minLng, maxLat, maxLng] = printArea;
            map.invalidateSize(false);
            map.fitBounds([[minLat, minLng], [maxLat, maxLng]], {
              animate: false,
              padding: [5, 5],
              maxZoom: captureMaxZoom,
            });
            await waitForMapMove(map);
          }
          await delay(700);
          await waitForTiles(mapContainer);
          restoreTiles = await inlineVisibleTiles(mapContainer);
          await waitForTiles(mapContainer, 1500);
          await delay(250);

          // If printArea is provided, calculate crop bounds
          if (printArea && !fitToBounds) {
            const [minLat, minLng, maxLat, maxLng] = printArea;
            // Leaflet uses [lat, lng]
            const nwPoint = map.latLngToContainerPoint([maxLat, minLng]);
            const sePoint = map.latLngToContainerPoint([minLat, maxLng]);

            captureOptions.x = Math.min(nwPoint.x, sePoint.x);
            captureOptions.y = Math.min(nwPoint.y, sePoint.y);
            captureOptions.width = Math.abs(nwPoint.x - sePoint.x);
            captureOptions.height = Math.abs(nwPoint.y - sePoint.y);
            
            console.log('[MapCaptureHandler] Calculated crop bounds:', {
              x: captureOptions.x,
              y: captureOptions.y,
              width: captureOptions.width,
              height: captureOptions.height
            });
          }

          const canvas = await html2canvas(mapContainer, captureOptions);
          
          const dataUrl = canvas.toDataURL('image/png');
          emit('map-capture-result', { captureId, dataUrl });
          console.log('[MapCaptureHandler] Sent map-capture-result');
        } catch (err) {
          console.error('[MapCaptureHandler] Global capture error:', err);
          emit('map-capture-error', { captureId, error: String(err) });
        } finally {
          restoreTiles.forEach((restore) => restore());
          if (captureModeEnabled) {
            window.dispatchEvent(new CustomEvent(REPORT_CAPTURE_EVENT, { detail: { active: false } }));
          }
          if (fitToBounds) {
            map.setView(originalCenter, originalZoom, { animate: false });
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
