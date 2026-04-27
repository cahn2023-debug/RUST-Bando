import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { listen, emit } from '@tauri-apps/api/event';
import html2canvas from 'html2canvas';

export function MapCaptureHandler() {
  const map = useMap();

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<{ printArea: [number, number, number, number] | null }>('request-map-capture', async (event) => {
        console.log('[MapCaptureHandler] Received request-map-capture', event.payload);
        const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
        if (!mapContainer) {
          console.error('[MapCaptureHandler] Map container not found');
          return;
        }

        const { printArea } = event.payload;

        try {
          let captureOptions: any = {
            useCORS: true,
            allowTaint: true,
            scale: 4,
            ignoreElements: (el: any) => {
              const className = typeof el.className === 'string' ? el.className : "";
              return className.includes('leaflet-control-container') || 
                     className.includes('leaflet-draw-toolbar');
            }
          };

          // If printArea is provided, calculate crop bounds
          if (printArea) {
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
          emit('map-capture-result', { dataUrl });
          console.log('[MapCaptureHandler] Sent map-capture-result');
        } catch (err) {
          console.error('[MapCaptureHandler] Global capture error:', err);
          emit('map-capture-error', { error: String(err) });
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
