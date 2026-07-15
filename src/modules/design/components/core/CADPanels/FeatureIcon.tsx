import React from "react";
import { Square, MapPin } from "lucide-react";
import { PolylineIcon } from "@DESIGN/components/icons/MapIcons";
import { getFeatureDisplayInfo } from "@TOOL/utils/featureUtils";
import type { FeatureState } from "@CONTRACT/types";

export const FeatureIcon = React.memo(({ feature, selected, groupType, groupName }: { feature: FeatureState, selected: boolean, groupType?: string, groupName?: string }) => {
  const { icon: Icon, color, gType } = getFeatureDisplayInfo(feature, groupType, groupName);
  const iconProps = {
    size: 14,
    style: { color },
    className: "shrink-0",
  } as const;

  if (Icon) {
    return <Icon {...iconProps} strokeWidth={1.85} />;
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
