import { invoke } from '@tauri-apps/api/core';
import { FeatureMetadata, IconType } from '@CONTRACT/types';

const AI_MODEL = 'all-MiniLM-L6-v2';
const MAX_AI_TEXT_LEN = 2000;

type AnyMeta = Record<string, any>;

type AiNormalizeResponse = {
  normalized_text: string;
  embedding: number[];
  model: string;
  updated_at: string;
};

const NUMBER_KEYS = new Set([
  'size',
  'weight',
  'stroke',
  'rotation',
  'fov_angle',
  'fov_radius',
  'lengthKm',
  'length_km',
  'vn2000_x',
  'vn2000_y',
  'contract_id',
]);

const STRING_KEYS = new Set([
  'description',
  'note',
  'notes',
  'ghi_chu',
  'type',
  'icon',
  'label',
  'contractor',
  'phoneNumber',
  'display_order',
  'stt',
]);

const TEXT_FIELDS = [
  'type',
  'icon',
  'description',
  'note',
  'notes',
  'ghi_chu',
  'label',
];

const cleanString = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Đảm bảo giá trị trả về là chuỗi, xử lý các trường hợp object đặc biệt (như Protobuf {@type, value})
 */
const safeString = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (value.value !== undefined && value.value !== null) {
      return safeString(value.value);
    }
    try {
      if (Object.keys(value).length === 0) return "";
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  return String(value);
};

const isPlainObject = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);

const pruneEmpty = (value: any) => {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (isPlainObject(value) && Object.keys(value).length === 0) return true;
  return false;
};

