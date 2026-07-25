import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Eye, EyeOff, Check, ChevronDown, Sliders, Maximize2,
    Layers, Camera, Video, Monitor, Info
} from 'lucide-react';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import { useDesignSync, DesignEventType } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureUtils';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const CAMERA_TYPES = [
    { id: 'cctv', label: 'CCTV / Camera', icon: Camera },
    { id: 'ptz', label: 'Camera PTZ', icon: Video },
    { id: 'speed', label: 'Camera Tốc độ', icon: Monitor },
    { id: 'lpr', label: 'Camera LPR', icon: Info },
];

export const VisibilityTool: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    // FOV State
    const { showFovTypes, setShowFovTypes, toggleFovType } = useSettingsStore();
    const { state, dispatchEvents, showFeatureGroups, setShowFeatureGroups, showDORILayers, setShowDORILayers } = useDesignSync();

    const [bulkAngle, setBulkAngle] = useState(60);
    const [bulkRadius, setBulkRadius] = useState(50);
    const [isApplying, setIsApplying] = useState(false);

    const fovCount = showFovTypes.length;
    const isAnyFovVisible = fovCount > 0;
    const isAnyActive = isAnyFovVisible || showFeatureGroups || showDORILayers;

    // Update coordinates when opening
    useLayoutEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 8,
                left: rect.left + rect.width / 2
            });
        }
    }, [isOpen]);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = document.getElementById('visibility-dropdown');
            if (
                containerRef.current && !containerRef.current.contains(event.target as Node) &&
                dropdown && !dropdown.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleBulkUpdate = async () => {
        if (!state?.features || !state?.feature_groups) return;
        setIsApplying(true);

        try {
            const events: DesignEventType[] = [];

            Object.entries(state.features).forEach(([id, feature]) => {
                if (!feature.group_id) return;
                const group = state.feature_groups[feature.group_id];
                if (!group) return;

                const metadata = typeof feature.metadata === 'string'
                    ? JSON.parse(feature.metadata)
                    : (feature.metadata || {});

                const displayInfo = getFeatureDisplayInfo(feature, group.type, group.name, metadata);

                if (displayInfo.isCamera) {
                    const newMetadata = {
                        ...metadata,
                        gis: {
                            ...(metadata.gis || {}),
                            fov_angle: bulkAngle,
                            fov_radius: bulkRadius,
                            fov_visible: true
                        }
                    };

                    events.push({
                        type: 'FeatureUpdated',
                        payload: {
                            id,
                            metadata: JSON.stringify(newMetadata)
                        }
                    });
                }
            });

            if (events.length > 0) {
                console.log(`[VisibilityTool] Bulk updating ${events.length} cameras...`);
                await dispatchEvents(events);
            }
        } catch (err) {
            console.error("Bulk update failed:", err);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex flex-col items-center gap-1 group transition-all",
                    isOpen || isAnyActive ? "text-cad-accent" : "text-cad-text-primary hover:text-cad-accent"
                )}
            >
                <div className={cn(
                    "p-2 rounded group-hover:bg-cad-surface transition-colors relative",
                    (isOpen || isAnyActive) && "bg-cad-surface border border-cad-border text-cad-accent shadow-sm"
                )}>
                    {isAnyFovVisible ? <Eye size={20} strokeWidth={1.5} /> : <EyeOff size={20} strokeWidth={1.5} />}
                    <div className="absolute -bottom-0.5 -right-0.5 bg-cad-accent text-black rounded-full p-0.5 scale-[0.6]">
                        <ChevronDown size={12} strokeWidth={3} />
                    </div>
                </div>
                <span className="text-[9px] font-mono font-bold leading-none uppercase">VISIBILITY</span>
            </button>

            {isOpen && createPortal(
                <div
                    id="visibility-dropdown"
                    className="fixed w-72 bg-cad-elevated border border-cad-border rounded-lg shadow-2xl z-cad-dropdown p-1 animate-in fade-in zoom-in duration-150 overflow-hidden"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="flex flex-col gap-1">
                        {/* Section: CAMERA FOV */}
                        <div className="px-3 py-2 bg-white/5 rounded-t">
                            <span className="text-[9px] font-black text-cad-accent uppercase tracking-widest flex items-center gap-2">
                                <Camera size={12} /> CAMERA FOV
                            </span>
                        </div>

                        <div className="flex gap-1 px-1">
                            <button
                                onClick={() => setShowFovTypes(CAMERA_TYPES.map(t => t.id))}
                                className="flex-1 flex items-center justify-center gap-2 px-2 py-2 text-[9px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black rounded transition-all border border-cad-border/30 uppercase"
                            >
                                <Eye size={12} /> Bật tất cả
                            </button>
                            <button
                                onClick={() => setShowFovTypes([])}
                                className="flex-1 flex items-center justify-center gap-2 px-2 py-2 text-[9px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black rounded transition-all border border-cad-border/30 uppercase"
                            >
                                <EyeOff size={12} /> Tắt tất cả
                            </button>
                        </div>

                        <div className="px-1 grid grid-cols-2 gap-1">
                            {CAMERA_TYPES.map(type => {
                                const isActive = showFovTypes.includes(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => toggleFovType(type.id)}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-2 text-[9px] font-bold rounded transition-colors text-left border border-transparent",
                                            isActive
                                                ? "text-cad-accent bg-cad-accent/10 border-cad-accent/20"
                                                : "text-cad-text-muted hover:bg-white/5"
                                        )}
                                    >
                                        <type.icon size={12} className={isActive ? "text-cad-accent" : "text-cad-text-muted"} />
                                        <span>{type.label}</span>
                                        {isActive && <Check size={10} className="ml-auto" />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Bulk Update Controls */}
                        <div className="m-1 p-2 bg-black/40 rounded border border-cad-border/20 space-y-3">
                            <div className="flex items-center gap-1.5 text-blue-400">
                                <Sliders size={12} />
                                <span className="text-[8px] font-black uppercase tracking-wider">Cấu hình hàng loạt</span>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-cad-text-muted uppercase">
                                        <span>Góc mở (FOV)</span>
                                        <span className="text-cad-accent">{bulkAngle}°</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10"
                                        max="180"
                                        value={bulkAngle}
                                        onChange={(e) => setBulkAngle(Number(e.target.value))}
                                        className="w-full h-1 bg-cad-border/30 rounded-lg appearance-none cursor-pointer accent-cad-accent"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-cad-text-muted uppercase">
                                        <span>Tầm nhìn (m)</span>
                                        <span className="text-cad-accent">{bulkRadius}m</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="500"
                                        value={bulkRadius}
                                        onChange={(e) => setBulkRadius(Number(e.target.value))}
                                        className="w-full h-1 bg-cad-border/30 rounded-lg appearance-none cursor-pointer accent-cad-accent"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleBulkUpdate}
                                disabled={isApplying}
                                className="w-full py-2 bg-cad-accent hover:bg-white disabled:opacity-50 text-black text-[9px] font-black uppercase rounded transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-cad-accent/10 mt-1"
                            >
                                <Maximize2 size={12} />
                                {isApplying ? 'Đang cập nhật...' : 'Áp dụng cho cameras'}
                            </button>
                        </div>

                        <div className="h-[1px] bg-cad-border/30 my-1 mx-2" />

                        {/* Section: MAP LAYERS */}
                        <div className="px-3 py-1">
                            <span className="text-[9px] font-black text-cad-accent uppercase tracking-widest flex items-center gap-2">
                                <Layers size={12} /> MAP LAYERS
                            </span>
                        </div>

                        <div className="px-1 flex flex-col gap-1">
                            <button
                                onClick={() => setShowFeatureGroups(!showFeatureGroups)}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 text-[10px] font-bold rounded transition-all border border-transparent",
                                    showFeatureGroups
                                        ? "text-cad-accent bg-cad-accent/10 border-cad-accent/20"
                                        : "text-cad-text-muted hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Layers size={14} />
                                    <span>GOM NHÓM ĐỐI TƯỢNG</span>
                                </div>
                                {showFeatureGroups && <Check size={14} />}
                            </button>

                            <button
                                onClick={() => setShowDORILayers(!showDORILayers)}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 text-[10px] font-bold rounded transition-all border border-transparent",
                                    showDORILayers
                                        ? "text-orange-400 bg-orange-400/10 border-orange-400/20"
                                        : "text-cad-text-muted hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Eye size={14} />
                                    <span>VÙNG PHỦ DORI</span>
                                </div>
                                {showDORILayers && <Check size={14} />}
                            </button>
                        </div>

                        <div className="p-3 bg-cad-surface/50 mt-1">
                            <p className="text-[8px] text-cad-text-muted italic leading-relaxed text-center">
                                * Sử dụng phím tắt <span className="text-cad-accent font-bold">V</span> để chuyển đổi nhanh các chế độ hiển thị.
                            </p>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
