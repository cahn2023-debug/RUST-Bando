import React from "react";
import { AlertTriangle, Square, MapPin } from "lucide-react";
import { PolylineIcon } from "@DESIGN/components/icons/MapIcons";
import { getFeatureDisplayInfo, getParsedMetadata } from "@TOOL/utils/featureUtils";
import type { FeatureState } from "@CONTRACT/types";

type FeatureIconProps = {
  feature: FeatureState;
  selected: boolean;
  groupType?: string;
  groupName?: string;
  previewMetadata?: { metadata: any };
};

export const FeatureIcon = React.memo(({ feature, selected, groupType, groupName, previewMetadata }: FeatureIconProps) => {
  const previewMeta = previewMetadata?.metadata;
  const baseMetadata = getParsedMetadata(feature);
  const providedMetadata = previewMeta
    ? { ...baseMetadata, ...previewMeta, gis: { ...((baseMetadata.gis || {}) as Record<string, unknown>), ...(previewMeta.gis || {}) } }
    : undefined;
  const { icon: Icon, color, gType, isUnmapped, mappingWarning } = getFeatureDisplayInfo(feature, groupType, groupName, providedMetadata);
  const iconProps = {
    size: 14,
    style: { color },
    className: "shrink-0",
  } as const;

  if (Icon) {
    const icon = <Icon {...iconProps} strokeWidth={1.85} />;
    return isUnmapped ? (
      <span className="relative inline-flex" title={mappingWarning} aria-label={mappingWarning}>
        {icon}
        <AlertTriangle size={7} className="absolute -right-1 -top-1 text-cad-warn" aria-hidden="true" />
      </span>
    ) : icon;
  }

  // Geometry based icons for non-special types
  if (gType === 'LINESTRING' || gType === 'POLYLINE') {
    return <PolylineIcon {...iconProps} />;
  }

  if (gType === 'POLYGON') {
    return <Square {...iconProps} strokeWidth={1.85} />;
  }

  return <MapPin {...iconProps} fill={selected ? color : "none"} strokeWidth={1.85} />;
});
