import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IS_REAL_TAURI, safeEmit } from '@IMPLEMENT/lib/tauri';
import { initGoogleMaps, waitForGoogleMaps } from '@TOOL/utils/googleMapsLoader';

interface StreetViewJSProps {
  lat: number;
  lng: number;
  heading: number;
  fov?: number;
  pitch?: number;
  apiKey?: string;
  rotationLock?: boolean;
}

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;

function getDestinationPoint(lat: number, lng: number, distanceMeters: number, headingDegrees: number): { lat: number; lng: number } {
  const R = 6371000;
  const radLat = (lat * Math.PI) / 180;
  const radLng = (lng * Math.PI) / 180;
  const radHeading = (headingDegrees * Math.PI) / 180;
  const distRatio = distanceMeters / R;

  const destLatRad = Math.asin(
    Math.sin(radLat) * Math.cos(distRatio) +
    Math.cos(radLat) * Math.sin(distRatio) * Math.cos(radHeading)
  );

  const destLngRad = radLng + Math.atan2(
    Math.sin(radHeading) * Math.sin(distRatio) * Math.cos(radLat),
    Math.cos(distRatio) - Math.sin(radLat) * Math.sin(destLatRad)
  );

  return {
    lat: (destLatRad * 180) / Math.PI,
    lng: (destLngRad * 180) / Math.PI
  };
}

