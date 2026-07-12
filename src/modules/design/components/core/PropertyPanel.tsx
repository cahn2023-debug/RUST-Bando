
import React, { useState, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import type { FeatureMetadata, FeatureProperties, IconType } from '@CONTRACT/types';
import {
  Save, Camera, MapPin, Route,
  Info, Palette, Settings, Image as ImageIcon,
  Calculator, Phone, User as UserIcon, Loader2, X, Clock, Grid3X3, Sparkles, FileUp, Briefcase,
  Layers, Zap, Radio, Construction, Pencil
} from "lucide-react";
import { IconSelector } from '@DESIGN/components/ui/IconSelector';
import { designLogic } from '@TOOL/utils/designLogic';
import { getFeatureDisplayInfo, safeString, getCleanName, isCameraIcon } from '@TOOL/utils/featureUtils';
import { useCamera } from '@IMPLEMENT/hooks/useCamera';
import { importFromExcel, importFromKML, getExcelHeaders, applyImportedRecords } from '@IMPLEMENT/services/importService';
import { safeOpenDialog } from '@IMPLEMENT/lib/tauri';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { cn } from '@TOOL/utils/cn';
import { useProjectData } from '@IMPLEMENT/hooks/useProjectData';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';

import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { buildFeaturePropertiesForPersistence, getTypeForIcon } from '@TOOL/utils/featurePersistence';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';

interface SegmentItem {
  id?: string | number;
  segment_type?: string;
  type?: string;
  length?: number;
  [key: string]: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asStringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;

const asNumberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Clipboard image could not be read as a data URL.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clipboard image.'));
    reader.readAsDataURL(file);
  });

const readClipboardImageDataUrls = async (clipboardData: DataTransfer): Promise<string[]> => {
  const imageFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);

  return Promise.all(imageFiles.map(readFileAsDataUrl));
};

const preparePropertyMetadata = (metaInput: unknown): FeatureMetadata => {
  const metaToSave = { ...((metaInput || {}) as FeatureMetadata) };

  if (metaToSave.size !== undefined && metaToSave.size !== null) {
    metaToSave.size = Number(metaToSave.size);
    if (isNaN(metaToSave.size)) {
      metaToSave.size = 4;
    }
  }

  const standardizedMeta = normalizeMetadataObject(metaToSave);
  if (!standardizedMeta.size && metaToSave.size) {
    standardizedMeta.size = metaToSave.size;
  }

  return standardizedMeta;
};

const getDebugShape = (metadata: FeatureMetadata, properties?: FeatureProperties) => ({
  metaIcon: metadata.icon ?? null,
  metaType: metadata.type ?? null,
  metaColor: metadata.color ?? null,
  metaSize: metadata.size ?? null,
  propIcon: properties?.icon ?? null,
  propIconKey: properties?.iconKey ?? null,
  propType: properties?.type ?? null,
});

