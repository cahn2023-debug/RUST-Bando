import type { IconType } from '@CONTRACT/types';

export const DEFAULT_FEATURE_COLOR = '#6366f1';
export const DEFAULT_LINE_COLOR = '#10b981';

export const POINT_SYMBOL_SIZE_MIN = 4;
export const POINT_SYMBOL_SIZE_MAX = 100;
export const LINE_STROKE_SIZE_MIN = 1;
export const LINE_STROKE_SIZE_MAX = 32;
export const DEFAULT_POINT_SYMBOL_SIZE = 32;
export const DEFAULT_LINE_STROKE_SIZE = 4;

export type FeatureSymbolGeometry = 'point' | 'line';

const SAFE_COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\)|[a-z]+)$/i;

export const normalizeIconKey = (icon: unknown): IconType => {
  const normalizedIcon = typeof icon === 'string' ? icon.trim().toLowerCase() : '';
  switch (normalizedIcon) {
    case 'cctv':
    case 'camera':
      return 'cctv';
    case 'ptz':
      return 'ptz';
    case 'speed':
      return 'speed';
    case 'lpr':
      return 'lpr';
    case 'intersection':
      return 'intersection';
    case 'point_circle':
    case 'circle':
      return 'point_circle';
    default:
      return 'default';
  }
};

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
