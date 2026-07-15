import React, { useState, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    Eye, EyeOff, Compass, Settings, Save, Wand2,
    ChevronDown, ChevronRight, Layers, X, Check
} from "lucide-react";
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import {
    getFeatureDisplayInfo,
        getPointCoordinates,
        calculateNearestRoadAngle,
} from '@TOOL/utils/featureUtils';
import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { buildFeaturePropertiesForPersistence } from '@TOOL/utils/featurePersistence';


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
            updateNestedMeta('gis.rotation', Math.round(angle));
        }
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
        } catch (e) {
            console.warn('[DeviceConfigPanel] Failed to parse persisted metadata:', e);
            persistedMetaJson = '{}';
        }
    }
    const [isSaving, setIsSaving] = useState(false);
    const draftMeta = (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata)
        ? previewMetadata.metadata
        : localMeta;
    const isDirty = !!feature && JSON.stringify(draftMeta || {}) !== persistedMetaJson;
    const rotation = getMetaValue('gis.rotation', 0);
    const showFov = getMetaValue('gis.show_fov', true);

    const handleSave = async () => {
        if (!selectedFeatureId || !isDirty || isSaving) return;
        setIsSaving(true);
        setShowSuccess(false);

        try {
            const standardizedMeta = normalizeMetadataObject(draftMeta);
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
            setShowSuccess(true);
            setPreview(null, null);
            setTimeout(() => setShowSuccess(false), 1500);
        } catch (error) {
            console.error('[DeviceConfigPanel] Save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!feature || !displayInfo) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-muted bg-[#1e1e1e] p-4 text-center border border-[#333] shadow-2xl font-mono">
                <div className="flex items-center justify-between w-full absolute top-0 p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move" {...dragHandleProps}>
                    <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-[#444]" />
                        <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">Device Configure</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
                </div>
                <Compass className="w-10 h-10 mb-4 text-[#444] animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Chưa chọn thiết bị</p>
                <p className="text-[9px] mt-2 text-cad-text-muted max-w-[200px]">
                    Vui lòng chọn một thiết bị trên bản đồ hoặc trong cây thư mục để chỉnh sửa hướng và thông số GIS.
                </p>
            </div>
        );
    }
    if (selectionSet.size > 1) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cad-text-muted bg-[#1e1e1e] p-4 text-center opacity-50 border border-[#333] shadow-2xl font-mono">
                <Layers className="w-8 h-8 mb-4 text-cad-accent" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Chọn nhiều đối tượng</p>
                <p className="text-[9px] mt-2 text-cad-text-muted max-w-[200px]">
                    Vui lòng chỉ chọn một thiết bị để thay đổi thông số cấu hình.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-white font-mono select-none rounded-xl border border-[#333] shadow-2xl overflow-hidden">
            {/* Header */}
            <div
                {...dragHandleProps}
                className="flex items-center justify-between p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move sticky top-0"
            >
                <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-black tracking-widest uppercase text-cad-accent">
                        Device Configure
                    </span>
                    {(isDirty || isSaving || showSuccess) && (
                        <div className={`w-1.5 h-1.5 rounded-full ${showSuccess ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`} />
                    )}
                </div>
                <div className="flex gap-1">
                    {(isDirty || isSaving || showSuccess) && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving || showSuccess}
                            className={`p-1 px-2 flex items-center gap-1.5 rounded transition-colors text-[9px] font-bold uppercase border ${showSuccess ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'hover:bg-blue-500/20 text-blue-400 border-blue-500/10'
                                }`}
                            title="Lưu thay đổi"
                        >
                            {showSuccess ? <Check size={12} /> : <Save size={12} />}
                            {showSuccess ? 'Done' : 'Save'}
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
                {/* 1. GIS Location & Orientation */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
                        <Compass className="w-3 h-3" /> Tọa độ & Hướng
                        <div className="flex-1" />
                        <button onClick={() => toggleSection('gis')} className="p-1 hover:bg-[#333] rounded text-cad-text-muted">
                            {expandedSections.gis ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>

                    {expandedSections.gis && (
                        <div className="space-y-4 bg-[#111] p-3 rounded border border-[#333]">
                            {/* Layer Toggles */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => updateNestedMeta('gis.show_fov', !showFov)}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all border ${showFov
                                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                        : 'bg-[#252525] border-[#333] text-cad-text-muted hover:bg-[#333]'
                                        }`}
                                >
                                    {showFov ? <Eye size={12} /> : <EyeOff size={12} />}
                                    FOV
                                </button>
                                <button
                                    onClick={() => setShowDORILayers(!showDORILayers)}
                                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all border ${showDORILayers
                                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                                        : 'bg-[#252525] border-[#333] text-cad-text-muted hover:bg-[#333]'
                                        }`}
                                >
                                    {showDORILayers ? <Eye size={12} /> : <EyeOff size={12} />}
                                    DORI
                                </button>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Góc xoay (360°)</label>
                                        <span className="text-[10px] font-mono text-cad-orange font-bold mr-1">{rotation}°</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="range" min="0" max="359" step="1"
                                            value={rotation}
                                            onChange={(e) => updateNestedMeta('gis.rotation', parseInt(e.target.value))}
                                            className="flex-1 h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-cad-orange my-auto"
                                        />
                                        <button
                                            onClick={handleAutoOrient}
                                            className="p-1.5 bg-[#252525] border border-[#333] hover:bg-[#333] hover:border-cad-accent rounded text-cad-text-muted hover:text-white transition-all group"
                                            title="Tự động hướng ra đường"
                                        >
                                            <Wand2 size={12} className="group-hover:text-blue-400" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-4 border-t border-[#333]/50">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Góc nhìn (FOV)</label>
                                        <span className="text-[10px] font-mono text-blue-400 font-bold mr-1">{getMetaValue('gis.fov_angle', 90)}°</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="range" min="10" max="180" step="1"
                                            value={getMetaValue('gis.fov_angle', 90)}
                                            onChange={(e) => updateNestedMeta('gis.fov_angle', parseInt(e.target.value))}
                                            className="flex-1 h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500 my-auto"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Chiều dài (Radius)</label>
                                        <span className="text-[10px] font-mono text-purple-400 font-bold mr-1">{getMetaValue('gis.fov_radius', 100)}m</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="range" min="1" max="1000" step="1"
                                            value={getMetaValue('gis.fov_radius', 100)}
                                            onChange={(e) => updateNestedMeta('gis.fov_radius', parseInt(e.target.value))}
                                            className="flex-1 h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500 my-auto"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