export const PropertyPanel: React.FC = () => {
  const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext() || {};
  const {
    state,
    selectedFeatureId,
    selectFeature,
    dispatchEvent,
    queueEvent,
    setDrawingMode,
    setSelectedGroup,
    setActiveParentFeature,
    setPreview,
    previewMetadata,
    editingFeatureId,
    setEditingFeatureId,
    projectId,
    selectionSet
  } = useDesignSync();

  // Load contracts for the project
  const { contracts } = useProjectData({
    id: String(projectId ?? ''),
    name: '',
    pmp_path: '',
    path: '',
    description: null,
    contract_number: null,
    investor: null,
    contractor: null,
    signed_date: null,
    duration: null,
    end_date: null,
    status: 'active',
    created_at: '',
    updated_at: '',
  });
  const [isImporting, setIsImporting] = useState(false);

  // Multi-selection check will be handled in the final return block to avoid hook violations.

  const feature = selectedFeatureId && state?.features ? state.features[selectedFeatureId] : null;
  const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;
  const displayInfo = feature && group ? getFeatureDisplayInfo(feature, group.type, group.name) : null;
  const isIntersectionFeature = !!displayInfo?.isIntersection;

  const [localName, setLocalName] = useState('');
  const [localMeta, setLocalMeta] = useState<FeatureMetadata>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const togglePalette = useLayoutStore(s => s.togglePalette);
  const paletteConfigs = useLayoutStore(s => s.paletteConfigs);

  let persistedMeta: FeatureMetadata = {};
  let persistedMetaJson = '{}';
  if (feature) {
    try {
      const parsed = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
      persistedMeta = preparePropertyMetadata(parsed);
      persistedMetaJson = JSON.stringify(persistedMeta);
    } catch {
      persistedMeta = {};
      persistedMetaJson = '{}';
    }
  }

  const persistedName = feature ? getCleanName(feature, String(persistedMeta.display_order || persistedMeta.stt || persistedMeta.STT || '')) : '';
  const draftMeta = (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata)
    ? previewMetadata.metadata as FeatureMetadata
    : localMeta;
  const draftName = (previewMetadata?.id === selectedFeatureId && previewMetadata.name !== undefined)
    ? previewMetadata.name
    : localName;
  const isMetadataDirty = !!feature && JSON.stringify(preparePropertyMetadata(draftMeta)) !== persistedMetaJson;
  const isNameDirty = !!feature && draftName !== persistedName;

  // Cleanup preview on unmount or when changing feature
  useEffect(() => {
    return () => {
      setPreview(null, null);
    };
  }, [selectedFeatureId]);

  // Helper to get nested metadata values with legacy fallback
  const getMetaValue = (path: string, legacyKey?: string): unknown => {
    const parts = path.split('.');
    let current: unknown = localMeta;
    for (const part of parts) {
      const currentRecord = asRecord(current);
      if (!currentRecord) {
        current = undefined;
        break;
      }
      current = currentRecord[part];
    }
    if (current !== undefined && current !== null && current !== '') return current;
    if (legacyKey) {
      const metaRecord = localMeta as Record<string, unknown>;
      const legacyVal = metaRecord[legacyKey];
      if (legacyVal !== undefined) return legacyVal;
    }
    return undefined;
  };

  // Helper to update nested metadata
  const updateNestedMeta = (path: string, value: unknown) => {
    const next = { ...localMeta } as Record<string, unknown>;
    const parts = path.split('.');
    let current: Record<string, unknown> = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current[part] = { ...(current[part] as Record<string, unknown>) };
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;

    setLocalMeta(next as FeatureMetadata);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next as FeatureMetadata, localName);
    }
  };

  const appendImageUrls = (dataUrls: string[]) => {
    if (dataUrls.length === 0) return;
    const currentImages = asStringArray(getMetaValue('media.imageUrls', 'imageUrls'));
    updateNestedMeta('media.imageUrls', [...currentImages, ...dataUrls]);
  };

  const handleMediaPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const hasImage = Array.from(event.clipboardData.items)
      .some((item) => item.kind === 'file' && item.type.startsWith('image/'));

    if (!hasImage) return;

    event.preventDefault();
    try {
      appendImageUrls(await readClipboardImageDataUrls(event.clipboardData));
    } catch (error) {
      console.error('[PropertyPanel] Failed to paste clipboard image:', error);
    }
  };

  const openCameraPalettes = () => {
    const deviceConfig = paletteConfigs['device-config'];
    const cameraView = paletteConfigs['camera-view'];

    if (deviceConfig && !deviceConfig.isVisible) {
      togglePalette('device-config');
    }
    if (cameraView && !cameraView.isVisible) {
      togglePalette('camera-view');
    }
  };

  const handleIconChange = (icon: IconType) => {
    const nextMeta = {
      ...(localMeta || {}),
      icon,
      type: getTypeForIcon(icon),
    } as FeatureMetadata;

    console.groupCollapsed(`[PropertyPanel] Icon change -> ${icon}`);
    console.log('featureId:', selectedFeatureId);
    console.log('before:', getDebugShape(preparePropertyMetadata(localMeta), feature?.properties as FeatureProperties | undefined));
    console.log('after:', getDebugShape(preparePropertyMetadata(nextMeta), feature?.properties as FeatureProperties | undefined));
    console.groupEnd();

    setLocalMeta(nextMeta);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, nextMeta, localName);
    }

    if (isCameraIcon(icon)) {
      openCameraPalettes();
    }
  };

  // Camera integration
  const {
    isCameraOpen,
    isCapturing,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    capture
  } = useCamera({
    onCapture: (dataUrl) => {
      appendImageUrls([dataUrl]);
    },
    watermarkData: {
      location: (() => {
        try {
          const coords = typeof feature?.coordinates === 'string' ? JSON.parse(feature.coordinates) : feature?.coordinates;
          return Array.isArray(coords) && coords.length > 0 ? coords[0] : undefined;
        } catch (e) { return undefined; }
      })(),
      label: localName || 'Đối tượng khảo sát'
    }
  });

  // Sync local state when selection changes
  useEffect(() => {
    if (feature) {
      try {
        const meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
        const normalized = normalizeMetadataObject(meta);

        console.groupCollapsed(`[PropertyPanel] Feature synced from store ${feature.id}`);
        console.log('name:', feature.name);
        console.log('metadata(raw):', meta);
        console.log('metadata(normalized):', normalized);
        console.log('properties:', feature.properties);
        console.log('shape:', getDebugShape(normalized, feature.properties as FeatureProperties | undefined));
        console.groupEnd();

        // Cập nhật tên (làm sạch STT nếu có)
        const sttValue = asStringValue(normalized.display_order ?? normalized.stt ?? normalized.STT);
        setLocalName(getCleanName(feature, sttValue));

        // Cập nhật metadata
        setLocalMeta(normalized);
      } catch (e) {
        setLocalName(safeString(feature.name) || '');
        setLocalMeta({});
      }
    }
  }, [feature?.id]);

  useEffect(() => {
    if (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata) {
      setLocalMeta((prev) => {
        const incoming = previewMetadata.metadata as FeatureMetadata;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
      if (previewMetadata.name !== undefined) {
        setLocalName((prev) => prev !== previewMetadata.name ? previewMetadata.name! : prev);
      }
    }
  }, [previewMetadata, selectedFeatureId]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectFeature(null);
        setActiveParentFeature(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectFeature]);

  const handleSave = async () => {
    if (!feature || (!isNameDirty && !isMetadataDirty)) return;
    setIsSaving(true);
    setIsSaved(false);

    console.log('[PropertyPanel] 💾 Saving feature:', feature.id);
    console.log('[PropertyPanel] 📝 draftMeta before save:', JSON.stringify(draftMeta, null, 2));
    console.log('[PropertyPanel] 🔧 Size/Stroke value:', draftMeta.size);
    console.log('[PropertyPanel] 🎨 Color value:', draftMeta.color);

    try {
      const standardizedMeta = preparePropertyMetadata(draftMeta);
      const nextProperties = buildFeaturePropertiesForPersistence(
        feature.properties as FeatureProperties | undefined,
        standardizedMeta
      );

      console.groupCollapsed(`[PropertyPanel] Save payload ${feature.id}`);
      console.log('persisted-before:', getDebugShape(persistedMeta, feature.properties as FeatureProperties | undefined));
      console.log('standardizedMeta:', standardizedMeta);
      console.log('nextProperties:', nextProperties);
      console.log('persisted-after:', getDebugShape(standardizedMeta, nextProperties));
      console.groupEnd();

      console.log('[PropertyPanel] ✅ Standardized metadata:', JSON.stringify(standardizedMeta, null, 2));
      console.log('[PropertyPanel] 📦 Final payload size:', standardizedMeta.size);
      console.log('[PropertyPanel] 🧭 Final payload icon/type:', nextProperties.iconKey, nextProperties.type);

      // Save to database via event queue
      await queueEvent({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: draftName,
          metadata: JSON.stringify(standardizedMeta),
          properties: nextProperties
        }
      });

      console.log('[PropertyPanel] ✅ Event queued successfully');

      // CRITICAL: Force state update to trigger map re-render
      const currentState = useDesignSync.getState().state;
      if (currentState) {
        useDesignSync.setState({ state: { ...currentState } });
        console.log('[PropertyPanel] 🔄 Forced state update for re-render');
      }

      // CRITICAL: Verify save was successful
      await new Promise(resolve => setTimeout(resolve, 300));
      const verifyState = useDesignSync.getState().state;
      const verifyFeature = verifyState?.features[feature.id];
      if (verifyFeature) {
        const verifyMeta = typeof verifyFeature.metadata === 'string'
          ? JSON.parse(verifyFeature.metadata)
          : verifyFeature.metadata;
        const normalizedVerifyMeta = preparePropertyMetadata(verifyMeta);

        console.groupCollapsed(`[PropertyPanel] Save verification ${feature.id}`);
        console.log('expected shape:', getDebugShape(standardizedMeta, nextProperties));
        console.log('actual metadata:', verifyMeta);
        console.log('actual properties:', verifyFeature.properties);
        console.log('actual shape:', getDebugShape(normalizedVerifyMeta, verifyFeature.properties as FeatureProperties | undefined));
        console.groupEnd();

        console.log('[PropertyPanel] 🔍 Verification:');
        console.log('[PropertyPanel]   Expected size:', standardizedMeta.size);
        console.log('[PropertyPanel]   Actual size:', verifyMeta.size);

        if (
          verifyMeta.size !== standardizedMeta.size ||
          normalizedVerifyMeta.icon !== standardizedMeta.icon ||
          normalizedVerifyMeta.type !== standardizedMeta.type ||
          verifyFeature.properties?.iconKey !== nextProperties.iconKey ||
          verifyFeature.properties?.type !== nextProperties.type
        ) {
          console.error('[PropertyPanel] ❌ Metadata was not saved correctly!');
          console.error('[PropertyPanel] This indicates a sync/database write issue or state overwrite.');
        } else {
          console.log('[PropertyPanel] ✅ Metadata saved successfully!');
        }
      }

      // Success feedback
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);

      // Clear preview after save
      setPreview(null, null);
    } catch (error) {
      console.error("[PropertyPanel] ❌ Save failed:", error);
      alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async () => {
    if (!feature || !state) return;
    setIsImporting(true);
    try {
      const selected = await safeOpenDialog({
        filters: [{ name: 'GIS Data', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb', 'kml', 'kmz'] }],
        multiple: false,
        directory: false,
      });
      if (!selected || typeof selected !== 'string') {
        return;
      }

      const filePath = selected;
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      // Virtual Folder Logic: Data goes to the same group, but is tied to this feature's ID
      const targetGroupId = feature.group_id;

      if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext)) {
        const headers = await getExcelHeaders(filePath);
        if (headers.length === 0) { alert('File Excel rỗng hoặc không đọc được.'); return; }
        const records = await importFromExcel(filePath, {
          name_column: headers[0] || '',
          lat_column: headers.find((header) => /lat|vĩ|vi_do|latitude/i.test(header)) || '',
          lng_column: headers.find((header) => /lng|lon|kinh|longitude/i.test(header)) || '',
          description_column: headers.find((header) => /mô tả|mo ta|description|ghi chú/i.test(header)),
          order_column: headers.find((header) => /stt|order|mã hiệu|ma hieu|id/i.test(header)),
        });
        const importedCount = await applyImportedRecords(records, targetGroupId ?? undefined);
        alert(`✅ Đã import ${importedCount} đối tượng từ ${fileName}.`);
      } else if (['kml', 'kmz'].includes(ext)) {
        const records = await importFromKML(filePath);
        const importedCount = await applyImportedRecords(records, targetGroupId ?? undefined);
        alert(`✅ Đã import ${importedCount} đối tượng từ ${fileName}.`);
      } else if (['gpx'].includes(ext)) {
        alert('Định dạng GPX sẽ được hỗ trợ trong phiên bản tiếp theo.');
      } else {
        alert('Định dạng file không được hỗ trợ. Vui lòng chọn Excel, KML, hoặc KMZ.');
      }

      // Auto-select the target group to expand it in sidebar
      setSelectedGroup(targetGroupId);
      setPreview(null, null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Import error:', err);
      alert('Lỗi import: ' + errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = () => {
    if (!feature) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!feature) return;
    await dispatchEvent({
      type: 'FeatureDeleted',
      payload: { id: feature.id }
    });
    selectFeature(null);
    setShowDeleteModal(false);
  };


  // Removed the second `selectionSet` declaration as per instruction.
  // The `selectionSet` is now declared at the top.

  if (selectionSet.size > 1) {
    return (
      <aside className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-[#444]" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-50">
          <div className="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4 text-cad-accent">
            <Layers className="w-8 h-8" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest">Multi-Selection Active</p>
          <p className="text-[9px] mt-2 mb-4 max-w-[200px]">
            Please use the <strong>Bulk Edit</strong> palette to modify multiple items.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => selectFeature(null)}
              className="px-3 py-1 bg-cad-bg border border-cad-border text-[8px] font-bold uppercase rounded-sm hover:bg-cad-elevated"
            >
              Deselect All
            </button>
          </div>
        </div>
      </aside>
    );
  }

  if (!feature) {
    return (
      <aside className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-[#444]" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-50">
          <div className="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4">
            <Settings className="w-8 h-8 text-[#444]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest">No Selection</p>
          <p className="text-[9px] mt-1">Select an entity to configure</p>
        </div>
      </aside>
    );
  }

  const isPolyline = feature.geom_type === 'LineString' || feature.geom_type === 'polyline';
  const distance = isPolyline ? asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')) : 0;
  const linkBudget = isPolyline ? designLogic.calculateFiberLinkBudget(distance) : 0;

  // Detect polyline type for specific metadata
  const polyType = asStringValue(
    getMetaValue('infrastructure.type'),
    safeString(feature.name).toLowerCase().includes('điện') ? 'PowerLine' : safeString(feature.name).toLowerCase().includes('cáp') ? 'SignalLine' : ''
  );

  return (
    <aside
      className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-white font-mono rounded-xl overflow-hidden"
      onContextMenu={(e) => {
        e.preventDefault();
        selectFeature(null);
      }}
    >

      {/* Camera UI Overlay */}
      {isCameraOpen && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-lg text-[10px] text-white flex items-center gap-2 border border-white/10">
            <Clock className="w-3 h-3 text-indigo-400" /> {new Date().toLocaleTimeString()}
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 px-4">
            <button onClick={stopCamera} className="w-12 h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-md border border-white/10">
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={capture}
              disabled={isCapturing}
              className="w-16 h-16 bg-white text-indigo-600 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
            >
              {isCapturing ? <Loader2 className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div 
        {...dragHandleProps}
        className="p-3 border-b border-[#333] flex justify-between items-center bg-[#252525] sticky top-0 backdrop-blur-md z-11 drag-handle cursor-move"
      >
        <div className="flex items-center gap-2">
          {displayInfo?.icon ? (
            <displayInfo.icon className={cn("w-3.5 h-3.5", displayInfo.tailwindColor || "text-cad-accent")} />
          ) : (
            isPolyline ? <Route className="w-3.5 h-3.5 text-cad-accent" /> : <MapPin className="w-3.5 h-3.5 text-cad-accent" />
          )}
          <h2 className="text-[10px] font-black tracking-widest uppercase text-cad-accent">THÔNG SỐ THIẾT KẾ</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="p-1 px-2 hover:bg-red-500/20 text-red-400 rounded transition-colors text-[9px] font-bold uppercase border border-red-500/10"
            title="Xóa đối tượng"
          >
            Delete
          </button>
          {(isPolyline || feature.geom_type === 'Polygon') && (
            <button
              onClick={() => setEditingFeatureId(editingFeatureId === feature.id ? null : feature.id)}
              className={cn(
                "p-1 px-2 rounded transition-all text-[9px] font-bold uppercase border",
                editingFeatureId === feature.id
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                  : "hover:bg-[#333] text-cad-text-muted border-transparent"
              )}
              title="Chỉnh sửa điểm (Vertex Editing)"
            >
              <div className="flex items-center gap-1">
                <Pencil className={cn("w-3 h-3", editingFeatureId === feature.id ? "animate-pulse" : "")} />
                Edit
              </div>
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
            onClick={() => { if(onClose) onClose(); selectFeature(null); setActiveParentFeature(null); }}
            className="p-1 px-2 hover:bg-[#333] text-cad-text-muted rounded transition-colors text-[9px] font-bold uppercase"
          >
            Close
          </button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-8 custom-scrollbar">

        {/* IDENTIFICATION */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Info className="w-3 h-3" /> Identification
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Object Name</label>
              <input
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all"
                value={localName}
                onChange={e => {
                  const nextName = e.target.value;
                  setLocalName(nextName);
                  if (selectedFeatureId) {
                    setPreview(selectedFeatureId, localMeta, nextName);
                  }
                }}
                placeholder="Enter name..."
              />
            </div>

            {feature.geom_type === 'Point' && isIntersectionFeature && (
              <div className="pt-2 space-y-3">
                <div className="space-y-2 p-3 bg-orange-500/5 border border-orange-500/10 rounded-md">
                  <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Grid3X3 size={12} /> Bảng điều khiển Nút giao
                  </p>
                  <button
                    onClick={handleFileUpload}
                    disabled={isImporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-60 text-white rounded-md transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 group"
                  >
                    {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />}
                    {isImporting ? 'Đang import...' : 'Upload dữ liệu (Excel/KML/KMZ)'}
                  </button>
                  <p className="text-[7px] text-[#555] px-1 leading-relaxed">
                    Hỗ trợ: .xlsx, .xls, .xlsm, .xlsb, .kml, .kmz
                  </p>
                  <div className="h-px bg-orange-500/10 my-1" />
                  <p className="text-[8px] text-[#666] uppercase tracking-wider font-bold mb-1">Thêm thủ công:</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      onClick={() => { setDrawingMode('point'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-indigo-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <MapPin size={10} className="text-indigo-400" /> Thêm Điểm Khảo Sát
                    </button>
                    <button
                      onClick={() => { setDrawingMode('polyline'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-emerald-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <Route size={10} className="text-emerald-400" /> Thêm Tuyến/Cáp
                    </button>
                    <button
                      onClick={() => { setDrawingMode('image'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-amber-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <ImageIcon size={10} className="text-amber-400" /> Thêm Ảnh Hiện Trường
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Description</label>
              <textarea
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all resize-none"
                rows={2}
                value={asStringValue(getMetaValue('description', 'description'))}
                onChange={e => updateNestedMeta('description', e.target.value)}
                placeholder="Technical notes..."
              />
            </div>
          </div>
        </section>

        {/* GEOMETRY & VN2000 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Calculator className="w-3 h-3" /> Coordinates (VN-2000)
          </div>
          <div className="grid grid-cols-2 gap-2 bg-[#111] p-3 rounded border border-[#333]">
            {(() => {
              try {
                const coords = typeof feature.coordinates === 'string' ? JSON.parse(feature.coordinates) : feature.coordinates;
                if (Array.isArray(coords)) {
                  const first = Array.isArray(coords[0]) ? coords[0] : coords;
                  const vnx = asNumberValue(getMetaValue('gis.vn2000_x', 'vn2000_x'));
                  const vny = asNumberValue(getMetaValue('gis.vn2000_y', 'vn2000_y'));
                  return (
                    <>
                      <ReadOnlyField label="Lng" value={first[0]?.toFixed(6) || '0'} />
                      <ReadOnlyField label="Lat" value={first[1]?.toFixed(6) || '0'} />
                      {vnx && vny ? (
                        <>
                          <div className="col-span-2 h-[1px] bg-[#333] my-1"></div>
                          <ReadOnlyField label="X (VN2000)" value={Number(vnx).toFixed(3)} />
                          <ReadOnlyField label="Y (VN2000)" value={Number(vny).toFixed(3)} />
                        </>
                      ) : null}
                    </>
                  );
                }
              } catch (e) {
                console.error('[PropertyPanel] Failed to parse feature data:', e);
                return <p className="col-span-2 text-[9px] text-red-500">Error loading feature data</p>;
              }
            })()}
          </div>
        </section>

        {/* STYLING */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Palette className="w-3 h-3" /> Styling & Symbols
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Color</label>
                <input
                  type="color"
                  className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                  value={asStringValue(getMetaValue('color', 'color'), '#3b82f6')}
                  onChange={e => updateNestedMeta('color', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{isPolyline ? 'Stroke' : 'Size'}</label>
                <input
                  type="number"
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white mt-1 focus:border-cad-accent outline-none"
                  value={asNumberValue(getMetaValue('size', 'size'), isPolyline ? 4 : 32)}
                  onChange={e => updateNestedMeta('size', Number(e.target.value))}
                />
              </div>
            </div>
            {!isPolyline && (
              <IconSelector
                value={((getMetaValue('icon', 'icon') as IconType) || (isIntersectionFeature ? 'intersection' : 'default'))}
                onChange={handleIconChange}
                className="pt-2"
              />
            )}
          </div>
        </section>


        {/* INFRASTRUCTURE SPECS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-indigo-400 uppercase">
            <Settings className="w-3 h-3" /> Infrastructure Details
          </div>
          <div className="bg-[#111] p-3 rounded border border-indigo-500/10 space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Type</label>
              <select
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white outline-none active:border-indigo-500"
                value={asStringValue(getMetaValue('infrastructure.type'), polyType)}
                onChange={e => updateNestedMeta('infrastructure.type', e.target.value)}
              >
                <option value="">Select Type...</option>
                <option value="PowerLine">Power Line (Lưới điện)</option>
                <option value="SignalLine">Signal / Fiber (Thông tin)</option>
                <option value="TrenchLine">Trench / Pipe (Mương cáp)</option>
              </select>
            </div>

            {(getMetaValue('infrastructure.type') || polyType) === 'PowerLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Voltage" icon={<Zap className="w-3 h-3" />} value={getMetaValue('infrastructure.voltage')} onChange={v => updateNestedMeta('infrastructure.voltage', v)} />
                <DesignField label="Owner" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('infrastructure.owner')} onChange={v => updateNestedMeta('infrastructure.owner', v)} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'SignalLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Cable" icon={<Radio className="w-3 h-3" />} value={getMetaValue('infrastructure.cable_type')} onChange={v => updateNestedMeta('infrastructure.cable_type', v)} />
                <DesignField label="Cores" icon={<Layers className="w-3 h-3" />} value={getMetaValue('infrastructure.core_count')} onChange={v => updateNestedMeta('infrastructure.core_count', asNumberValue(v))} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'TrenchLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Depth" icon={<Construction className="w-3 h-3" />} value={getMetaValue('infrastructure.depth')} onChange={v => updateNestedMeta('infrastructure.depth', asNumberValue(v))} />
                <DesignField label="Surface" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('infrastructure.surface_type')} onChange={v => updateNestedMeta('infrastructure.surface_type', v)} />
              </div>
            )}
          </div>
        </section>

        {/* AUTOMATED SEGMENTS */}
        {isPolyline && feature.properties?.segments && (
          <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
              <Sparkles className="w-3 h-3 text-amber-400" /> Automated Segments
            </div>
            <div className="space-y-1.5">
              {((feature.properties.segments ?? []) as SegmentItem[]).map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="p-2.5 bg-[#111] border border-[#333] rounded-md flex items-center justify-between hover:border-indigo-500/30 transition-all hover:bg-[#161616] animate-in fade-in slide-in-from-right-2 fill-mode-both"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-[#222] rounded flex items-center justify-center text-[9px] font-bold text-cad-text-muted border border-[#333]">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white uppercase tracking-tight">{seg.segment_type || 'Unknown'}</p>
                      <p className="text-[8px] text-[#444] font-mono">ID: {typeof seg.id === 'string' ? seg.id.slice(0, 8) : seg.id ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                      seg.segment_type === 'AsphaltRoad' ? 'bg-zinc-600' :
                        seg.segment_type === 'StoneSidewalk' ? 'bg-stone-500' :
                          seg.segment_type === 'SoilSidewalk' ? 'bg-amber-900' :
                            'bg-indigo-500/20'
                    )} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* DESIGN SPECS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Settings className="w-3 h-3" /> Construction Info
          </div>
          <div className="space-y-3">
            <DesignField label="Contractor" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('business.contractor', 'contractor')} onChange={v => updateNestedMeta('business.contractor', v)} />
            <DesignField label="Phone" icon={<Phone className="w-3 h-3" />} value={getMetaValue('business.phoneNumber', 'phoneNumber')} onChange={v => updateNestedMeta('business.phoneNumber', v)} />

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" /> Contract
              </label>
              <select
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                value={asStringValue(getMetaValue('business.contract_id', 'contract_id'))}
                onChange={e => updateNestedMeta('business.contract_id', e.target.value ? e.target.value : null)}
              >
                <option value="">No Contract Linked</option>
                {(contracts || []).map(c => (
                  <option key={c.id} value={c.id}>{c.contract_number ? `[${c.contract_number}] ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* CALCULATIONS */}
        {isPolyline && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-amber-500 uppercase">
              <Sparkles className="w-3 h-3" /> Technical Stats
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded p-4 space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#666]">Length</span>
                <span className="font-bold text-amber-500">{asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')).toFixed(3)} KM</span>
              </div>
              <div className="flex justify-between items-center border-t border-amber-500/5 pt-2 text-[10px]">
                <span className="text-[#666]">Est. Loss</span>
                <span className="font-bold text-amber-500">{linkBudget.toFixed(2)} dB</span>
              </div>
            </div>
          </section>
        )}

        {/* TECHNICAL SPECIFICATIONS (DYNAMIC) */}
        {(() => {
          const excludedKeys = [
            'description', 'color', 'size', 'icon', 'imageUrls', 'contractor', 'phoneNumber',
            'business', 'media', 'gis', 'preview_rotation', 'preview_fov_angle', 'preview_fov_radius'
          ];
          const dynamicSpecs = Object.entries(localMeta).filter(([key]) => !excludedKeys.includes(key));

          if (dynamicSpecs.length === 0) return null;

          return (
            <section className="space-y-4 pt-4 border-t border-[#333]">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-indigo-400 uppercase">
                <Settings className="w-3 h-3" /> Technical Specs
              </div>
              <div className="grid grid-cols-1 gap-3">
                {dynamicSpecs.map(([key, value]) => (
                  <DesignField
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}
                    icon={<Settings className="w-3 h-3 opacity-30" />}
                    value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    onChange={v => updateNestedMeta(key, v)}
                  />
                ))}
              </div>
            </section>
          );
        })()}

        {/* MEDIA */}
        <section
          className="space-y-4 pt-4 border-t border-[#333] outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/60"
          tabIndex={0}
          onPaste={handleMediaPaste}
          onClick={(event) => event.currentTarget.focus()}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
              <ImageIcon className="w-3 h-3" /> Site Photos
            </div>
            <button
              onClick={startCamera}
              className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase flex items-center gap-1"
            >
              <Camera className="w-3 h-3" /> Capture
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {asStringArray(getMetaValue('media.imageUrls', 'imageUrls')).length > 0 ? (
              asStringArray(getMetaValue('media.imageUrls', 'imageUrls')).map((url, idx) => (
                <div key={idx} className="aspect-video rounded overflow-hidden border border-[#333] relative group">
                  <img src={url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => {
                        const newImgs = [...asStringArray(getMetaValue('media.imageUrls', 'imageUrls'))];
                        newImgs.splice(idx, 1);
                        updateNestedMeta('media.imageUrls', newImgs);
                      }}
                      className="p-1 px-2 bg-red-500 text-white rounded text-[10px] font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div
                onClick={startCamera}
                className="col-span-2 py-8 border border-dashed border-[#333] rounded flex flex-col items-center justify-center gap-2 text-[#444] cursor-pointer hover:border-[#555] transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">No photos attached</span>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-[#333] bg-[#222]">
        <button
          onClick={handleSave}
          disabled={isSaving || (!isNameDirty && !isMetadataDirty)}
          className={cn(
            "w-full py-2.5 rounded text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
            isSaved
              ? "bg-emerald-500 text-white"
              : "bg-cad-accent hover:bg-cad-accent/90 disabled:bg-[#333] text-[#111]"
          )}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSaved ? (
            <Zap className="w-3.5 h-3.5 animate-bounce" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? 'PERSISTING...' : isSaved ? 'SAVED SUCCESSFUL' : 'SAVE SPECS'}
        </button>
      </div>
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Xóa Đối Tượng"
        message={`Bạn có chắc chắn muốn xóa đối tượng "${localName || feature.id}"? Hành động này không thể hoàn tác.`}
        itemName={localName || feature.id}
      />
    </aside >
  );
};

const ReadOnlyField = ({ label, value }: { label: string, value: string }) => (
  <div className="space-y-1">
    <label className="text-[8px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{label}</label>
    <div className="bg-[#0a0a0a] rounded px-2 py-1 text-[10px] font-mono text-cad-accent/70 border border-[#222]">
      {value}
    </div>
  </div>
);

const DesignField = ({ label, icon, value, onChange }: { label: string, icon: React.ReactNode, value: unknown, onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
      {icon} {label}
    </label>
    <input
      className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all"
      value={asStringValue(value)}
      onChange={e => onChange(e.target.value)}
      placeholder={`Enter ${safeString(label).toLowerCase()}...`}
    />
  </div>
);