const normalizeValue = (key: string, value: any): any => {
  if (value == null) return value;

  if (typeof value === 'string') {
    const cleaned = cleanString(value);
    if (NUMBER_KEYS.has(key)) {
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : value;
    }
    return STRING_KEYS.has(key) ? cleaned : value;
  }

  // Handle case where value is an object but should be a string (e.g. {@type, value})
  if (STRING_KEYS.has(key) && isPlainObject(value)) {
    return cleanString(safeString(value));
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (Array.isArray(value)) {
    const normalized = value.map((v) => normalizeValue(key, v)).filter((v) => !pruneEmpty(v));
    return normalized;
  }

  if (isPlainObject(value)) {
    const out: AnyMeta = {};
    for (const [k, v] of Object.entries(value)) {
      const normalized = normalizeValue(k, v);
      if (!pruneEmpty(normalized)) out[k] = normalized;
    }
    return out;
  }

  return value;
};

/**
 * Standardizes metadata into the unified FeatureMetadata structure.
 */
export const normalizeMetadataObject = (metadata: any): FeatureMetadata => {
  const raw: AnyMeta = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    const v = normalizeValue(key, value);
    if (!pruneEmpty(v)) raw[key] = v;
  }

  const mediaRaw = isPlainObject(raw.media) ? raw.media : {};
  const imageAssetIds = Array.isArray(mediaRaw.imageAssetIds)
    ? mediaRaw.imageAssetIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '')
    : Array.isArray(raw.imageAssetIds)
      ? raw.imageAssetIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '')
      : undefined;
  const externalUrls = Array.isArray(mediaRaw.externalUrls)
    ? mediaRaw.externalUrls.filter((url: unknown): url is string => typeof url === 'string' && url.trim() !== '')
    : Array.isArray(raw.externalUrls)
      ? raw.externalUrls.filter((url: unknown): url is string => typeof url === 'string' && url.trim() !== '')
      : undefined;
  const primaryImageAssetId =
    typeof mediaRaw.primaryImageAssetId === 'string'
      ? mediaRaw.primaryImageAssetId
      : typeof raw.primaryImageAssetId === 'string'
        ? raw.primaryImageAssetId
        : undefined;

  const result: FeatureMetadata = {
    // Top-level properties
    description: raw.description || raw.note || raw.notes || raw.ghi_chu || raw.gis?.description,
    type: raw.type || raw.gis?.type,
    icon: (raw.icon as IconType) || (raw.gis?.icon as IconType) || undefined,
    color: raw.color || raw.gis?.color,
    size: raw.size || raw.gis?.size,
    label: raw.label || raw.gis?.label,
    display_order: raw.display_order || raw.stt || raw.STT || raw.order || raw.gis?.display_order,

    // Media grouping
    media: {
      imageUrl: raw.imageUrl || mediaRaw.imageUrl,
      imageUrls: raw.imageUrls || mediaRaw.imageUrls,
      imageAssetIds: imageAssetIds && imageAssetIds.length > 0 ? imageAssetIds : undefined,
      primaryImageAssetId,
      externalUrls: externalUrls && externalUrls.length > 0 ? externalUrls : undefined,
    },

    // GIS grouping
    gis: {
      vn2000_x: raw.vn2000_x || raw.gis?.vn2000_x,
      vn2000_y: raw.vn2000_y || raw.gis?.vn2000_y,
      lengthKm: raw.lengthKm || raw.length_km || raw.gis?.lengthKm || raw.gis?.length_km,
      rotation: raw.rotation !== undefined ? raw.rotation : raw.gis?.rotation,
      fov_angle: raw.fov_angle !== undefined ? raw.fov_angle : raw.gis?.fov_angle,
      fov_radius: raw.fov_radius !== undefined ? raw.fov_radius : raw.gis?.fov_radius,
      fov_visible: raw.fov_visible !== undefined ? raw.fov_visible : raw.gis?.fov_visible,
    },

    // Business grouping
    business: {
      contractor: raw.contractor || raw.business?.contractor,
      phoneNumber: raw.phoneNumber || raw.business?.phoneNumber,
      contract_id: raw.contract_id || raw.business?.contract_id,
    },

    // Technical Specs (Camera, etc.)
    specs: {
      install_height: raw.install_height || raw.installation_height || raw.specs?.install_height || raw.specs?.installation_height,
      focal_length: raw.focal_length || raw.specs?.focal_length,
      sensor_size: raw.sensor_size || raw.specs?.sensor_size,
      resolution_x: raw.resolution_x || raw.specs?.resolution_x,
      resolution_y: raw.resolution_y || raw.specs?.resolution_y,
      target_distance: raw.target_distance || raw.specs?.target_distance,
      target_height: raw.target_height || raw.specs?.target_height,
    },

    // Complex fields
    vertexMetadata: raw.vertexMetadata || raw.gis?.vertexMetadata,
    ai: raw.ai || raw.gis?.ai,
  };

  // Sync size, weight, and stroke for backward compatibility
  const baseSize = result.size || raw.weight || raw.stroke || raw.gis?.size || raw.gis?.weight || raw.gis?.stroke;
  if (baseSize !== undefined) {
    const numSize = typeof baseSize === 'string' ? Number(baseSize) : baseSize;
    if (Number.isFinite(numSize)) {
      result.size = numSize;
      result.weight = numSize;
      result.stroke = numSize;
    }
  }

  // Additional standardization/cleanup logic
  if (result.icon && typeof result.icon === 'string') {
    result.icon = result.icon.toLowerCase() as IconType;
  }

  // Sync internal image arrays
  const imageUrls = Array.isArray(result.media?.imageUrls) ? result.media!.imageUrls!.filter(Boolean) : [];
  if (result.media?.imageUrl && !imageUrls.includes(result.media.imageUrl)) {
    imageUrls.unshift(result.media.imageUrl);
  }
  if (!result.media?.imageUrl && imageUrls.length > 0) {
    if (!result.media) result.media = {};
    result.media.imageUrl = imageUrls[0];
  }
  if (imageUrls.length > 0) {
    if (!result.media) result.media = {};
    result.media.imageUrls = imageUrls;
  }

  // Prune top-level empty objects
  if (pruneEmpty(result.media)) delete result.media;
  if (pruneEmpty(result.gis)) delete result.gis;
  if (pruneEmpty(result.business)) delete result.business;
  if (pruneEmpty(result.specs)) delete result.specs;

  // Add back any unknown fields for flexibility
  for (const [k, v] of Object.entries(raw)) {
    const knownKeys = [
      'description', 'note', 'notes', 'ghi_chu', 'type', 'icon', 'color', 'size', 'label',
      'imageUrl', 'imageUrls', 'imageAssetIds', 'primaryImageAssetId', 'externalUrls',
      'vn2000_x', 'vn2000_y', 'lengthKm', 'length_km',
      'rotation', 'fov_angle', 'fov_radius', 'fov_visible',
      'contractor', 'phoneNumber', 'vertexMetadata', 'ai',
      'gis', 'media', 'business', 'specs', 'weight', 'stroke'
    ];
    if (!knownKeys.includes(k)) {
      if (result[k] === undefined) result[k] = v;
    }
  }

  return result;
};

const buildMetadataText = (name: string, metadata: AnyMeta) => {
  const parts: string[] = [];
  if (name) parts.push(cleanString(name));
  for (const key of TEXT_FIELDS) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) parts.push(cleanString(value));
  }
  const text = parts.join(' | ');
  return text.length > MAX_AI_TEXT_LEN ? text.slice(0, MAX_AI_TEXT_LEN) : text;
};

const hashText = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const normalizeMetadataWithAI = async (metadata: AnyMeta, name: string) => {
  const normalizedMeta = normalizeMetadataObject(metadata || {});
  const text = buildMetadataText(name || '', normalizedMeta);
  if (!text) return normalizedMeta;

  const hash = hashText(text);
  if (normalizedMeta.ai?.hash === hash && normalizedMeta.ai?.model === AI_MODEL) {
    return normalizedMeta;
  }

  try {
    const result = await invoke<AiNormalizeResponse>('normalize_metadata', { text });
    normalizedMeta.ai = {
      model: result.model || AI_MODEL,
      hash,
      normalized_text: result.normalized_text,
      embedding: result.embedding,
      updated_at: result.updated_at,
    };
  } catch (error) {
    console.warn('[AI] normalize_metadata failed:', error);
  }

  return normalizedMeta;
};
