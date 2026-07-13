import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { listen, emit } from '@tauri-apps/api/event';
import html2canvas from 'html2canvas';

type MapCaptureRequest = {
  captureId?: string;
  printArea: [number, number, number, number] | null;
  scale?: number;
  fitToBounds?: boolean;
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

export function MapCaptureHandler() {
  const map = useMap();

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<MapCaptureRequest>('request-map-capture', async (event) => {
        console.log('[MapCaptureHandler] Received request-map-capture', event.payload);
        const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
        if (!mapContainer) {
          console.error('[MapCaptureHandler] Map container not found');
          emit('map-capture-error', { captureId: event.payload.captureId, error: 'Map container not found' });
          return;
        }

        const { captureId, printArea, scale, fitToBounds } = event.payload;
        const originalCenter = map.getCenter();
        const originalZoom = map.getZoom();

        try {
          let captureOptions: any = {
            useCORS: true,
            allowTaint: true,
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
            map.fitBounds([[minLat, minLng], [maxLat, maxLng]], {
              animate: false,
              padding: [80, 80],
              maxZoom: 19,
            });
            await waitForMapMove(map);
          }

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
