import { useRef, useEffect, useMemo } from "react";
import { MapLayer } from "@DESIGN/features/map/MapLayer";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useCanvasInteraction } from "@IMPLEMENT/hooks/useCanvasInteraction";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";
import { MapProvider } from "@DESIGN/features/map/MapContext";
import { Device3DViewport, type Device3DProps } from "@DESIGN/components/3d/DeviceMeshes3D";
import { getFeatureDisplayInfo, getPointCoordinates } from "@TOOL/utils/featureUtils";

const INITIAL_CENTER: [number, number] = [21.0285, 105.8542];

// Convert Lat/Lng to local meters relative to initial center
function latLngToMeters(lat: number, lng: number, centerLat: number = INITIAL_CENTER[0], centerLng: number = INITIAL_CENTER[1]): [number, number] {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLng = ((lng - centerLng) * Math.PI) / 180;
  const x = dLng * R * Math.cos((centerLat * Math.PI) / 180);
  const z = -dLat * R;
  return [x, z];
}

function CADCanvasContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerZoomExtend = useDesignSync(s => s.triggerZoomExtend);
  const show3DMode = useDesignSync(s => s.show3DMode);
  const state = useDesignSync(s => s.state);
  const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
  const selectFeature = useDesignSync(s => s.selectFeature);

  useEffect(() => {
    // Trigger auto-zoom on mount (when entering Design tab)
    triggerZoomExtend();
  }, [triggerZoomExtend]);

  useCanvasInteraction();
  const { handleLocationChange, finalizePolyline, finishDrawingSession } = useDrawingInteraction();

  // Prepare 3D device list from active design state features
  const devices3D = useMemo<Device3DProps[]>(() => {
    if (!state?.features) return [];
    const list: Device3DProps[] = [];

    Object.values(state.features).forEach((f) => {
      if (!f) return;
      const geom = String(f.geom_type || '').toUpperCase();
      if (geom.includes('LINE') || geom.includes('POLYLINE') || geom.includes('POLYGON') || geom === 'NETWORKLINK') return;

      const coords = getPointCoordinates(f);
      if (!coords) return;
      const [lng, lat] = coords;
      const [x, z] = latLngToMeters(lat, lng);
      const displayInfo = getFeatureDisplayInfo(f);

      list.push({
        id: f.id,
        name: f.name || 'Thiết bị',
        iconKey: displayInfo.iconKey,
        position: [x, 0, z],
        rotation: Number((f.metadata as any)?.gis?.rotation || 0),
        pitch: Number((f.metadata as any)?.gis?.pitch || 0),
        color: displayInfo.color,
        metadata: f.metadata as any,
      });
    });

    return list;
  }, [state?.features]);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden group bg-[#0b0f19] pointer-events-auto">
      {/* 2D CAD Canvas Layer View */}
      <div className={`absolute inset-0 z-0 pointer-events-auto transition-opacity duration-300 ${show3DMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <MapLayer
          center={INITIAL_CENTER}
          zoom={13}
          onLocationChange={handleLocationChange}
          onFinishDrawing={finalizePolyline}
          onFinishDrawingSession={finishDrawingSession}
        />
      </div>

      {/* 3D Viewport Space */}
      {show3DMode && (
        <div className="absolute inset-0 z-10 pointer-events-auto animate-in fade-in duration-300">
          <Device3DViewport
            devices={devices3D}
            selectedId={selectedFeatureId}
            onSelectDevice={(id) => selectFeature(id)}
          />
        </div>
      )}
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
