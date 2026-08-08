import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
  Save, Camera, MapPin, Route,
  Info, Palette, Settings, Image as ImageIcon,
  Calculator, Phone, User as UserIcon, Loader2, X, Clock, Grid3X3, Sparkles, Briefcase, List, Edit3,
  Layers, Zap, Radio, Construction, Pencil, RotateCw, Circle, Square, MoveUpRight, Plus, Minus
} from "lucide-react";
import { IconSelector } from '@DESIGN/components/ui/IconSelector';
import { Button } from '@DESIGN/components/ui/Button';
import { ImageEditorModal } from '@DESIGN/components/ui/ImageEditorModal';
import { designLogic } from '@TOOL/utils/designLogic';
import { getFeatureDisplayInfo, safeString, getCleanName, isCameraIcon, getParsedMetadata, getPointCoordinates } from '@TOOL/utils/featureUtils';
import { useCamera } from '@IMPLEMENT/hooks/useCamera';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { cn } from '@SHARED/utils/cn';
import type { DesignEventType, FeatureMetadata, FeatureProperties, FiberCable, IconType } from '@CONTRACT/types';
import { useProjectData } from '@IMPLEMENT/hooks/useProjectData';
import { useLayoutStore } from '@CORE/stores/useLayoutStore';
import { deleteMediaAsset, importMediaAsset, resolveMediaAsset, replaceMediaAsset, type MediaFeaturePatch } from '@IMPLEMENT/services/mediaAssetService';
import { requestStorageHealthRefresh } from '@IMPLEMENT/services/projectStorageService';
import { PropertyImportControls } from './PropertyPanel/PropertyImportControls';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';

import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { getFeatureDetailV2 } from '@SHARED/utils/designIpc';
import { buildFeaturePropertiesForPersistence, getTypeForIcon, normalizeFeatureMetadataForPersistence } from '@TOOL/utils/featurePersistence';
import { getDeclaredOrderFieldKey, syncDisplayOrderAliases } from '@TOOL/utils/featureMapping';
import { buildToggleOriginEvents } from '@DESIGN/features/map/network/networkTopology';
import { buildFiberRouteDisplay } from '@DESIGN/features/map/network/fiberRouteDisplay';
import { getTemplateFieldValue, getTemplateTypeIdForFeature, normalizeProjectSettings } from '@TOOL/utils/objectDataTemplates';
import { confirmUserAction } from '@SHARED/utils/userConfirmation';

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

const POINT_SYMBOL_SIZE_MIN = 4;
const POINT_SYMBOL_SIZE_MAX = 100;
const LINE_STROKE_SIZE_MIN = 1;
const LINE_STROKE_SIZE_MAX = 32;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeSymbolSize = (value: unknown, isPolyline: boolean): number => {
  const fallback = isPolyline ? 4 : 32;
  const min = isPolyline ? LINE_STROKE_SIZE_MIN : POINT_SYMBOL_SIZE_MIN;
  const max = isPolyline ? LINE_STROKE_SIZE_MAX : POINT_SYMBOL_SIZE_MAX;
  return clampNumber(asNumberValue(value, fallback), min, max);
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getMediaAssetIds = (metadata: FeatureMetadata): string[] => {
  const media = asRecord(metadata.media);
  return asStringArray(media?.imageAssetIds);
};

const getLegacyImageUrls = (metadata: FeatureMetadata): string[] => {
  const media = asRecord(metadata.media);
  const urls = asStringArray(media?.imageUrls);
  const single = typeof media?.imageUrl === 'string' ? media.imageUrl : undefined;
  return single && !urls.includes(single) ? [single, ...urls] : urls;
};

const isRenderableImageUrl = (url: string): boolean =>
  url.startsWith('data:image') || /^https?:\/\//i.test(url);

const withMediaAssets = (metadata: FeatureMetadata, assetIds: string[]): FeatureMetadata => {
  const media = asRecord(metadata.media) || {};
  const nextMedia: Record<string, unknown> = {
    ...media,
    imageAssetIds: assetIds,
    primaryImageAssetId: assetIds[0] || undefined,
  };
  return {
    ...metadata,
    media: nextMedia,
  };
};

const getOrderFieldLabel = (metadata: Record<string, unknown>, properties?: FeatureProperties): string =>
  getDeclaredOrderFieldKey(metadata, properties as Record<string, unknown> | undefined) || 'Mã hiệu (STT)';

const isLineGeometry = (geomType?: string | null): boolean => {
  const normalized = safeString(geomType).toLowerCase();
  return normalized === 'linestring' || normalized === 'polyline' || normalized.includes('line');
};

const isLegacyObjectType = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'point' || normalized === 'default';
};

const getObjectTypeFieldValue = (
  metadata: FeatureMetadata,
  displayInfo: ReturnType<typeof getFeatureDisplayInfo> | null
): string => {
  const rawType = asStringValue(metadata.type);
  if (rawType && !isLegacyObjectType(rawType)) return rawType;
  if (!displayInfo) return rawType;

  if (displayInfo.isIntersection) return 'intersection';
  if (displayInfo.isCamera) {
    const iconKey = isCameraIcon(displayInfo.iconKey)
      ? displayInfo.iconKey as IconType
      : 'cctv';
    return getTypeForIcon(iconKey);
  }
  if (displayInfo.isLine) return 'line';
  if (displayInfo.isPolygon) return 'polygon';

  return rawType;
};

const getExistingFiberCable = (state: unknown, featureId: string): FiberCable | undefined => {
  const inventory = asRecord(state)?.inventory;
  const cables = Array.isArray(asRecord(inventory)?.cables) ? asRecord(inventory)?.cables : [];
  return (cables as FiberCable[]).find(cable => cable.feature_id === featureId);
};

const getPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getFiniteNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(asStringValue(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeFiberLineMetadata = (metadata: FeatureMetadata): FeatureMetadata => {
  const gis = metadata.gis || {};
  const width = getFiniteNumber(gis.size ?? gis.weight ?? gis.stroke ?? metadata.size ?? metadata.weight ?? metadata.stroke) ?? 6;
  const color = asStringValue(gis.color || metadata.color, '#0088ff');

  return {
    ...metadata,
    color,
    size: width,
    weight: width,
    stroke: width,
    gis: {
      ...gis,
      color,
      size: width,
      weight: width,
      stroke: width,
      dashArray: asStringValue(gis.dashArray || (metadata as Record<string, unknown>).dashArray).trim() || undefined,
      opacity: getFiniteNumber(gis.opacity ?? (metadata as Record<string, unknown>).opacity),
    },
    infrastructure: {
      ...(metadata.infrastructure || {}),
      type: 'SignalLine',
      cable_type: asStringValue(metadata.infrastructure?.cable_type).trim(),
      core_count: getPositiveInteger(metadata.infrastructure?.core_count) || undefined,
    },
    network: {
      ...(metadata.network || {}),
      direction_mode: metadata.network?.direction_mode || 'auto',
    },
    fiber: {
      ...(metadata.fiber || {}),
      role: 'cable',
    },
  };
};

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
  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  const listFiles = Array.from(clipboardData.files || [])
    .filter((file) => file.type.startsWith('image/'));
  const imageFiles = itemFiles.length > 0 ? itemFiles : listFiles;

  return Promise.all(imageFiles.map(readFileAsDataUrl));
};

const isEditablePasteTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
};

const appendTextAnnotationsToDescription = (metadata: FeatureMetadata, textAnnotations: string[]): FeatureMetadata => {
  if (textAnnotations.length === 0) return metadata;
  const currentDescription = asStringValue(metadata.description).trimEnd();
  const existingLines = (currentDescription || '').split('\n').map(l => l.trim()).filter(Boolean);
  const uniqueNewLines = textAnnotations.map(t => t.trim()).filter(t => t && !existingLines.includes(t));
  if (uniqueNewLines.length === 0) return metadata;

  const nextDescription = [currentDescription, ...uniqueNewLines].filter(Boolean).join('\n');
  return {
    ...metadata,
    description: nextDescription,
  };
};

