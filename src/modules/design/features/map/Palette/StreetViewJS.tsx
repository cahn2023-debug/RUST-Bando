import React, { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { initGoogleMaps, waitForGoogleMaps } from '@TOOL/utils/googleMapsLoader';
import { cn } from '@TOOL/utils/cn';

declare const google: any;

interface StreetViewJSProps {
  lat: number;
  lng: number;
  heading: number;
  fov: number;
  pitch?: number;
  apiKey: string;
  rotationLock?: boolean;
}

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;
const zoomToFov = (zoom: number | undefined) => 180 / Math.pow(2, zoom || 1);
const fovToZoom = (value: number) => Math.max(0, Math.log2(180 / Math.max(1, value)));

export const StreetViewJS: React.FC<StreetViewJSProps> = ({
  lat,
  lng,
  heading,
  fov,
  pitch = 0,
  apiKey,
  rotationLock = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<any>(null);
  const initialHeadingRef = useRef<number>(heading);
  const isExternalUpdate = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const trimmedApiKey = apiKey.trim();

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .gm-style iframe + div,
      .gm-style-cc,
      .gmnoprint,
      .dismissButton,
      .widget-pane-section-back,
      .widget-minimap,
      .widget-minimap-shim,
      .widget-reveal-card,
      .scene-footer,
      .watermark,
      #minimap {
        display: none !important;
      }
      .gm-style > div:first-child > div:nth-child(2) {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    const observer = new MutationObserver(() => {
      document
        .querySelectorAll('.gm-style > div:first-child > div:nth-child(2), .gm-style-cc, .dismissButton')
        .forEach((element) => {
          (element as HTMLElement).style.display = 'none';
          (element as HTMLElement).style.pointerEvents = 'none';
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const findNearestPano = async (
    nextLat: number,
    nextLng: number
  ): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (typeof google === 'undefined') {
        resolve(null);
        return;
      }

      const service = new google.maps.StreetViewService();
      service.getPanorama(
        {
          location: { lat: nextLat, lng: nextLng },
          radius: 200,
          source: google.maps.StreetViewSource.OUTDOOR
        },
        (data: any, status: string) => {
          if (status === google.maps.StreetViewStatus.OK && data.location) {
            resolve({
              lat: data.location.latLng.lat(),
              lng: data.location.latLng.lng()
            });
            return;
          }
          resolve(null);
        }
      );
    });
  };

  useEffect(() => {
    let disposed = false;
    const windowWithGoogle = window as Window & { gm_authFailure?: () => void };

    windowWithGoogle.gm_authFailure = () => {
      if (disposed) return;
      setError('Google Maps Auth Failed. Vui lòng kiểm tra billing.');
    };

    if (!trimmedApiKey) {
      const errorTimer = window.setTimeout(() => {
        setError('Missing API Configuration.');
      }, 0);
      return () => window.clearTimeout(errorTimer);
    }

    const initPanorama = async () => {
      try {
        const ok = initGoogleMaps(trimmedApiKey);
        if (!ok) {
          setError('SDK Initialization Failed.');
          return;
        }

        await waitForGoogleMaps();
        if (disposed || !containerRef.current) return;

        const nearest = await findNearestPano(lat, lng);
        if (!nearest) {
          setError('Không tìm thấy dữ liệu Street View tại vị trí này.');
          setLoading(false);
          return;
        }

        const g = (window as any).google;
        if (!g?.maps) throw new Error('Maps SDK not found');

        const panorama = new g.maps.StreetViewPanorama(containerRef.current, {
          position: nearest,
          pov: { heading, pitch },
          zoom: 1,
          addressControl: false,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          showRoadLabels: true,
          clickToGo: true
        });

        panoramaRef.current = panorama;
        initialHeadingRef.current = normalizeHeading(heading);

        const updateBrowserUrl = (
          nextLat: number,
          nextLng: number,
          nextHeading: number,
          nextFov: number
        ) => {
          window.history.replaceState(
            null,
            '',
            `/@${nextLat.toFixed(7)},${nextLng.toFixed(7)},${nextFov.toFixed(1)}y,${normalizeHeading(nextHeading).toFixed(1)}t`
          );
        };

        const getAngleDiff = (a: number, b: number) => {
          let diff = a - b;
          while (diff < -180) diff += 360;
          while (diff > 180) diff -= 360;
          return diff;
        };

        panorama.addListener('position_changed', () => {
          if (isExternalUpdate.current) return;
          const pos = panorama.getPosition();
          if (!pos) return;

          const pLat = pos.lat();
          const pLng = pos.lng();
          const pov = panorama.getPov();
          const nextFov = zoomToFov(panorama.getZoom());

          updateBrowserUrl(pLat, pLng, pov.heading, nextFov);
          emit('pano-changed', {
            pano: panorama.getPano(),
            lat: pLat,
            lng: pLng,
            heading: normalizeHeading(pov.heading),
            fov: nextFov
          });
        });

        panorama.addListener('pov_changed', () => {
          if (isExternalUpdate.current) return;

          const pov = panorama.getPov();
          const currentHeading = normalizeHeading(pov.heading);
          const angleDiff = getAngleDiff(currentHeading, initialHeadingRef.current);
          let constrainedHeading = currentHeading;

          if (rotationLock && Math.abs(angleDiff) > 90) {
            constrainedHeading = normalizeHeading(
              initialHeadingRef.current + (angleDiff > 0 ? 90 : -90)
            );
          }

          if (constrainedHeading !== currentHeading || pov.pitch !== 0) {
            panorama.setPov({
              heading: constrainedHeading,
              pitch: 0,
              zoom: panorama.getZoom()
            });
            return;
          }

          const pos = panorama.getPosition();
          const nextFov = zoomToFov(panorama.getZoom());
          if (pos) {
            updateBrowserUrl(pos.lat(), pos.lng(), constrainedHeading, nextFov);
          }

          emit('pov-changed', {
            heading: constrainedHeading,
            pitch: 0,
            zoom: panorama.getZoom(),
            fov: nextFov
          });
        });

        panorama.addListener('status_changed', () => {
          const status = panorama.getStatus();
          if (status !== 'OK' && status !== 'INITIALIZING') {
            setError('Street View data is not available for this precise location.');
            return;
          }
          if (status === 'OK') {
            setError(null);
            emit('panorama-ready');
          }
        });

        panorama.setZoom(fovToZoom(fov));
      } catch (sdkError) {
        console.error('[StreetViewJS] Initialization error:', sdkError);
        setError('Failed to load Map system. Please check your internet connection and API configuration.');
      } finally {
        setLoading(false);
      }
    };

    void initPanorama();

    return () => {
      disposed = true;
      if (panoramaRef.current) {
        const gMaps = (window as any).google?.maps;
        if (gMaps) {
          gMaps.event.clearInstanceListeners(panoramaRef.current);
        }
        panoramaRef.current = null;
      }
      windowWithGoogle.gm_authFailure = undefined;
    };
  }, [trimmedApiKey]);

  useEffect(() => {
    if (!panoramaRef.current || typeof google === 'undefined') return;

    const updatePosition = async () => {
      isExternalUpdate.current = true;
      try {
        const currentPos = panoramaRef.current.getPosition();
        if (currentPos) {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(
            currentPos,
            new google.maps.LatLng(lat, lng)
          );
          if (dist > 5) {
            const nearest = await findNearestPano(lat, lng);
            panoramaRef.current.setPosition(nearest || { lat, lng });
          }
        }

        panoramaRef.current.setPov({ heading: normalizeHeading(heading), pitch: 0 });
        panoramaRef.current.setZoom(fovToZoom(fov));
      } finally {
        window.setTimeout(() => {
          isExternalUpdate.current = false;
        }, 120);
      }
    };

    void updatePosition();
  }, [lat, lng, heading, fov]);

  const handleClose = () => {
    import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
      getCurrentWebviewWindow()?.close();
    });
  };

  return (
    <div className="street-view-container-premium bg-white">
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-9 z-[1000] cursor-move active:cursor-grabbing flex justify-between items-center px-3 bg-white/90 backdrop-blur-md border-b border-slate-200"
      >
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.24em] pointer-events-none">
          Street View
        </div>

        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 hover:bg-red-500/80 text-slate-500 hover:text-white transition-all"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          'street-view-panorama-premium streetview-canvas w-full h-full transition-opacity duration-300 bg-white',
          error || loading ? 'opacity-0' : 'opacity-100'
        )}
        style={{ display: error ? 'none' : 'block' }}
      />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-50">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <div className="mt-3 text-[10px] uppercase tracking-[0.24em] text-slate-500">
            Đang tải panorama
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/96 text-slate-900 p-8 z-[9999]">
          <div className="w-12 h-12 mb-4 text-red-500/55">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-center text-slate-700 mb-5 max-w-md">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-[11px] font-semibold transition-all uppercase tracking-[0.2em]"
          >
            Thu lai
          </button>
        </div>
      )}
    </div>
  );
};
