import type { FeatureState } from '@CONTRACT/types';

export type ObjectDataTemplateTypeId = 'intersection' | 'camera' | 'line';
export type ObjectDataFieldType = 'text' | 'number' | 'boolean' | 'select';

export interface ObjectDataTemplateField {
  key: string;
  label: string;
  type: ObjectDataFieldType;
  groupId: string;
  order: number;
  showInPalette: boolean;
  showInAnalysis: boolean;
  options?: string[];
  defaultValue?: string | number | boolean;
}

export interface ObjectDataTemplateGroup {
  id: string;
  label: string;
  order: number;
}

export interface ObjectDataTemplateType {
  id: ObjectDataTemplateTypeId;
  label: string;
  appliesTo: string[];
  groups: ObjectDataTemplateGroup[];
  fields: ObjectDataTemplateField[];
}

export interface ObjectDataTemplateSettings {
  version: 1;
  types: Record<ObjectDataTemplateTypeId, ObjectDataTemplateType>;
}

export interface CameraPreset {
  focal_length: number;
  sensor_size: string;
  resolution_x: number;
  resolution_y: number;
}

export interface ProjectSettingsSchema {
  default_install_height: number;
  camera_presets: Record<string, CameraPreset>;
  object_data_templates: ObjectDataTemplateSettings;
}

export const normalizeSchemaFieldKey = (label: string) => (
  label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
);

const DEFAULT_CAMERA_PRESETS: Record<string, CameraPreset> = {
  cctv: { focal_length: 4, sensor_size: '1/2.8"', resolution_x: 1920, resolution_y: 1080 },
  ptz: { focal_length: 4.8, sensor_size: '1/2.8"', resolution_x: 1920, resolution_y: 1080 },
  speed: { focal_length: 6, sensor_size: '1/2"', resolution_x: 2560, resolution_y: 1440 },
  lpr: { focal_length: 12, sensor_size: '1/1.8"', resolution_x: 1920, resolution_y: 1080 },
  default: { focal_length: 3.6, sensor_size: '1/3"', resolution_x: 1920, resolution_y: 1080 },
};

const buildTemplateType = (
  id: ObjectDataTemplateTypeId,
  label: string,
  appliesTo: string[],
  groups: ObjectDataTemplateGroup[],
  fields: ObjectDataTemplateField[],
): ObjectDataTemplateType => ({
  id,
  label,
  appliesTo,
  groups,
  fields,
});