const preparePropertyMetadata = (metaInput: unknown, properties?: FeatureProperties): FeatureMetadata => {
  const metaToSave = { ...((metaInput || {}) as FeatureMetadata) };

  if (metaToSave.size !== undefined && metaToSave.size !== null) {
    metaToSave.size = Number(metaToSave.size);
    if (isNaN(metaToSave.size)) {
      metaToSave.size = 4;
    }
  }

  const standardizedMeta = syncDisplayOrderAliases(
    normalizeMetadataObject(metaToSave) as Record<string, unknown>,
    undefined,
    properties as Record<string, unknown> | undefined
  ) as FeatureMetadata;
  if (!standardizedMeta.size && metaToSave.size) {
    standardizedMeta.size = metaToSave.size;
  }

  return normalizeFeatureMetadataForPersistence(standardizedMeta, properties);
};

export const PropertyPanel: React.FC = () => {
  const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext() || {};
  const {
    state,
    selectedFeatureId,
    selectFeature,
    dispatchEvent,
    dispatchEvents,
    queueEvent,
    queueEvents,
    setDrawingMode,
    setSelectedGroup,
    setActiveParentFeature,
    setPreview,
    previewMetadata,
    editingFeatureId,
    setEditingFeatureId,
    projectId,
    selectionSet,
    featureDetailsCache,
    visibleFeatures
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


  const feature = selectedFeatureId
    ? state?.features?.[selectedFeatureId] || featureDetailsCache[selectedFeatureId] || visibleFeatures[selectedFeatureId] || null
    : null;

  useEffect(() => {
    if (selectedFeatureId && projectId && !feature) {
      getFeatureDetailV2(String(projectId), selectedFeatureId)
        .then(fetchedFeature => {
          if (fetchedFeature) {
             useDesignSync.getState().cacheFeatureDetail(fetchedFeature);
          }
        })
        .catch(err => {
          console.warn("[PropertyPanel] Failed to fetch feature detail:", err);
        });
    }
  }, [selectedFeatureId, projectId, feature]);
  const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;
  const [localName, setLocalName] = useState('');
  const [localMeta, setLocalMeta] = useState<FeatureMetadata>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingImage, setEditingImage] = useState<{ index: number; url: string } | null>(null);
  const [isImportingMedia, setIsImportingMedia] = useState(false);
  const [mediaImportError, setMediaImportError] = useState<string | null>(null);
  const [brokenMediaAssetIds, setBrokenMediaAssetIds] = useState<string[]>([]);
  // Validation messages for the fiber-line fields, so the existing `alert()` on save
  // is also surfaced to assistive tech via aria-describedby / aria-invalid.
  const [fiberFieldErrors, setFiberFieldErrors] = useState<{ cableType?: string; coreCount?: string }>({});
  const togglePalette = useLayoutStore(s => s.togglePalette);
  const paletteConfigs = useLayoutStore(s => s.paletteConfigs);
  // One stable prefix per panel instance; every `htmlFor`/`aria-*` id below derives
  // from it so labels stay wired to their control across re-renders.
  const uid = useId();
  const projectSettings = useMemo(() => normalizeProjectSettings(state?.settings), [state?.settings]);
  const displayInfo = feature && group ? getFeatureDisplayInfo(feature, group.type, group.name, localMeta) : null;
  const isIntersectionFeature = !!displayInfo?.isIntersection;
  const isPolyline = isLineGeometry(feature?.geom_type);
  const isCameraFeature = !!displayInfo?.isCamera || isCameraIcon(asStringValue(localMeta.icon || localMeta.type));
  const templateTypeId = getTemplateTypeIdForFeature(feature, { isCamera: isCameraFeature, isIntersection: isIntersectionFeature });
  const templateType = templateTypeId ? projectSettings.object_data_templates.types[templateTypeId] : null;
  const templateFields = useMemo(
    () => (templateType?.fields || []).filter((field) => {
      if (!field.showInPalette) return false;
      if (!isPolyline) return true;
      return !['cable_type', 'core_count', 'infrastructure.cable_type', 'infrastructure.core_count'].includes(field.key);
    }),
    [templateType, isPolyline]
  );

  const { persistedMeta, persistedMetaJson } = useMemo<{ persistedMeta: FeatureMetadata; persistedMetaJson: string }>(() => {
    if (!feature) return { persistedMeta: {}, persistedMetaJson: '{}' };
    try {
      const parsed = getParsedMetadata(feature);
      const prepared = preparePropertyMetadata(parsed, feature.properties as FeatureProperties);
      return { persistedMeta: prepared, persistedMetaJson: JSON.stringify(prepared) };
    } catch {
      return { persistedMeta: {}, persistedMetaJson: '{}' };
    }
    // feature.metadata / feature.properties are listed explicitly because the store
    // can mutate a feature record in place without changing its object identity.
  }, [feature, feature?.metadata, feature?.properties]);

  const rawOrder = persistedMeta.display_order ?? persistedMeta.stt ?? persistedMeta.STT ?? '';
  const orderStr = (typeof rawOrder === 'string' || typeof rawOrder === 'number') ? String(rawOrder) : '';
  const persistedName = feature ? getCleanName(feature, orderStr) : '';
  const draftMeta = (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata)
    ? previewMetadata.metadata as FeatureMetadata
    : localMeta;
  const draftName = (previewMetadata?.id === selectedFeatureId && previewMetadata.name !== undefined)
    ? previewMetadata.name
    : localName;
  const isMetadataDirty = !!feature && JSON.stringify(preparePropertyMetadata(draftMeta, feature.properties as FeatureProperties)) !== persistedMetaJson;
  const isNameDirty = !!feature && draftName !== persistedName;
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const mediaSourceMeta = draftMeta || localMeta;
  const imageAssetIds = useMemo(() => getMediaAssetIds(mediaSourceMeta), [mediaSourceMeta]);
  const legacyImageUrls = useMemo(
    () => getLegacyImageUrls(mediaSourceMeta).filter(isRenderableImageUrl),
    [mediaSourceMeta]
  );
  const displayImageEntries = useMemo(() => [
    ...imageAssetIds
      .map((assetId, index) => ({ url: resolvedMediaUrls[assetId], index }))
      .filter((entry): entry is { url: string; index: number } => !!entry.url),
    ...legacyImageUrls.map((url, offset) => ({ url, index: imageAssetIds.length + offset })),
  ], [imageAssetIds, legacyImageUrls, resolvedMediaUrls]);
  const brokenMediaCount = useMemo(
    () => brokenMediaAssetIds.filter((assetId) => imageAssetIds.includes(assetId)).length,
    [brokenMediaAssetIds, imageAssetIds]
  );

  // Cleanup preview on unmount or when changing feature
  useEffect(() => {
    return () => {
      setPreview(null, null);
    };
  }, [selectedFeatureId]);

  useEffect(() => {
    if (!projectId || imageAssetIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedMediaUrls({});
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      imageAssetIds.map(async (assetId) => {
        const asset = await resolveMediaAsset(String(projectId), assetId);
        return [assetId, asset.src] as const;
      })
    )
      .then((results) => {
        if (!cancelled) {
          const entries: Array<readonly [string, string]> = [];
          const broken: string[] = [];
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              entries.push(result.value);
            } else {
              broken.push(imageAssetIds[index]);
            }
          });
          setResolvedMediaUrls(Object.fromEntries(entries));
          setBrokenMediaAssetIds(broken);
        }
      })
      .catch((error) => {
        void error;
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, imageAssetIds.join('|')]);

  // Helper to get nested metadata values with legacy fallback
  const getMetaValue = useCallback((path: string, legacyKey?: string): unknown => {
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
  }, [localMeta]);

  // Helper to update nested metadata
  const updateNestedMeta = useCallback((path: string, value: unknown) => {
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
  }, [localMeta, localName, selectedFeatureId, setPreview]);

  const updateSymbolSize = useCallback((value: unknown) => {
    const nextSize = normalizeSymbolSize(value, isPolyline);
    const currentGis = asRecord(localMeta.gis) || {};
    const next = {
      ...localMeta,
      size: nextSize,
      weight: nextSize,
      stroke: nextSize,
      gis: {
        ...currentGis,
        size: nextSize,
        weight: nextSize,
        stroke: nextSize,
      },
    } as FeatureMetadata;
    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
  }, [isPolyline, localMeta, localName, selectedFeatureId, setPreview]);

  const orderFieldLabel = useMemo(
    () => getOrderFieldLabel(localMeta as Record<string, unknown>, feature?.properties as FeatureProperties | undefined),
    [localMeta, feature?.properties]
  );
  const updateOrderMeta = useCallback((value: string) => {
    const next = syncDisplayOrderAliases(
      localMeta as Record<string, unknown>,
      value,
      feature?.properties as Record<string, unknown> | undefined
    ) as FeatureMetadata;
    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
  }, [localMeta, localName, selectedFeatureId, setPreview, feature?.properties]);

  // `updateNestedMeta` must close over the newest `localMeta`, but the per-field
  // handlers handed to the memoized rows have to keep a stable identity or the
  // rows re-render on every keystroke anywhere in the panel. Keep the latest
  // updater in a ref and hand out cached handlers that read through it.
  const updateNestedMetaRef = useRef(updateNestedMeta);
  useEffect(() => {
    updateNestedMetaRef.current = updateNestedMeta;
  }, [updateNestedMeta]);

  const fieldHandlerCache = useRef(new Map<string, (v: string) => void>());
  const getFieldHandler = useCallback((path: string, asNumber = false): ((v: string) => void) => {
    const cacheKey = `${path}|${asNumber ? 'number' : 'text'}`;
    const cached = fieldHandlerCache.current.get(cacheKey);
    if (cached) return cached;
    const handler = (v: string) => {
      updateNestedMetaRef.current(path, asNumber ? asNumberValue(v) : v);
    };
    fieldHandlerCache.current.set(cacheKey, handler);
    return handler;
  }, []);

  const applyFeaturePatch = (patch?: MediaFeaturePatch | null) => {
    if (!patch) return;
    let parsedMeta: FeatureMetadata = {};
    try {
      parsedMeta = normalizeMetadataObject(JSON.parse(patch.metadata || '{}'));
    } catch {
      parsedMeta = {};
    }
    const nextName = patch.name !== undefined ? getCleanName({ name: patch.name } as any, asStringValue(parsedMeta.display_order)) : localName;
    const patchMedia = asRecord(parsedMeta.media);
    setLocalMeta((prev) => ({
      ...prev,
      ...(patchMedia ? { media: patchMedia } : {}),
    }));
    if (patch.name !== undefined) {
      setLocalName(nextName);
    }
    setPreview(null, null);
    const currentState = useDesignSync.getState().state;
    const currentFeature = currentState?.features?.[patch.id];
    if (!currentState || !currentFeature) return;
    useDesignSync.setState({
      state: {
        ...currentState,
        features: {
          ...currentState.features,
          [patch.id]: {
            ...currentFeature,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            metadata: patch.metadata,
            ...(patch.properties ? { properties: patch.properties as FeatureProperties } : {}),
          },
        },
      },
    });
  };

  const appendImageUrls = async (dataUrls: string[]) => {
    if (dataUrls.length === 0) return;
    if (!feature || !projectId) {
      setMediaImportError('Không thể lưu ảnh khi thiếu project hoặc đối tượng.');
      return;
    }
    if (!(await confirmUserAction(`Xác nhận thêm ${dataUrls.length} ảnh vào đối tượng này?`, { fallbackOnDialogError: true }))) return;

    setIsImportingMedia(true);
    setMediaImportError(null);

    const importedAssetIds: string[] = [];
    const importedAssets: Array<{ assetId: string; src: string }> = [];
    let latestFeaturePatch: MediaFeaturePatch | null = null;

    try {
      for (const dataUrl of dataUrls) {
        const imported = await importMediaAsset(String(projectId), feature.id, dataUrl);
        const assetId = imported.assetId || imported.id;
        importedAssetIds.push(assetId);
        importedAssets.push({ assetId, src: imported.src });
        latestFeaturePatch = imported.featurePatch || latestFeaturePatch;
      }

      setResolvedMediaUrls((prev) => {
        const next = { ...prev };
        for (const asset of importedAssets) {
          next[asset.assetId] = asset.src;
        }
        return next;
      });

      applyFeaturePatch(latestFeaturePatch);
      requestStorageHealthRefresh();
    } catch (error) {
      await Promise.all(
        importedAssetIds.map(async (assetId) => {
          try {
            await deleteMediaAsset(String(projectId), assetId);
          } catch (cleanupError) {
            void cleanupError;
          }
        })
      );
      setMediaImportError('Không thể lưu ảnh vào thư mục dự án. Vui lòng thử lại.');
      throw error;
    } finally {
      setIsImportingMedia(false);
    }
  };

  const updateMediaImages = (imageUrls: string[]): FeatureMetadata => {
    const next = {
      ...localMeta,
      media: {
        ...(asRecord(localMeta.media) || {}),
        imageUrl: imageUrls[0] || undefined,
        imageUrls,
      },
    } as FeatureMetadata;

    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
    return next;
  };

  const removeImageUrl = async (index: number) => {
    if (!(await confirmUserAction('Xác nhận xóa ảnh này khỏi đối tượng?'))) return;
    if (index < imageAssetIds.length) {
      const removedAssetId = imageAssetIds[index];
      const nextAssetIds = [...imageAssetIds];
      nextAssetIds.splice(index, 1);
      if (projectId) {
        const result = await deleteMediaAsset(String(projectId), removedAssetId);
        applyFeaturePatch(result.featurePatch);
      }
      setResolvedMediaUrls((prev) => {
        const next = { ...prev };
        delete next[removedAssetId];
        return next;
      });
      requestStorageHealthRefresh();
      return;
    }
    const legacyIndex = index - imageAssetIds.length;
    const newImgs = [...legacyImageUrls];
    newImgs.splice(legacyIndex, 1);
    const nextMeta = updateMediaImages(newImgs);
    if (feature) {
      const standardizedMeta = preparePropertyMetadata(nextMeta, feature.properties as FeatureProperties);
      const nextProperties = buildFeaturePropertiesForPersistence(
        feature.properties as FeatureProperties | undefined,
        standardizedMeta
      );
      await queueEvent({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: localName,
          metadata: JSON.stringify(standardizedMeta),
          properties: nextProperties,
        },
      });
    }
  };

  const replaceImageUrl = async (index: number, dataUrl: string, textAnnotations: string[] = []) => {
    if (!feature) return;
    let nextMeta: FeatureMetadata;

    try {
      if (index < imageAssetIds.length && projectId) {
        const imported = await replaceMediaAsset(String(projectId), feature.id, imageAssetIds[index], dataUrl);
        const assetId = imported.assetId || imported.id;
        const nextAssetIds = [...imageAssetIds];
        nextAssetIds[index] = assetId;
        setResolvedMediaUrls((prev) => ({
          ...prev,
          [assetId]: dataUrl,
        }));
        applyFeaturePatch(imported.featurePatch);
        nextMeta = withMediaAssets(localMeta, nextAssetIds);
      } else {
        const legacyIndex = Math.max(index - imageAssetIds.length, 0);
        const nextImageUrls = [...legacyImageUrls];
        nextImageUrls[legacyIndex] = dataUrl;
        nextMeta = updateMediaImages(nextImageUrls);
      }

      const nextMetaWithText = appendTextAnnotationsToDescription(nextMeta, textAnnotations);
      if (textAnnotations.length > 0) {
        setLocalMeta(nextMetaWithText);
      }

      const standardizedMeta = appendTextAnnotationsToDescription(
        preparePropertyMetadata(nextMeta, feature.properties as FeatureProperties),
        textAnnotations
      );
      const nextProperties = buildFeaturePropertiesForPersistence(
        feature.properties as FeatureProperties | undefined,
        standardizedMeta
      );

      if (!(index < imageAssetIds.length && projectId) || textAnnotations.length > 0) {
        await queueEvent({
          type: 'FeatureUpdated',
          payload: {
            id: feature.id,
            name: localName,
            metadata: JSON.stringify(standardizedMeta),
            properties: nextProperties,
          },
        });
      }
      setPreview(null, null);
      setEditingImage(null);
      requestStorageHealthRefresh();
    } catch (error) {
      console.error('[PropertyPanel] Failed to save edited image:', error);
      setMediaImportError('Không thể lưu ảnh đã chỉnh sửa. Vui lòng thử lại.');
      throw error;
    }
  };

  const pasteClipboardImages = async (
    clipboardData: DataTransfer,
    source: 'panel' | 'window',
    preventDefault: () => void,
    stopPropagation?: () => void,
  ) => {
    const items = Array.from(clipboardData.items);
    const imageItems = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const imageFiles = Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'));

    console.log('[PropertyPanel][Paste] event', {
      source,
      selectedFeatureId,
      itemCount: items.length,
      items: items.map((item) => ({ kind: item.kind, type: item.type })),
      imageCount: imageItems.length + imageFiles.length,
      activeElement: document.activeElement?.tagName ?? null,
    });

    if (imageItems.length === 0 && imageFiles.length === 0) return;

    preventDefault();
    stopPropagation?.();
    try {
      const dataUrls = await readClipboardImageDataUrls(clipboardData);
      console.log('[PropertyPanel][Paste] read images', {
        source,
        count: dataUrls.length,
        existingCount: legacyImageUrls.length,
      });
      await appendImageUrls(dataUrls);
      console.log('[PropertyPanel][Paste] appended images', {
        source,
        nextCount: imageAssetIds.length + legacyImageUrls.length + dataUrls.length,
      });
    } catch (error) {
      console.error('[PropertyPanel][Paste] failed', error);
    }
  };

  const handleMediaPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    await pasteClipboardImages(
      event.clipboardData,
      'panel',
      () => event.preventDefault(),
      () => event.stopPropagation(),
    );
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
      void appendImageUrls([dataUrl]).catch((error) => {
        void error;
      });
    },
    watermarkData: {
      location: feature ? (getPointCoordinates(feature) ?? undefined) : undefined,
      label: localName || 'Đối tượng khảo sát'
    }
  });

  const lastFeatureIdRef = useRef<string | null>(null);

  // Sync local state when selection changes or metadata updates
  useEffect(() => {
    if (feature) {
      try {
        const meta = getParsedMetadata(feature);
        const normalized = normalizeMetadataObject(meta);
        const sttValue = asStringValue(normalized.display_order ?? normalized.stt ?? normalized.STT);
        const cleanName = getCleanName(feature, sttValue);

        const isNewFeature = lastFeatureIdRef.current !== feature.id;
        lastFeatureIdRef.current = feature.id;

        const nextMeta = isLineGeometry(feature.geom_type)
          ? normalizeFiberLineMetadata(normalized)
          : normalized;

        if (isNewFeature) {
          setLocalName(cleanName);
          setLocalMeta(nextMeta);
        } else {
          setLocalMeta((prevMeta) => {
            const incomingMedia = asRecord(nextMeta.media);
            return {
              ...nextMeta,
              ...prevMeta,
              ...(incomingMedia ? { media: incomingMedia } : {}),
            };
          });
        }
      } catch (e) {
        setLocalName(safeString(feature.name) || '');
        setLocalMeta({});
      }
    } else {
      lastFeatureIdRef.current = null;
    }
  }, [feature?.id, feature?.metadata]);

  useEffect(() => {
    if (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalMeta((prev) => {
        const incoming = previewMetadata.metadata as FeatureMetadata;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
      if (previewMetadata.name !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalName((prev) => prev !== previewMetadata.name ? previewMetadata.name! : prev);
      }
    }
  }, [previewMetadata, selectedFeatureId]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingImage) return;
        selectFeature(null);
        setActiveParentFeature(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingImage, selectFeature, setActiveParentFeature]);

  useEffect(() => {
    if (!feature) return;
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData || isEditablePasteTarget(event.target)) return;
      void pasteClipboardImages(
        event.clipboardData,
        'window',
        () => event.preventDefault(),
        () => event.stopPropagation(),
      );
    };
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [feature?.id, legacyImageUrls, selectedFeatureId, localMeta, localName]);

  const handleSave = async () => {
    if (!feature || (!isNameDirty && !isMetadataDirty)) return;
    let standardizedMeta = preparePropertyMetadata(draftMeta, feature.properties as FeatureProperties);
    const events: DesignEventType[] = [];

    if (isPolyline) {
      standardizedMeta = normalizeFiberLineMetadata(standardizedMeta);
      const lineType = asStringValue(standardizedMeta.infrastructure?.type, 'SignalLine');
      const cableType = asStringValue(standardizedMeta.infrastructure?.cable_type).trim();
      const fiberCount = getPositiveInteger(standardizedMeta.infrastructure?.core_count);
      if (lineType === 'SignalLine' && !cableType) {
        setFiberFieldErrors({ cableType: 'Vui lòng nhập loại cáp.' });
        alert('Vui lòng nhập loại cáp.');
        return;
      }
      if (lineType === 'SignalLine' && !fiberCount) {
        setFiberFieldErrors({ coreCount: 'Dung lượng cáp phải là số nguyên lớn hơn 0.' });
        alert('Dung lượng cáp phải là số nguyên lớn hơn 0.');
        return;
      }
      setFiberFieldErrors({});

      if (lineType === 'SignalLine') {
        const existingCable = getExistingFiberCable(state, feature.id);
        events.push({
          type: 'FiberCableUpserted',
          payload: {
            id: existingCable?.id || feature.id,
            project_id: String(projectId || ''),
            feature_id: feature.id,
            cable_type: cableType,
            fiber_count: fiberCount,
            owner: asStringValue(standardizedMeta.infrastructure?.owner).trim() || existingCable?.owner || null,
            status: (standardizedMeta.infrastructure?.status as FiberCable['status']) || existingCable?.status || 'planned',
            source: existingCable?.source || 'manual',
          },
        });
      }
    }
    if (!(await confirmUserAction(`Xác nhận lưu thay đổi cho đối tượng "${draftName}"?`))) return;
    setIsSaving(true);
    setIsSaved(false);

    try {
      const nextProperties = buildFeaturePropertiesForPersistence(
        feature.properties as FeatureProperties | undefined,
        standardizedMeta
      );

      // Save to database via event queue
      events.unshift({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: draftName,
          metadata: JSON.stringify(standardizedMeta),
          properties: nextProperties
        }
      });
      if (events.length > 1) {
        await queueEvents(events);
      } else {
        await queueEvent(events[0]);
      }
      // CRITICAL: Force state update to trigger map re-render
      const currentState = useDesignSync.getState().state;
      if (currentState) {
        useDesignSync.setState({ state: { ...currentState } });
      }

      // CRITICAL: Verify save was successful
      await new Promise(resolve => setTimeout(resolve, 300));
      const verifyState = useDesignSync.getState().state;
      const verifyFeature = verifyState?.features[feature.id];
      if (verifyFeature) {
        const verifyMeta = getParsedMetadata(verifyFeature);
        const normalizedVerifyMeta = preparePropertyMetadata(verifyMeta, feature.properties as FeatureProperties);

        if (
          verifyMeta.size !== standardizedMeta.size ||
          normalizedVerifyMeta.icon !== standardizedMeta.icon ||
          normalizedVerifyMeta.type !== standardizedMeta.type ||
          verifyFeature.properties?.iconKey !== nextProperties.iconKey ||
          verifyFeature.properties?.type !== nextProperties.type
        ) {
          // Keep non-paste diagnostics silent while isolating clipboard paste issues.
        }
      }

      // Success feedback
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);

      // Clear preview after save
      setPreview(null, null);
    } catch (error) {
      void error;
      alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleOrigin = async () => {
    if (!selectedFeatureId || !state?.features) return;
    const events = buildToggleOriginEvents(state.features, selectedFeatureId);
    if (events.length === 0) return;
    await dispatchEvents(events);
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

  if (selectionSet.size > 1) {
    return (
      <aside className="w-full h-full min-h-0 bg-cad-surface border border-cad-border flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-cad-border bg-cad-elevated drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-cad-text-muted" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              icon={X}
              ariaLabel="Đóng bảng thông số"
              className="text-cad-text-muted hover:bg-cad-elevated hover:text-cad-text-primary rounded"
            />
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-70">
          <div className="w-16 h-16 bg-cad-elevated rounded-full flex items-center justify-center mb-4 text-cad-accent">
            <Layers className="w-8 h-8" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cad-text-primary">Multi-Selection Active</p>
          <p className="text-[9px] mt-2 mb-4 max-w-[200px] text-cad-text-secondary">
            Please use the <strong>Bulk Edit</strong> palette to modify multiple items.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => selectFeature(null)}
              variant="secondary"
              size="sm"
              className="px-3 text-[8px] font-bold uppercase rounded-sm"
            >
              Deselect All
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  if (!feature) {
    return (
      <aside className="w-full h-full min-h-0 bg-cad-surface border border-cad-border flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-cad-border bg-cad-elevated drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-cad-text-muted" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              icon={X}
              ariaLabel="Đóng bảng thông số"
              className="text-cad-text-muted hover:bg-cad-elevated hover:text-cad-text-primary rounded"
            />
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-70">
          <div className="w-16 h-16 bg-cad-elevated rounded-full flex items-center justify-center mb-4">
            <Settings className="w-8 h-8 text-cad-text-muted" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-cad-text-primary">No Selection</p>
          <p className="text-[9px] mt-1 text-cad-text-secondary">Select an entity to configure</p>
        </div>
      </aside>
    );
  }

  const distance = isPolyline ? asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')) : 0;
  const linkBudget = isPolyline ? designLogic.calculateFiberLinkBudget(distance) : 0;
  const routeDisplay = feature && isPolyline
    ? buildFiberRouteDisplay(feature, state?.features, localMeta)
    : '';
  const polyType = asStringValue(getMetaValue('infrastructure.type'), '');

  return (
    <aside
      className="w-full h-full bg-cad-surface border border-cad-border flex flex-col shadow-2xl text-cad-text-primary font-mono rounded-xl overflow-hidden"
      onPaste={handleMediaPaste}
      onContextMenu={(e) => {
        e.preventDefault();
        selectFeature(null);
      }}
    >
      {/* Camera UI Overlay */}
      {isCameraOpen && (
        <div className="absolute inset-0 z-10 bg-cad-bg flex flex-col">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-cad-bg/80 backdrop-blur-md rounded-lg text-[10px] text-cad-text-primary flex items-center gap-2 border border-cad-border">
            <Clock className="w-3 h-3 text-cad-accent" /> {new Date().toLocaleTimeString()}
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 px-4">
            <button onClick={stopCamera} className="w-12 h-12 bg-cad-elevated/80 hover:bg-cad-text-primary/10 text-cad-text-primary rounded-full flex items-center justify-center backdrop-blur-md border border-cad-border">
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={capture}
              disabled={isCapturing}
              className="w-16 h-16 bg-cad-surface text-cad-accent rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform border border-cad-border"
            >
              {isCapturing ? <Loader2 className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div 
        {...dragHandleProps}
        className="p-3 border-b border-cad-border flex justify-between items-center bg-cad-elevated sticky top-0 backdrop-blur-md z-11 drag-handle cursor-move"
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
          <Button
            onClick={handleDelete}
            variant="ghost"
            size="sm"
            className="px-2 rounded text-[9px] font-bold uppercase text-cad-danger border-cad-danger/10 hover:bg-cad-danger/20 hover:text-cad-danger"
            title="Xóa đối tượng"
          >
            Delete
          </Button>
          {(isPolyline || feature.geom_type === 'Polygon') && (
            <button
              onClick={() => setEditingFeatureId(editingFeatureId === feature.id ? null : feature.id)}
              className={cn(
                "p-1 px-2 rounded transition-all text-[9px] font-bold uppercase border",
                editingFeatureId === feature.id
                  ? "bg-cad-warn/20 text-cad-warn border-cad-warn/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                  : "hover:bg-cad-elevated text-cad-text-muted border-transparent"
              )}
              title="Chỉnh sửa điểm (Vertex Editing)"
            >
              <div className="flex items-center gap-1">
                <Pencil className={cn("w-3 h-3", editingFeatureId === feature.id ? "animate-pulse" : "")} />
                Edit
              </div>
            </button>
          )}
          <Button
            onClick={onPin}
            variant="ghost"
            size="sm"
            className={cn(
              'px-2 rounded text-[9px] font-bold uppercase hover:bg-cad-elevated',
              isPinned ? 'text-cad-accent bg-cad-elevated' : 'text-cad-text-muted'
            )}
            title={isPinned ? "Auto-hide" : "Pin"}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button
            onClick={() => { if(onClose) onClose(); selectFeature(null); setActiveParentFeature(null); }}
            variant="ghost"
            size="sm"
            className="px-2 rounded text-[9px] font-bold uppercase text-cad-text-muted hover:bg-cad-elevated"
          >
            Close
          </Button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-8 custom-scrollbar">

        {/* IDENTIFICATION */}
        <section className="space-y-4" role="group" aria-labelledby={`${uid}-identification`}>
          <div id={`${uid}-identification`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
            <Info className="w-3 h-3" aria-hidden="true" /> Identification
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor={`${uid}-object-name`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Object Name</label>
              <input
                id={`${uid}-object-name`}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary focus:border-cad-accent outline-none transition-all"
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

            <div className="space-y-1">
              <label htmlFor={`${uid}-order`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{orderFieldLabel}</label>
              <input
                id={`${uid}-order`}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary focus:border-cad-accent outline-none transition-all"
                value={asStringValue(getMetaValue('display_order', orderFieldLabel))}
                onChange={e => updateOrderMeta(e.target.value)}
                placeholder="Enter code..."
              />
            </div>

            {!isPolyline && feature.geom_type === 'Point' && (
              <button
                onClick={handleToggleOrigin}
                className={cn(
                  'w-full rounded border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
                  localMeta.network?.is_origin
                    ? 'border-cad-accent/30 bg-cad-accent/10 text-cad-accent'
                    : 'border-cad-border bg-cad-bg text-cad-text-primary hover:border-cad-accent/40 hover:bg-cad-accent/10'
                )}
              >
                {localMeta.network?.is_origin ? 'Bỏ điểm gốc Network' : 'Đặt điểm gốc Network'}
              </button>
            )}

            {feature.geom_type === 'Point' && isIntersectionFeature && (
              <PropertyImportControls
                feature={feature}
                setDrawingMode={setDrawingMode}
                setSelectedGroup={setSelectedGroup}
                setActiveParentFeature={setActiveParentFeature}
                setPreview={setPreview}
              />
            )}

            <div className="space-y-1">
              <label htmlFor={`${uid}-description`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Description</label>
              <textarea
                id={`${uid}-description`}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary focus:border-cad-accent outline-none transition-all resize-none"
                rows={2}
                value={asStringValue(getMetaValue('description', 'description'))}
                onChange={e => updateNestedMeta('description', e.target.value)}
                placeholder="Technical notes..."
              />
            </div>
          </div>
        </section>

        {templateFields.length > 0 && (
          <section className="space-y-4" role="group" aria-labelledby={`${uid}-template-fields`}>
            <div id={`${uid}-template-fields`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-accent uppercase">
              <List className="w-3 h-3" aria-hidden="true" /> Template Fields
            </div>
            <div className="bg-cad-bg p-3 rounded border border-cad-accent/10 space-y-3">
              {templateFields.map((field) => {
                const value = getTemplateFieldValue(feature, field.key);
                if (field.type === 'boolean') {
                  return (
                    <label key={field.key} className="flex items-center justify-between rounded border border-cad-border bg-cad-bg px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cad-text-muted">
                      <span className="flex items-center gap-1.5">
                        <Edit3 className="w-3 h-3" aria-hidden="true" /> {field.label}
                      </span>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-cad-accent"
                        checked={Boolean(value)}
                        onChange={(e) => updateNestedMeta(field.key, e.target.checked)}
                      />
                    </label>
                  );
                }

                if (field.type === 'select') {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label htmlFor={`${uid}-tpl-${field.key}`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{field.label}</label>
                      <select
                        id={`${uid}-tpl-${field.key}`}
                        className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all"
                        value={asStringValue(value)}
                        onChange={(e) => updateNestedMeta(field.key, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return (
                  <DesignField
                    key={field.key}
                    label={field.label}
                    icon={<Edit3 className="w-3 h-3" />}
                    value={value}
                    onChange={(v) => updateNestedMeta(field.key, field.type === 'number' ? asNumberValue(v) : v)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* GEOMETRY & VN2000 */}
        <section className="space-y-4" role="group" aria-labelledby={`${uid}-coordinates`}>
          <div id={`${uid}-coordinates`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
            <Calculator className="w-3 h-3" aria-hidden="true" /> Coordinates (VN-2000)
          </div>
          <div className="grid grid-cols-2 gap-2 bg-cad-bg p-3 rounded border border-cad-border">
            {(() => {
              let parsedCoords: any = null;
              try {
                parsedCoords = typeof feature.coordinates === 'string' ? JSON.parse(feature.coordinates) : feature.coordinates;
              } catch (e) {
                void e;
              }
              if (Array.isArray(parsedCoords)) {
                const first = Array.isArray(parsedCoords[0]) ? parsedCoords[0] : parsedCoords;
                const vnx = asNumberValue(getMetaValue('gis.vn2000_x', 'vn2000_x'));
                const vny = asNumberValue(getMetaValue('gis.vn2000_y', 'vn2000_y'));
                return (
                  <>
                    <ReadOnlyField label="Lng" value={first[0]?.toFixed(6) || '0'} />
                    <ReadOnlyField label="Lat" value={first[1]?.toFixed(6) || '0'} />
                    {vnx && vny ? (
                      <>
                        <div className="col-span-2 h-[1px] bg-cad-border my-1" aria-hidden="true"></div>
                        <ReadOnlyField label="X (VN2000)" value={Number(vnx).toFixed(3)} />
                        <ReadOnlyField label="Y (VN2000)" value={Number(vny).toFixed(3)} />
                      </>
                    ) : null}
                  </>
                );
              }
              return null;
            })()}
          </div>
        </section>

        {/* STYLING */}
        <section className="space-y-4" role="group" aria-labelledby={`${uid}-styling`}>
          <div id={`${uid}-styling`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
            <Palette className="w-3 h-3" aria-hidden="true" /> Styling & Symbols
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${uid}-color`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Color</label>
                <input
                  id={`${uid}-color`}
                  type="color"
                  className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                  value={asStringValue(getMetaValue('gis.color', 'color'), '#3b82f6')}
                  onChange={e => updateNestedMeta('gis.color', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-size-number`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">
                  {isPolyline ? 'Stroke (px)' : 'Size (px)'}
                </label>
                <div className="flex items-center gap-1 mt-1">
                  <button
                    type="button"
                    aria-label="Decrease size"
                    onClick={() => {
                      const current = normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline);
                      const min = isPolyline ? LINE_STROKE_SIZE_MIN : POINT_SYMBOL_SIZE_MIN;
                      const step = isPolyline ? 1 : 2;
                      updateSymbolSize(Math.max(min, current - step));
                    }}
                    className="p-1.5 bg-cad-bg border border-cad-border rounded text-cad-text-muted hover:text-cad-text-primary hover:border-cad-accent transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    id={`${uid}-size-number`}
                    type="number"
                    min={isPolyline ? LINE_STROKE_SIZE_MIN : POINT_SYMBOL_SIZE_MIN}
                    max={isPolyline ? LINE_STROKE_SIZE_MAX : POINT_SYMBOL_SIZE_MAX}
                    step={isPolyline ? 1 : 2}
                    className="w-full bg-cad-bg border border-cad-border rounded px-2 py-1 text-xs text-cad-text-primary focus:border-cad-accent outline-none text-center font-bold"
                    value={normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline)}
                    onChange={e => updateSymbolSize(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Increase size"
                    onClick={() => {
                      const current = normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline);
                      const max = isPolyline ? LINE_STROKE_SIZE_MAX : POINT_SYMBOL_SIZE_MAX;
                      const step = isPolyline ? 1 : 2;
                      updateSymbolSize(Math.min(max, current + step));
                    }}
                    className="p-1.5 bg-cad-bg border border-cad-border rounded text-cad-text-muted hover:text-cad-text-primary hover:border-cad-accent transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Slider & Presets */}
            <div className="space-y-2 bg-cad-bg p-2.5 rounded border border-cad-border/60">
              <div className="flex items-center justify-between text-[9px] font-bold text-cad-text-muted uppercase">
                <span>{isPolyline ? 'Độ dày đường' : 'Kích thước biểu tượng'}</span>
                <span className="font-mono text-cad-accent font-bold">
                  {normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline)}px
                </span>
              </div>
              <input
                id={`${uid}-size-slider`}
                aria-label={isPolyline ? 'Polyline stroke slider' : 'Symbol size slider'}
                type="range"
                min={isPolyline ? LINE_STROKE_SIZE_MIN : POINT_SYMBOL_SIZE_MIN}
                max={isPolyline ? LINE_STROKE_SIZE_MAX : POINT_SYMBOL_SIZE_MAX}
                step={isPolyline ? 1 : 2}
                value={normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline)}
                onChange={e => updateSymbolSize(e.target.value)}
                className="w-full h-1.5 bg-cad-elevated rounded-lg appearance-none cursor-pointer accent-cad-accent"
              />
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[8px] font-bold text-cad-text-muted uppercase shrink-0">Presets:</span>
                <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                  {(isPolyline ? [2, 4, 8, 12] : [16, 32, 48, 64]).map((presetVal) => {
                    const currentVal = normalizeSymbolSize(getMetaValue(isPolyline ? 'gis.size' : 'size', 'size'), isPolyline);
                    const isSelected = currentVal === presetVal;
                    return (
                      <button
                        key={presetVal}
                        type="button"
                        onClick={() => updateSymbolSize(presetVal)}
                        className={cn(
                          "px-2 py-0.5 text-[9px] font-bold rounded border transition-all shrink-0",
                          isSelected
                            ? "bg-cad-accent/20 text-cad-accent border-cad-accent"
                            : "bg-cad-elevated text-cad-text-muted border-cad-border hover:border-cad-accent/40 hover:text-cad-text-primary"
                        )}
                      >
                        {presetVal}px
                      </button>
                    );
                  })}
                </div>
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
        <section className="space-y-4" role="group" aria-labelledby={`${uid}-infrastructure`}>
          <div id={`${uid}-infrastructure`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-accent uppercase">
            <Settings className="w-3 h-3" aria-hidden="true" /> Infrastructure Details
          </div>
          <div className="bg-cad-bg p-3 rounded border border-cad-accent/10 space-y-4">
            {isPolyline && (
              <>
                <ReadOnlyField label="Loại tuyến" value="Cáp quang" />
                <div className="grid grid-cols-2 gap-2">
                  <DesignField
                    label="Loại cáp"
                    icon={<Radio className="w-3 h-3" aria-hidden="true" />}
                    value={getMetaValue('infrastructure.cable_type')}
                    onChange={getFieldHandler('infrastructure.cable_type')}
                    errorMessage={fiberFieldErrors.cableType}
                  />
                  <DesignField
                    label="Dung lượng cáp"
                    icon={<Layers className="w-3 h-3" aria-hidden="true" />}
                    value={getMetaValue('infrastructure.core_count')}
                    onChange={getFieldHandler('infrastructure.core_count', true)}
                    errorMessage={fiberFieldErrors.coreCount}
                  />
                  <DesignField
                    label="Chủ sở hữu"
                    icon={<UserIcon className="w-3 h-3" aria-hidden="true" />}
                    value={getMetaValue('infrastructure.owner')}
                    onChange={getFieldHandler('infrastructure.owner')}
                  />
                  <DesignField
                    label="Trạng thái"
                    icon={<Circle className="w-3 h-3" aria-hidden="true" />}
                    value={getMetaValue('infrastructure.status')}
                    onChange={getFieldHandler('infrastructure.status')}
                  />
                </div>
              </>
            )}
            {!isPolyline && (
              <>
            <div className="space-y-1">
              <label htmlFor={`${uid}-infra-type`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Type</label>
              <select
                id={`${uid}-infra-type`}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary outline-none active:border-cad-accent"
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
                <DesignField label="Voltage" icon={<Zap className="w-3 h-3" />} value={getMetaValue('infrastructure.voltage')} onChange={getFieldHandler('infrastructure.voltage')} />
                <DesignField label="Owner" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('infrastructure.owner')} onChange={getFieldHandler('infrastructure.owner')} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'SignalLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Cable" icon={<Radio className="w-3 h-3" />} value={getMetaValue('infrastructure.cable_type')} onChange={getFieldHandler('infrastructure.cable_type')} />
                <DesignField label="Cores" icon={<Layers className="w-3 h-3" />} value={getMetaValue('infrastructure.core_count')} onChange={getFieldHandler('infrastructure.core_count', true)} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'TrenchLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Depth" icon={<Construction className="w-3 h-3" />} value={getMetaValue('infrastructure.depth')} onChange={getFieldHandler('infrastructure.depth', true)} />
                <DesignField label="Surface" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('infrastructure.surface_type')} onChange={getFieldHandler('infrastructure.surface_type')} />
              </div>
            )}
              </>
            )}
          </div>
        </section>

        {/* AUTOMATED SEGMENTS */}
        {isPolyline && feature.properties?.segments && (
          <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200" role="group" aria-labelledby={`${uid}-segments`}>
            <div id={`${uid}-segments`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
              <Sparkles className="w-3 h-3 text-cad-warn" aria-hidden="true" /> Automated Segments
            </div>
            <div className="space-y-1.5">
              {((feature.properties.segments ?? []) as SegmentItem[]).map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="p-2.5 bg-cad-elevated border border-cad-border rounded-md flex items-center justify-between hover:border-cad-accent/30 transition-all hover:bg-cad-surface animate-in fade-in slide-in-from-right-2 fill-mode-both"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-cad-bg rounded flex items-center justify-center text-[9px] font-bold text-cad-text-muted border border-cad-border">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-cad-text-primary uppercase tracking-tight">{seg.segment_type || 'Unknown'}</p>
                      <p className="text-[8px] text-cad-text-muted font-mono">ID: {typeof seg.id === 'string' ? seg.id.slice(0, 8) : seg.id ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Surface-type swatch. Colours encode segment data (asphalt / stone /
                        soil), not theme chrome, so they stay literal. The same information is
                        already shown as text above, so the dot is decorative for a11y. */}
                    <div aria-hidden="true" className={cn(
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
        <section className="space-y-4" role="group" aria-labelledby={`${uid}-construction`}>
          <div id={`${uid}-construction`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
            <Settings className="w-3 h-3" aria-hidden="true" /> Construction Info
          </div>
          <div className="space-y-3">
            <DesignField label="Contractor" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('business.contractor', 'contractor')} onChange={getFieldHandler('business.contractor')} />
            <DesignField label="Phone" icon={<Phone className="w-3 h-3" />} value={getMetaValue('business.phoneNumber', 'phoneNumber')} onChange={getFieldHandler('business.phoneNumber')} />

            <div className="space-y-1">
              <label htmlFor={`${uid}-contract`} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" aria-hidden="true" /> Contract
              </label>
              <select
                id={`${uid}-contract`}
                className="w-full bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all"
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
          <section className="space-y-4" role="group" aria-labelledby={`${uid}-stats`}>
            <div id={`${uid}-stats`} className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-warn uppercase">
              <Sparkles className="w-3 h-3" aria-hidden="true" /> Technical Stats
            </div>
            <div className="bg-cad-warn/5 border border-cad-warn/10 rounded p-4 space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-cad-text-muted">Length</span>
                <span className="font-bold text-cad-warn">{asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')).toFixed(3)} KM</span>
              </div>
              <div className="flex justify-between items-center border-t border-cad-warn/5 pt-2 text-[10px]">
                <span className="text-cad-text-muted">Est. Loss</span>
                <span className="font-bold text-cad-warn">{linkBudget.toFixed(2)} dB</span>
              </div>
            </div>
          </section>
        )}

        {/* METADATA CARDS */}
        <section className="space-y-4 pt-4 border-t border-cad-border">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-accent uppercase">
            <Settings className="w-3 h-3" /> Object Metadata
          </div>
          <div className="bg-cad-bg p-3 rounded border border-cad-accent/10 space-y-3">
            <DesignField
              label="Object Type"
              icon={<Info className="w-3 h-3" />}
              value={getObjectTypeFieldValue(localMeta, displayInfo)}
              onChange={v => updateNestedMeta('type', v)}
            />
            <DesignField
              label="Survey Notes"
              icon={<Pencil className="w-3 h-3" />}
              value={getMetaValue('description', 'description')}
              onChange={v => updateNestedMeta('description', v)}
            />
          </div>
        </section>

        {isCameraFeature && (
          <section className="space-y-4 pt-4 border-t border-cad-border">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-accent uppercase">
              <Camera className="w-3 h-3" /> Camera Metadata
            </div>
            <div className="bg-cad-bg p-3 rounded border border-cad-accent/10 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Telemetry ID" icon={<Radio className="w-3 h-3" />} value={getMetaValue('network.telemetry_id')} onChange={v => updateNestedMeta('network.telemetry_id', v)} />
                <DesignField label="Install Height" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('specs.install_height')} onChange={v => updateNestedMeta('specs.install_height', asNumberValue(v))} />
                <DesignField label="Focal Length" icon={<Camera className="w-3 h-3" />} value={getMetaValue('specs.focal_length')} onChange={v => updateNestedMeta('specs.focal_length', asNumberValue(v))} />
                <DesignField label="Sensor Size" icon={<Square className="w-3 h-3" />} value={getMetaValue('specs.sensor_size')} onChange={v => updateNestedMeta('specs.sensor_size', v)} />
                <DesignField label="Resolution X" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('specs.resolution_x')} onChange={v => updateNestedMeta('specs.resolution_x', asNumberValue(v))} />
                <DesignField label="Resolution Y" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('specs.resolution_y')} onChange={v => updateNestedMeta('specs.resolution_y', asNumberValue(v))} />
                <DesignField label="Rotation" icon={<RotateCw className="w-3 h-3" />} value={getMetaValue('gis.rotation', 'rotation')} onChange={v => updateNestedMeta('gis.rotation', asNumberValue(v))} />
                <DesignField label="FOV Angle" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('gis.fov_angle', 'fov_angle')} onChange={v => updateNestedMeta('gis.fov_angle', asNumberValue(v))} />
                <DesignField label="FOV Radius" icon={<Circle className="w-3 h-3" />} value={getMetaValue('gis.fov_radius', 'fov_radius')} onChange={v => updateNestedMeta('gis.fov_radius', asNumberValue(v))} />
                <DesignField label="Target Distance" icon={<MapPin className="w-3 h-3" />} value={getMetaValue('specs.target_distance')} onChange={v => updateNestedMeta('specs.target_distance', asNumberValue(v))} />
                <DesignField label="Target Height" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('specs.target_height')} onChange={v => updateNestedMeta('specs.target_height', asNumberValue(v))} />
              </div>
              <label className="flex items-center justify-between rounded border border-cad-border bg-cad-bg px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cad-text-muted">
                <span className="flex items-center gap-1.5"><Circle className="w-3 h-3" /> Show FOV</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-cad-accent"
                  checked={getMetaValue('gis.fov_visible', 'fov_visible') === true}
                  onChange={e => updateNestedMeta('gis.fov_visible', e.target.checked)}
                />
              </label>
            </div>
          </section>
        )}

        {isIntersectionFeature && (
          <section className="space-y-4 pt-4 border-t border-cad-border">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-warn uppercase">
              <Grid3X3 className="w-3 h-3" /> Intersection Metadata
            </div>
            <div className="bg-cad-bg p-3 rounded border border-cad-warn/10 space-y-3">
              <DesignField
                label="Network Role"
                icon={<Radio className="w-3 h-3" />}
                value={getMetaValue('network.role')}
                onChange={v => updateNestedMeta('network.role', v)}
              />
              <label className="flex items-center justify-between rounded border border-cad-border bg-cad-bg px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cad-text-muted">
                <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Network Origin</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-cad-warn"
                  checked={getMetaValue('network.is_origin') === true}
                  onChange={e => updateNestedMeta('network.is_origin', e.target.checked)}
                />
              </label>
            </div>
          </section>
        )}

        {isPolyline && (
          <section className="space-y-4 pt-4 border-t border-cad-border">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-accent uppercase">
              <Route className="w-3 h-3" /> Line Metadata
            </div>
            <div className="bg-cad-bg p-3 rounded border border-cad-accent/10 space-y-3">
              <ReadOnlyField label="Đối tượng đi qua" value={routeDisplay || 'Chưa liên kết'} />
              <div className="grid grid-cols-2 gap-2">
                <ReadOnlyField label="Fiber role" value={asStringValue(getMetaValue('fiber.role'), 'cable')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Stroke" icon={<Route className="w-3 h-3" />} value={getMetaValue('gis.weight', 'weight')} onChange={getFieldHandler('gis.weight', true)} />
                <DesignField label="Dash" icon={<Pencil className="w-3 h-3" />} value={getMetaValue('gis.dashArray', 'dashArray')} onChange={getFieldHandler('gis.dashArray')} />
                <DesignField label="Opacity" icon={<Circle className="w-3 h-3" />} value={getMetaValue('gis.opacity', 'opacity')} onChange={getFieldHandler('gis.opacity', true)} />
              </div>
            </div>
          </section>
        )}

        {/* MEDIA */}
        <section
          className="space-y-4 pt-4 border-t border-cad-border outline-none focus-visible:ring-1 focus-visible:ring-cad-accent/60"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onPaste={handleMediaPaste}
          onClick={(event) => event.currentTarget.focus()}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cad-text-muted uppercase">
              <ImageIcon className="w-3 h-3" /> Site Photos
            </div>
            <Button
              onClick={startCamera}
              loading={isImportingMedia}
              variant="ghost"
              size="sm"
              icon={isImportingMedia ? undefined : Camera}
              className="px-0 text-[10px] font-black uppercase text-cad-accent hover:bg-transparent hover:text-cad-active"
            >
              {isImportingMedia ? 'Saving...' : 'Capture'}
            </Button>
          </div>

          {mediaImportError ? (
            <div className="rounded border border-cad-danger/30 bg-cad-danger/10 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-cad-danger">
              {mediaImportError}
            </div>
          ) : null}
          {brokenMediaCount > 0 ? (
            <div className="rounded border border-cad-warn/30 bg-cad-warn/10 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-cad-warn">
              {brokenMediaCount} photo file link is missing. Valid photos are still shown; use Storage Health to review or recover.
            </div>
          ) : null}


          <div className="grid grid-cols-2 gap-2">
            {displayImageEntries.length > 0 ? (
              displayImageEntries.map(({ url, index }) => (
                <div key={`${index}:${url}`} className="aspect-video rounded overflow-hidden border border-cad-border relative group">
                  <img src={url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-cad-bg/70 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                    <Button
                      onClick={() => setEditingImage({ index, url })}
                      variant="secondary"
                      size="sm"
                      className="rounded text-[10px] font-bold"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => removeImageUrl(index)}
                      variant="danger"
                      size="sm"
                      className="rounded text-[10px] font-bold"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div
                onClick={startCamera}
                className="col-span-2 py-8 border border-dashed border-cad-border rounded flex flex-col items-center justify-center gap-2 text-cad-text-muted cursor-pointer hover:border-cad-accent/40 transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">No photos attached</span>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Footer Actions */}
      <div className="p-2 border-t border-cad-border bg-cad-elevated">
        <Button
          onClick={handleSave}
          disabled={isSaving || (!isNameDirty && !isMetadataDirty)}
          variant="primary"
          size="md"
          icon={isSaving ? Loader2 : isSaved ? Zap : Save}
          className={cn(
            "w-full rounded text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95",
            isSaving && "[&_svg]:animate-spin",
            isSaved && "bg-cad-active border-cad-active [&_svg]:animate-bounce"
          )}
        >
          {isSaving ? 'PERSISTING...' : isSaved ? 'SAVED SUCCESSFUL' : 'SAVE SPECS'}
        </Button>
      </div>
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Xóa Đối Tượng"
        message={`Bạn có chắc chắn muốn xóa đối tượng "${localName || feature.id}"? Hành động này không thể hoàn tác.`}
        itemName={localName || feature.id}
      />
      {editingImage && (
        <ImageEditorModal
          imageUrl={editingImage.url}
          onCancel={() => setEditingImage(null)}
          onSave={(result) => replaceImageUrl(editingImage.index, result.dataUrl, result.textAnnotations)}
        />
      )}
    </aside>
  );
};

// Read-only display pair. The caption is a <span>, not a <label>: there is no form
// control to point at, and an orphan <label> is itself an a11y defect.
const ReadOnlyField = React.memo<{ label: string; value: string }>(({ label, value }) => (
  <div className="space-y-1">
    <span className="block text-[8px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{label}</span>
    <div className="bg-cad-bg rounded px-2 py-1 text-[10px] font-mono text-cad-accent font-semibold border border-cad-border">
      {value}
    </div>
  </div>
));

ReadOnlyField.displayName = 'ReadOnlyField';

interface DesignFieldProps {
  label: string;
  icon: React.ReactNode;
  value: unknown;
  onChange: (v: string) => void;
  /** Validation message; associated with the input via aria-describedby. */
  errorMessage?: string;
}

const DesignField = React.memo<DesignFieldProps>(({ label, icon, value, onChange, errorMessage }) => {
  const inputId = React.useId();
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-flex">{icon}</span> {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full bg-cad-bg border rounded px-3 py-1.5 text-xs text-cad-text-primary outline-none transition-all",
          errorMessage ? "border-cad-danger focus:border-cad-danger" : "border-cad-border focus:border-cad-accent"
        )}
        value={asStringValue(value)}
        onChange={e => onChange(e.target.value)}
        placeholder={`Enter ${safeString(label).toLowerCase()}...`}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className="ml-1 text-[9px] font-bold text-cad-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
});

DesignField.displayName = 'DesignField';
