import { useRef, useEffect, useState } from "react";
import { MapLayer } from "@DESIGN/features/map/MapLayer";
import { CoordinatePanel } from "@DESIGN/components/core/CoordinatePanel";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useCanvasInteraction } from "@IMPLEMENT/hooks/useCanvasInteraction";
import { MapSearchBar } from "@DESIGN/features/map/MapLayerComponents/MapSearchBar";
import { CADNavigation } from "@DESIGN/components/core/CADNavigation";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";
import { MapProvider, useMapContext } from "@DESIGN/features/map/MapContext";
import { useMapStyles } from "@DESIGN/features/map/useMapStyles";
import { Layers } from "lucide-react";

const INITIAL_CENTER: [number, number] = [21.0285, 105.8542];

function CADCanvasContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerZoomExtend = useDesignSync(s => s.triggerZoomExtend);
  const [isMeasureActive, setIsMeasureActive] = useState(false);
  const { basemapId, setBasemapId } = useMapStyles();

  let map: maplibregl.Map | null = null;
  try {
    map = useMapContext().map;
  } catch {
    // Optional MapContext
  }

  useEffect(() => {
    // Trigger auto-zoom on mount (when entering Design tab)
    triggerZoomExtend();
  }, [triggerZoomExtend]);

  useCanvasInteraction();
  const { handleLocationChange, finalizePolyline, finishDrawingSession } = useDrawingInteraction();

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("GPS Location:", pos.coords.latitude, pos.coords.longitude);
        map?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
      },
      (err) => console.error("Geolocation error:", err.message),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const toggleBasemap = () => {
    const nextStyle = basemapId === 'satellite' ? 'dark' : 'satellite';
    setBasemapId(nextStyle);
  };

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden group bg-transparent pointer-events-none">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <MapLayer
          center={INITIAL_CENTER}
          zoom={13}
          onLocationChange={handleLocationChange}
          onFinishDrawing={finalizePolyline}
          onFinishDrawingSession={finishDrawingSession}
          isMeasureActive={isMeasureActive}
          onMeasureDeactivate={() => setIsMeasureActive(false)}
        />
      </div>

      <div className="pointer-events-auto">
        <MapSearchBar />
      </div>

      <div className="absolute top-4 right-4 z-30 pointer-events-auto">
        <button
          onClick={toggleBasemap}
          title={`Chuyển lớp bản đồ (Hiện tại: ${basemapId === 'satellite' ? 'Vệ tinh' : 'Bản đồ'})`}
          className="p-2 bg-cad-surface/90 border border-cad-border text-cad-text-primary hover:text-cad-accent hover:border-cad-accent backdrop-blur-md rounded-md shadow-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
        >
          <Layers size={14} className="text-cad-accent" />
          <span>{basemapId === 'satellite' ? 'VỆ TINH' : 'BẢN ĐỒ'}</span>
        </button>
      </div>

      <div className="pointer-events-auto">
        <CADNavigation
          onLocateMe={handleLocateMe}
          onZoomIn={() => map?.zoomIn()}
          onZoomOut={() => map?.zoomOut()}
          onZoomExtend={triggerZoomExtend}
          isMeasureActive={isMeasureActive}
          onToggleMeasure={() => setIsMeasureActive((active) => !active)}
        />
      </div>

      <div className="pointer-events-auto">
        <CoordinatePanel />
      </div>
    </div>
  );
}

export function CADCanvas() {
  return (
    <MapProvider>
      <CADCanvasContent />
    </MapProvider>
  );
}
