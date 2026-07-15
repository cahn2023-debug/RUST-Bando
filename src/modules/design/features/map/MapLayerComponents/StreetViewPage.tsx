import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { StreetViewJS } from '../Palette/StreetViewJS';
import { getGoogleMapsApiKey } from '@TOOL/utils/googleMapsRuntime';

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;

const parseStreetViewLocation = () => {
  const pathname = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  const match = pathname.match(/@([-?\d.]+),([-?\d.]+)(?:,([\d.]+)y)?(?:,([\d.]+)t)?/);

  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
      fov: match[3] ? parseFloat(match[3]) : 90,
      heading: match[4] ? normalizeHeading(parseFloat(match[4])) : 0
    };
  }

  const lat = search.get('lat');
  const lng = search.get('lng');
  if (lat && lng) {
    return {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      heading: normalizeHeading(parseFloat(search.get('heading') || '0')),
      fov: parseFloat(search.get('fov') || '90')
    };
  }

  return null;
};

const StreetViewPage: React.FC = () => {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [heading, setHeading] = useState<number>(0);
  const [fov, setFov] = useState<number>(90);

  useEffect(() => {
    const parsed = parseStreetViewLocation();
    if (parsed) {
      setLat(parsed.lat);
      setLng(parsed.lng);
      setHeading(parsed.heading);
      setFov(parsed.fov);
    }

    const unlistenLocation = listen<{ lat: number; lng: number; heading?: number; fov?: number }>(
      'location-change',
      (event) => {
        setLat(event.payload.lat);
        setLng(event.payload.lng);
        setHeading(normalizeHeading(event.payload.heading ?? 0));
        setFov(event.payload.fov ?? 90);
      }
    );

    const key = getGoogleMapsApiKey();
    setApiKey(key);

    const root = document.documentElement;
    const body = document.body;
    root.classList.add('streetview-window');
    body.classList.add('streetview-window');
    root.style.colorScheme = 'light';
    body.style.colorScheme = 'light';
    document.title = 'Street View';

    return () => {
      unlistenLocation.then((fn) => fn());
      root.classList.remove('streetview-window');
      body.classList.remove('streetview-window');
      root.style.removeProperty('color-scheme');
      body.style.removeProperty('color-scheme');
    };
  }, []);

  if (lat === null || lng === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Đang tải dữ liệu vị trí
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden bg-white streetview-window-container"
      style={{
        colorScheme: 'light',
        background: '#ffffff',
        filter: 'none'
      }}
    >
      <StreetViewJS lat={lat} lng={lng} heading={heading} fov={fov} apiKey={apiKey} />
    </div>
  );
};

export default StreetViewPage;
