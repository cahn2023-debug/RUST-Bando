import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useMap, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getEffectiveCameraSpecs, getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { calculateHFOV, mapRotationToHeading, SENSOR_SIZES } from '@TOOL/utils/cameraMath';
import { checkStreetViewMetadata } from '@TOOL/utils/googleMapsLoader';
import { getGoogleMapsApiKey } from '@TOOL/utils/googleMapsRuntime';

const STREET_VIEW_WINDOW_LABEL = 'street-view-window';
const DEFAULT_FOV = 90;
const POSITION_EPSILON = 0.0000008;
const HEADING_EPSILON = 0.5;
const FOV_EPSILON = 0.5;
const POSITION_JITTER_EPSILON = 0.000003;
const HEADING_JITTER_EPSILON = 1.5;
const FOV_JITTER_EPSILON = 1;
const STREETVIEW_SYNC_INTERVAL_MS = 500;
const STREETVIEW_SYNC_MIN_APPLY_MS = 120;
const STREETVIEW_SMOOTH_FACTOR = 0.45;
const ICON_HEADING_OFFSET = 0;
const STREETVIEW_PEGMAN_PANE = 'streetview-pegman-pane';

type PegmanSource = 'map' | 'streetview';

type StreetViewLocationPayload = {
  lat: number;
  lng: number;
  heading?: number;
  fov?: number;
  pano?: string;
};

type StreetViewPovPayload = {
  heading: number;
  pitch?: number;
  zoom?: number;
  fov?: number;
};

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

function clampFov(value: number) {
  return Math.max(30, Math.min(150, value || DEFAULT_FOV));
}

function getHeadingDelta(from: number, to: number) {
  let delta = normalizeHeading(to) - normalizeHeading(from);
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function blendHeading(from: number, to: number, factor: number) {
  return normalizeHeading(from + getHeadingDelta(from, to) * factor);
}

function getPegmanRotationDegrees(heading: number) {
  return normalizeHeading(heading + ICON_HEADING_OFFSET);
}

function hasMeaningfulMovement(
  previous: [number, number] | null,
  nextLat: number,
  nextLng: number
) {
  if (!previous) return true;
  return (
    Math.abs(previous[0] - nextLat) > POSITION_EPSILON ||
    Math.abs(previous[1] - nextLng) > POSITION_EPSILON
  );
}

function formatCoords(location: [number, number] | null) {
  if (!location) return '--';
  return `${location[0].toFixed(6)}, ${location[1].toFixed(6)}`;
}

function buildStreetViewUrl(lat: number, lng: number, heading: number, fov: number, panoId = '') {
  const panoParam = panoId ? `&pano=${panoId}` : '';
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}${panoParam}&heading=${normalizeHeading(
    heading
  )}&pitch=0&fov=${clampFov(fov)}`;
}

function parseStreetViewUrl(rawUrl: string | null) {
  if (!rawUrl) return null;
  const num = '(-?\\d+(?:\\.\\d+)?)';
  const pointMatch =
    rawUrl.match(new RegExp(`@${num},${num}`)) ||
    rawUrl.match(new RegExp(`!3d${num}!4d${num}`)) ||
    rawUrl.match(new RegExp(`viewpoint=${num},${num}`));

  if (!pointMatch) return null;

  const headingMatch =
    rawUrl.match(/heading=(-?\d+(?:\.\d+)?)/i) ||
    rawUrl.match(/,(-?\d+(?:\.\d+)?)h(?:[/?&#,]|$)/i) ||
    rawUrl.match(/[?&]h=(-?\d+(?:\.\d+)?)/i);
  const fovMatch =
    rawUrl.match(/fov=(\d+(?:\.\d+)?)/i) ||
    rawUrl.match(/,(\d+(?:\.\d+)?)y(?:[/?&#,]|$)/i) ||
    rawUrl.match(/[?&]y=(\d+(?:\.\d+)?)/i) ||
    rawUrl.match(/,(\d+(?:\.\d+)?)f(?:[/?&#,]|$)/i);

  console.log('[StreetViewControl] parseStreetViewUrl', {
    rawUrl,
    locationMatch: pointMatch[0],
    headingMatch: headingMatch?.[0] ?? null,
    parsedHeading: headingMatch ? normalizeHeading(parseFloat(headingMatch[1])) : null,
    fovMatch: fovMatch?.[0] ?? null,
    parsedFov: fovMatch ? clampFov(parseFloat(fovMatch[1])) : DEFAULT_FOV
  });

  return {
    lat: parseFloat(pointMatch[1]),
    lng: parseFloat(pointMatch[2]),
    heading: headingMatch ? normalizeHeading(parseFloat(headingMatch[1])) : 0,
    fov: fovMatch ? clampFov(parseFloat(fovMatch[1])) : DEFAULT_FOV
  };
}

function PegmanIcon({
  isActive,
  heading = 0,
  fov = DEFAULT_FOV
}: {
  isActive: boolean;
  heading?: number;
  fov?: number;
}) {
  const color = '#10B981';
  const fovColor = 'rgba(16,185,129,0.15)';
  const glowColor = 'rgba(16,185,129,0.5)';
  const radius = 24;
  const startAngle = (-fov / 2 - 90) * Math.PI / 180;
  const endAngle = (fov / 2 - 90) * Math.PI / 180;

  const x1 = 12 + radius * Math.cos(startAngle);
  const y1 = 12 + radius * Math.sin(startAngle);
  const x2 = 12 + radius * Math.cos(endAngle);
  const y2 = 12 + radius * Math.sin(endAngle);

  const largeArcFlag = fov > 180 ? 1 : 0;
  const fovPath = `M 12 12 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

  return (
    <div
      className="relative transition-transform duration-200"
      style={{ transform: `rotate(${getPegmanRotationDegrees(heading)}deg)` }}
    >
      <style>{`
        @keyframes radar {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`transition-all duration-200 ${isActive ? 'opacity-100 scale-110' : 'opacity-85 hover:opacity-100'}`}
        style={{
          filter: isActive ? `drop-shadow(0 0 8px ${glowColor})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          overflow: 'visible'
        }}
      >
        {isActive && (
          <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1" style={{ animation: 'radar 1.5s infinite ease-out' }} />
        )}
        {isActive && <path d={fovPath} fill={fovColor} className="animate-pulse" />}
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <circle cx="6" cy="12" r="3" fill={color} />
        <circle cx="18" cy="12" r="3" fill={color} />
        <circle cx="12" cy="12" r="7" fill={color} />
        <circle cx="12" cy="12" r="3.5" fill="#F7DA4D" stroke="white" strokeWidth="1" />
        <path d="M12 5 L10 8 L14 8 Z" fill="white" />
      </svg>
    </div>
  );
}

