import React from "react";
import { Folder } from "lucide-react";
import { getFeatureDisplayInfo } from "@TOOL/utils/featureUtils";

export interface GroupIconProps {
    type?: string;
    name?: string;
    size?: number;
    className?: string;
    color?: string;
}

const getGroupGeometryHint = (type?: string, name?: string): string => {
    const lowerType = (type || "").toLowerCase();
    const lowerName = (name || "").toLowerCase();
    if (lowerType.includes("line") || lowerType.includes("polyline") || lowerName.includes("tuyến")) return "LineString";
    if (lowerType.includes("polygon") || lowerName.includes("vùng")) return "Polygon";
    return "Point";
};

export const GroupIcon = React.memo(({ type, name, size = 12, className, color }: GroupIconProps) => {
    const lowerType = (type || "").toLowerCase();
    const lowerName = (name || "").toLowerCase();

    if (lowerType === "folder" || lowerName.includes("thư mục") || lowerName.includes("nhóm")) {
        return <Folder size={size} className={className} style={{ color }} />;
    }

    const displayInfo = getFeatureDisplayInfo(
        {
            geom_type: getGroupGeometryHint(type, name),
            name,
            metadata: { type },
            properties: { type },
        },
        type,
        name,
        { type, color }
    );
    const Icon = displayInfo.icon;

    return <Icon size={size} className={className} style={{ color: color || displayInfo.color }} />;
});
