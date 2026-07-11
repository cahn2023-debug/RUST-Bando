import React, { useState, useEffect } from 'react';
import {
    Save, Settings, Info, Camera, Ruler,
    Pin, PinOff, X, Check
} from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';

interface CameraTypePreset {
    focal_length: number;
    sensor_size: string;
    resolution_x: number;
    resolution_y: number;
}

interface ProjectSettings {
    default_install_height: number;
    camera_presets: Record<string, CameraTypePreset>;
}

const isCameraTypePreset = (value: unknown): value is CameraTypePreset =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as CameraTypePreset).sensor_size === 'string' &&
    typeof (value as CameraTypePreset).focal_length === 'number' &&
    typeof (value as CameraTypePreset).resolution_x === 'number' &&
    typeof (value as CameraTypePreset).resolution_y === 'number';

const asProjectSettings = (value: unknown): ProjectSettings | null => {
    if (!value || typeof value !== 'object') return null;
    const settings = value as Record<string, unknown>;
    const presets = settings.camera_presets;
    if (
        typeof settings.default_install_height !== 'number' ||
        !presets ||
        typeof presets !== 'object'
    ) {
        return null;
    }

    const normalizedPresets = Object.entries(presets).reduce<Record<string, CameraTypePreset>>((acc, [key, preset]) => {
        if (isCameraTypePreset(preset)) {
            acc[key] = preset;
        }
        return acc;
    }, {});

    return {
        default_install_height: settings.default_install_height,
        camera_presets: normalizedPresets,
    };
};

const DEFAULT_SETTINGS: ProjectSettings = {
    default_install_height: 5,
    camera_presets: {
        'cctv': { focal_length: 4, sensor_size: '1/2.8"', resolution_x: 1920, resolution_y: 1080 },
        'ptz': { focal_length: 4.8, sensor_size: '1/2.8"', resolution_x: 1920, resolution_y: 1080 },
        'speed': { focal_length: 6, sensor_size: '1/2"', resolution_x: 2560, resolution_y: 1440 },
        'lpr': { focal_length: 12, sensor_size: '1/1.8"', resolution_x: 1920, resolution_y: 1080 },
        'default': { focal_length: 3.6, sensor_size: '1/3"', resolution_x: 1920, resolution_y: 1080 },
    }
};

const CAMERA_TYPES = [
    { id: 'cctv', label: 'CCTV (Bullet/Dome)', icon: <Camera size={12} /> },
    { id: 'ptz', label: 'PTZ Camera', icon: <Camera size={12} /> },
    { id: 'speed', label: 'Speed Camera', icon: <Camera size={12} /> },
    { id: 'lpr', label: 'LPR Camera', icon: <Camera size={12} /> },
    { id: 'default', label: 'Loại khác', icon: <Camera size={12} /> },
];

