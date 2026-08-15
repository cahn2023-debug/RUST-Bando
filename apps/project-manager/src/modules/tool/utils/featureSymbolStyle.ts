import type { IconType } from '@CONTRACT/types';
import { MAP_ICON_MANIFEST } from '@DESIGN/mapIconManifest';

export const DEFAULT_FEATURE_COLOR = '#6366f1';
export const DEFAULT_LINE_COLOR = '#10b981';

export const POINT_SYMBOL_SIZE_MIN = 4;
export const POINT_SYMBOL_SIZE_MAX = 100;
export const LINE_STROKE_SIZE_MIN = 1;
export const LINE_STROKE_SIZE_MAX = 32;
export const DEFAULT_POINT_SYMBOL_SIZE = 32;
export const DEFAULT_LINE_STROKE_SIZE = 4;

export type FeatureSymbolGeometry = 'point' | 'line';

export type FeatureSymbolDefinition = {
  id: IconType;
  label: string;
  objectType: string;
  aliases: readonly string[];
};

const LEGACY_OBJECT_TYPES = new Set([
  'cabinet',
  'pole',
  'splice',
  'odf',
  'splitter',
  'node',
  'pillar',
  'bridge',
  'tunnel',
  'gate',
]);

const FEATURE_SYMBOL_ORDER: readonly IconType[] = [
  'default',
  'cctv',
  'ptz',
  'speed',
  'lpr',
  'info_cabinet',
  'light_cabinet',
  'intersection',
  'point_circle',
];

const getCanonicalManifestEntry = (id: IconType) => Object.values(MAP_ICON_MANIFEST).find((entry) => entry.iconKey === id);

export const FEATURE_SYMBOL_DEFINITIONS: readonly FeatureSymbolDefinition[] = FEATURE_SYMBOL_ORDER.flatMap((id) => {
  const entry = getCanonicalManifestEntry(id);
  if (!entry?.objectType) return [];
  return [{
    id,
    label: entry.label || entry.name,
    objectType: entry.objectType,
    aliases: Array.from(new Set([id, ...(entry.aliases || [])])),
  }];
});

const symbolIdByAlias = new Map(
  FEATURE_SYMBOL_DEFINITIONS.flatMap((definition) => definition.aliases.map((alias) => [alias.toLowerCase(), definition.id] as const)),
);

const symbolDefinitionById = new Map(FEATURE_SYMBOL_DEFINITIONS.map((definition) => [definition.id, definition] as const));

export const getFeatureSymbolDefinition = (icon: IconType): FeatureSymbolDefinition => (
  symbolDefinitionById.get(icon) || symbolDefinitionById.get('default')!
);

const SAFE_COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\)|[a-z]+)$/i;

export const normalizeIconKey = (icon: unknown): IconType => {
  const normalizedIcon = typeof icon === 'string' ? icon.trim().toLowerCase() : '';
  return symbolIdByAlias.get(normalizedIcon) || 'default';
};

export const isKnownIconValue = (icon: unknown): boolean => {
  if (typeof icon !== 'string') return false;
  return symbolIdByAlias.has(icon.trim().toLowerCase());
};

export const isKnownObjectType = (objectType: unknown): boolean => {
  if (typeof objectType !== 'string') return false;
  const normalized = objectType.trim().toLowerCase();
  return normalized === ''
    || normalized === 'point'
    || normalized === 'line'
    || normalized === 'polygon'
    || FEATURE_SYMBOL_DEFINITIONS.some((definition) => definition.objectType === normalized)
    || LEGACY_OBJECT_TYPES.has(normalized);
};

export const getObjectTypeForIcon = (icon: IconType): string => getFeatureSymbolDefinition(icon).objectType;

export const normalizeFeatureColor = (value: unknown, fallback = DEFAULT_FEATURE_COLOR): string => {
  const color = typeof value === 'string' ? value.trim() : '';
  return color && SAFE_COLOR_PATTERN.test(color) ? color : fallback;
};

export const normalizeFeatureSize = (
  value: unknown,
  geometry: FeatureSymbolGeometry = 'point',
): number => {
  const isLine = geometry === 'line';
  const min = isLine ? LINE_STROKE_SIZE_MIN : POINT_SYMBOL_SIZE_MIN;
  const max = isLine ? LINE_STROKE_SIZE_MAX : POINT_SYMBOL_SIZE_MAX;
  const fallback = isLine ? DEFAULT_LINE_STROKE_SIZE : DEFAULT_POINT_SYMBOL_SIZE;
  const numeric = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);

  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};
