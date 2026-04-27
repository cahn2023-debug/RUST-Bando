import { useState, useEffect } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { safeString, getCleanName } from '@TOOL/utils/featureUtils';
import type { FeatureMetadata } from '@CONTRACT/types';

/**
 * Hook to manage property panel state for a selected feature.
 * Handles local name/metadata state, sync, save, and metadata helpers.
 */
export function usePropertyPanel() {
  const {
    state,
    selectedFeatureId,
    selectFeature,
    dispatchEvent,
    queueEvent,
    setPreview,
    setActiveParentFeature,
    selectionSet
  } = useDesignSync();

  const feature = selectedFeatureId && state?.features ? state.features[selectedFeatureId] : null;
  const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;

  const [localName, setLocalName] = useState('');
  const [localMeta, setLocalMeta] = useState<FeatureMetadata>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Cleanup preview on unmount or when changing feature
  useEffect(() => {
    return () => {
      setPreview(null, null);
    };
  }, [selectedFeatureId]);

  // Sync local state when selection changes
  useEffect(() => {
    if (feature) {
      try {
        const meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
        const normalized = normalizeMetadataObject(meta);
        const sttValue = normalized.display_order || normalized.stt || normalized.STT || '';
        setLocalName(getCleanName(feature, String(sttValue)));
        setLocalMeta(normalized);
      } catch (e) {
        console.warn('[usePropertyPanel] Failed to parse feature metadata:', e);
        setLocalName(safeString(feature.name) || '');
        setLocalMeta({});
      }
    }
  }, [feature?.id]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectFeature(null);
        setActiveParentFeature(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectFeature, setActiveParentFeature]);

  // Helper to get nested metadata values with legacy fallback
  const getMetaValue = (path: string, legacyKey?: string): string | number | boolean | undefined => {
    const parts = path.split('.');
    let current: Record<string, unknown> | undefined = localMeta as Record<string, unknown>;
    for (const part of parts) {
      if (current === undefined || current === null) break;
      current = current[part] as Record<string, unknown> | undefined;
    }
    if (current !== undefined && current !== null && (typeof current !== 'string' || current !== '')) return current as any;
    if (legacyKey) {
      const metaRecord = localMeta as Record<string, unknown>;
      const legacyVal = metaRecord[legacyKey];
      if (typeof legacyVal === 'string' || typeof legacyVal === 'number' || typeof legacyVal === 'boolean') {
        return legacyVal;
      }
    }
    return '';
  };

  // Helper to update nested metadata
  const updateNestedMeta = (path: string, value: string | number | boolean | null) => {
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
      setPreview(selectedFeatureId, next as FeatureMetadata);
    }
  };

  const handleSave = async () => {
    if (!feature) return;
    setIsSaving(true);
    setIsSaved(false);
    try {
      const standardizedMeta = normalizeMetadataObject(localMeta);
      await queueEvent({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: localName,
          metadata: JSON.stringify(standardizedMeta)
        }
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      setPreview(null, null);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
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

  return {
    state,
    feature,
    group,
    selectedFeatureId,
    selectionSet,
    localName,
    setLocalName,
    localMeta,
    setLocalMeta,
    isSaving,
    isSaved,
    showDeleteModal,
    getMetaValue,
    updateNestedMeta,
    handleSave,
    handleDelete,
    confirmDelete,
    selectFeature,
    setActiveParentFeature,
  };
}
