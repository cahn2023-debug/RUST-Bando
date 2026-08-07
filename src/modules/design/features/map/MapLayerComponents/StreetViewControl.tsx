import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMapContext } from '../MapContext';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { IS_REAL_TAURI, safeEmit, safeListen } from '@IMPLEMENT/lib/tauri';

const DEFAULT_FOV = 90;

type PegmanSource = 'map' | 'streetview';

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

function clampFov(value: number) {
  return Math.max(30, Math.min(150, value || DEFAULT_FOV));
}

function formatCoords(location: [number, number] | null) {
  if (!location) return '--';
  return `${location[0].toFixed(6)}, ${location[1].toFixed(6)}`;
}

function buildStreetViewUrl(lat: number, lng: number, heading: number, fov: number) {
  return `/@${lat.toFixed(6)},${lng.toFixed(6)},${clampFov(fov)}y,${normalizeHeading(heading)}t`;
}

function PegmanIcon({ heading = 0, fov = DEFAULT_FOV, active = false }) {
  const color = active ? '#10b981' : '#94a3b8';
  const fovColor = active ? 'rgba(16,185,129,0.24)' : 'rgba(148,163,184,0.18)';
  const startAngle = ((-fov / 2 - 90) * Math.PI) / 180;
  const endAngle = ((fov / 2 - 90) * Math.PI) / 180;
  const x1 = 12 + 24 * Math.cos(startAngle);
  const y1 = 12 + 24 * Math.sin(startAngle);
  const x2 = 12 + 24 * Math.cos(endAngle);
  const y2 = 12 + 24 * Math.sin(endAngle);
  const largeArcFlag = fov > 180 ? 1 : 0;

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      style={{ overflow: 'visible', transform: `rotate(${normalizeHeading(heading)}deg)` }}
      aria-hidden="true"
    >
      <path d={`M 12 12 L ${x1} ${y1} A 24 24 0 ${largeArcFlag} 1 ${x2} ${y2} Z`} fill={fovColor} />
      <circle cx="6" cy="12" r="3" fill={color} />
      <circle cx="18" cy="12" r="3" fill={color} />
      <circle cx="12" cy="12" r="7" fill={color} />
      <circle cx="12" cy="12" r="3.5" fill="#facc15" stroke="white" strokeWidth="1" />
      <path d="M12 5 L10 8 L14 8 Z" fill="white" />
    </svg>
  );
}

