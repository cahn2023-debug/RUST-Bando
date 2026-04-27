import React from "react";
import { Folder, Network, Camera, Square, Circle, Video, ShieldAlert, Monitor, ArrowRightLeft } from "lucide-react";

export interface GroupIconProps {
    type?: string;
    name?: string;
    size?: number;
    className?: string;
    color?: string;
}

export const GroupIcon = React.memo(({ type, name, size = 12, className, color }: GroupIconProps) => {
    const lowerType = (type || "").toLowerCase();
    const lowerName = (name || "").toLowerCase();

    // Determine icon based on type or name
    if (lowerType === 'folder' || lowerName.includes('thư mục') || lowerName.includes('nhóm')) {
        return <Folder size={size} className={className} style={{ color }} />;
    }

    if (lowerType === 'intersection' || lowerName.includes('nút giao')) {
        return <Network size={size} className={className} style={{ color }} />;
    }

    if (lowerType === 'cctv' || lowerType === 'ptz' || lowerType === 'camera' || lowerName.includes('camera')) {
        if (lowerType === 'ptz') return <Video size={size} className={className} style={{ color }} />;
        return <Camera size={size} className={className} style={{ color }} />;
    }

    if (lowerType === 'speed' || lowerName.includes('tốc độ')) {
        return <ShieldAlert size={size} className={className} style={{ color }} />;
    }

    if (lowerType === 'lpr' || lowerName.includes('biển số')) {
        return <Monitor size={size} className={className} style={{ color }} />;
    }

    if (lowerType === 'polyline' || lowerType === 'line' || lowerName.includes('tuyến')) {
        return <ArrowRightLeft size={size} className={className} style={{ color }} />;
    }

    // Default icons based on common names or just a folder
    if (lowerName.includes('vùng') || lowerType === 'polygon') return <Square size={size} className={className} style={{ color }} />;
    if (lowerName.includes('điểm') || lowerType === 'point') return <Circle size={size} className={className} style={{ color }} />;

    return <Folder size={size} className={className} style={{ color }} />;
});