export const SystemConfigPanel: React.FC<{ onClose?: () => void }> = ({ onClose: propOnClose }) => {
    const { onPin, onClose: contextOnClose, isPinned, dragHandleProps } = usePaletteContext();
    const onClose = propOnClose || contextOnClose;
    const { state, updateSettings } = useDesignSync();
    const [localSettings, setLocalSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const isDirty = JSON.stringify(localSettings) !== JSON.stringify(state?.settings || DEFAULT_SETTINGS);

    useEffect(() => {
        const nextSettings = asProjectSettings(state?.settings);
        if (nextSettings && Object.keys(nextSettings.camera_presets).length > 0) {
            setLocalSettings(nextSettings);
        }
    }, [state?.settings]);

    const handleSave = async () => {
        if (!isDirty || isSaving) return;
        setIsSaving(true);
        try {
            await updateSettings(localSettings);
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                if (onClose) onClose();
            }, 1000);
        } finally {
            setIsSaving(false);
        }
    };

    const updatePreset = (type: string, field: keyof CameraTypePreset, value: string | number) => {
        setLocalSettings(prev => ({
            ...prev,
            camera_presets: {
                ...prev.camera_presets,
                [type]: {
                    ...prev.camera_presets[type],
                    [field]: value
                }
            }
        }));
    };

    return (
        <div className="flex flex-col max-h-full w-[450px] bg-[#0b0f12] text-gray-200 select-none rounded-xl border border-white/10 shadow-2xl overflow-hidden anim-in fade-in duration-200">
            {/* Header */}
            <div
                {...dragHandleProps}
                className="flex items-center justify-between p-2.5 border-b border-white/10 bg-[#1a2126] drag-handle cursor-move hover:bg-[#252d33] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-cad-accent" />
                    <span className="text-[10px] font-bold tracking-wider uppercase text-gray-300">
                        Cấu hình hệ thống
                    </span>
                    {(isDirty || isSaving || showSuccess) && (
                        <div className={`w-1.5 h-1.5 rounded-full ${showSuccess ? 'bg-green-500' : 'bg-cad-accent'} animate-pulse`} />
                    )}
                </div>
                <div className="flex items-center gap-1">
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

            <div className="flex-1 overflow-y-auto p-2.5 space-y-8 custom-scrollbar pb-8">
                {/* Global Defaults */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
                        <Ruler className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thông số mặc định dự án</span>
                        <div className="flex-1 h-[1px] bg-[#333] ml-2" />
                    </div>

                    <div className="px-1 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Chiều cao lắp đặt mặc định (m)</label>
                            <input
                                type="number"
                                value={localSettings.default_install_height}
                                onChange={(e) => setLocalSettings(p => ({ ...p, default_install_height: Number(e.target.value) }))}
                                className="w-full bg-transparent border-b border-[#333] focus:border-cad-accent px-1 py-1.5 text-xs text-white outline-none transition-colors font-mono"
                                placeholder="Nhập chiều cao (m)..."
                            />
                        </div>

                        <div className="flex items-start gap-2 p-2 rounded border border-cad-accent/20 bg-cad-accent/5">
                            <Info size={12} className="text-cad-accent mt-0.5 shrink-0" />
                            <p className="text-[10px] text-cad-text-secondary leading-relaxed">
                                Thông số này sẽ được áp dụng tự động khi bạn tạo thiết bị mới nếu không chỉ định rõ.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Camera Presets */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
                        <Camera className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thông số kỹ thuật mẫu</span>
                        <div className="flex-1 h-[1px] bg-[#333] ml-2" />
                    </div>

                    <div className="space-y-6 px-1">
                        {CAMERA_TYPES.map(type => (
                            <div key={type.id} className="space-y-3 pb-4 border-b border-[#333]/50 last:border-0">
                                <div className="flex items-center gap-2 text-cad-accent">
                                    {type.icon}
                                    <span className="text-[9px] font-black uppercase tracking-widest">
                                        {type.label}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Tiêu cự (mm)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={localSettings.camera_presets[type.id]?.focal_length || 0}
                                            onChange={(e) => updatePreset(type.id, 'focal_length', Number(e.target.value))}
                                            className="w-full bg-transparent border-b border-[#333] focus:border-cad-accent px-1 py-1 text-xs text-white outline-none transition-colors font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Cảm biến (inch)</label>
                                        <input
                                            type="text"
                                            value={localSettings.camera_presets[type.id]?.sensor_size || ''}
                                            onChange={(e) => updatePreset(type.id, 'sensor_size', e.target.value)}
                                            className="w-full bg-transparent border-b border-[#333] focus:border-cad-accent px-1 py-1 text-xs text-white outline-none transition-colors"
                                            placeholder='1/2.8"'
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Res X (px)</label>
                                        <input
                                            type="number"
                                            value={localSettings.camera_presets[type.id]?.resolution_x || 0}
                                            onChange={(e) => updatePreset(type.id, 'resolution_x', Number(e.target.value))}
                                            className="w-full bg-transparent border-b border-[#333] focus:border-cad-accent px-1 py-1 text-xs text-white outline-none transition-colors font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-cad-text-secondary uppercase font-bold tracking-tight">Res Y (px)</label>
                                        <input
                                            type="number"
                                            value={localSettings.camera_presets[type.id]?.resolution_y || 0}
                                            onChange={(e) => updatePreset(type.id, 'resolution_y', Number(e.target.value))}
                                            className="w-full bg-transparent border-b border-[#333] focus:border-cad-accent px-1 py-1 text-xs text-white outline-none transition-colors font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[#333] flex gap-2">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="flex-1 bg-transparent border border-[#444] hover:border-gray-400 text-gray-400 hover:text-white py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
                    >
                        Hủy
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={!isDirty || isSaving || showSuccess}
                    className={`flex-[2] flex items-center justify-center gap-2 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${showSuccess
                        ? 'bg-green-500 text-white'
                        : isDirty
                            ? 'bg-cad-accent hover:bg-white text-black shadow-cad-accent/10'
                            : 'bg-white/5 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                >
                    {showSuccess ? (
                        <>
                            <Check size={14} />
                            Đã lưu thành công
                        </>
                    ) : isSaving ? (
                        <>
                            <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Đang lưu...
                        </>
                    ) : (
                        <>
                            <Save size={14} />
                            Lưu cấu hình
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
