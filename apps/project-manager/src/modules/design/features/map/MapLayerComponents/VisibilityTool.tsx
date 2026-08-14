import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Eye, EyeOff, Check, ChevronDown, Sliders, Maximize2,
    Layers, Camera, Video, Monitor, Info
} from 'lucide-react';
import { useSettingsStore } from '@CORE/stores/useSettingsStore';
import { useDesignSync, DesignEventType } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureUtils';
import { Button } from '@DESIGN/components/ui/Button';
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

const CAMERA_TYPE_IDS = CAMERA_TYPES.map(type => type.id);

const DROPDOWN_ID = 'visibility-dropdown';
const FOV_SECTION_ID = 'visibility-fov-heading';
const BULK_SECTION_ID = 'visibility-bulk-heading';
const LAYERS_SECTION_ID = 'visibility-layers-heading';
const BULK_ANGLE_ID = 'visibility-bulk-angle';
const BULK_RADIUS_ID = 'visibility-bulk-radius';

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
            const dropdown = document.getElementById(DROPDOWN_ID);
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

    const handleBulkUpdate = useCallback(async () => {
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
    }, [state, bulkAngle, bulkRadius, dispatchEvents]);

    const handleToggleOpen = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const handleEnableAllFov = useCallback(() => {
        setShowFovTypes(CAMERA_TYPE_IDS);
    }, [setShowFovTypes]);

    const handleDisableAllFov = useCallback(() => {
        setShowFovTypes([]);
    }, [setShowFovTypes]);

    const handleToggleFeatureGroups = useCallback(() => {
        setShowFeatureGroups(!showFeatureGroups);
    }, [setShowFeatureGroups, showFeatureGroups]);

    const handleToggleDORILayers = useCallback(() => {
        setShowDORILayers(!showDORILayers);
    }, [setShowDORILayers, showDORILayers]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={handleToggleOpen}
                aria-label="Tùy chọn hiển thị lớp bản đồ"
                aria-haspopup="true"
                aria-expanded={isOpen}
                aria-controls={isOpen ? DROPDOWN_ID : undefined}
                className={cn(
                    "flex flex-col items-center gap-1 group transition-all cursor-pointer",
                    isOpen || isAnyActive ? "text-cad-accent" : "text-cad-text-primary hover:text-cad-accent"
                )}
            >
                <div className={cn(
                    "p-2 rounded group-hover:bg-cad-surface transition-colors relative",
                    (isOpen || isAnyActive) && "bg-cad-surface border border-cad-border text-cad-accent shadow-sm"
                )}>
                    {isAnyFovVisible ? <Eye size={20} strokeWidth={1.5} aria-hidden="true" /> : <EyeOff size={20} strokeWidth={1.5} aria-hidden="true" />}
                    <div className="absolute -bottom-0.5 -right-0.5 bg-cad-accent text-black rounded-full p-0.5 scale-[0.6]">
                        <ChevronDown size={12} strokeWidth={3} aria-hidden="true" />
                    </div>
                </div>
                <span className="text-[9px] font-mono font-bold leading-none uppercase">VISIBILITY</span>
            </button>

            {isOpen && createPortal(
                <div
                    id={DROPDOWN_ID}
                    role="group"
                    aria-label="Tùy chọn hiển thị"
                    className="fixed w-72 bg-cad-elevated border border-cad-border rounded-lg shadow-2xl z-cad-dropdown p-1 animate-in fade-in zoom-in duration-150 overflow-hidden"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="flex flex-col gap-1">
                        {/* Section: CAMERA FOV */}
                        <div className="px-3 py-2 bg-cad-surface rounded-t">
                            <span
                                id={FOV_SECTION_ID}
                                className="text-[9px] font-black text-cad-accent uppercase tracking-widest flex items-center gap-2"
                            >
                                <Camera size={12} aria-hidden="true" /> CAMERA FOV
                            </span>
                        </div>

                        <div className="flex gap-1 px-1" role="group" aria-labelledby={FOV_SECTION_ID}>
                            <Button
                                variant="secondary"
                                size="md"
                                icon={Eye}
                                onClick={handleEnableAllFov}
                                className="flex-1 text-[9px] font-black uppercase border-cad-border/30 hover:bg-cad-accent hover:text-black"
                            >
                                Bật tất cả
                            </Button>
                            <Button
                                variant="secondary"
                                size="md"
                                icon={EyeOff}
                                onClick={handleDisableAllFov}
                                className="flex-1 text-[9px] font-black uppercase border-cad-border/30 hover:bg-cad-accent hover:text-black"
                            >
                                Tắt tất cả
                            </Button>
                        </div>

                        <div className="px-1 grid grid-cols-2 gap-1" role="group" aria-labelledby={FOV_SECTION_ID}>
                            {CAMERA_TYPES.map(type => {
                                const isActive = showFovTypes.includes(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => toggleFovType(type.id)}
                                        aria-pressed={isActive}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-2 text-[9px] font-bold rounded transition-colors text-left border border-transparent cursor-pointer",
                                            isActive
                                                ? "text-cad-accent bg-cad-accent/10 border-cad-accent/20"
                                                : "text-cad-text-muted hover:bg-cad-text-primary/10"
                                        )}
                                    >
                                        <type.icon size={12} aria-hidden="true" className={isActive ? "text-cad-accent" : "text-cad-text-muted"} />
                                        <span>{type.label}</span>
                                        {isActive && <Check size={10} aria-hidden="true" className="ml-auto" />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Bulk Update Controls */}
                        <div
                            role="group"
                            aria-labelledby={BULK_SECTION_ID}
                            className="m-1 p-2 bg-cad-surface rounded border border-cad-border/20 space-y-3"
                        >
                            <div className="flex items-center gap-1.5 text-cad-active">
                                <Sliders size={12} aria-hidden="true" />
                                <span id={BULK_SECTION_ID} className="text-[8px] font-black uppercase tracking-wider">Cấu hình hàng loạt</span>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-cad-text-muted uppercase">
                                        <label htmlFor={BULK_ANGLE_ID}>Góc mở (FOV)</label>
                                        <span className="text-cad-accent">{bulkAngle}°</span>
                                    </div>
                                    <input
                                        id={BULK_ANGLE_ID}
                                        type="range"
                                        min="10"
                                        max="180"
                                        value={bulkAngle}
                                        onChange={(e) => setBulkAngle(Number(e.target.value))}
                                        aria-valuetext={`${bulkAngle} độ`}
                                        className="w-full h-1 bg-cad-border/30 rounded-lg appearance-none cursor-pointer accent-cad-accent"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-cad-text-muted uppercase">
                                        <label htmlFor={BULK_RADIUS_ID}>Tầm nhìn (m)</label>
                                        <span className="text-cad-accent">{bulkRadius}m</span>
                                    </div>
                                    <input
                                        id={BULK_RADIUS_ID}
                                        type="range"
                                        min="5"
                                        max="500"
                                        value={bulkRadius}
                                        onChange={(e) => setBulkRadius(Number(e.target.value))}
                                        aria-valuetext={`${bulkRadius} mét`}
                                        className="w-full h-1 bg-cad-border/30 rounded-lg appearance-none cursor-pointer accent-cad-accent"
                                    />
                                </div>
                            </div>

                            <Button
                                variant="primary"
                                size="md"
                                icon={Maximize2}
                                loading={isApplying}
                                onClick={handleBulkUpdate}
                                className="w-full text-[9px] font-black uppercase active:scale-95 shadow-lg shadow-cad-accent/10 mt-1"
                            >
                                {isApplying ? 'Đang cập nhật...' : 'Áp dụng cho cameras'}
                            </Button>
                        </div>

                        <div className="h-[1px] bg-cad-border/30 my-1 mx-2" aria-hidden="true" />

                        {/* Section: MAP LAYERS */}
                        <div className="px-3 py-1">
                            <span
                                id={LAYERS_SECTION_ID}
                                className="text-[9px] font-black text-cad-accent uppercase tracking-widest flex items-center gap-2"
                            >
                                <Layers size={12} aria-hidden="true" /> MAP LAYERS
                            </span>
                        </div>

                        <div className="px-1 flex flex-col gap-1" role="group" aria-labelledby={LAYERS_SECTION_ID}>
                            <button
                                type="button"
                                onClick={handleToggleFeatureGroups}
                                aria-pressed={showFeatureGroups}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 text-[10px] font-bold rounded transition-all border border-transparent cursor-pointer",
                                    showFeatureGroups
                                        ? "text-cad-accent bg-cad-accent/10 border-cad-accent/20"
                                        : "text-cad-text-muted hover:bg-cad-text-primary/10"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Layers size={14} aria-hidden="true" />
                                    <span>GOM NHÓM ĐỐI TƯỢNG</span>
                                </div>
                                {showFeatureGroups && <Check size={14} aria-hidden="true" />}
                            </button>

                            <button
                                type="button"
                                onClick={handleToggleDORILayers}
                                aria-pressed={showDORILayers}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 text-[10px] font-bold rounded transition-all border border-transparent cursor-pointer",
                                    showDORILayers
                                        ? "text-cad-warn bg-cad-warn/10 border-cad-warn/20"
                                        : "text-cad-text-muted hover:bg-cad-text-primary/10"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Eye size={14} aria-hidden="true" />
                                    <span>VÙNG PHỦ DORI</span>
                                </div>
                                {showDORILayers && <Check size={14} aria-hidden="true" />}
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
