import { useRef, useEffect } from "react";
import { MapLayer } from "@DESIGN/features/map/MapLayer";
import { CoordinatePanel } from "@DESIGN/components/core/CoordinatePanel";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useCanvasInteraction } from "@IMPLEMENT/hooks/useCanvasInteraction";
import { MapSearchBar } from "@DESIGN/features/map/MapLayerComponents/MapSearchBar";
import { CADNavigation } from "@DESIGN/components/core/CADNavigation";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";

export function CADCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerZoomExtend = useDesignSync(s => s.triggerZoomExtend);

  useEffect(() => {
    // Trigger auto-zoom on mount (when entering Design tab)
    triggerZoomExtend();
  }, [triggerZoomExtend]);

  useCanvasInteraction();
  const { handleLocationChange, finalizePolyline } = useDrawingInteraction();

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => console.log("GPS Location:", pos.coords.latitude, pos.coords.longitude),
      (err) => console.error("Geolocation error:", err.message),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden group">
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <MapLayer
          center={[21.0285, 105.8542]}
          zoom={13}
          onLocationChange={handleLocationChange}
          onFinishDrawing={finalizePolyline}
        />
      </div>

      <MapSearchBar />

      <CADNavigation
        onLocateMe={handleLocateMe}
        onZoomIn={() => {/* Leaflet handles zoom via container if needed, or we use map instance */ }}
        onZoomOut={() => { }}
        onZoomExtend={triggerZoomExtend}
      />

      <CoordinatePanel />
    </div>
  );
}
