import { describe, expect, it } from 'vitest';
import { iconSvgForFeature } from './mapImageService';

describe('mapImageService', () => {
  it('uses the canonical icon, color and exact display size for map images', () => {
    const svg = iconSvgForFeature({
      iconKey: 'intersection',
      iconColor: '#8b5cf6',
      color: '#22d3ee',
      displaySize: 30,
      labelIndex: 'N1',
    });

    expect(svg).toContain('width="30" height="30"');
    expect(svg).toContain('stroke="#8b5cf6"');
    expect(svg).toContain('>N1</text>');
    expect(svg).not.toContain('<div');
  });
});
