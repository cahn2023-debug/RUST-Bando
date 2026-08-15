import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_COLOR,
  FEATURE_SYMBOL_DEFINITIONS,
  getObjectTypeForIcon,
  normalizeFeatureColor,
  normalizeFeatureSize,
  normalizeIconKey,
} from './featureSymbolStyle';

describe('featureSymbolStyle', () => {
  it('normalizes icon aliases to the supported icon set', () => {
    expect(normalizeIconKey('camera')).toBe('cctv');
    expect(normalizeIconKey('circle')).toBe('point_circle');
    expect(normalizeIconKey('info_cabinet')).toBe('info_cabinet');
    expect(normalizeIconKey('light_cabinet')).toBe('light_cabinet');
    expect(normalizeIconKey('not-an-icon')).toBe('default');
  });

  it('derives the object type and selector metadata from one catalog', () => {
    expect(getObjectTypeForIcon('cctv')).toBe('cctv');
    expect(getObjectTypeForIcon('info_cabinet')).toBe('info_cabinet');
    expect(FEATURE_SYMBOL_DEFINITIONS.map(({ id }) => id)).toEqual([
      'default',
      'cctv',
      'ptz',
      'speed',
      'lpr',
      'info_cabinet',
      'light_cabinet',
      'intersection',
      'point_circle',
    ]);
  });

  it('keeps safe colors and falls back for unsafe SVG values', () => {
    expect(normalizeFeatureColor('#0ea5e9')).toBe('#0ea5e9');
    expect(normalizeFeatureColor('rgb(14, 165, 233)')).toBe('rgb(14, 165, 233)');
    expect(normalizeFeatureColor('red; fill: black')).toBe(DEFAULT_FEATURE_COLOR);
  });

  it('uses shared point and line size bounds', () => {
    expect(normalizeFeatureSize(120, 'point')).toBe(100);
    expect(normalizeFeatureSize(0, 'point')).toBe(4);
    expect(normalizeFeatureSize(40, 'line')).toBe(32);
    expect(normalizeFeatureSize('invalid', 'line')).toBe(4);
  });
});