function createPegmanIcon(heading: number, fov: number = DEFAULT_FOV, isSelected = false) {
  const color = '#10B981';
  const fovColor = 'rgba(16,185,129,0.25)';
  const size = 24;
  const center = 12;
  const radius = 24;
  const startAngle = (-fov / 2 - 90) * Math.PI / 180;
  const endAngle = (fov / 2 - 90) * Math.PI / 180;
  const x1 = center + radius * Math.cos(startAngle);
  const y1 = center + radius * Math.sin(startAngle);
  const x2 = center + radius * Math.cos(endAngle);
  const y2 = center + radius * Math.sin(endAngle);
  const largeArcFlag = fov > 180 ? 1 : 0;
  const fovPath = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

  return L.divIcon({
    html: `
      <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
        <div class="pegman-rotor" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));transform:rotate(${getPegmanRotationDegrees(heading)}deg);transform-origin:50% 50%;transition:transform 120ms linear;will-change:transform;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
          <path d="${fovPath}" fill="${fovColor}" />
          <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="1" stroke-dasharray="2 2" opacity="0.4" />
          <circle cx="6" cy="12" r="3" fill="${color}" />
          <circle cx="18" cy="12" r="3" fill="${color}" />
          <circle cx="12" cy="12" r="7" fill="${color}" />
          <circle cx="12" cy="12" r="3.5" fill="#F7DA4D" stroke="white" stroke-width="1" />
          <path d="M12 5 L10 8 L14 8 Z" fill="white" />
        </svg>
        </div>
      </div>
    `,
    className: `custom-pegman-marker ${isSelected ? 'selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [center, center]
  });
}

const CLEANUP_STREET_VIEW_SCRIPT = `
  (() => {
    const styleId = 'street-view-cleanup-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = [
        '.widget-pane-section-back,.scene-footer,.watermark,.gm-style-cc{display:none!important;}',
        '.gm-style > div:first-child > div:nth-child(2){display:none!important;pointer-events:none!important;}',
        '.dismissButton{display:none!important;}',
        '.widget-reveal-card,.widget-pane,.widget-pane-section{transform:scale(.82)!important;transform-origin:top left!important;}',
        '.widget-minimap,.widget-minimap-shim,#minimap{transform:scale(.72)!important;transform-origin:bottom left!important;}',
        '.widget-minimap,.widget-minimap-shim,#minimap{margin-left:-18px!important;margin-bottom:-18px!important;}',
        '.widget-minimap canvas,#minimap canvas{border-radius:10px!important;}',
        '.app-viewcard-strip,.scene-footer-container,.widget-zoom,.widget-compass,.widget-scene-controls{transform:scale(.84)!important;transform-origin:bottom right!important;}',
        '.widget-zoom,.widget-compass,.widget-scene-controls{margin-right:-10px!important;margin-bottom:-10px!important;}'
      ].join('');
      document.head.appendChild(style);
    }
  })();
`;

const SURVIVOR_SYNC_SCRIPT = `
  (() => {
    const syncMarker = 'SYNC_POS:';
    const parseCurrentPayload = () => {
      try {
        const url = window.location.href;
        const num = '(-?\\\\d+(?:\\\\.\\\\d+)?)';
        const pointMatch =
          url.match(new RegExp('@' + num + ',' + num)) ||
          url.match(new RegExp('!3d' + num + '!4d' + num)) ||
          url.match(new RegExp('viewpoint=' + num + ',' + num));

        if (!pointMatch) return null;

        const headingMatch =
          url.match(/heading=(-?\\d+(?:\\.\\d+)?)/i) ||
          url.match(/,(-?\\d+(?:\\.\\d+)?)h(?:[/?&#,]|$)/i) ||
          url.match(/[?&]h=(-?\\d+(?:\\.\\d+)?)/i);
        const fovMatch =
          url.match(/fov=(\\d+(?:\\.\\d+)?)/i) ||
          url.match(/,(\\d+(?:\\.\\d+)?)y(?:[/?&#,]|$)/i) ||
          url.match(/[?&]y=(\\d+(?:\\.\\d+)?)/i) ||
          url.match(/,(\\d+(?:\\.\\d+)?)f(?:[/?&#,]|$)/i);

        const heading = headingMatch ? headingMatch[1] : '0';
        const fov = fovMatch ? fovMatch[1] : '90';
        console.log('[StreetViewControl] public payload extracted', {
          url,
          locationMatch: pointMatch[0],
          headingMatch: headingMatch ? headingMatch[0] : null,
          heading,
          fovMatch: fovMatch ? fovMatch[0] : null,
          fov
        });
        return syncMarker + pointMatch[1] + ',' + pointMatch[2] + ',' + heading + ',' + fov;
      } catch (error) {
        console.warn('[StreetViewControl] Failed to parse current Street View payload:', error);
        return null;
      }
    };

    const writeTitleSync = () => {
      const payload = parseCurrentPayload();
      if (!payload) return;
      const baseTitle = (document.title || 'Street View').replace(/SYNC_POS:[^|]+\\|?\\s*/g, '').trim();
      document.title = payload + ' | ' + (baseTitle || 'Street View');
      window.__streetViewSyncPayload = payload;
    };

    if (!window.__streetViewSyncInstalled) {
      window.__streetViewSyncInstalled = true;
      setInterval(writeTitleSync, 500);
      window.addEventListener('popstate', writeTitleSync);
      window.addEventListener('hashchange', writeTitleSync);
    }

    writeTitleSync();
  })();
`;

export function StreetViewControl() {
  const map = useMap();
  const [isActive, setIsActive] = useState(false);
  const [isPegmanSelected, setIsPegmanSelected] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const pegmanState = useDesignSync((s) => s.pegmanState);
  const setPegmanState = useDesignSync((s) => s.setPegmanState);
  const selectedFeatureId = useDesignSync((s) => s.selectedFeatureId);
  const state = useDesignSync((s) => s.state);

  const latestPegmanState = useRef(pegmanState);
  latestPegmanState.current = pegmanState;
  const pegmanMarkerRef = useRef<L.Marker | null>(null);
  const isDraggingPegmanRef = useRef(false);
  const pendingStreetViewSyncRef = useRef<Partial<typeof pegmanState> | null>(null);
  const streetViewSyncTimerRef = useRef<number | null>(null);
  const lastStreetViewApplyAtRef = useRef(0);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.clearTimeout((showFeedback as unknown as { timer?: number }).timer);
    (showFeedback as unknown as { timer?: number }).timer = window.setTimeout(() => {
      setFeedback(null);
    }, 2800);
  }, []);

  useEffect(() => {
    const CustomControl = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create('div', 'custom-street-view-control');
        L.DomEvent.disableClickPropagation(div);
        setContainer(div);
        return div;
      },
      onRemove: function () {
        setContainer(null);
      }
    });

    const control = new CustomControl({ position: 'topright' });
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  useEffect(() => {
    if (!map.getPane(STREETVIEW_PEGMAN_PANE)) {
      const pane = map.createPane(STREETVIEW_PEGMAN_PANE);
      pane.style.zIndex = '1350';
      pane.style.pointerEvents = 'auto';
    }
  }, [map]);

  const injectCleanup = useCallback(async () => {
    try {
      await invoke('eval_webview', {
        label: STREET_VIEW_WINDOW_LABEL,
        script: CLEANUP_STREET_VIEW_SCRIPT
      });
    } catch (error) {
      console.warn('[StreetViewControl] Cleanup injection skipped:', error);
    }
  }, []);

  const injectSurvivorSync = useCallback(async () => {
    try {
      await invoke('eval_webview', {
        label: STREET_VIEW_WINDOW_LABEL,
        script: SURVIVOR_SYNC_SCRIPT
      });
    } catch (error) {
      console.warn('[StreetViewControl] Survivor sync injection skipped:', error);
    }
  }, []);

  const syncPegmanState = useCallback(
    (payload: Partial<typeof pegmanState> & { source?: PegmanSource }) => {
      const current = latestPegmanState.current;
      const nextHeading =
        payload.heading !== undefined ? normalizeHeading(payload.heading) : current.heading;
      const nextFov = payload.fov !== undefined ? clampFov(payload.fov) : current.fov;
      console.log('[StreetViewControl] syncPegmanState', {
        source: payload.source ?? current.source ?? 'streetview',
        currentHeading: current.heading,
        nextHeading,
        currentFov: current.fov,
        nextFov,
        windowOpen: payload.windowOpen ?? current.windowOpen ?? true,
        location: payload.location ?? current.location
      });
      setPegmanState({
        ...payload,
        heading: nextHeading,
        fov: nextFov,
        source: payload.source ?? current.source ?? 'streetview',
        windowOpen: payload.windowOpen ?? current.windowOpen ?? true,
        lastSyncAt: Date.now()
      });
    },
    [setPegmanState]
  );

  const flushStreetViewSync = useCallback(() => {
    streetViewSyncTimerRef.current = null;
    const pending = pendingStreetViewSyncRef.current;
    pendingStreetViewSyncRef.current = null;
    if (!pending) {
      return;
    }

    lastStreetViewApplyAtRef.current = Date.now();
    syncPegmanState({
      ...pending,
      source: 'streetview',
      windowOpen: true
      });
  }, [syncPegmanState]);

  const scheduleStreetViewSync = useCallback(
    (payload: { location?: [number, number] | null; heading?: number; fov?: number }) => {
      const current = latestPegmanState.current;
      const currentLocation = current.location;
      const nextLocation = payload.location ?? currentLocation;
      const rawHeading = payload.heading ?? current.heading;
      const rawFov = payload.fov ?? current.fov;
      const normalizedHeading = normalizeHeading(rawHeading);
      const normalizedFov = clampFov(rawFov);

      let hasLocationDelta = false;
      let smoothedLocation = nextLocation;
      if (currentLocation && nextLocation) {
        const latDelta = nextLocation[0] - currentLocation[0];
        const lngDelta = nextLocation[1] - currentLocation[1];
        hasLocationDelta =
          Math.abs(latDelta) > POSITION_JITTER_EPSILON ||
          Math.abs(lngDelta) > POSITION_JITTER_EPSILON;

        if (hasLocationDelta) {
          smoothedLocation = [
            currentLocation[0] + latDelta * STREETVIEW_SMOOTH_FACTOR,
            currentLocation[1] + lngDelta * STREETVIEW_SMOOTH_FACTOR
          ];
        }
      } else if (nextLocation) {
        hasLocationDelta = true;
      }

      const headingDelta = Math.abs(getHeadingDelta(current.heading, normalizedHeading));
      const hasHeadingDelta = headingDelta > HEADING_JITTER_EPSILON;
      const smoothedHeading =
        hasHeadingDelta && headingDelta < 24
          ? blendHeading(current.heading, normalizedHeading, STREETVIEW_SMOOTH_FACTOR)
          : normalizedHeading;

      const fovDelta = Math.abs(normalizedFov - current.fov);
      const hasFovDelta = fovDelta > FOV_JITTER_EPSILON;
      const smoothedFov =
        hasFovDelta && fovDelta < 18
          ? current.fov + (normalizedFov - current.fov) * STREETVIEW_SMOOTH_FACTOR
          : normalizedFov;

      if (!hasLocationDelta && !hasHeadingDelta && !hasFovDelta) {
        return;
      }

      pendingStreetViewSyncRef.current = {
        location: smoothedLocation ?? currentLocation,
        heading: smoothedHeading,
        fov: smoothedFov
      };

      if (streetViewSyncTimerRef.current !== null) {
        return;
      }

      const elapsed = Date.now() - lastStreetViewApplyAtRef.current;
      const delay = Math.max(0, STREETVIEW_SYNC_MIN_APPLY_MS - elapsed);
      streetViewSyncTimerRef.current = window.setTimeout(flushStreetViewSync, delay);
    },
    [flushStreetViewSync]
  );

  const closeStreetViewSession = useCallback(() => {
    if (streetViewSyncTimerRef.current !== null) {
      window.clearTimeout(streetViewSyncTimerRef.current);
      streetViewSyncTimerRef.current = null;
    }
    pendingStreetViewSyncRef.current = null;
    setIsActive(false);
    setPegmanState({
      active: false,
      windowOpen: false,
      source: 'map',
      lastSyncAt: Date.now()
    });
  }, [setPegmanState]);

  const applyPegmanDomRotation = useCallback(
    (nextHeading: number) => {
      const markerElement = pegmanMarkerRef.current?.getElement();
      const rotor = markerElement?.querySelector('.pegman-rotor');
      if (!(rotor instanceof HTMLElement)) {
        console.log('[StreetViewControl] pegman rotor element not ready', {
          heading: nextHeading
        });
        return;
      }

      const rotation = getPegmanRotationDegrees(nextHeading);
      console.log('[StreetViewControl] applying pegman marker rotation', {
        heading: nextHeading,
        rotation
      });
      rotor.style.transform = `rotate(${rotation}deg)`;
      rotor.style.transformOrigin = '50% 50%';
    },
    []
  );

  const openStreetViewWindow = useCallback(
    async (lat: number, lng: number) => {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const feature = selectedFeatureId ? state?.features?.[selectedFeatureId] : null;
        const shouldSeedFromFeature =
          !!feature &&
          (!latestPegmanState.current.windowOpen ||
            latestPegmanState.current.featureId !== selectedFeatureId ||
            !latestPegmanState.current.location);

        let nextHeading = latestPegmanState.current.heading || 0;
        let nextFov = latestPegmanState.current.fov || DEFAULT_FOV;
        let panoId = '';
        if (feature && shouldSeedFromFeature) {
          const meta = getParsedMetadata(feature);
          const gis = typeof meta.gis === 'object' && meta.gis ? meta.gis as Record<string, unknown> : {};
          const specsMeta = typeof meta.specs === 'object' && meta.specs ? meta.specs as Record<string, unknown> : {};
          const rotation = parseFloat(String(gis.rotation ?? meta.rotation ?? 0));
          nextHeading = mapRotationToHeading(rotation);
          panoId = String(gis.pano_id ?? meta.pano_id ?? panoId);

          const specs = getEffectiveCameraSpecs(feature, state?.settings, meta);
          const sensor =
            SENSOR_SIZES[specs.sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/3"'];
          nextFov = parseFloat(
            String(specsMeta.hfov ?? meta.hfov ?? calculateHFOV(sensor.width, specs.focalLength))
          );
        }

        const apiKey = getGoogleMapsApiKey().trim();
        if (apiKey) {
          const metadata = await checkStreetViewMetadata(lat, lng, apiKey);
          if (metadata.ok) {
            panoId = metadata.panoId || panoId;
          } else {
            console.warn(
              `[StreetViewControl] Metadata unavailable (${metadata.status}), falling back to public URL.`
            );
          }
        } else {
          console.info('[StreetViewControl] Opening public Street View without metadata precheck.');
        }

        nextHeading = normalizeHeading(nextHeading);
        nextFov = clampFov(nextFov);

        syncPegmanState({
          location: [lat, lng],
          heading: nextHeading,
          fov: nextFov,
          source: 'map',
          windowOpen: true,
          featureId: selectedFeatureId ?? null
        });

        const streetViewUrl = buildStreetViewUrl(lat, lng, nextHeading, nextFov, panoId);
        const existingWindow = await WebviewWindow.getByLabel(STREET_VIEW_WINDOW_LABEL);

        if (existingWindow) {
          await invoke('navigate_webview', { label: STREET_VIEW_WINDOW_LABEL, url: streetViewUrl });
          await existingWindow.setTitle('Street View');
          await existingWindow.show();
          await existingWindow.setFocus();
          window.setTimeout(() => {
            void injectCleanup();
            void injectSurvivorSync();
          }, 900);
        } else {
          const newWindow = new WebviewWindow(STREET_VIEW_WINDOW_LABEL, {
            url: streetViewUrl,
            title: 'Street View',
            width: 920,
            height: 620,
            minWidth: 520,
            minHeight: 360,
            visible: true,
            decorations: true,
            transparent: false,
            shadow: true,
            focus: true
          } as any);

          newWindow.once('tauri://created', async () => {
            syncPegmanState({ windowOpen: true, source: 'map' });
            window.setTimeout(() => {
              void injectCleanup();
              void injectSurvivorSync();
            }, 1200);
          });

          newWindow.once('tauri://error', () => {
            syncPegmanState({ windowOpen: false });
            showFeedback('Không tạo được cửa sổ Street View.');
          });
        }

        if (!panoId) {
          console.info('[StreetViewControl] Public Street View window opened without pano precheck.');
        }

        return true;
      } catch (error) {
        console.error('[StreetViewControl] Failed to manage Street View window:', error);
        showFeedback('Street View gặp lỗi khi khởi tạo.');
        syncPegmanState({ windowOpen: false });
        return false;
      }
    },
    [injectCleanup, injectSurvivorSync, selectedFeatureId, showFeedback, state, syncPegmanState]
  );

  useEffect(() => {
    let disposed = false;

    const bindListeners = async () => {
      const unlisteners = await Promise.all([
        listen<StreetViewLocationPayload>('pano-changed', (event) => {
          if (disposed) return;
          const { lat, lng, fov } = event.payload;
          const current = latestPegmanState.current;
          const nextLocation = hasMeaningfulMovement(current.location, lat, lng)
            ? ([lat, lng] as [number, number])
            : current.location;

          scheduleStreetViewSync({
            location: nextLocation ?? [lat, lng],
            fov: fov ?? current.fov
          });
        }),
        listen<StreetViewPovPayload>('pov-changed', (event) => {
          if (disposed) return;
          const { heading, fov } = event.payload;
          const current = latestPegmanState.current;
          console.log('[StreetViewControl] pov-changed received', {
            heading,
            normalizedHeading: normalizeHeading(heading),
            currentHeading: current.heading,
            delta: getHeadingDelta(current.heading, heading),
            fov,
            currentFov: current.fov
          });
          if (
            Math.abs(getHeadingDelta(current.heading, heading)) < HEADING_EPSILON &&
            Math.abs(clampFov(fov ?? current.fov) - current.fov) < FOV_EPSILON
          ) {
            return;
          }

          syncPegmanState({
            heading,
            fov: fov ?? current.fov,
            source: 'streetview',
            windowOpen: true
          });
        }),
        listen('panorama-ready', () => {
          if (disposed) return;
          syncPegmanState({ windowOpen: true, source: 'streetview' });
        })
      ]);

      return () => {
        for (const unlisten of unlisteners) {
          unlisten();
        }
      };
    };

    let cleanup: (() => void) | undefined;
    void bindListeners().then((fn) => {
      cleanup = fn;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [scheduleStreetViewSync, syncPegmanState]);

  useEffect(() => {
    if (!pegmanState.windowOpen) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const bindDestroyedListener = async () => {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const windowHandle = await WebviewWindow.getByLabel(STREET_VIEW_WINDOW_LABEL);
      if (!windowHandle || disposed) {
        if (!disposed) {
          closeStreetViewSession();
        }
        return;
      }

      cleanup = await windowHandle.listen(TauriEvent.WINDOW_DESTROYED, () => {
        if (disposed) return;
        closeStreetViewSession();
      });
    };

    void bindDestroyedListener();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [closeStreetViewSession, pegmanState.windowOpen]);

  useEffect(() => {
    if (!pegmanState.windowOpen) {
      return;
    }

    let webviewRef: { title: () => Promise<string>; } | null = null;
    let isWindowAlive = true;

    const syncTask = async () => {
      try {
        if (isDraggingPegmanRef.current) {
          return;
        }

        if (!webviewRef) {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          webviewRef = await WebviewWindow.getByLabel(STREET_VIEW_WINDOW_LABEL);
        }

        if (!webviewRef) {
          closeStreetViewSession();
          return;
        }

        if (!isWindowAlive) {
          return;
        }

        const current = latestPegmanState.current;
        let syncPayload = '';
        const title = await webviewRef.title().catch(() => null);

        if (title && title.includes('SYNC_POS:')) {
          syncPayload = title.substring(title.indexOf('SYNC_POS:') + 'SYNC_POS:'.length).split('|')[0].trim();
        } else {
          const rawUrl = (await invoke('get_webview_url', {
            label: STREET_VIEW_WINDOW_LABEL
          })) as string;
          const parsed = parseStreetViewUrl(rawUrl);
          if (!parsed) {
            console.log('[StreetViewControl] Unable to parse Street View URL, re-injecting sync helper.');
            void injectSurvivorSync();
            return;
          }
          syncPayload = `${parsed.lat},${parsed.lng},${parsed.heading},${parsed.fov}`;
        }

        const parts = syncPayload.split(',');
        if (parts.length < 4) {
          return;
        }

        const nextLat = parseFloat(parts[0]);
        const nextLng = parseFloat(parts[1]);
        const nextHeading = normalizeHeading(parseFloat(parts[2]));
        const nextFov = clampFov(parseFloat(parts[3]));

        if (
          Number.isNaN(nextLat) ||
          Number.isNaN(nextLng) ||
          Number.isNaN(nextHeading) ||
          Number.isNaN(nextFov)
        ) {
          return;
        }

        const nextLocation = [nextLat, nextLng] as [number, number];
        const shouldSyncLocation = hasMeaningfulMovement(current.location, nextLat, nextLng);
        const shouldSyncHeading =
          Math.abs(getHeadingDelta(current.heading, nextHeading)) > HEADING_EPSILON;
        const shouldSyncFov = Math.abs(nextFov - current.fov) > FOV_EPSILON;

        if (!shouldSyncLocation && !shouldSyncHeading && !shouldSyncFov) {
          return;
        }

        console.log('[StreetViewControl] public street view sync payload', {
          nextLocation,
          nextHeading,
          nextFov,
          currentHeading: current.heading,
          currentLocation: current.location,
          currentFov: current.fov
        });

        syncPegmanState({
          location: nextLocation,
          heading: nextHeading,
          fov: nextFov,
          source: 'streetview',
          windowOpen: true
        });
      } catch (error) {
        console.warn('[StreetViewControl] Street View sync read failed, closing pegman session:', error);
        closeStreetViewSession();
      }
    };

    const intervalId = window.setInterval(syncTask, STREETVIEW_SYNC_INTERVAL_MS);
    void syncTask();

    return () => {
      isWindowAlive = false;
      window.clearInterval(intervalId);
      if (streetViewSyncTimerRef.current !== null) {
        window.clearTimeout(streetViewSyncTimerRef.current);
        streetViewSyncTimerRef.current = null;
      }
      pendingStreetViewSyncRef.current = null;
    };
  }, [closeStreetViewSession, injectSurvivorSync, pegmanState.windowOpen, syncPegmanState]);

  useEffect(() => {
    if (!isActive) {
      setPegmanState({ active: false });
      return;
    }
    setPegmanState({ active: true });
  }, [isActive, setPegmanState]);

  useEffect(() => {
    if (!isActive) return;

    const onClick = (event: L.LeafletMouseEvent) => {
      setIsPegmanSelected(false);
      void openStreetViewWindow(event.latlng.lat, event.latlng.lng).then((opened) => {
        if (opened) {
          setIsActive(false);
        }
      });
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [isActive, map, openStreetViewWindow]);

  const shouldShowPegman = !!pegmanState.location && (isActive || pegmanState.windowOpen);
  const hasStreetViewWindow = !!pegmanState.windowOpen;
  const location = pegmanState.location;
  const heading = normalizeHeading(pegmanState.heading || 0);
  const fov = clampFov(pegmanState.fov || DEFAULT_FOV);

  useEffect(() => {
    if (!shouldShowPegman) {
      setIsPegmanSelected(false);
    }
  }, [shouldShowPegman]);

  useEffect(() => {
    if (!pegmanMarkerRef.current || !shouldShowPegman || !location || isDraggingPegmanRef.current) {
      return;
    }

    console.log('[StreetViewControl] syncing pegman marker location', {
      heading,
      location
    });
    pegmanMarkerRef.current.setLatLng(new L.LatLng(location[0], location[1]));
  }, [heading, location, shouldShowPegman]);

  useEffect(() => {
    if (!pegmanMarkerRef.current || !shouldShowPegman || !location) {
      return;
    }

    console.log('[StreetViewControl] rebuilding pegman icon', {
      heading,
      fov,
      location
    });
    pegmanMarkerRef.current.setIcon(createPegmanIcon(heading, fov, isPegmanSelected));
    window.requestAnimationFrame(() => {
      applyPegmanDomRotation(heading);
    });
  }, [applyPegmanDomRotation, fov, heading, isPegmanSelected, location, shouldShowPegman]);

  useEffect(() => {
    if (!shouldShowPegman) {
      return;
    }

    applyPegmanDomRotation(heading);
  }, [applyPegmanDomRotation, heading, shouldShowPegman]);

  const controlButton = container
    ? createPortal(
        <button
          onClick={() => setIsActive((value) => !value)}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all duration-300 ${
            isActive
              ? 'bg-emerald-500/18 ring-2 ring-emerald-400/70 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]'
              : hasStreetViewWindow
                ? 'bg-black/20 hover:bg-black/30'
                : 'bg-transparent hover:bg-black/10'
          }`}
          title="Google Street View"
        >
          <PegmanIcon isActive={isActive || hasStreetViewWindow} heading={heading} fov={fov} />
        </button>,
        container
      )
    : null;

  return (
    <>
      {controlButton}

      {isActive && (
        <TileLayer
          url="https://mt1.google.com/vt?lyrs=svv&style=40,18&hl=vi&gl=vn&x={x}&y={y}&z={z}"
          opacity={0.72}
          zIndex={1000}
        />
      )}

      {shouldShowPegman && location && (
        <Marker
          ref={(marker) => {
            pegmanMarkerRef.current = marker;
          }}
          pane={STREETVIEW_PEGMAN_PANE}
          position={new L.LatLng(location[0], location[1])}
          icon={createPegmanIcon(heading, fov, isPegmanSelected)}
          draggable={isPegmanSelected}
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stopPropagation(event.originalEvent);
              setIsPegmanSelected(true);
            },
            dragstart: () => {
              isDraggingPegmanRef.current = true;
            },
            dragend: (event) => {
              isDraggingPegmanRef.current = false;
              setIsPegmanSelected(true);
              const marker = event.target as L.Marker;
              const position = marker.getLatLng();
              syncPegmanState({
                location: [position.lat, position.lng],
                source: 'map',
                windowOpen: latestPegmanState.current.windowOpen,
                featureId: selectedFeatureId ?? latestPegmanState.current.featureId ?? null
              });
              void openStreetViewWindow(position.lat, position.lng);
            }
          }}
          zIndexOffset={2200}
        />
      )}

      {(feedback || (isActive && !location)) && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[5000] bg-[#1B1E24]/92 border border-emerald-400/25 text-emerald-200 px-5 py-2 rounded-full shadow-2xl text-[10px] uppercase font-bold tracking-[0.22em] backdrop-blur-md flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>
            {feedback ||
              `Chon vi tri de mo Street View | ${formatCoords(pegmanState.location)}`}
          </span>
        </div>
      )}
    </>
  );
}