export const StreetViewJS: React.FC<StreetViewJSProps> = ({
  lat,
  lng,
  heading,
  apiKey = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<any>(null);
  const [currentLat, setCurrentLat] = useState(lat);
  const [currentLng, setCurrentLng] = useState(lng);
  const [currentHeading, setCurrentHeading] = useState(() => normalizeHeading(heading));
  const [usePublicEmbed, setUsePublicEmbed] = useState(!apiKey.trim());
  const [loading, setLoading] = useState(true);

  // Sync props when map updates
  useEffect(() => {
    setCurrentLat(lat);
    setCurrentLng(lng);
  }, [lat, lng]);

  useEffect(() => {
    setCurrentHeading(normalizeHeading(heading));
  }, [heading]);

  // Update heading & emit to map
  const updateHeading = (newHeading: number) => {
    const norm = normalizeHeading(newHeading);
    setCurrentHeading(norm);
    void safeEmit('pov-changed', { heading: norm, fov: 90 });
  };

  // Move position & emit to map
  const movePosition = (distanceMeters: number) => {
    const next = getDestinationPoint(currentLat, currentLng, distanceMeters, currentHeading);
    setCurrentLat(next.lat);
    setCurrentLng(next.lng);
    void safeEmit('pano-changed', { lat: next.lat, lng: next.lng, heading: currentHeading, fov: 90 });
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        updateHeading(currentHeading - 15);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        updateHeading(currentHeading + 15);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        movePosition(12);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        movePosition(-12);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentHeading, currentLat, currentLng]);

  // Google Maps JS SDK Initialization (if apiKey present)
  useEffect(() => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey || usePublicEmbed) return;

    let disposed = false;
    const initPanorama = async () => {
      try {
        const ok = initGoogleMaps(trimmedKey);
        if (!ok) {
          setUsePublicEmbed(true);
          return;
        }
        await waitForGoogleMaps();
        if (disposed || !containerRef.current) return;

        const g = (window as any).google;
        if (!g?.maps) return;

        const panorama = new g.maps.StreetViewPanorama(containerRef.current, {
          position: { lat: currentLat, lng: currentLng },
          pov: { heading: currentHeading, pitch: 0 },
          zoom: 1,
          addressControl: false,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          showRoadLabels: true,
          clickToGo: true
        });

        panoramaRef.current = panorama;

        panorama.addListener('position_changed', () => {
          const pos = panorama.getPosition();
          if (!pos) return;
          const pLat = pos.lat();
          const pLng = pos.lng();
          const pov = panorama.getPov();
          setCurrentLat(pLat);
          setCurrentLng(pLng);
          void safeEmit('pano-changed', {
            lat: pLat,
            lng: pLng,
            heading: normalizeHeading(pov.heading),
            fov: 90
          });
        });

        panorama.addListener('pov_changed', () => {
          const pov = panorama.getPov();
          const norm = normalizeHeading(pov.heading);
          setCurrentHeading(norm);
          void safeEmit('pov-changed', {
            heading: norm,
            fov: 90
          });
        });
      } catch (err) {
        console.warn('[StreetViewJS] JS SDK error, using public embed:', err);
        setUsePublicEmbed(true);
      }
    };

    void initPanorama();

    return () => {
      disposed = true;
    };
  }, [apiKey, usePublicEmbed]);

  const publicEmbedUrl = useMemo(() => {
    setLoading(true);
    const params = new URLSearchParams({
      layer: 'c',
      cbll: `${currentLat},${currentLng}`,
      cbp: `12,${currentHeading.toFixed(1)},0,0,0`,
      output: 'svembed'
    });
    return `https://maps.google.com/maps?${params.toString()}`;
  }, [currentLat, currentLng, currentHeading]);

  const googleMapsWebUrl = useMemo(() => {
    return `https://www.google.com/maps/@${currentLat.toFixed(7)},${currentLng.toFixed(7)},3a,75y,${currentHeading.toFixed(1)}h,0t`;
  }, [currentLat, currentLng, currentHeading]);

  const handleClose = () => {
    if (IS_REAL_TAURI) {
      import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
        getCurrentWebviewWindow()?.close();
      });
    } else {
      window.close();
    }
  };

  return (
    <div className="street-view-container-premium w-full h-full bg-white relative overflow-hidden select-none">
      {/* Header Controls */}
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-9 z-20 cursor-move active:cursor-grabbing flex justify-between items-center px-3 bg-cad-surface/90 backdrop-blur-md border-b border-cad-border"
      >
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-semibold text-cad-text-secondary uppercase tracking-[0.24em] pointer-events-none">
            Google Street View
          </div>

          {/* Heading & Position Controls */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => updateHeading(currentHeading - 30)}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-cad-elevated hover:bg-cad-accent/20 text-cad-accent border border-cad-accent/30 transition-all active:scale-95"
              title="Xoay Trái 30° (Mũi tên Trái / A)"
            >
              ⟲ -30°
            </button>

            <span className="text-[10px] font-mono font-bold text-cad-accent px-2 py-0.5 rounded bg-cad-elevated/80 border border-cad-border">
              {Math.round(currentHeading)}°
            </span>

            <button
              onClick={() => updateHeading(currentHeading + 30)}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-cad-elevated hover:bg-cad-accent/20 text-cad-accent border border-cad-accent/30 transition-all active:scale-95"
              title="Xoay Phải 30° (Mũi tên Phải / D)"
            >
              +30° ⟳
            </button>

            <div className="w-px h-3.5 bg-cad-border mx-1" />

            <button
              onClick={() => movePosition(12)}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95 flex items-center gap-1"
              title="Tiến lên 12m theo hướng nhìn (Mũi tên Lên / W)"
            >
              <span>Tiến ⬆</span>
            </button>

            <button
              onClick={() => movePosition(-12)}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-cad-elevated hover:bg-cad-surface text-cad-text-secondary border border-cad-border transition-all active:scale-95 flex items-center gap-1"
              title="Lùi lại 12m (Mũi tên Xuống / S)"
            >
              <span>Lùi ⬇</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <a
            href={googleMapsWebUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-0.5 text-[9px] font-semibold rounded bg-cad-elevated hover:bg-emerald-500/20 text-emerald-400 transition-all border border-emerald-500/30 flex items-center gap-1"
            title="Mở vị trí trực tiếp trên Google Maps Web"
          >
            <span>Google Maps ↗</span>
          </a>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-cad-elevated hover:bg-cad-danger/80 text-cad-text-muted hover:text-white transition-all"
            title="Đóng cửa sổ"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {!usePublicEmbed ? (
        <div ref={containerRef} className="w-full h-full pt-9 bg-white" />
      ) : (
        <iframe
          src={publicEmbedUrl}
          title="Google Street View Public Embed"
          className="w-full h-full border-0 pt-9 bg-white"
          allowFullScreen
          onLoad={() => setLoading(false)}
        />
      )}

      {loading && usePublicEmbed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-50 pointer-events-none">
          <div className="w-8 h-8 border-2 border-cad-accent/30 border-t-cad-accent rounded-full animate-spin" />
          <div className="mt-3 text-[10px] uppercase tracking-[0.24em] text-cad-text-muted">
            Đang tải Street View...
          </div>
        </div>
      )}
    </div>
  );
};
