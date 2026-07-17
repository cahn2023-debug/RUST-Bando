import React, { useMemo, useState, useEffect } from 'react';
import {
  Save, Settings, Camera, Ruler,
  Pin, PinOff, X, Check, Plus, Trash2, Edit3, Grid3X3
} from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import {
  normalizeProjectSettings,
  normalizeSchemaFieldKey,
  type ObjectDataTemplateField,
  type ObjectDataTemplateGroup,
  type ObjectDataTemplateType,
  type ObjectDataTemplateTypeId,
  type ProjectSettingsSchema,
} from '@TOOL/utils/objectDataTemplates';

const CAMERA_TYPE_LABELS: Record<string, string> = {
  cctv: 'CCTV (Bullet/Dome)',
  ptz: 'PTZ Camera',
  speed: 'Speed Camera',
  lpr: 'LPR Camera',
  default: 'Default',
};

const TEMPLATE_TYPE_ORDER: ObjectDataTemplateTypeId[] = ['intersection', 'camera', 'line'];

const createBlankField = (groupId: string, order: number): ObjectDataTemplateField => ({
  key: '',
  label: '',
  type: 'text',
  groupId,
  order,
  showInPalette: true,
  showInAnalysis: true,
});

const asTemplateSettings = (value: unknown): ProjectSettingsSchema => normalizeProjectSettings(value);

