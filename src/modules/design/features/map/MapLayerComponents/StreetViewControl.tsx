import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMap, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { invoke } from '@tauri-apps/api/core';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getEffectiveCameraSpecs, getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { calculateHFOV, mapRotationToHeading, SENSOR_SIZES } from '@TOOL/utils/cameraMath';

// SVG Pegman icon component with Dynamic FOV
function PegmanIcon({ isActive, heading = 0, fov = 90 }: { isActive: boolean, heading?: number, fov?: number }) {
  const color = '#10B981'; // Emerald-500
  const fovColor = 'rgba(16,185,129,0.15)';
  const glowColor = 'rgba(16,185,129,0.5)';

  // Calculate FOV Arc Path
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
      style={{ transform: `rotate(${heading}deg)` }}
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
        {/* Radar Effect */}
        {isActive && (
          <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1" style={{ animation: 'radar 1.5s infinite ease-out' }} />
        )}

        {/* FOV Sector */}
        {isActive && (
          <path d={fovPath} fill={fovColor} className="animate-pulse" />
        )}

        {/* Outer Ring */}
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

        {/* Camera Body (Top-down) */}
        <circle cx="6" cy="12" r="3" fill={color} />
        <circle cx="18" cy="12" r="3" fill={color} />
        <circle cx="12" cy="12" r="7" fill={color} />
        <circle cx="12" cy="12" r="3.5" fill="#F7DA4D" stroke="white" strokeWidth="1" />
        <path d="M12 5 L10 8 L14 8 Z" fill="white" />
      </svg>
    </div>
  );
}

