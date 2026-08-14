import { useRef, useEffect } from "react";
import { MapLayer } from "@DESIGN/features/map/MapLayer";
import { CoordinatePanel } from "@DESIGN/components/core/CoordinatePanel";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useCanvasInteraction } from "@IMPLEMENT/hooks/useCanvasInteraction";
import { MapSearchBar } from "@DESIGN/features/map/MapLayerComponents/MapSearchBar";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";
import { MapProvider } from "@DESIGN/features/map/MapContext";

const INITIAL_CENTER: [number, number] = [21.0285, 105.8542];

function CADCanvasContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerZoomExtend = useDesignSync(s => s.triggerZoomExtend);

  useEffect(() => {
    // Trigger auto-zoom on mount (when entering Design tab)
    triggerZoomExtend();
  }, [triggerZoomExtend]);

  useCanvasInteraction();
  const { handleLocationChange, finalizePolyline, finishDrawingSession } = useDrawingInteraction();

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden group bg-transparent pointer-events-none">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <MapLayer
          center={INITIAL_CENTER}
          zoom={13}
          onLocationChange={handleLocationChange}
          onFinishDrawing={finalizePolyline}
          onFinishDrawingSession={finishDrawingSession}
        />
      </div>

      <div className="pointer-events-auto">
        <MapSearchBar />
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