export const DEFAULT_OBJECT_DATA_TEMPLATES: ObjectDataTemplateSettings = {
  version: 1,
  types: {
    intersection: buildTemplateType(
      'intersection',
      'Nut giao',
      ['intersection'],
      [
        { id: 'general', label: 'Thong tin chung', order: 10 },
        { id: 'network', label: 'Ket noi', order: 20 },
      ],
      [
        { key: 'intersection_code', label: 'Ma nut giao', type: 'text', groupId: 'general', order: 10, showInPalette: true, showInAnalysis: true },
        { key: 'junction_scope', label: 'Pham vi nut giao', type: 'text', groupId: 'general', order: 20, showInPalette: true, showInAnalysis: true },
        { key: 'traffic_role', label: 'Vai tro', type: 'select', groupId: 'network', order: 10, showInPalette: true, showInAnalysis: true, options: ['primary', 'secondary', 'shared'] },
      ],
    ),
    camera: buildTemplateType(
      'camera',
      'Camera',
      ['camera'],
      [
        { id: 'general', label: 'Thong tin chung', order: 10 },
        { id: 'specs', label: 'Thong so ky thuat', order: 20 },
      ],
      [
        { key: 'camera_code', label: 'Ma camera', type: 'text', groupId: 'general', order: 10, showInPalette: true, showInAnalysis: true },
        { key: 'vendor', label: 'Nha cung cap', type: 'text', groupId: 'general', order: 20, showInPalette: true, showInAnalysis: true },
        { key: 'model', label: 'Model', type: 'text', groupId: 'general', order: 30, showInPalette: true, showInAnalysis: true },
        { key: 'mount_height', label: 'Chieu cao lap dat', type: 'number', groupId: 'specs', order: 10, showInPalette: true, showInAnalysis: true, defaultValue: 0 },
        { key: 'focal_length_mm', label: 'Tieu cu (mm)', type: 'number', groupId: 'specs', order: 20, showInPalette: true, showInAnalysis: true, defaultValue: 0 },
        { key: 'sensor_size', label: 'Cam bien', type: 'text', groupId: 'specs', order: 30, showInPalette: true, showInAnalysis: true },
        { key: 'resolution', label: 'Do phan giai', type: 'text', groupId: 'specs', order: 40, showInPalette: true, showInAnalysis: true },
      ],
    ),
    line: buildTemplateType(
      'line',
      'Duong line',
      ['line', 'polyline'],
      [
        { id: 'general', label: 'Thong tin chung', order: 10 },
        { id: 'cable', label: 'Thong so cap', order: 20 },
      ],
      [
        { key: 'line_code', label: 'Ma tuyen', type: 'text', groupId: 'general', order: 10, showInPalette: true, showInAnalysis: true },
        { key: 'line_role', label: 'Vai tro', type: 'select', groupId: 'general', order: 20, showInPalette: true, showInAnalysis: true, options: ['backbone', 'access', 'link'] },
        { key: 'cable_type', label: 'Loai cap', type: 'text', groupId: 'cable', order: 10, showInPalette: true, showInAnalysis: true },
        { key: 'core_count', label: 'So loi', type: 'number', groupId: 'cable', order: 20, showInPalette: true, showInAnalysis: true, defaultValue: 0 },
        { key: 'bandwidth', label: 'Bang thong', type: 'text', groupId: 'cable', order: 30, showInPalette: true, showInAnalysis: true },
      ],
    ),
  },
};

const isCameraPreset = (value: unknown): value is CameraPreset => (
  !!value
  && typeof value === 'object'
  && typeof (value as CameraPreset).sensor_size === 'string'
  && typeof (value as CameraPreset).focal_length === 'number'
  && typeof (value as CameraPreset).resolution_x === 'number'
  && typeof (value as CameraPreset).resolution_y === 'number'
);

const normalizeObjectDataTemplates = (value: unknown): ObjectDataTemplateSettings => {
  const source = value && typeof value === 'object' ? value as Partial<ObjectDataTemplateSettings> : {};
  const types = source.types && typeof source.types === 'object' ? source.types as Partial<Record<ObjectDataTemplateTypeId, Partial<ObjectDataTemplateType>>> : {};

  const normalizedTypes = (['intersection', 'camera', 'line'] as ObjectDataTemplateTypeId[]).reduce<Record<ObjectDataTemplateTypeId, ObjectDataTemplateType>>((acc, typeId) => {
    const fallback = DEFAULT_OBJECT_DATA_TEMPLATES.types[typeId];
    const rawType = types[typeId];
    const groups = Array.isArray(rawType?.groups) && rawType?.groups.length > 0
      ? rawType.groups
          .filter((group): group is ObjectDataTemplateGroup => !!group && typeof group === 'object' && typeof group.id === 'string' && typeof group.label === 'string')
          .map((group, index) => ({
            id: normalizeSchemaFieldKey(group.id || group.label) || `${typeId}_group_${index + 1}`,
            label: group.label || fallback.groups[index]?.label || group.id,
            order: typeof group.order === 'number' ? group.order : (index + 1) * 10,
          }))
      : fallback.groups;

    const groupIds = new Set(groups.map((group) => group.id));
    const fields = Array.isArray(rawType?.fields) && rawType?.fields.length > 0
      ? rawType.fields
          .filter((field): field is ObjectDataTemplateField => !!field && typeof field === 'object' && typeof field.key === 'string')
          .map((field, index) => ({
            key: normalizeSchemaFieldKey(field.key),
            label: field.label || field.key,
            type: (['text', 'number', 'boolean', 'select'].includes(field.type) ? field.type : 'text') as ObjectDataFieldType,
            groupId: groupIds.has(field.groupId) ? field.groupId : groups[0]?.id || 'general',
            order: typeof field.order === 'number' ? field.order : (index + 1) * 10,
            showInPalette: field.showInPalette !== false,
            showInAnalysis: field.showInAnalysis !== false,
            options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === 'string') : undefined,
            defaultValue: field.defaultValue,
          }))
      : fallback.fields;

    acc[typeId] = {
      id: typeId,
      label: typeof rawType?.label === 'string' ? rawType.label : fallback.label,
      appliesTo: Array.isArray(rawType?.appliesTo) && rawType?.appliesTo.length > 0
        ? rawType.appliesTo.filter((item): item is string => typeof item === 'string')
        : fallback.appliesTo,
      groups: groups.sort((left, right) => left.order - right.order),
      fields: fields.sort((left, right) => left.order - right.order),
    };
    return acc;
  }, {} as Record<ObjectDataTemplateTypeId, ObjectDataTemplateType>);

  return {
    version: 1,
    types: normalizedTypes,
  };
};