// Custom Pegman Marker Icon for Leaflet
const createPegmanIcon = (heading: number, fov: number = 90) => {
  const color = '#10B981'; // Emerald-500
  const fovColor = 'rgba(16,185,129,0.25)';
  const radius = 24;
  const startAngle = (-fov / 2 - 90) * Math.PI / 180;
  const endAngle = (fov / 2 - 90) * Math.PI / 180;
  const x1 = 12 + radius * Math.cos(startAngle);
  const y1 = 12 + radius * Math.sin(startAngle);
  const x2 = 12 + radius * Math.cos(endAngle);
  const y2 = 12 + radius * Math.sin(endAngle);
  const largeArcFlag = fov > 180 ? 1 : 0;
  const fovPath = `M 12 12 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

  return L.divIcon({
    html: `
      <div style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); transform: rotate(${heading}deg);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
          <path d="${fovPath}" fill="${fovColor}" />
          <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="1" stroke-dasharray="2 2" opacity="0.4" />
          <circle cx="6" cy="12" r="3" fill="${color}" />
          <circle cx="18" cy="12" r="3" fill="${color}" />
          <circle cx="12" cy="12" r="7" fill="${color}" />
          <circle cx="12" cy="12" r="3.5" fill="#F7DA4D" stroke="white" stroke-width="1" />
          <path d="M12 5 L10 8 L14 8 Z" fill="white" />
        </svg>
      </div>
    `,
    className: 'custom-pegman-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const SURVIVOR_SYNC_SCRIPT = `
  (function() {
    // 1. CSS Cleanup
    const style = document.createElement('style');
    style.innerHTML = \`
      .widget-pane-section-back, .widget-minimap, .widget-minimap-shim,
      .widget-reveal-card, .scene-footer, .watermark, #minimap, .gm-style-cc { display: none !important; }
    \`;
    document.head.appendChild(style);
    
    const syncToTitle = () => {
      try {
        const url = window.location.href;
        const num = "(-?\\\\d+(?:\\\\.\\\\d+)?)";
        const latLngMatch = url.match(new RegExp("@" + num + "," + num)) || url.match(new RegExp("!3d" + num + "!4d" + num));
        
        const hMatch = url.match(/,(-?\\d+(?:\\.\\d+)?)h/) || url.match(/,(-?\\d+(?:\\.\\d+)?)y/);
        const fMatch = url.match(/,(\\d+(?:\\.\\d+)?)y/) || url.match(/,(\\d+(?:\\.\\d+)?)f/);
        
        if (latLngMatch) {
          const h = hMatch ? hMatch[1] : "0";
          const f = fMatch ? fMatch[1] : "90";
          const payload = "SYNC_POS:" + latLngMatch[1] + "," + latLngMatch[2] + "," + h + "," + f;

          window._SURVIVOR_PAYLOAD = payload;
          const baseTitle = document.title.replace(/SYNC_POS:[^ ]+/, "").replace(/^[ |]+/, "").trim();
          document.title = payload + " | " + baseTitle;
        }
      } catch(e) {
        console.warn('[StreetViewControl] Failed to sync position from URL:', e);
      }
    };

    // ⚔️ TITLE HIJACKING: Bắt cóc thuộc tính title để ngăn Google ghi đè
    try {
      if (!document.__titleHijacked) {
        let currentTitle = document.title;
        Object.defineProperty(document, 'title', {
          get: function() { return currentTitle; },
          set: function(val) {
            const payload = window._SURVIVOR_PAYLOAD || "";
            currentTitle = payload ? (payload + " | " + val.replace(/SYNC_POS:[^ ]+/, "").trim()) : val;
            // Cập nhật DOM thực tế
            const t = document.querySelector('title');
            if (t) t.innerText = currentTitle;
          },
          configurable: true
        });
        document.__titleHijacked = true;
      }
    } catch(e) {
      console.warn('[StreetViewControl] Failed to hijack title:', e);
    }

    // 🛡️ TITLE SYNC & CLEAN TITLE
    setInterval(syncToTitle, 1000);
    setInterval(() => {
      document.querySelectorAll('.gm-style-cc, .gmnoprint').forEach(el => (el.style.display = 'none'));
    }, 2000);
  })();
`;

export function StreetViewControl() {
  const map = useMap();
  const [isActive, setIsActive] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const pegmanState = useDesignSync((s) => s.pegmanState);
  const setPegmanState = useDesignSync((s) => s.setPegmanState);

  const selectedFeatureId = useDesignSync((s) => s.selectedFeatureId);
  const state = useDesignSync((s) => s.state);

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

  // Persistent Ref for the watcher
  const latestPegmanState = useRef(pegmanState);
  latestPegmanState.current = pegmanState;

  const lastInjectionRef = useRef(0);

  const injectSurvivorSync = useCallback(async (label: string) => {
    const now = Date.now();
    if (now - lastInjectionRef.current < 8000) return; // Cool-down 8s tránh spam
    lastInjectionRef.current = now;

    try {
      await invoke('eval_webview', { label, script: SURVIVOR_SYNC_SCRIPT });
      console.log('[StreetView] Survivor-Sync reinforced (Throttle OK).');
    } catch (err) {
      console.error('[StreetView] Injection failed:', err);
    }
  }, []);

  const openStreetViewWindow = useCallback(async (lat: number, lng: number) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      // Thống nhất label để tránh lỗi mở cửa sổ trùng ID hoặc không tìm thấy
      const label = 'street-view-window';

      const feature = selectedFeatureId ? state?.features?.[selectedFeatureId] : null;
      let nextHeading = pegmanState.heading;
      let nextFov = pegmanState.fov;
      let panoId = '';

      if (feature) {
        const meta = getParsedMetadata(feature);
        const rotation = parseFloat(meta?.gis?.rotation ?? meta.rotation ?? 0);
        // Chuyển đổi Rotation (CAD) sang Heading (Compass)
        nextHeading = mapRotationToHeading(rotation);

        // Hỗ trợ Pano ID nếu có trong metadata
        panoId = meta?.gis?.pano_id ?? meta.pano_id ?? '';

        const specs = getEffectiveCameraSpecs(feature, state?.settings, meta);
        const sensor = SENSOR_SIZES[specs.sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/3"'];
        nextFov = parseFloat(meta?.specs?.hfov ?? meta.hfov ?? calculateHFOV(sensor.width, specs.focalLength).toString());
      }

      setPegmanState({
        heading: nextHeading,
        fov: nextFov,
        location: [lat, lng]
      });

      let webview = await WebviewWindow.getByLabel(label);

      // 🔒 Áp đặt ràng buộc góc nhìn: Heading 0-270, Pitch 0 (Nhìn ngang)
      const h = Math.max(0, Math.min(270, nextHeading || 0));
      const p = 0; // Fixed horizontal
      const f = nextFov || 90;

      // 🌐 Cấu trúc Link Public chuẩn Google Street View (Ưu tiên pano nếu có)
      const panoParam = panoId ? `&pano=${panoId}` : '';
      const publicUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}${panoParam}&heading=${h}&pitch=${p}&fov=${f}`;

      if (webview) {
        // 🔄 Cập nhật tọa độ cho cửa sổ đang mở (Sử dụng Rust Bridge)
        await invoke('navigate_webview', { label, url: publicUrl });
        await webview.setFocus();
        await webview.show();

        // 💉 Re-inject after navigation (wait briefly for load)
        setTimeout(() => injectSurvivorSync(label), 3000);
      } else {
        // ✨ Tạo mới cửa sổ Street View với cấu trúc link chuẩn
        const projectTitle = (state as any)?.project?.name || 'Street View';
        let newWebview = new WebviewWindow(label, {
          url: publicUrl,
          title: `${projectTitle} | @${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          width: 1024,
          height: 768,
          minWidth: 400,
          minHeight: 300,
          visible: true,
          decorations: true,
          transparent: false,
          shadow: true,
          focus: true,
        } as any);

        newWebview.once('tauri://created', async () => {
          console.log('[StreetView] Public window created.');
          // 🔒 Survivor-Sync: Initial injection
          setTimeout(() => injectSurvivorSync(label), 3000);
        });

        newWebview.once('tauri://error', (e) => {
          console.error('[StreetView] Window creation error:', e);
        });
      }
    } catch (error) {
      console.error('Failed to manage Street View window:', error);
    }
  }, [selectedFeatureId, state, pegmanState.heading, pegmanState.fov, setPegmanState]);

  // 🛰️ Survivor Watcher: Optimized for CPU performance
  useEffect(() => {
    if (!isActive) return;

    let webviewRef: any = null;
    let isWindowAlive = true;

    const syncTask = async () => {
      try {
        if (!webviewRef) {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          webviewRef = await WebviewWindow.getByLabel('street-view-window');
        }

        if (!webviewRef || !isWindowAlive) return;

        const title = await webviewRef.title().catch(() => {
          isWindowAlive = false;
          return null;
        });

        if (!title) return;

        const syncMarker = "SYNC_POS:";
        let syncIdx = title.indexOf(syncMarker);
        let finalTitle = title;

        if (syncIdx === -1) {
          try {
            const rawUrl = await invoke('get_webview_url', { label: 'street-view-window' }) as string;
            const num = "(-?\\d+(?:\\.\\d+)?)";
            const m = rawUrl.match(new RegExp("@" + num + "," + num)) || rawUrl.match(new RegExp("!3d" + num + "!4d" + num));
            const hM = rawUrl.match(/,(-?\d+(?:\.\d+)?)h/) || rawUrl.match(/,(-?\d+(?:\.\d+)?)y/);
            const fM = rawUrl.match(/,(\d+(?:\.\d+)?)y/) || rawUrl.match(/,(\d+(?:\.\d+)?)f/);

            if (m) {
              const h = hM ? hM[1] : "0";
              const f = fM ? fM[1] : "90";
              finalTitle = `SYNC_POS:${m[1]},${m[2]},${h},${f}`;
              syncIdx = 0;
            }
          } catch (e) {
            console.warn('[StreetViewControl] Failed to parse streetview URL:', e);
          }
        }

        if (syncIdx === -1) {
          injectSurvivorSync('street-view-window');
          return;
        }

        const payload = finalTitle.substring(syncIdx + syncMarker.length).split('|')[0].trim();
        const parts = payload.split(',');

        if (parts.length >= 4) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          const heading = parseFloat(parts[2]);
          const fov = parseFloat(parts[3]);

          if (isNaN(lat) || isNaN(lng)) return;

          const current = latestPegmanState.current;
          const currentPos = current.location || [0, 0];
          const dist = Math.abs(lat - currentPos[0]) + Math.abs(lng - currentPos[1]);
          const hDiff = Math.abs(heading - (current.heading || 0));
          const fDiff = Math.abs(fov - (current.fov || 90));

          // Threshold cực nhạy nhưng có guard để tránh re-render thừa
          if (dist > 0.00000001 || hDiff > 0.01 || fDiff > 0.1) {
            setPegmanState({ location: [lat, lng], heading, fov });
          }
        }
      } catch (err) {
        webviewRef = null; // Reset on error
      }
    };

    const intervalId = setInterval(syncTask, 400);
    return () => {
      clearInterval(intervalId);
      isWindowAlive = false;
    };
  }, [isActive, injectSurvivorSync, setPegmanState]);

  useEffect(() => {
    if (!isActive) {
      setPegmanState({ active: false });
      return;
    }

    setPegmanState({ active: true });
    // Note: Local listeners disabled to avoid conflict with Title-Sync
  }, [isActive, setPegmanState]);


  useEffect(() => {
    if (!isActive) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      openStreetViewWindow(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [isActive, map, openStreetViewWindow]);

  const controlButton = container ? createPortal(
    <button
      onClick={() => setIsActive(!isActive)}
      className={`
        flex items-center justify-center 
        w-[36px] h-[36px] 
        bg-transparent rounded-full
        transition-all duration-300
        ${isActive
          ? 'bg-blue-600/20 ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent'
          : 'hover:bg-black/10'
        }
      `}
      title="Google Street View"
    >
      <PegmanIcon isActive={isActive} heading={0} fov={isActive ? pegmanState.fov : 90} />
    </button>,
    container
  ) : null;

  return (
    <>
      {controlButton}

      {isActive && (
        <TileLayer
          url="https://mt1.google.com/vt?lyrs=svv&style=40,18&hl=vi&gl=vn&x={x}&y={y}&z={z}"
          opacity={0.8}
          zIndex={1000}
        />
      )}

      {isActive && pegmanState.location && (
        <Marker
          position={new L.LatLng(pegmanState.location[0], pegmanState.location[1])}
          icon={createPegmanIcon(pegmanState.heading, pegmanState.fov)}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              openStreetViewWindow(position.lat, position.lng);
            },
          }}
          zIndexOffset={2000}
        />
      )}

      {isActive && !pegmanState.location && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[5000] bg-[#1C1D21] border border-emerald-500/30 text-emerald-400 px-6 py-2 rounded-full shadow-2xl text-[10px] uppercase font-bold tracking-widest backdrop-blur-md flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Chọn vị trí trên đường màu xanh để xem Street View
        </div>
      )}
    </>
  );
}