export const SystemConfigPanel: React.FC<{ onClose?: () => void }> = ({ onClose: propOnClose }) => {
  const { onPin, onClose: contextOnClose, isPinned, dragHandleProps } = usePaletteContext();
  const onClose = propOnClose || contextOnClose;
  const { state, updateSettings } = useDesignSync();
  const [localSettings, setLocalSettings] = useState<ProjectSettingsSchema>(() => normalizeProjectSettings(state?.settings));
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setLocalSettings(asTemplateSettings(state?.settings));
  }, [state?.settings]);

  const isDirty = useMemo(() => (
    JSON.stringify(localSettings) !== JSON.stringify(normalizeProjectSettings(state?.settings))
  ), [localSettings, state?.settings]);

  const updateTemplateType = (typeId: ObjectDataTemplateTypeId, updater: (current: ObjectDataTemplateType) => ObjectDataTemplateType) => {
    setLocalSettings((prev) => ({
      ...prev,
      object_data_templates: {
        ...prev.object_data_templates,
        types: {
          ...prev.object_data_templates.types,
          [typeId]: updater(prev.object_data_templates.types[typeId]),
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose?.();
      }, 1000);
    } finally {
      setIsSaving(false);
    }
  };

  const updateGroup = (typeId: ObjectDataTemplateTypeId, groupIndex: number, field: keyof ObjectDataTemplateGroup, value: string | number) => {
    updateTemplateType(typeId, (current) => {
      const groups = [...current.groups];
      groups[groupIndex] = { ...groups[groupIndex], [field]: value } as ObjectDataTemplateGroup;
      return { ...current, groups: groups.sort((left, right) => left.order - right.order) };
    });
  };

  const addGroup = (typeId: ObjectDataTemplateTypeId) => {
    updateTemplateType(typeId, (current) => {
      const nextIndex = current.groups.length + 1;
      const groupId = normalizeSchemaFieldKey(window.prompt('Group key', `group_${nextIndex}`) || `group_${nextIndex}`) || `group_${nextIndex}`;
      const label = window.prompt('Group label', `Group ${nextIndex}`) || `Group ${nextIndex}`;
      return {
        ...current,
        groups: [...current.groups, { id: groupId, label, order: nextIndex * 10 }],
      };
    });
  };

  const removeGroup = (typeId: ObjectDataTemplateTypeId, groupId: string) => {
    updateTemplateType(typeId, (current) => {
      const groups = current.groups.filter((group) => group.id !== groupId);
      const fallbackGroupId = groups[0]?.id || 'general';
      const fields = current.fields.map((field) => (
        field.groupId === groupId ? { ...field, groupId: fallbackGroupId } : field
      ));
      return { ...current, groups, fields };
    });
  };

  const addField = (typeId: ObjectDataTemplateTypeId) => {
    updateTemplateType(typeId, (current) => {
      const nextOrder = current.fields.length + 1;
      const groupId = current.groups[0]?.id || 'general';
      return { ...current, fields: [...current.fields, createBlankField(groupId, nextOrder * 10)] };
    });
  };

  const updateField = (typeId: ObjectDataTemplateTypeId, fieldIndex: number, patch: Partial<ObjectDataTemplateField>) => {
    updateTemplateType(typeId, (current) => {
      const fields = [...current.fields];
      fields[fieldIndex] = { ...fields[fieldIndex], ...patch, key: patch.key ? normalizeSchemaFieldKey(patch.key) : fields[fieldIndex].key };
      return { ...current, fields: fields.sort((left, right) => left.order - right.order) };
    });
  };

  const removeField = (typeId: ObjectDataTemplateTypeId, fieldIndex: number) => {
    updateTemplateType(typeId, (current) => ({
      ...current,
      fields: current.fields.filter((_, index) => index !== fieldIndex),
    }));
  };

  const updateCameraPreset = (presetId: string, key: 'focal_length' | 'sensor_size' | 'resolution_x' | 'resolution_y', value: string | number) => {
    setLocalSettings((prev) => ({
      ...prev,
      camera_presets: {
        ...prev.camera_presets,
        [presetId]: {
          ...prev.camera_presets[presetId],
          [key]: value,
        },
      },
    }));
  };

  return (
    <div className="flex max-h-full w-[760px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f12] text-gray-200 shadow-2xl">
      <div
        {...dragHandleProps}
        className="flex items-center justify-between border-b border-white/10 bg-[#1a2126] px-3 py-2.5 drag-handle cursor-move"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-cad-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Cau hinh he thong</span>
          {(isDirty || isSaving || showSuccess) && (
            <div className={`h-1.5 w-1.5 rounded-full ${showSuccess ? 'bg-green-500' : 'bg-cad-accent'} animate-pulse`} />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPin}
            className={`rounded p-1 transition-all hover:bg-cad-accent hover:text-black ${isPinned ? 'text-cad-accent' : 'text-gray-500'}`}
            title={isPinned ? 'Auto-hide' : 'Pin'}
          >
            {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 transition-all hover:bg-red-500 hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
            <Ruler className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thong so mac dinh du an</span>
            <div className="ml-2 h-px flex-1 bg-[#333]" />
          </div>

          <div className="grid gap-3 rounded-lg border border-[#222] bg-[#101419] p-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-tight text-cad-text-secondary">Chieu cao lap dat mac dinh (m)</span>
              <input
                type="number"
                value={localSettings.default_install_height}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, default_install_height: Number(e.target.value) }))}
                className="w-full rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cad-accent"
              />
            </label>

            <div className="rounded border border-cad-accent/20 bg-cad-accent/5 p-3 text-[10px] text-cad-text-secondary">
              Thong so nay se duoc ap dung khi tao doi tuong moi neu khong chon gia tri rieng.
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
            <Grid3X3 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Database mau theo doi tuong</span>
            <div className="ml-2 h-px flex-1 bg-[#333]" />
          </div>

          <div className="space-y-4">
            {TEMPLATE_TYPE_ORDER.map((typeId) => {
              const template = localSettings.object_data_templates.types[typeId];
              return (
                <div key={typeId} className="rounded-lg border border-[#222] bg-[#101419] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-cad-accent">
                      <Camera className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-widest">{template.label}</span>
                    </div>
                    <button
                      onClick={() => addField(typeId)}
                      className="flex items-center gap-1 rounded border border-cad-border px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-cad-text-secondary hover:border-cad-accent hover:text-cad-accent"
                    >
                      <Plus size={11} /> Them field
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.groups.map((group, groupIndex) => (
                      <div key={group.id} className="flex items-center gap-2 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1">
                        <input
                          value={group.id}
                          onChange={(e) => updateGroup(typeId, groupIndex, 'id', e.target.value)}
                          className="w-24 bg-transparent text-[10px] font-mono text-white outline-none"
                        />
                        <input
                          value={group.label}
                          onChange={(e) => updateGroup(typeId, groupIndex, 'label', e.target.value)}
                          className="w-32 bg-transparent text-[10px] text-white outline-none"
                        />
                        <button onClick={() => removeGroup(typeId, group.id)} className="text-cad-text-muted hover:text-rose-400">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addGroup(typeId)}
                      className="flex items-center gap-1 rounded border border-dashed border-[#333] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-cad-text-muted hover:border-cad-accent hover:text-cad-accent"
                    >
                      <Plus size={11} /> Add group
                    </button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded border border-[#222]">
                    <div className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 border-b border-[#222] bg-[#0a0a0a] px-2 py-2 text-[9px] font-black uppercase tracking-widest text-cad-text-muted">
                      <span>Label</span>
                      <span>Key</span>
                      <span>Type</span>
                      <span>Group</span>
                      <span>Palette</span>
                      <span>Analysis</span>
                      <span />
                    </div>
                    <div className="divide-y divide-[#222]">
                      {template.fields.map((field, fieldIndex) => (
                        <div key={`${field.key || fieldIndex}`} className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 px-2 py-2">
                          <input
                            value={field.label}
                            onChange={(e) => updateField(typeId, fieldIndex, { label: e.target.value })}
                            className="rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 text-[10px] text-white outline-none"
                            placeholder="Label"
                          />
                          <input
                            value={field.key}
                            onChange={(e) => updateField(typeId, fieldIndex, { key: e.target.value })}
                            className="rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 font-mono text-[10px] text-white outline-none"
                            placeholder="field_key"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => updateField(typeId, fieldIndex, { type: e.target.value as ObjectDataTemplateField['type'] })}
                            className="rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 text-[10px] text-white outline-none"
                          >
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="select">select</option>
                          </select>
                          <select
                            value={field.groupId}
                            onChange={(e) => updateField(typeId, fieldIndex, { groupId: e.target.value })}
                            className="rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1 text-[10px] text-white outline-none"
                          >
                            {template.groups.map((group) => (
                              <option key={group.id} value={group.id}>{group.label}</option>
                            ))}
                          </select>
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={field.showInPalette}
                              onChange={(e) => updateField(typeId, fieldIndex, { showInPalette: e.target.checked })}
                              className="h-3.5 w-3.5 accent-cad-accent"
                            />
                          </label>
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={field.showInAnalysis}
                              onChange={(e) => updateField(typeId, fieldIndex, { showInAnalysis: e.target.checked })}
                              className="h-3.5 w-3.5 accent-cad-accent"
                            />
                          </label>
                          <button onClick={() => removeField(typeId, fieldIndex)} className="rounded p-1 text-cad-text-muted hover:text-rose-400">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 space-y-4">
          <div className="flex items-center gap-2 px-1 text-cad-text-secondary">
            <Camera className="h-3.5 w-3.5 text-green-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thong so mau camera</span>
            <div className="ml-2 h-px flex-1 bg-[#333]" />
          </div>
          <div className="space-y-4 rounded-lg border border-[#222] bg-[#101419] p-3">
            {Object.entries(localSettings.camera_presets).map(([presetId, preset]) => (
              <div key={presetId} className="space-y-2 border-b border-[#222] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 text-cad-accent">
                  <Edit3 className="h-3 w-3" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{CAMERA_TYPE_LABELS[presetId] || presetId}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-tight text-cad-text-secondary">Tieu cu (mm)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={preset.focal_length}
                      onChange={(e) => updateCameraPreset(presetId, 'focal_length', Number(e.target.value))}
                      className="w-full rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cad-accent"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-tight text-cad-text-secondary">Cam bien</span>
                    <input
                      value={preset.sensor_size}
                      onChange={(e) => updateCameraPreset(presetId, 'sensor_size', e.target.value)}
                      className="w-full rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cad-accent"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-tight text-cad-text-secondary">Res X</span>
                    <input
                      type="number"
                      value={preset.resolution_x}
                      onChange={(e) => updateCameraPreset(presetId, 'resolution_x', Number(e.target.value))}
                      className="w-full rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cad-accent"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-tight text-cad-text-secondary">Res Y</span>
                    <input
                      type="number"
                      value={preset.resolution_y}
                      onChange={(e) => updateCameraPreset(presetId, 'resolution_y', Number(e.target.value))}
                      className="w-full rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cad-accent"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex gap-2 border-t border-[#333] p-3">
        {onClose && (
          <button
            onClick={onClose}
            className="flex-1 rounded border border-[#444] bg-transparent py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-all hover:border-gray-400 hover:text-white active:scale-95"
          >
            Huy
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving || showSuccess}
          className={`flex-[2] flex items-center justify-center gap-2 rounded py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${showSuccess
            ? 'bg-green-500 text-white'
            : isDirty
              ? 'bg-cad-accent text-black hover:bg-white'
              : 'cursor-not-allowed bg-white/5 text-gray-500 opacity-50'
            }`}
        >
          {showSuccess ? <><Check size={14} /> Da luu</> : isSaving ? <><div className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" /> Dang luu...</> : <><Save size={14} /> Luu cau hinh</>}
        </button>
      </div>
    </div>
  );
};
