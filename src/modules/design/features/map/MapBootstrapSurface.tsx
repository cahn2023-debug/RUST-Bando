import React from "react";

interface MapBootstrapSurfaceProps {
  cachedPreviewUrl?: string | null;
  isVisible: boolean;
}

export const MapBootstrapSurface: React.FC<MapBootstrapSurfaceProps> = ({
  cachedPreviewUrl,
  isVisible,
}) => {
  if (!isVisible) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500 ease-out"
      style={{
        backgroundColor: "#e5e7eb", // neutral light background surface
        opacity: isVisible ? 1 : 0,
      }}
    >
      {cachedPreviewUrl && (
        <img
          src={cachedPreviewUrl}
          alt=""
          className="w-full h-full object-cover opacity-80 filter blur-[1px]"
        />
      )}
    </div>
  );
};
