import React, { useState, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    Eye, EyeOff, Compass, Settings, Save, Wand2,
    ChevronDown, ChevronRight, Layers, Pin, PinOff, X, Check
} from "lucide-react";
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import {
    getFeatureDisplayInfo,
        getPointCoordinates,
        calculateNearestRoadAngle,
        isCameraIcon
} from '@TOOL/utils/featureUtils';
import { calculateHFOV, SENSOR_SIZES } from '@TOOL/utils/cameraMath';
import { useMetadataAutosave } from '@DESIGN/hooks/useMetadataAutosave';

export const DeviceConfigPanel: React.FC = () => {
    const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext();
    const {
        state,
        selectedFeatureId,
        setPreview,
        queueEvent,
        previewMetadata,
        selectionSet
    } = useDesignSync();

    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const setShowDORILayers = useDesignSync(s => s.setShowDORILayers);

    const feature = selectedFeatureId && state?.features ? state.features[selectedFeatureId] : null;
    const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;
    const displayInfo = feature && group ? getFeatureDisplayInfo(feature, group.type, group.name) : null;

    const [localMeta, setLocalMeta] = useState<any>({});
    const [showSuccess, setShowSuccess] = useState(false);
    const [isRotationDragging, setIsRotationDragging] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        gis: true,
        sim: true
    });

    useEffect(() => {
        if (!feature) {
            setLocalMeta({});
            return;
        }

        try {
            const parsed = typeof feature.metadata === 'string'
                ? JSON.parse(feature.metadata || '{}')
                : (feature.metadata || {});
            setLocalMeta(parsed);
        } catch (e) {
            console.warn('[DeviceConfigPanel] Failed to parse feature metadata:', e);
            setLocalMeta({});
        }

    }, [feature?.id, feature?.metadata]);

    // Sync with previewMetadata (from other palettes)
    useEffect(() => {
        if (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata) {
            setLocalMeta((prev: any) => {
                const incoming = previewMetadata.metadata;
                if (JSON.stringify(prev) !== JSON.stringify(incoming)) {
                    return incoming;
                }
                return prev;
            });
        }
    }, [previewMetadata, selectedFeatureId]);

    // Debounced Preview for Map rendering
    useEffect(() => {
        if (!selectedFeatureId || !localMeta) return;

        // Skip preview if matching persisted state to avoid re-render loops
        const currentMetaJson = JSON.stringify(localMeta);
        const featureMeta = typeof feature?.metadata === 'string'
            ? feature.metadata
            : JSON.stringify(feature?.metadata || {});

        if (currentMetaJson === featureMeta) return;

        const timer = setTimeout(() => {
            setPreview(selectedFeatureId, localMeta);
        }, 50); // Small debounce to avoid jank on sliders

        return () => clearTimeout(timer);
    }, [localMeta, selectedFeatureId, setPreview]);

    // Multi-selection check moved below hooks to avoid violation.



    const getMetaValue = (path: string, defaultValue: any) => {
        const parts = path.split('.');
        let current = localMeta;
        for (const part of parts) {
            if (current == null) return defaultValue;
            current = current[part];
        }
        return current ?? defaultValue;
    };

    const updateNestedMeta = (path: string, value: any) => {
        const newMeta = { ...localMeta };
        const parts = path.split('.');
        let current = newMeta;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextLevel = current[part];
            current[part] = nextLevel && typeof nextLevel === 'object'
                ? { ...nextLevel }
                : {};
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
        setLocalMeta(newMeta);
        if (selectedFeatureId) {
            setPreview(selectedFeatureId, newMeta);
        }
        return newMeta;
    };

    const handleAutoOrient = async () => {
        const coords = getPointCoordinates(feature);
        if (!coords) return;

        const [lng, lat] = coords as [number, number];
        const angle = calculateNearestRoadAngle([lng, lat], Object.values(state?.features || {}));
        if (angle !== null) {
            const nextMeta = updateNestedMeta('gis.rotation', Math.round(angle));
            await flushNow({ meta: nextMeta });
        }
    };

    const handleRotationCommit = () => {
        setIsRotationDragging(false);
        setTimeout(() => {
            void flushNow();
        }, 0);
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    let persistedMeta: any = {};
    let persistedMetaJson = '{}';
    if (feature) {
        try {
            const parsed = typeof feature.metadata === 'string'
                ? JSON.parse(feature.metadata || '{}')
                : (feature.metadata || {});
            persistedMeta = parsed;
            persistedMetaJson = JSON.stringify(parsed);
        } catch (e) {
            console.warn('[DeviceConfigPanel] Failed to parse persisted metadata:', e);
            persistedMeta = {};
            persistedMetaJson = '{}';
        }
    }
    const { isSaving, flushNow } = useMetadataAutosave({
        featureId: selectedFeatureId,
        localMeta,
        persistedMeta,
        queueEvent,
        setPreview,
        debounceMs: 300,
        enabled: isCameraIcon(typeof localMeta?.icon === 'string' ? localMeta.icon : ''),
        suspend: isRotationDragging,
        onPersisted: () => {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 1500);
        },
        onError: (error) => {
            console.error('[DeviceConfigPanel] Auto-save failed:', error);
        }
    });
    const isDirty = !!feature && JSON.stringify(localMeta || {}) !== persistedMetaJson;
    const rotation = getMetaValue('gis.rotation', 0);
    const showFov = getMetaValue('gis.show_fov', true);

    const handleSave = async () => {
        if (!selectedFeatureId || !isDirty || isSaving) return;
        await flushNow({ force: true });
    };

    if (!feature || !displayInfo) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-secondary bg-cad-bg-secondary p-4 text-center">
                <div className="flex items-center justify-between w-full absolute top-0 p-2.5 border-b border-white/5 bg-white/5 drag-handle cursor-move" {...dragHandleProps}>
                    <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-cad-text-muted" />
                        <span className="text-[10px] font-bold tracking-wider uppercase text-gray-500">Device Configure</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:bg-red-500 hover:text-white transition-all rounded"><X size={12} /></button>
                </div>
                <Compass className="w-10 h-10 mb-4 text-cad-text-muted/30 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Chưa chọn thiết bị</p>
                <p className="text-[9px] mt-2 text-cad-text-muted max-w-[200px]">
                    Vui lòng chọn một thiết bị trên bản đồ hoặc trong cây thư mục để chỉnh sửa hướng và thông số GIS.
                </p>
            </div>
        );
    }
    if (selectionSet.size > 1) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-secondary bg-cad-bg-secondary p-4 text-center opacity-50">
                <Layers className="w-8 h-8 mb-4 text-cad-accent" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Chọn nhiều đối tượng</p>
                <p className="text-[9px] mt-2 text-cad-text-muted max-w-[200px]">
                    Vui lòng sử dụng tính năng <strong>Chỉnh sửa hàng loạt</strong> để thay đổi thông số cho nhiều thiết bị.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-md text-gray-200 select-none rounded-xl border border-white/10 shadow-xl overflow-hidden">
            {/* Header */}
            <div
                {...dragHandleProps}
                className="flex items-center justify-between p-2.5 border-b border-white/5 bg-white/5 drag-handle cursor-move hover:bg-white/10 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-bold tracking-wider uppercase text-gray-300">
                        Device Configure
                    </span>
                    {(isDirty || isSaving || showSuccess) && (
                        <div className={`w-1.5 h-1.5 rounded-full ${showSuccess ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`} />
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {(isDirty || isSaving || showSuccess) && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving || showSuccess}
                            className={`p-1.5 flex items-center gap-1.5 rounded transition-all group disabled:opacity-50 ${showSuccess ? 'bg-green-500/20 text-green-400' : 'hover:bg-blue-500/20 text-blue-400'
                                }`}
                            title="Lưu thay đổi"
                        >
                            {showSuccess ? <Check size={14} /> : <Save size={14} />}
                            {showSuccess && <span className="text-[8px] font-bold uppercase">Done</span>}
                        </button>
                    )}
                    <div className="w-[1px] h-3 bg-white/10 mx-1" />
                    <button
                        onClick={onPin}
                        className={`p-1 hover:bg-cad-accent hover:text-black transition-all rounded ${isPinned ? 'text-cad-accent' : 'text-gray-500'}`}
                        title={isPinned ? "Auto-hide" : "Pin"}
                    >
                        {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-500 hover:bg-red-500 hover:text-white transition-all rounded"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-6 custom-scrollbar pb-8">
                {/* 1. GIS Location & Orientation */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
                        <Compass className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Tọa độ & Hướng</span>
                        <div className="flex-1 h-[1px] bg-[#333] ml-2" />
                        <button onClick={() => toggleSection('gis')} className="p-1 hover:bg-white/5 rounded">
                            {expandedSections.gis ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.gis && (
                        <div className="space-y-4 px-1">
                            {/* Layer Toggles */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => updateNestedMeta('gis.show_fov', !showFov)}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all border ${showFov
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                        : 'bg-transparent border-[#333] text-gray-500 opacity-50'
                                        }`}
                                >
                                    {showFov ? <Eye size={12} /> : <EyeOff size={12} />}
                                    FOV
                                </button>
                                <button
                                    onClick={() => setShowDORILayers(!showDORILayers)}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all border ${showDORILayers
                                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                        : 'bg-transparent border-[#333] text-gray-500 opacity-50'
                                        }`}
                                >
                                    {showDORILayers ? <Eye size={12} /> : <EyeOff size={12} />}
                                    DORI
                                </button>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Góc xoay (360°)</label>
                                    <span className="text-[10px] font-mono text-cad-orange font-bold">{rotation}°</span>
                                </div>
                                <div className="flex gap-3 px-1">
                                    <input
                                        type="range" min="0" max="359" step="1"
                                        value={rotation}
                                        onChange={(e) => updateNestedMeta('gis.rotation', parseInt(e.target.value))}
                                        onPointerDown={() => setIsRotationDragging(true)}
                                        onPointerUp={handleRotationCommit}
                                        onPointerCancel={handleRotationCommit}
                                        onMouseUp={handleRotationCommit}
                                        onTouchEnd={handleRotationCommit}
                                        className="flex-1 h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-cad-orange"
                                    />
                                    <button
                                        onClick={handleAutoOrient}
                                        className="p-1.5 bg-[#252525] border border-[#333] rounded hover:border-cad-orange transition-colors"
                                        title="Tự động hướng theo đường"
                                    >
                                        <Wand2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* FOV Angle & Radius Controls */}
                            <div className="pt-2 space-y-4 border-t border-[#333]/50">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Góc nhìn (FOV)</label>
                                        <span className="text-[10px] font-mono text-blue-400 font-bold">{getMetaValue('gis.fov_angle', 90)}°</span>
                                    </div>
                                    <div className="px-1">
                                        <input
                                            type="range" min="10" max="180" step="1"
                                            value={getMetaValue('gis.fov_angle', 90)}
                                            onChange={(e) => updateNestedMeta('gis.fov_angle', parseInt(e.target.value))}
                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Tầm nhìn (Radius)</label>
                                        <span className="text-[10px] font-mono text-purple-400 font-bold">{getMetaValue('gis.fov_radius', 100)}m</span>
                                    </div>
                                    <div className="px-1">
                                        <input
                                            type="range" min="1" max="1000" step="1"
                                            value={getMetaValue('gis.fov_radius', 100)}
                                            onChange={(e) => updateNestedMeta('gis.fov_radius', parseInt(e.target.value))}
                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* 2. Simulation Settings */}
                <section className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
                        <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Simulation (Camera Specs)</span>
                        <div className="flex-1 h-[1px] bg-[#333] ml-2" />
                        <button onClick={() => toggleSection('sim')} className="p-1 hover:bg-white/5 rounded">
                            {expandedSections.sim ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.sim && (
                        <div className="space-y-4 px-1">
                            {/* Resolution & Sensor Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Resolution</label>
                                    <select
                                        value={`${getMetaValue('specs.resolution_x', 1920)}x${getMetaValue('specs.resolution_y', 1080)}`}
                                        onChange={(e) => {
                                            const [x, y] = e.target.value.split('x').map(Number);
                                            updateNestedMeta('specs.resolution_x', x);
                                            updateNestedMeta('specs.resolution_y', y);
                                        }}
                                        className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[9px] text-gray-300 focus:outline-none focus:border-purple-500/50"
                                    >
                                        <option value="1920x1080">2MP (1080p)</option>
                                        <option value="2560x1440">4MP (2K)</option>
                                        <option value="3840x2160">8MP (4K)</option>
                                        <option value="5120x2880">14MP (5K)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Sensor Size</label>
                                    <select
                                        value={getMetaValue('specs.sensor_size', '1/3"')}
                                        onChange={(e) => updateNestedMeta('specs.sensor_size', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[9px] text-gray-300 focus:outline-none focus:border-purple-500/50"
                                    >
                                        <option value='1/1.8"'>1/1.8" (High-end)</option>
                                        <option value='1/2.7"'>1/2.7"</option>
                                        <option value='1/2.8"'>1/2.8" (Common)</option>
                                        <option value='1/3"'>1/3"</option>
                                        <option value='1/4"'>1/4"</option>
                                    </select>
                                </div>
                            </div>

                            {/* Focal Length Slider */}
                            <div className="space-y-2 pt-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Focal Length (Tiêu cự)</label>
                                    <span className="text-[10px] font-mono text-purple-400 font-bold">{getMetaValue('specs.focal_length', 3.6)}mm</span>
                                </div>
                                <input
                                    type="range" min="1.8" max="50" step="0.1"
                                    value={getMetaValue('specs.focal_length', 3.6)}
                                    onChange={(e) => updateNestedMeta('specs.focal_length', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>

                            {/* Installation Heights */}
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                    <label className="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Height (Lắp đặt)</label>
                                    <div className="relative">
                                        <input
                                            type="number" step="0.1"
                                            value={getMetaValue('specs.install_height', 5.0)}
                                            onChange={(e) => updateNestedMeta('specs.install_height', parseFloat(e.target.value))}
                                            className="w-full bg-white/5 border border-white/10 rounded pl-2 pr-5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-purple-500/50 appearance-none"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-gray-600 font-bold">M</span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Target (Mục tiêu)</label>
                                    <div className="relative">
                                        <input
                                            type="number" step="0.1"
                                            value={getMetaValue('specs.target_height', 1.7)}
                                            onChange={(e) => updateNestedMeta('specs.target_height', parseFloat(e.target.value))}
                                            className="w-full bg-white/5 border border-white/10 rounded pl-2 pr-5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-purple-500/50 appearance-none"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-gray-600 font-bold">M</span>
                                    </div>
                                </div>
                            </div>

                            {/* DORI Ranges Display (New) */}
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <label className="text-[8px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Calculated DORI Ranges</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'Identify', ppm: 250, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                                        { label: 'Recognize', ppm: 125, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
                                        { label: 'Observe', ppm: 63, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
                                        { label: 'Detect', ppm: 25, color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
                                    ].map((level) => {
                                        const resX = getMetaValue('specs.resolution_x', 1920);
                                        const focal = getMetaValue('specs.focal_length', 3.6);
                                        const sSizeStr = getMetaValue('specs.sensor_size', '1/3"');
                                        const sensor = SENSOR_SIZES[sSizeStr as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/3"'];
                                        const hfov = calculateHFOV(sensor.width, focal);
                                        const hfovRad = (hfov * Math.PI) / 180;
                                        const slant = resX / (2 * level.ppm * Math.tan(hfovRad / 2));
                                        const hDiff = Math.max(0, getMetaValue('specs.install_height', 5) - getMetaValue('specs.target_height', 1.7));
                                        const dist = slant > hDiff ? Math.sqrt(slant * slant - hDiff * hDiff) : 0;

                                        return (
                                            <div key={level.label} className={`flex flex-col p-1.5 rounded border ${level.color}`}>
                                                <span className="text-[7px] font-black uppercase opacity-60">{level.label}</span>
                                                <span className="text-[11px] font-mono font-bold">{dist.toFixed(1)}m</span>
                                                <span className="text-[6px] opacity-40 uppercase tracking-tighter">{level.ppm} PPM</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Summary / Hint */}
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-2 mt-2">
                                <p className="text-[8px] text-blue-300/70 leading-relaxed">
                                    * Vùng **DORI** tự động cập nhật trên bản đồ khi thay đổi thông số. Sử dụng chuột để đo đạc chính xác hơn.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