export const normalizeProjectSettings = (value: unknown): ProjectSettingsSchema => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const cameraPresets = source.camera_presets && typeof source.camera_presets === 'object'
    ? Object.entries(source.camera_presets as Record<string, unknown>).reduce<Record<string, CameraPreset>>((acc, [key, preset]) => {
      if (isCameraPreset(preset)) {
        acc[key] = preset;
      }
      return acc;
    }, {})
    : {};

  return {
    default_install_height: typeof source.default_install_height === 'number' ? source.default_install_height : 5,
    camera_presets: {
      ...DEFAULT_CAMERA_PRESETS,
      ...cameraPresets,
    },
    object_data_templates: normalizeObjectDataTemplates(source.object_data_templates),
  };
};

export const getTemplateTypeIdForFeature = (
  feature: FeatureState | null | undefined,
  options?: {
    isCamera?: boolean;
    isIntersection?: boolean;
  },
): ObjectDataTemplateTypeId | null => {
  if (!feature) return null;
  if (options?.isIntersection) return 'intersection';

  const geomType = String(feature.geom_type || '').toLowerCase();
  if (geomType.includes('line')) return 'line';
  if (options?.isCamera) return 'camera';
  return null;
};

export const getTemplateFieldValue = (
  feature: FeatureState | null | undefined,
  key: string,
) => {
  if (!feature) return undefined;

  const metadata = typeof feature.metadata === 'string'
    ? (() => {
      try {
        return JSON.parse(feature.metadata || '{}') as Record<string, unknown>;
      } catch {
        return {};
      }
    })()
    : (feature.metadata as Record<string, unknown> | undefined) || {};

  if (Object.prototype.hasOwnProperty.call(metadata, key)) {
    return metadata[key];
  }

  const props = feature.properties as Record<string, unknown> | undefined;
  if (props && Object.prototype.hasOwnProperty.call(props, key)) {
    return props[key];
  }

  return undefined;
};

export const getAnalysisTemplateColumnKeys = (settings: ProjectSettingsSchema): string[] => {
  const keys = new Set<string>();
  (Object.values(settings.object_data_templates.types) as ObjectDataTemplateType[]).forEach((type) => {
    type.fields.forEach((field) => {
      if (field.showInAnalysis) {
        keys.add(field.key);
      }
    });
  });
  return Array.from(keys).sort((left, right) => left.localeCompare(right));
};

export const getAnalysisTemplateGroups = (settings: ProjectSettingsSchema) => (
  Object.values(settings.object_data_templates.types)
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((type) => ({
      id: type.id,
      label: type.label,
      groups: type.groups,
      fields: type.fields.filter((field) => field.showInAnalysis),
    }))
    .filter((item) => item.fields.length > 0)
);

