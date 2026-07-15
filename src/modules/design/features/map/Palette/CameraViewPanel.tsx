import React, { useState, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    Settings, Save,
    Video, Ruler, Activity, ChevronDown, ChevronRight, Map as MapIcon, Layers
} from "lucide-react";
import {
    getFeatureDisplayInfo,
    getPointCoordinates,
    getEffectiveMountingHeight,
    getEffectiveCameraSpecs
} from '@TOOL/utils/featureUtils';
import {
    calculateHFOV,
    calculatePPM,
    getDORICategory,
    mapRotationToHeading,
    mapHeadingToRotation,
    calculateDORIDistance
} from '@TOOL/utils/cameraMath';
import { RecognitionSimulator } from '@DESIGN/features/map/Palette/RecognitionSimulator';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import { X } from 'lucide-react';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import { cn } from '@TOOL/utils/cn';
import { DORILegend } from '@DESIGN/features/map/MapLayerComponents/DORILegend';
import { InteractiveStreetViewPreview } from './InteractiveStreetViewPreview';
import { CameraHudFallback } from './CameraHudFallback';
import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { buildFeaturePropertiesForPersistence } from '@TOOL/utils/featurePersistence';

const SENSOR_SIZES = {
    '1/3"': { width: 4.8, height: 3.6 },
    '1/2.8"': { width: 5.6, height: 4.2 },
    '1/1.8"': { width: 7.2, height: 5.4 },
    '1/1.2"': { width: 10.6, height: 8.0 },
    'Full Frame': { width: 36.0, height: 24.0 }
} as const;

