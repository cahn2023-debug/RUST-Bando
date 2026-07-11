import React, { useState } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    Layers, Save, CheckSquare, Square,
    ChevronRight, Camera, Maximize, Ruler, Settings
} from 'lucide-react';
import { cn } from '@TOOL/utils/cn';
import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';

import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import { Pin, PinOff, X } from 'lucide-react';

type CameraPreset = {
    sensor_size?: string;
    focal_length?: number;
    resolution_x?: number;
    resolution_y?: number;
};

const getDefaultPreset = (state: ReturnType<typeof useDesignSync.getState>['state']): CameraPreset =>
    (state?.settings &&
        typeof state.settings.camera_presets === 'object' &&
        state.settings.camera_presets &&
        'default' in state.settings.camera_presets
        ? (state.settings.camera_presets as Record<string, CameraPreset>).default
        : {}) ?? {};

export const BulkEditPanel: React.FC = () => {
    const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext();
    const { selectionSet, state, queueEvents } = useDesignSync();
    const [isApplying, setIsApplying] = useState(false);
    const defaultPreset = getDefaultPreset(state);

    // Editable fields with their check state
    const [fields, setFields] = useState({
        install_height: { active: false, value: state?.settings?.default_install_height ?? 3.5 },
        sensor_size: { active: false, value: defaultPreset.sensor_size ?? '1/3"' },
        focal_length: { active: false, value: defaultPreset.focal_length ?? 4.0 },
        resolution_x: { active: false, value: defaultPreset.resolution_x ?? 1920 },
        resolution_y: { active: false, value: defaultPreset.resolution_y ?? 1080 },
        rotation: { active: false, value: 0 },
    });

    // Update fields when settings change (if not yet modified or active)
    React.useEffect(() => {
        if (state?.settings) {
            setFields(prev => ({
                ...prev,
                install_height: prev.install_height.active ? prev.install_height : { ...prev.install_height, value: state.settings.default_install_height ?? prev.install_height.value },
                sensor_size: prev.sensor_size.active ? prev.sensor_size : { ...prev.sensor_size, value: getDefaultPreset(state).sensor_size ?? prev.sensor_size.value },
                focal_length: prev.focal_length.active ? prev.focal_length : { ...prev.focal_length, value: getDefaultPreset(state).focal_length ?? prev.focal_length.value },
                resolution_x: prev.resolution_x.active ? prev.resolution_x : { ...prev.resolution_x, value: getDefaultPreset(state).resolution_x ?? prev.resolution_x.value },
                resolution_y: prev.resolution_y.active ? prev.resolution_y : { ...prev.resolution_y, value: getDefaultPreset(state).resolution_y ?? prev.resolution_y.value },
            }));
        }
    }, [state?.settings]);

    const selectedCount = selectionSet.size;

    const toggleField = (key: keyof typeof fields) => {
        setFields(prev => ({
            ...prev,
            [key]: { ...prev[key], active: !prev[key].active }
        }));
    };

    const updateValue = (key: keyof typeof fields, value: any) => {
        setFields(prev => ({
            ...prev,
            [key]: { ...prev[key], value }
        }));
    };

    const handleApply = async () => {
        if (selectedCount === 0 || isApplying) return;

        const activeFields = Object.entries(fields)
            .filter(([_, data]) => data.active)
            .reduce((acc, [key, data]) => ({ ...acc, [key]: data.value }), {} as any);

        if (Object.keys(activeFields).length === 0) {
            alert("Vui lòng chọn ít nhất một trường để cập nhật.");
            return;
        }

        setIsApplying(true);
        try {
            const updates = Array.from(selectionSet).map(id => {
                const feature = state?.features[id];
                if (!feature) return null;

                const currentMeta = typeof feature.metadata === 'string'
                    ? JSON.parse(feature.metadata || '{}')
                    : (feature.metadata || {});

                const normalized = normalizeMetadataObject(currentMeta);

                // Build the patch object
                const specsPatch: any = {};
                const gisPatch: any = {};

                if (fields.install_height.active) specsPatch.install_height = fields.install_height.value;
                if (fields.focal_length.active) specsPatch.focal_length = fields.focal_length.value;
                if (fields.sensor_size.active) specsPatch.sensor_size = fields.sensor_size.value;
                if (fields.resolution_x.active) specsPatch.resolution_x = fields.resolution_x.value;
                if (fields.resolution_y.active) specsPatch.resolution_y = fields.resolution_y.value;

                if (fields.rotation.active) gisPatch.rotation = fields.rotation.value;

                // Deep merge patches into normalized metadata
                const updatedMeta = {
                    ...normalized,
                    specs: {
                        ...(normalized.specs || {}),
                        ...specsPatch
                    },
                    gis: {
                        ...(normalized.gis || {}),
                        ...gisPatch
                    }
                };

                return {
                    type: 'FeatureUpdated' as const,
                    payload: {
                        id,
                        metadata: JSON.stringify(updatedMeta)
                    }
                };
            }).filter(Boolean);

            if (updates.length > 0) {
                await queueEvents(updates as any);
                alert(`Đã cập nhật thành công ${updates.length} thiết bị.`);
            }
        } catch (err) {
            console.error("Bulk update failed:", err);
            alert("Lỗi khi cập nhật hàng loạt.");
        } finally {
            setIsApplying(false);
        }
    };

    if (selectedCount <= 1) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center opacity-50 h-full">
                <Layers className="w-12 h-12 text-cad-text-muted mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">
                    Chế độ chỉnh sửa hàng loạt
                </p>
                <p className="text-[9px] mt-2 text-cad-text-muted">
                    Vui lòng chọn từ 2 thiết bị trở lên trên bản đồ để bắt đầu.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-200 select-none shadow-2xl rounded-lg border border-[#333]">
            {/* Header */}
            <div
                {...dragHandleProps}
                className="flex items-center justify-between p-2.5 border-b border-[#333] bg-[#252525] drag-handle cursor-move rounded-t-lg hover:bg-[#2a2a2a] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-cad-accent" />
                    <span className="text-[10px] font-bold tracking-wider uppercase text-gray-300">
                        Chỉnh sửa hàng loạt
                    </span>
                </div>
                <div className="flex items-center gap-1">
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
                <div className="flex items-center gap-3 p-3 bg-cad-accent/5 border border-cad-accent/20 rounded">
                    <Layers className="text-cad-accent w-4 h-4 shrink-0" />
                    <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-tight leading-none">Đang chỉnh sửa {selectedCount} thiết bị</p>
                        <p className="text-[8px] text-cad-accent font-bold uppercase tracking-[0.2em] mt-1">Sẵn sàng áp dụng</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
                        <Camera className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thông số Camera</span>
                        <div className="flex-1 h-[1px] bg-[#333] ml-2" />
                    </div>

                    <div className="space-y-4 px-1">
                        <BulkField
                            label="Chiều cao lắp đặt (m)"
                            icon={<Ruler size={12} />}
                            active={fields.install_height.active}
                            onToggle={() => toggleField('install_height')}
                            value={fields.install_height.value}
                            onChange={(v) => updateValue('install_height', parseFloat(v))}
                            type="number"
                        />

                        <BulkField
                            label="Góc xoay (360°)"
                            icon={<Settings size={12} />}
                            active={fields.rotation.active}
                            onToggle={() => toggleField('rotation')}
                            value={fields.rotation.value}
                            onChange={(v) => updateValue('rotation', parseInt(v))}
                            type="number"
                        />

                        <BulkField
                            label="Tiêu cự (mm)"
                            icon={<Camera size={12} />}
                            active={fields.focal_length.active}
                            onToggle={() => toggleField('focal_length')}
                            value={fields.focal_length.value}
                            onChange={(v) => updateValue('focal_length', parseFloat(v))}
                            type="number"
                        />

                        <BulkField
                            label="Cảm biến (inch)"
                            icon={<Maximize size={12} />}
                            active={fields.sensor_size.active}
                            onToggle={() => toggleField('sensor_size')}
                            value={fields.sensor_size.value}
                            onChange={(v) => updateValue('sensor_size', v)}
                            type="select"
                            options={['1/3"', '1/2.8"', '1/1.8"', '1/1.2"', 'Full Frame']}
                        />

                        <div className="space-y-2">
                            <BulkField
                                label="Resolution X"
                                icon={<Maximize size={12} />}
                                active={fields.resolution_x.active}
                                onToggle={() => {
                                    toggleField('resolution_x');
                                    if (!fields.resolution_y.active) toggleField('resolution_y');
                                }}
                                value={fields.resolution_x.value}
                                onChange={(v) => updateValue('resolution_x', parseInt(v))}
                                type="number"
                            />
                            <div className="pl-6">
                                <BulkField
                                    label="Resolution Y"
                                    icon={<Maximize size={12} className="opacity-0" />}
                                    active={fields.resolution_y.active}
                                    onToggle={() => toggleField('resolution_y')} // Just a dummy or no toggle
                                    value={fields.resolution_y.value}
                                    onChange={(v) => updateValue('resolution_y', parseInt(v))}
                                    type="number"
                                    hideToggle
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3 border-t border-[#333] flex flex-col gap-2">
                <button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="w-full py-3 bg-cad-accent hover:bg-white text-black text-[10px] font-black uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 shadow-lg shadow-cad-accent/10 active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                    {isApplying ? <LoaderIcon className="animate-spin" /> : <Save size={14} />}
                    ÁP DỤNG({selectedCount})
                </button>
            </div>
        </div>
    );
};

const LoaderIcon = ({ className }: { className?: string }) => (
    <svg className={cn("w-4 h-4", className)} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2V6M12 18V22M6 12H2M22 12H18M19.07 4.93L16.24 7.76M7.76 16.24L4.93 19.07M19.07 19.07L16.24 16.24M7.76 7.76L4.93 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

interface BulkFieldProps {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onToggle: () => void;
    value: any;
    onChange: (v: any) => void;
    type: 'number' | 'text' | 'select';
    options?: string[];
    hideToggle?: boolean;
}

const BulkField: React.FC<BulkFieldProps> = ({
    label, icon, active, onToggle, value, onChange, type, options, hideToggle
}) => {
    return (
        <div className={cn(
            "group flex flex-col gap-1.5 p-2 rounded-sm border transition-all",
            active ? "bg-cad-accent/5 border-cad-accent/30 shadow-inner" : "bg-cad-bg/50 border-cad-border hover:border-cad-border/80"
        )}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {!hideToggle && (
                        <button
                            onClick={onToggle}
                            className={cn(
                                "p-0.5 rounded transition-colors border",
                                active ? "bg-cad-accent border-cad-accent text-black" : "bg-transparent border-cad-border text-cad-text-muted"
                            )}
                        >
                            {active ? <CheckSquare size={10} /> : <Square size={10} />}
                        </button>
                    )}
                    <span className={cn(
                        "text-[9px] font-bold uppercase tracking-tight flex items-center gap-1.5",
                        active ? "text-cad-accent" : "text-cad-text-muted"
                    )}>
                        {icon} {label}
                    </span>
                </div>
                {active && (
                    <ChevronRight size={10} className="text-cad-accent animate-in slide-in-from-left-2" />
                )}
            </div>

            <div className={cn(
                "transition-all duration-300",
                active ? "opacity-100 translate-y-0" : "opacity-30 pointer-events-none"
            )}>
                {type === 'select' ? (
                    <select
                        className="w-full bg-black border border-cad-border rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    >
                        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                ) : (
                    <input
                        type={type}
                        className="w-full bg-black border border-cad-border rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cad-accent font-mono"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
                )}
            </div>
        </div>
    );
};
