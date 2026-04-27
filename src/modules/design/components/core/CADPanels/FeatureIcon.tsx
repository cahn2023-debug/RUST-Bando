import React from "react";
import { Square, MapPin } from "lucide-react";
import { PolylineIcon } from "@DESIGN/components/icons/MapIcons";
import { getFeatureDisplayInfo } from "@TOOL/utils/featureUtils";
import type { FeatureState } from "@CONTRACT/types";

export const FeatureIcon = React.memo(({ feature, selected, groupType, groupName }: { feature: FeatureState, selected: boolean, groupType?: string, groupName?: string }) => {
  const { icon: Icon, color, gType } = getFeatureDisplayInfo(feature, groupType, groupName);

  if (Icon) {
    return <Icon size={15} style={{ color }} className="shrink-0" />;
  }

  // Geometry based icons for non-special types
  if (gType === 'LINESTRING' || gType === 'POLYLINE') {
    return <PolylineIcon size={15} style={{ color }} className="shrink-0" />;
  }

  if (gType === 'POLYGON') {
    return <Square size={15} style={{ color }} className="shrink-0" />;
  }

  return <MapPin size={15} fill={selected ? color : "none"} className="shrink-0" style={{ color }} />;
});
