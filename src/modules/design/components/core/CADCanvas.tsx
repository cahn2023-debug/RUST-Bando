import { useRef, useEffect, useState } from "react";
import { MapLayer } from "@DESIGN/features/map/MapLayer";
import { CoordinatePanel } from "@DESIGN/components/core/CoordinatePanel";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useCanvasInteraction } from "@IMPLEMENT/hooks/useCanvasInteraction";
import { MapSearchBar } from "@DESIGN/features/map/MapLayerComponents/MapSearchBar";
import { CADNavigation } from "@DESIGN/components/core/CADNavigation";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";
import { MapProvider, useMapContext } from "@DESIGN/features/map/MapContext";

const INITIAL_CENTER: [number, number] = [21.0285, 105.8542];

function CADCanvasContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerZoomExtend = useDesignSync(s => s.triggerZoomExtend);
  const [isMeasureActive, setIsMeasureActive] = useState(false);
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

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden group">
      <div className="absolute inset-0 z-0 pointer-events-auto">
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

      <MapSearchBar />

      <CADNavigation
        onLocateMe={handleLocateMe}
        onZoomIn={() => map?.zoomIn()}
        onZoomOut={() => map?.zoomOut()}
        onZoomExtend={triggerZoomExtend}
        isMeasureActive={isMeasureActive}
        onToggleMeasure={() => setIsMeasureActive((active) => !active)}
      />

      <CoordinatePanel />
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
