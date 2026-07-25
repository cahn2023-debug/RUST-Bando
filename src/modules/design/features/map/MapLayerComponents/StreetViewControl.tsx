import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import { X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getEffectiveCameraSpecs, getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { calculateHFOV, mapRotationToHeading, SENSOR_SIZES } from '@TOOL/utils/cameraMath';
import { getCleanName } from '@TOOL/utils/featureUtils';
import { Button } from '@DESIGN/components/ui/Button';
import { ImageEditorModal, type ImageEditorSaveResult } from '@DESIGN/components/ui/ImageEditorModal';
import { importMediaAsset, type MediaFeaturePatch } from '@IMPLEMENT/services/mediaAssetService';
import { requestStorageHealthRefresh } from '@IMPLEMENT/services/projectStorageService';
import { buildFeaturePropertiesForPersistence, normalizeFeatureMetadataForPersistence } from '@TOOL/utils/featurePersistence';
import type { FeatureMetadata, FeatureProperties } from '@CONTRACT/types';

const STREET_VIEW_WINDOW_LABEL = 'street-view';
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

function isAttachedElement(element: HTMLElement | null | undefined) {
  return Boolean(element && (!('isConnected' in element) || element.isConnected));
}

export function canUseLeafletPane(map: L.Map, paneName = 'mapPane') {
  try {
    return Boolean((map as any)?._loaded && isAttachedElement(map.getPane(paneName)));
  } catch {
    return false;
  }
}

export function canUpdatePegmanMarker(map: L.Map, marker: L.Marker | null) {
  try {
    return Boolean(marker && (marker as any)._map === map && canUseLeafletPane(map, STREETVIEW_PEGMAN_PANE));
  } catch {
    return false;
  }
}

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
  const panoParam = panoId ? `&pano=${encodeURIComponent(panoId)}` : '';
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

const STREET_VIEW_CROP_BUTTON_SCRIPT = `
  (() => {
    const btnId = 'street-view-crop-btn';
    if (document.getElementById(btnId)) return;

    const btn = document.createElement('button');
    btn.id = btnId;
    btn.innerHTML = 'CROP PHOTO';
    btn.style.cssText = 'position:fixed;top:16px;right:60px;z-index:99999;background:#6366f1;color:#fff;font-family:sans-serif;font-size:11px;font-weight:bold;padding:6px 12px;border:none;border-radius:4px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.5);letter-spacing:0.5px;';

    btn.addEventListener('click', () => {
      if (document.getElementById('street-view-crop-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'street-view-crop-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.35);cursor:crosshair;user-select:none;';

      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;border:2px dashed #facc15;background:rgba(250,204,21,0.15);display:none;pointer-events:none;';
      overlay.appendChild(box);

      let startX = 0, startY = 0, isDragging = false;

      overlay.addEventListener('pointerdown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isDragging = true;
        box.style.left = startX + 'px';
        box.style.top = startY + 'px';
        box.style.width = '0px';
        box.style.height = '0px';
        box.style.display = 'block';
      });

      overlay.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const curX = e.clientX;
        const curY = e.clientY;
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
      });

      const finishCrop = () => {
        if (!isDragging) return;
        isDragging = false;

        const rectLeft = parseFloat(box.style.left || '0');
        const rectTop = parseFloat(box.style.top || '0');
        const rectWidth = parseFloat(box.style.width || '0');
        const rectHeight = parseFloat(box.style.height || '0');

        overlay.remove();

        if (rectWidth < 10 || rectHeight < 10) return;

        const normX = (rectLeft / window.innerWidth).toFixed(4);
        const normY = (rectTop / window.innerHeight).toFixed(4);
        const normW = (rectWidth / window.innerWidth).toFixed(4);
        const normH = (rectHeight / window.innerHeight).toFixed(4);

        const requestId = 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        window.__streetViewCropPayload = 'SYNC_CROP:' + requestId + ':' + normX + ',' + normY + ',' + normW + ',' + normH;

        const payload = window.__streetViewSyncPayload || '';
        const baseTitle = (document.title || 'Street View')
          .replace(/SYNC_CROP:[^|]+\\|?\\s*/g, '')
          .replace(/SYNC_POS:[^|]+\\|?\\s*/g, '')
          .trim();
        document.title = [payload, window.__streetViewCropPayload, '|', baseTitle || 'Street View'].filter(Boolean).join(' ');
      };

      overlay.addEventListener('pointerup', finishCrop);

      document.body.appendChild(overlay);
    });

    document.body.appendChild(btn);
  })();
`;

export function StreetViewControl() {
  const map = useMap();
  const [isActive, setIsActive] = useState(false);
  const [isPegmanSelected, setIsPegmanSelected] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pegmanPaneReady, setPegmanPaneReady] = useState(false);

  const pegmanState = useDesignSync((s) => s.pegmanState);
  const setPegmanState = useDesignSync((s) => s.setPegmanState);
  const selectedFeatureId = useDesignSync((s) => s.selectedFeatureId);
  const selectFeature = useDesignSync((s) => s.selectFeature);
  const projectId = useDesignSync((s) => s.projectId);
  const queueEvent = useDesignSync((s) => s.queueEvent);
  const state = useDesignSync((s) => s.state);

  const [pendingStreetViewCroppedImage, setPendingStreetViewCroppedImage] = useState<string | null>(null);
  const [showTargetFeaturePicker, setShowTargetFeaturePicker] = useState(false);
  const [targetFeatureId, setTargetFeatureId] = useState<string | null>(null);
  const [showStreetViewImageEditor, setShowStreetViewImageEditor] = useState(false);
  const processedCropRequestIds = useRef<Set<string>>(new Set());

  const latestPegmanState = useRef(pegmanState);
  
  useEffect(() => {
    latestPegmanState.current = pegmanState;
  }, [pegmanState]);

  const pegmanMarkerRef = useRef<L.Marker | null>(null);
  const isDraggingPegmanRef = useRef(false);
  const pendingStreetViewSyncRef = useRef<Partial<typeof pegmanState> | null>(null);
  const streetViewSyncTimerRef = useRef<number | null>(null);
  const lastStreetViewApplyAtRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 2800);
  }, []);

  const applyFeaturePatch = useCallback((patch: MediaFeaturePatch | null | undefined) => {
    if (!patch) return;
    const currentState = useDesignSync.getState().state;
    const currentFeature = currentState?.features?.[patch.id];
    if (!currentState || !currentFeature) return;
    useDesignSync.setState({
      state: {
        ...currentState,
        features: {
          ...currentState.features,
          [patch.id]: {
            ...currentFeature,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            metadata: patch.metadata,
            ...(patch.properties ? { properties: patch.properties as FeatureProperties } : {}),
          },
        },
      },
    });
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
    let cancelled = false;

    const ensurePegmanPane = () => {
      if (cancelled || !canUseLeafletPane(map)) {
        return;
      }

      const pane = map.getPane(STREETVIEW_PEGMAN_PANE) ?? map.createPane(STREETVIEW_PEGMAN_PANE);
      pane.style.zIndex = '1350';
      pane.style.pointerEvents = 'auto';
      setPegmanPaneReady(true);
    };

    if (canUseLeafletPane(map)) {
      ensurePegmanPane();
    } else {
      map.whenReady(ensurePegmanPane);
    }

    return () => {
      cancelled = true;
      setPegmanPaneReady(false);
    };
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

  const injectCropButton = useCallback(async () => {
    try {
      await invoke('eval_webview', {
        label: STREET_VIEW_WINDOW_LABEL,
        script: STREET_VIEW_CROP_BUTTON_SCRIPT
      });
    } catch (error) {
      console.warn('[StreetViewControl] Crop button injection skipped:', error);
    }
  }, []);

  const handleStreetViewCropRequest = useCallback(async (normX: number, normY: number, normW: number, normH: number) => {
    try {
      const captureResult = await invoke<{ dataUrl?: string }>('capture_webview_png', {
        label: STREET_VIEW_WINDOW_LABEL
      });

      if (!captureResult || !captureResult.dataUrl) {
        showFeedback('Chụp màn hình Street View thất bại.');
        return;
      }

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = captureResult.dataUrl!;
      });

      const cropX = Math.round(normX * img.naturalWidth);
      const cropY = Math.round(normY * img.naturalHeight);
      const cropW = Math.round(normW * img.naturalWidth);
      const cropH = Math.round(normH * img.naturalHeight);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.max(1, cropW);
      tempCanvas.height = Math.max(1, cropH);
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, tempCanvas.width, tempCanvas.height);
      const croppedDataUrl = tempCanvas.toDataURL('image/png');

      setPendingStreetViewCroppedImage(croppedDataUrl);
      setTargetFeatureId(selectedFeatureId || null);
      setShowTargetFeaturePicker(true);
    } catch (error) {
      console.error('[StreetViewControl] Failed to process Street View crop:', error);
      showFeedback('Lỗi khi chụp hoặc cắt ảnh Street View.');
    }
  }, [selectedFeatureId, showFeedback]);

  const handleSaveStreetViewPhoto = useCallback(async (result: ImageEditorSaveResult) => {
    const currentProjectId = projectId || useDesignSync.getState().projectId;
    const targetId = targetFeatureId || selectedFeatureId;
    if (!currentProjectId || !targetId) {
      showFeedback('Thiếu đối tượng hoặc dự án để lưu ảnh.');
      return;
    }

    try {
      const imported = await importMediaAsset(String(currentProjectId), targetId, result.dataUrl);
      const targetFeature = state?.features?.[targetId];
      let queuedTextPatch = false;

      if (targetFeature && result.textAnnotations.length > 0) {
        let patchMeta: FeatureMetadata = {};
        if (imported.featurePatch?.metadata) {
          try {
            patchMeta = JSON.parse(imported.featurePatch.metadata);
          } catch {
            patchMeta = {};
          }
        }
        let existingDesc = '';
        if (typeof patchMeta.description === 'string') {
          existingDesc = patchMeta.description;
        } else if (typeof targetFeature.metadata === 'string') {
          try {
            existingDesc = JSON.parse(targetFeature.metadata || '{}').description || '';
          } catch {
            existingDesc = '';
          }
        }
        const existingLines = (existingDesc || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
        const newUnique = result.textAnnotations.filter((t) => !existingLines.includes(t.trim()));

        if (newUnique.length > 0) {
          const nextDesc = [existingDesc, ...newUnique].filter(Boolean).join('\n');
          const nextMeta = { ...patchMeta, description: nextDesc };
          const standardized = normalizeFeatureMetadataForPersistence(nextMeta, targetFeature.properties as FeatureProperties);
          const nextProps = buildFeaturePropertiesForPersistence(targetFeature.properties as FeatureProperties | undefined, standardized);

          await queueEvent({
            type: 'FeatureUpdated',
            payload: {
              id: targetId,
              name: targetFeature.name,
              metadata: JSON.stringify(standardized),
              properties: nextProps,
            },
          });
          queuedTextPatch = true;
        }
      }

      if (!queuedTextPatch) {
        applyFeaturePatch(imported.featurePatch);
      }
      selectFeature(targetId);
      requestStorageHealthRefresh();
      showFeedback('Đã lưu ảnh Street View thành công vào Site Photos!');
      setShowStreetViewImageEditor(false);
      setPendingStreetViewCroppedImage(null);
    } catch (error) {
      console.error('[StreetViewControl] Failed to save Street View photo:', error);
      showFeedback('Lưu ảnh Street View vào đối tượng thất bại.');
    }
  }, [applyFeaturePatch, projectId, targetFeatureId, selectedFeatureId, state?.features, queueEvent, selectFeature, showFeedback]);

  const syncPegmanState = useCallback(
    (payload: Partial<typeof pegmanState> & { source?: PegmanSource }) => {
      const current = latestPegmanState.current;
      const nextHeading =
        payload.heading !== undefined ? normalizeHeading(payload.heading) : current.heading;
      const nextFov = payload.fov !== undefined ? clampFov(payload.fov) : current.fov;
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
      if (!canUpdatePegmanMarker(map, pegmanMarkerRef.current)) {
        return;
      }

      const markerElement = pegmanMarkerRef.current?.getElement();
      const rotor = markerElement?.querySelector('.pegman-rotor');
      if (!(rotor instanceof HTMLElement)) {
        return;
      }

      const rotation = getPegmanRotationDegrees(nextHeading);
      rotor.style.transform = `rotate(${rotation}deg)`;
      rotor.style.transformOrigin = '50% 50%';
    },
    [map]
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
          
          const rawRotation = gis.rotation ?? meta.rotation ?? 0;
          const rotationStr = (typeof rawRotation === 'string' || typeof rawRotation === 'number') ? String(rawRotation) : '0';
          const rotation = parseFloat(rotationStr);
          nextHeading = mapRotationToHeading(rotation);

          const rawPanoId = gis.pano_id ?? meta.pano_id;
          panoId = (typeof rawPanoId === 'string' || typeof rawPanoId === 'number') ? String(rawPanoId) : '';
          
          const specs = getEffectiveCameraSpecs(feature, state?.settings, meta);
          const sensor =
            SENSOR_SIZES[specs.sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/3"'];
          
          const rawHfov = specsMeta.hfov ?? meta.hfov ?? calculateHFOV(sensor.width, specs.focalLength);
          const hfovStr = (typeof rawHfov === 'string' || typeof rawHfov === 'number') ? String(rawHfov) : '90';
          nextFov = parseFloat(hfovStr);
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
            void injectCropButton();
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

          newWindow.once('tauri://created', () => {
            syncPegmanState({ windowOpen: true, source: 'map' });
            window.setTimeout(() => {
              void injectCleanup();
              void injectSurvivorSync();
              void injectCropButton();
            }, 1200);
          });

          newWindow.once('tauri://error', () => {
            syncPegmanState({ windowOpen: false });
            showFeedback('Không tạo được cửa sổ Street View.');
          });
        }

        return true;
      } catch (error) {
        console.error('[StreetViewControl] Failed to manage Street View window:', error);
        showFeedback('Street View gặp lỗi khi khởi tạo.');
        syncPegmanState({ windowOpen: false });
        return false;
      }
    },
    [injectCleanup, injectSurvivorSync, injectCropButton, selectedFeatureId, showFeedback, state, syncPegmanState]
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

    void injectCropButton();
    const intervalId = window.setInterval(() => {
      void injectCropButton();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [injectCropButton, pegmanState.windowOpen]);

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

        if (title && title.includes('SYNC_CROP:')) {
          const cropStr = title.substring(title.indexOf('SYNC_CROP:') + 'SYNC_CROP:'.length).split('|')[0].trim();
          const cropParts = cropStr.split(':');
          if (cropParts.length >= 2) {
            const reqId = cropParts[0];
            if (!processedCropRequestIds.current.has(reqId)) {
              processedCropRequestIds.current.add(reqId);
              const coords = cropParts[1].split(',').map(Number);
              if (coords.length === 4 && coords.every((n) => !isNaN(n))) {
                void handleStreetViewCropRequest(coords[0], coords[1], coords[2], coords[3]);
              }
            }
          }
        }

        if (title && title.includes('SYNC_POS:')) {
          syncPayload = title.substring(title.indexOf('SYNC_POS:') + 'SYNC_POS:'.length).split('|')[0].trim();
        } else {
          const rawUrl = (await invoke('get_webview_url', {
            label: STREET_VIEW_WINDOW_LABEL
          })) as string;
          const parsed = parseStreetViewUrl(rawUrl);
          if (!parsed) {
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
  }, [closeStreetViewSession, handleStreetViewCropRequest, injectSurvivorSync, pegmanState.windowOpen, syncPegmanState]);

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
  const shouldRenderPegman = shouldShowPegman && !!location && pegmanPaneReady;

  useEffect(() => {
    if (!shouldShowPegman) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPegmanSelected(false);
    }
  }, [shouldShowPegman]);

  useEffect(() => {
    const marker = pegmanMarkerRef.current;
    if (
      !marker ||
      !canUpdatePegmanMarker(map, marker) ||
      !shouldRenderPegman ||
      !location ||
      isDraggingPegmanRef.current
    ) {
      return;
    }

    marker.setLatLng(new L.LatLng(location[0], location[1]));
  }, [location, map, shouldRenderPegman]);

  useEffect(() => {
    const marker = pegmanMarkerRef.current;
    if (!marker || !canUpdatePegmanMarker(map, marker) || !shouldRenderPegman || !location) {
      return;
    }

    marker.setIcon(createPegmanIcon(heading, fov, isPegmanSelected));
    window.requestAnimationFrame(() => {
      applyPegmanDomRotation(heading);
    });
  }, [applyPegmanDomRotation, fov, heading, isPegmanSelected, location, map, shouldRenderPegman]);

  useEffect(() => {
    if (!shouldRenderPegman || !canUpdatePegmanMarker(map, pegmanMarkerRef.current)) {
      return;
    }

    applyPegmanDomRotation(heading);
  }, [applyPegmanDomRotation, heading, map, shouldRenderPegman]);

  const controlButton = container
    ? createPortal(
        <button
          onClick={() => setIsActive((value) => !value)}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all duration-300 ${
            isActive
              ? 'bg-cad-accent/20 ring-2 ring-cad-active/70 shadow-lg shadow-cad-accent/10'
              : hasStreetViewWindow
                ? 'bg-cad-surface hover:bg-cad-elevated'
                : 'bg-transparent hover:bg-cad-text-primary/10'
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

      {shouldRenderPegman && (
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
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-cad-toast bg-cad-elevated/92 border border-cad-accent/25 text-cad-accent px-5 py-2 rounded-full shadow-2xl text-[10px] uppercase font-bold tracking-[0.22em] backdrop-blur-md flex items-center gap-3">
          <div className="w-2 h-2 bg-cad-active rounded-full animate-pulse" />
          <span>
            {feedback ||
              `Chon vi tri de mo Street View | ${formatCoords(pegmanState.location)}`}
          </span>
        </div>
      )}

      {showTargetFeaturePicker && pendingStreetViewCroppedImage && (
        <div className="fixed inset-0 z-cad-modal-nested bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-cad-surface border border-cad-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-cad-text-primary font-mono">
            <div className="flex items-center justify-between border-b border-cad-border pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-cad-accent">Chọn đối tượng đính kèm ảnh</h3>
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                ariaLabel="Đóng"
                onClick={() => setShowTargetFeaturePicker(false)}
              />
            </div>

            <div className="aspect-video w-full rounded border border-cad-border overflow-hidden bg-cad-bg flex items-center justify-center">
              <img src={pendingStreetViewCroppedImage} alt="Street View Crop" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-secondary uppercase tracking-wider">Đối tượng nhận ảnh (Feature Target)</label>
              <select
                value={targetFeatureId || ''}
                onChange={(e) => setTargetFeatureId(e.target.value || null)}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-2 text-xs text-cad-text-primary outline-none focus:border-cad-accent"
              >
                <option value="">-- Chọn đối tượng trong dự án --</option>
                {Object.values(state?.features || {}).map((feat) => (
                  <option key={feat.id} value={feat.id}>
                    {getCleanName(feat) || feat.id} ({feat.geom_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-cad-border">
              <Button
                variant="secondary"
                size="md"
                className="uppercase"
                onClick={() => setShowTargetFeaturePicker(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="md"
                className="uppercase"
                disabled={!targetFeatureId}
                onClick={() => {
                  setShowTargetFeaturePicker(false);
                  setShowStreetViewImageEditor(true);
                }}
              >
                Chỉnh sửa & Lưu ảnh
              </Button>
            </div>
          </div>
        </div>
      )}

      {showStreetViewImageEditor && pendingStreetViewCroppedImage && (
        <ImageEditorModal
          imageUrl={pendingStreetViewCroppedImage}
          title="CHỈNH SỬA ẢNH STREET VIEW"
          saveLabel="LƯU ẢNH VÀO ĐỐI TƯỢNG"
          onCancel={() => {
            setShowStreetViewImageEditor(false);
            setPendingStreetViewCroppedImage(null);
          }}
          onSave={async (result) => {
            await handleSaveStreetViewPhoto(result);
          }}
        />
      )}
    </>
  );
}
