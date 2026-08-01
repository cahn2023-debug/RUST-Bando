import React, { useLayoutEffect, useState, useRef } from "react";
import "./PersistentMapHost.css";
import { MapBootstrapSurface } from "./MapBootstrapSurface";
import { BasemapErrorBoundary, OverlayErrorBoundary } from "./MapErrorBoundaries";
import { getBootstrapMetadata, type MapBootstrapMetadata } from "./bootstrapMetadata";
import { markMapStartup } from "./mapStartupTelemetry";
import { MapLibreFastRenderer } from "./MapLibreFastRenderer";
import { useMapStyles } from "./useMapStyles";

interface PersistentMapHostProps {
  initialMetadata?: MapBootstrapMetadata;
  children?: React.ReactNode;
}

export const PersistentMapHost: React.FC<PersistentMapHostProps> = ({
  initialMetadata,
  children,
}) => {
  const [bootstrapMeta] = useState<MapBootstrapMetadata>(() => {
    return initialMetadata || getBootstrapMetadata();
  });
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  const { getStyledTiles, mapKey, activeBasemapPreset } = useMapStyles();
  const basemapTiles = getStyledTiles();

  useLayoutEffect(() => {
    markMapStartup("host-mounted", {
      center: bootstrapMeta.center,
      zoom: bootstrapMeta.zoom,
    });
  }, [bootstrapMeta]);

  return (
    <div ref={hostRef} className="persistent-map-host">
      {/* P0 DOM Surface background & Cached Preview */}
      <MapBootstrapSurface isVisible={!firstFrameRendered} />

      {/* P0 Basemap Subsystem in isolated Error Boundary */}
      <BasemapErrorBoundary>
        <div className="maplibre-host-container">
          <MapLibreFastRenderer
            center={[bootstrapMeta.center[1], bootstrapMeta.center[0]]}
            zoom={bootstrapMeta.zoom}
            basemapTiles={basemapTiles}
            basemapKey={mapKey}
            basemapPreset={activeBasemapPreset}
            onFirstFrameRendered={() => {
              setFirstFrameRendered(true);
              markMapStartup("first-render");
            }}
          />
        </div>
      </BasemapErrorBoundary>

      {/* P0 Feature Overlay in isolated Error Boundary */}
      {overlayEnabled && (
        <OverlayErrorBoundary
          onError={(err) => {
            console.warn("[PersistentMapHost] Disabling overlay subsystem due to crash:", err);
            setOverlayEnabled(false);
          }}
        >
          {/* Overlay content rendered via MapLibreFastRenderer custom WebGL layer */}
        </OverlayErrorBoundary>
      )}

      {children}
    </div>
  );
};