export const CameraViewPanel: React.FC = () => {
    const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext();
    const {
        state,
        selectedFeatureId,
        setPreview,
        queueEvent,
        previewMetadata,
        selectionSet
    } = useDesignSync();
    const { lowPowerMode } = useSettingsStore(); // Added
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const setShowDORILayers = useDesignSync(s => s.setShowDORILayers);

    const feature = selectedFeatureId && state?.features ? state.features[selectedFeatureId] : null;
    const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;
    const displayInfo = feature && group ? getFeatureDisplayInfo(feature, group.type, group.name) : null;

    const [localMeta, setLocalMeta] = useState<any>({});
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        specs: true,
        simulation: true,
        recognition: false
    });
    const [hoveredDori, setHoveredDori] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const getMetaValue = (path: string, defaultValue: any, source: any = localMeta) => {
        const parts = path.split('.');
        let current = source;
        for (const part of parts) {
            if (current == null) return defaultValue;
            current = current[part];
        }
        return current ?? defaultValue;
    };

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
        } catch {
            setLocalMeta({});
        }
    }, [feature?.id, feature?.metadata]);

    // Update localMeta when previewMetadata changes (sync from other palettes)
    useEffect(() => {
        if (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata) {
            // Only update if metadata is actually different to avoid unnecessary jitter
            // but ensuring we have the latest "draft" from other palettes
            setLocalMeta((prev: any) => {
                if (JSON.stringify(prev) !== JSON.stringify(previewMetadata.metadata)) {
                    return previewMetadata.metadata;
                }
                return prev;
            });
        }
    }, [previewMetadata, selectedFeatureId]);


    // Effective metadata: use preview override if it matches current feature
    const effectiveMeta = (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata)
        ? previewMetadata.metadata
        : localMeta;

    const rotation = getMetaValue('gis.rotation', 0, effectiveMeta);

    // Verification for multi-selection handled in main return block to avoid hook violations.

    // Verification for multi-selection handled in main return block to avoid hook violations.

    const updateNestedMeta = (path: string, value: any) => {
        const newMeta = { ...localMeta };
        const parts = path.split('.');
        let current = newMeta;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        setLocalMeta(newMeta);
        setPreview(selectedFeatureId!, newMeta);
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    let persistedMetaJson = '{}';
    if (feature) {
        try {
            const parsed = typeof feature.metadata === 'string'
                ? JSON.parse(feature.metadata || '{}')
                : (feature.metadata || {});
            persistedMetaJson = JSON.stringify(parsed);
        } catch {
            persistedMetaJson = '{}';
        }
    }
    const isDirty = !!feature && JSON.stringify(effectiveMeta || {}) !== persistedMetaJson;

    const handleSave = async () => {
        if (!selectedFeatureId || !isDirty || isSaving) return;
        setIsSaving(true);

        try {
            const standardizedMeta = normalizeMetadataObject(effectiveMeta);
            await queueEvent({
                type: 'FeatureUpdated',
                payload: {
                    id: selectedFeatureId,
                    ...(previewMetadata?.id === selectedFeatureId && previewMetadata.name !== undefined
                        ? { name: previewMetadata.name }
                        : {}),
                    metadata: JSON.stringify(standardizedMeta),
                    properties: buildFeaturePropertiesForPersistence(feature?.properties, standardizedMeta),
                },
            });
            setPreview(null, null);
        } catch (error) {
            console.error('[CameraViewPanel] Save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Verification for multi-selection handled in main return block to avoid hook violations.
    if (!feature || !displayInfo) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-muted bg-[#1e1e1e] p-4 text-center border border-[#333] shadow-2xl font-mono">
                <div className="flex items-center justify-between w-full absolute top-0 p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move rounded-t-xl" {...dragHandleProps}>
                    <div className="flex items-center gap-2">
                        <Video className="w-3.5 h-3.5 text-[#444]" />
                        <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">Camera View</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
                </div>
                <Video className="w-10 h-10 mb-4 text-[#444] animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Chưa chọn thiết bị</p>
                <p className="text-[9px] mt-2 text-cad-text-muted max-w-[200px]">
                    Vui lòng chọn một camera để xem mô phỏng hình ảnh tại vị trí lắp đặt.
                </p>
            </div>
        );
    }

    const coords = getPointCoordinates(feature);

    if (selectionSet.size > 1) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-muted bg-[#1e1e1e] p-4 text-center opacity-50 border border-[#333] shadow-2xl font-mono">
                <Layers className="w-8 h-8 mb-4 text-cad-accent" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Multi-Selection</p>
                <p className="text-[9px] mt-2 text-cad-text-muted">
                    Simulation is disabled for multiple devices.
                </p>
            </div>
        );
    }

    const { focalLength, sensorSize, resolutionX } = getEffectiveCameraSpecs(feature, state?.settings, effectiveMeta);
    const installHeight = getEffectiveMountingHeight(feature, state?.settings, effectiveMeta);
    const targetDistance = getMetaValue('specs.target_distance', 20, effectiveMeta);
    const targetHeight = getMetaValue('specs.target_height', 1.7, effectiveMeta);

    const sensor = SENSOR_SIZES[sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/2.8"'];
    const hfov = calculateHFOV(sensor.width, focalLength);
    const ppm = calculatePPM(resolutionX, targetDistance, hfov, installHeight, targetHeight);
    const dori = getDORICategory(ppm);

    return (
        <div className={cn(
            "flex flex-col h-full bg-[#1e1e1e] text-white font-mono select-none rounded-xl border border-[#333] shadow-2xl overflow-hidden",
            !lowPowerMode && "backdrop-blur-md"
        )}>
            {/* Header */}
            <div
                {...dragHandleProps}
                className="flex items-center justify-between p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move sticky top-0"
            >
                <div className="flex items-center gap-2">
                    <Video className="w-3.5 h-3.5 text-cad-accent" />
                    <span className="text-[10px] font-black tracking-widest uppercase text-cad-accent">
                        GÓC NHÌN
                    </span>
                    {(isDirty || isSaving) && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                </div>
                <div className="flex items-center gap-1">
                    {(isDirty || isSaving) && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="p-1 px-2 flex items-center gap-1.5 rounded transition-colors text-[9px] font-bold uppercase border hover:bg-blue-500/20 text-blue-400 border-blue-500/10 group disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Lưu thay đổi"
                        >
                            <Save className="w-3 h-3" /> Save
                        </button>
                    )}
                    <button
                        onClick={onPin}
                        className={`p-1 px-2 hover:bg-[#333] transition-colors rounded text-[9px] font-bold uppercase ${isPinned ? 'text-cad-accent bg-[#333]' : 'text-cad-text-muted'}`}
                        title={isPinned ? "Auto-hide" : "Pin"}
                    >
                        {isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 px-2 hover:bg-[#333] text-cad-text-muted rounded transition-colors text-[9px] font-bold uppercase"
                    >
                        Close
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {/* 1. Technical Specifications */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
                        <Settings className="w-3 h-3" /> Thông số kỹ thuật
                        <div className="flex-1" />
                        <button onClick={() => toggleSection('specs')} className="p-1 hover:bg-[#333] rounded text-cad-text-muted">
                            {expandedSections.specs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.specs && (
                        <div className="space-y-4 bg-[#111] p-3 rounded border border-[#333]">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Độ phân giải</label>
                                    <select
                                        value={resolutionX}
                                        onChange={(e) => updateNestedMeta('specs.resolution_x', parseInt(e.target.value))}
                                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                                    >
                                        <option value={1280}>HD (1.3MP)</option>
                                        <option value={1920}>Full HD (2MP)</option>
                                        <option value={2560}>2K (4MP)</option>
                                        <option value={3840}>4K (8MP)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Cảm biến</label>
                                    <select
                                        value={sensorSize}
                                        onChange={(e) => updateNestedMeta('specs.sensor_size', e.target.value)}
                                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                                    >
                                        {Object.keys(SENSOR_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Tiêu cự (mm)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={focalLength}
                                        onChange={(e) => updateNestedMeta('specs.focal_length', Number(e.target.value))}
                                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Độ cao lắp (m)</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={installHeight}
                                        onChange={(e) => updateNestedMeta('specs.install_height', parseFloat(e.target.value))}
                                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center py-2 px-1 border-t border-[#333] mt-2">
                                <span className="text-[9px] text-cad-text-muted uppercase font-bold tracking-tighter ml-1">Góc nhìn ngang (HFOV)</span>
                                <span className="text-[10px] font-mono font-bold text-cad-accent mr-1">
                                    {hfov.toFixed(1)}°
                                </span>
                            </div>
                        </div>
                    )}
                </section>

                {/* 2. Simulated View */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
                        <MapIcon className="w-3 h-3 text-green-400" /> Mô phỏng Góc nhìn
                        <div className="flex-1" />
                        <button onClick={() => toggleSection('simulation')} className="p-1 hover:bg-[#333] rounded text-cad-text-muted">
                            {expandedSections.simulation ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.simulation && (
                        <div className="bg-[#111] p-3 rounded border border-[#333]">
                            <InteractiveStreetViewPreview
                                lat={coords?.[1] ?? NaN}
                                lng={coords?.[0] ?? NaN}
                                heading={mapRotationToHeading(rotation)}
                                fov={hfov}
                                onHeadingChange={(newHeading) => {
                                    const newRotation = mapHeadingToRotation(newHeading);
                                    updateNestedMeta('gis.rotation', newRotation);
                                }}
                                fallback={
                                    <CameraHudFallback
                                        hfov={hfov}
                                        targetDistance={targetDistance}
                                        installHeight={installHeight}
                                        targetHeight={targetHeight}
                                        rotation={rotation}
                                        ppm={ppm}
                                        statusLabel={ppm < 25 ? 'Không đạt' : ppm < 125 ? 'Tổng quan' : 'Chi tiết'}
                                        statusColor={dori.color}
                                    />
                                }
                            />
                        </div>
                    )}
                </section>

                {/* 3. Simulated Recognition (DORI) */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
                        <Activity className="w-3 h-3 text-purple-400" /> Chất lượng Nhận diện
                        <div className="flex-1" />
                        <button onClick={() => toggleSection('recognition')} className="p-1 hover:bg-[#333] rounded text-cad-text-muted">
                            {expandedSections.recognition ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.recognition && (
                        <div className="space-y-6 bg-[#111] p-3 rounded border border-[#333]">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Mục tiêu (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={targetHeight}
                                        onChange={(e) => updateNestedMeta('specs.target_height', parseFloat(e.target.value))}
                                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center h-full pt-4">
                                        <span className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">PPM</span>
                                        <span className="text-[12px] font-mono font-bold text-white mr-1">{Math.round(ppm)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between items-end">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase flex items-center gap-1 tracking-tighter ml-1">
                                        <Ruler className="w-3 h-3" /> Khoảng cách
                                    </label>
                                    <div className="text-[10px] font-mono text-cad-text-muted mr-1">
                                        {targetDistance}m
                                    </div>
                                </div>
                                <input
                                    type="range" min="1" max="200" step="1"
                                    value={targetDistance}
                                    onChange={(e) => updateNestedMeta('specs.target_distance', parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-400"
                                />
                            </div>

                            {/* 2D Cross Section */}
                            <div className="space-y-2 pt-4 border-t border-[#333]">
                                <div className="flex justify-between items-center">
                                    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Mặt cắt dọc</label>
                                    <button
                                        onClick={() => setShowDORILayers(!showDORILayers)}
                                        className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all border ${showDORILayers ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' : 'bg-transparent border-[#333] text-gray-500'}`}
                                    >
                                        DORI Map
                                    </button>
                                </div>
                                <div className="h-32 bg-[#161616] rounded-lg border border-[#333] overflow-hidden relative flex items-center justify-center p-1">
                                    <svg viewBox="0 0 300 125" className="w-full h-full overflow-visible">
                                        <defs>
                                            <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#222" />
                                                <stop offset="100%" stopColor="#111" />
                                            </linearGradient>
                                        </defs>

                                        {(() => {
                                            const camX = 25;
                                            const camY = 90 - (installHeight * 14.5);
                                            const scaleX = 4.2;

                                            const doriLevels = [
                                                { id: 'DET', ppm: 25, color: '#06b6d4', label: 'D' },
                                                { id: 'OBS', ppm: 62, color: '#10b981', label: 'O' },
                                                { id: 'REC', ppm: 125, color: '#f59e0b', label: 'R' },
                                                { id: 'ID', ppm: 250, color: '#ef4444', label: 'I' }
                                            ];

                                            const ranges = doriLevels.map(l => ({
                                                ...l,
                                                d: calculateDORIDistance(resolutionX, hfov, l.ppm, installHeight, targetHeight)
                                            })).sort((a, b) => b.d - a.d);

                                            return (
                                                <g>
                                                    {/* Background Grid Lines */}
                                                    {[0, 20, 40, 60].map(d => (
                                                        <g key={d}>
                                                            <line x1={camX + d * scaleX} y1="10" x2={camX + d * scaleX} y2="90" stroke="#333" strokeWidth="0.5" strokeDasharray="2, 4" />
                                                            <text x={camX + d * scaleX} y="112" textAnchor="middle" fill="#888" fontSize="7" fontWeight="bold">{d}m</text>
                                                        </g>
                                                    ))}

                                                    <rect x="0" y="90" width="300" height="35" fill="url(#groundGrad)" />
                                                    <line x1="0" y1="90" x2="300" y2="90" stroke="#444" strokeWidth="1" />

                                                    {showDORILayers && (
                                                        <g>
                                                            <defs>
                                                                {doriLevels.map(l => (
                                                                    <linearGradient key={`grad-${l.id}`} id={`grad-${l.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                                                        <stop offset="0%" stopColor={l.color} stopOpacity="0.4" />
                                                                        <stop offset="100%" stopColor={l.color} stopOpacity="0.05" />
                                                                    </linearGradient>
                                                                ))}
                                                            </defs>
                                                            {ranges.map((range, i) => {
                                                                const nextD = i < ranges.length - 1 ? ranges[i + 1].d : 0;
                                                                const p1 = Math.min(295, camX + range.d * scaleX);
                                                                const p2 = Math.min(295, camX + nextD * scaleX);
                                                                const isActive = hoveredDori === range.id;

                                                                return (
                                                                    <g key={range.id}>
                                                                        <path
                                                                            d={`M ${camX} ${camY} L ${p1} 90 L ${p2} 90 Z`}
                                                                            fill={`url(#grad-${range.id})`}
                                                                            onMouseEnter={() => setHoveredDori(range.id)}
                                                                            onMouseLeave={() => setHoveredDori(null)}
                                                                            style={{
                                                                                opacity: (hoveredDori && !isActive) ? 0.2 : 0.8,
                                                                                stroke: isActive ? range.color : 'none',
                                                                                strokeWidth: 1,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                            className="transition-all duration-300"
                                                                        />
                                                                        {/* DORI Markers at the top */}
                                                                        <line x1={p1} y1={camY - 5} x2={p1} y2="90" stroke={range.color} strokeWidth="0.5" strokeDasharray="1, 2" opacity="0.3" />
                                                                        <text x={p1} y={Math.max(10, camY - 8)} textAnchor="middle" fill={range.color} fontSize="8" fontWeight="black" opacity="0.8">{range.label}</text>
                                                                        <text x={p1} y="102" textAnchor="middle" fill={range.color} fontSize="7" fontWeight="bold" opacity="0.6">{Math.round(range.d)}m</text>
                                                                    </g>
                                                                );
                                                            })}
                                                        </g>
                                                    )}

                                                    {/* Camera Pole & Height Label */}
                                                    <g>
                                                        <line x1={camX} y1="90" x2={camX} y2={camY} stroke="#666" strokeWidth="1.5" />
                                                        <circle cx={camX} cy={camY} r="3" fill="#fb923c" />
                                                        <text x={camX - 4} y={(camY + 90) / 2} textAnchor="end" fill="#fb923c" fontSize="8" fontWeight="bold" className="tabular-nums">
                                                            {installHeight}m
                                                        </text>
                                                    </g>

                                                    {/* Target Indicator */}
                                                    {(() => {
                                                        const tx = camX + targetDistance * scaleX;
                                                        const ty = 90 - (targetHeight * 14.5);
                                                        if (tx > 300) return null;
                                                        return (
                                                            <g>
                                                                <line x1={tx} y1="90" x2={tx} y2={ty} stroke="#f472b6" strokeWidth="1.5" strokeDasharray="2, 2" />
                                                                <rect x={tx - 2} y={ty - 12} width="4" height="12" fill="#f472b6" rx="1" />
                                                                <circle cx={tx} cy={ty - 14} r="2" fill="#f472b6" />
                                                                <text x={tx + 5} y={ty - 10} fill="#f472b6" fontSize="8" fontWeight="bold">{targetDistance}m</text>
                                                            </g>
                                                        );
                                                    })()}
                                                </g>
                                            );
                                        })()}
                                    </svg>
                                </div>
                            </div>

                            {/* Recognition Simulator - Simplified in low power mode */}
                            <div className="pt-4 border-t border-[#333]">
                                {lowPowerMode ? (
                                    <div className="flex items-center gap-2 p-2 bg-[#252525] rounded text-[9px] text-cad-text-muted italic border border-[#333]">
                                        <Activity className="w-3 h-3 text-cad-accent" />
                                        Mô phỏng nhận diện đã được đơn giản hóa trong chế độ tiết kiệm điện.
                                    </div>
                                ) : (
                                    <RecognitionSimulator ppm={ppm} />
                                )}
                            </div>

                            {/* DORI Legend Integration */}
                            <div className="mt-4 pt-4 border-t border-[#333]">
                                <DORILegend />
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