export function StreetViewControl() {
  const { map } = useMapContext();
  const pegmanState = useDesignSync((s) => s.pegmanState);
  const setPegmanState = useDesignSync((s) => s.setPegmanState);
  const selectedFeatureId = useDesignSync((s) => s.selectedFeatureId);
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [markerPoint, setMarkerPoint] = useState<{ x: number; y: number } | null>(null);

  const location = pegmanState.location;
  const heading = normalizeHeading(pegmanState.heading || 0);
  const fov = clampFov(pegmanState.fov || DEFAULT_FOV);
  const hasStreetViewWindow = Boolean(pegmanState.windowOpen);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2400);
  }, []);

  const syncPegmanState = useCallback(
    (payload: Partial<typeof pegmanState> & { source?: PegmanSource }) => {
      setPegmanState({
        ...payload,
        heading: normalizeHeading(payload.heading ?? pegmanState.heading ?? 0),
        fov: clampFov(payload.fov ?? pegmanState.fov ?? DEFAULT_FOV),
        source: payload.source ?? pegmanState.source ?? 'map',
        lastSyncAt: Date.now(),
      });
    },
    [pegmanState.fov, pegmanState.heading, pegmanState.source, setPegmanState]
  );

  useEffect(() => {
    let unlistenPano: (() => void) | undefined;
    let unlistenPov: (() => void) | undefined;

    const setupListeners = async () => {
      const uPano = await safeListen<{ lat: number; lng: number; heading?: number; fov?: number }>(
        'pano-changed',
        (event) => {
          if (event?.payload?.lat != null && event?.payload?.lng != null) {
            setPegmanState({
              location: [event.payload.lat, event.payload.lng],
              heading: normalizeHeading(event.payload.heading ?? 0),
              fov: clampFov(event.payload.fov ?? DEFAULT_FOV),
              source: 'streetview',
              lastSyncAt: Date.now(),
            });
          }
        }
      );

      const uPov = await safeListen<{ heading: number; fov?: number }>(
        'pov-changed',
        (event) => {
          if (event?.payload?.heading != null) {
            setPegmanState({
              heading: normalizeHeading(event.payload.heading),
              fov: clampFov(event.payload.fov ?? DEFAULT_FOV),
              source: 'streetview',
              lastSyncAt: Date.now(),
            });
          }
        }
      );

      unlistenPano = uPano;
      unlistenPov = uPov;
    };

    void setupListeners();

    return () => {
      unlistenPano?.();
      unlistenPov?.();
    };
  }, [setPegmanState]);

  const openStreetViewWindow = useCallback((lat: number, lng: number) => {
    if (IS_REAL_TAURI) {
      void (async () => {
        try {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const { Window } = await import('@tauri-apps/api/window');
          const label = 'street-view';

          const existingWindow = await Window.getByLabel(label);
          if (existingWindow) {
            if (await existingWindow.isMinimized()) {
              await existingWindow.unminimize();
            }
            await existingWindow.show();
            await existingWindow.setFocus();
            await safeEmit('location-change', { lat, lng, heading, fov });

            syncPegmanState({
              active: false,
              location: [lat, lng],
              heading,
              fov,
              source: 'map',
              windowOpen: true,
              featureId: selectedFeatureId ?? pegmanState.featureId ?? null,
            });
            showFeedback('Đã cập nhật vị trí Street View.');
            return;
          }

          const url = `index.html?view=streetview&lat=${lat}&lng=${lng}&heading=${heading}&fov=${fov}`;
          const win = new WebviewWindow(label, {
            url,
            title: 'Google Street View',
            width: 1120,
            height: 760,
            minWidth: 600,
            minHeight: 450,
            decorations: false,
            visible: true,
            focus: true,
          });

          win.once('tauri://created', () => {
            syncPegmanState({
              active: false,
              location: [lat, lng],
              heading,
              fov,
              source: 'map',
              windowOpen: true,
              featureId: selectedFeatureId ?? pegmanState.featureId ?? null,
            });
            showFeedback('Đã mở Google Street View.');
          });

          win.once('tauri://error', async (err) => {
            console.error('[StreetViewControl] Failed to open Tauri window:', err);
            const reExisting = await Window.getByLabel(label);
            if (reExisting) {
              await reExisting.show();
              await reExisting.setFocus();
              await safeEmit('location-change', { lat, lng, heading, fov });
            } else {
              showFeedback('Không thể mở cửa sổ Street View.');
            }
          });
        } catch (err) {
          console.error('[StreetViewControl] Error creating window:', err);
          showFeedback('Không thể mở cửa sổ Street View.');
        }
      })();
      return;
    }

    // Fallback for browser mode
    const url = buildStreetViewUrl(lat, lng, heading, fov);
    const win = window.open(url, 'street-view', 'width=1120,height=760');

    if (!win) {
      showFeedback('Trình duyệt đã chặn cửa sổ pop-up. Vui lòng cho phép pop-up để xem Street View.');
      return;
    }

    syncPegmanState({
      active: false,
      location: [lat, lng],
      heading,
      fov,
      source: 'map',
      windowOpen: true,
      featureId: selectedFeatureId ?? pegmanState.featureId ?? null,
    });
    showFeedback('Đã mở Google Street View.');
  }, [fov, heading, pegmanState.featureId, selectedFeatureId, showFeedback, syncPegmanState]);

  useEffect(() => {
    if (!map || !isActive) return;

    const onClick = (event: maplibregl.MapMouseEvent) => {
      setIsActive(false);
      openStreetViewWindow(event.lngLat.lat, event.lngLat.lng);
    };

    map.getCanvas().style.cursor = 'crosshair';
    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [isActive, map, openStreetViewWindow]);

  useEffect(() => {
    setPegmanState({ active: isActive });
  }, [isActive, setPegmanState]);

  useEffect(() => {
    if (!map || !location) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMarkerPoint(null);
      return;
    }

    const updateMarkerPoint = () => {
      const point = map.project([location[1], location[0]]);
      setMarkerPoint({ x: point.x, y: point.y });
    };

    updateMarkerPoint();
    map.on('move', updateMarkerPoint);
    map.on('zoom', updateMarkerPoint);
    map.on('resize', updateMarkerPoint);

    if (pegmanState.source === 'streetview') {
      const bounds = map.getBounds();
      const inBounds = bounds && bounds.contains([location[1], location[0]]);
      if (!inBounds) {
        map.easeTo({ center: [location[1], location[0]], duration: 600 });
      }
    }

    return () => {
      map.off('move', updateMarkerPoint);
      map.off('zoom', updateMarkerPoint);
      map.off('resize', updateMarkerPoint);
    };
  }, [location, map, pegmanState.source]);

  const markerStyle = useMemo(() => {
    if (!markerPoint) return undefined;
    return {
      left: markerPoint.x,
      top: markerPoint.y,
      transform: 'translate(-50%, -50%)',
    };
  }, [markerPoint]);

  return (
    <>
      <div className="absolute top-4 right-4 z-cad-map-control pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsActive(value => !value)}
          className={`flex h-[38px] w-[38px] items-center justify-center rounded-full border border-cad-border bg-cad-surface shadow-lg transition-colors ${
            isActive || hasStreetViewWindow ? 'text-cad-accent ring-2 ring-cad-active/50' : 'text-cad-text-muted hover:text-cad-text-primary'
          }`}
          title="Google Street View"
        >
          <PegmanIcon active={isActive || hasStreetViewWindow} heading={heading} fov={fov} />
        </button>
      </div>

      {markerPoint && location && (
        <button
          type="button"
          className="absolute z-cad-map-control pointer-events-auto flex items-center justify-center p-1 transition-transform hover:scale-110 drop-shadow-md"
          style={markerStyle}
          title={`Street View: ${formatCoords(location)}`}
          onClick={(event) => {
            event.stopPropagation();
            openStreetViewWindow(location[0], location[1]);
          }}
        >
          <PegmanIcon active heading={heading} fov={fov} />
        </button>
      )}

      {(feedback || (isActive && !location)) && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-cad-toast bg-cad-elevated/92 border border-cad-accent/25 text-cad-accent px-5 py-2 rounded-full shadow-2xl text-[10px] uppercase font-bold tracking-[0.22em] backdrop-blur-md flex items-center gap-3">
          <div className="w-2 h-2 bg-cad-active rounded-full animate-pulse" />
          <span>{feedback || `Chọn vị trí để mở Street View | ${formatCoords(location)}`}</span>
        </div>
      )}
    </>
  );
}
