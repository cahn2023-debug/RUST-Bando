import { describe, expect, it } from 'vitest';
import { getIconSvgString } from './MapIcons';

describe('MapIcons', () => {
  it.each(['default', 'point', 'point_circle', 'unknown-point'])('returns a visible point SVG for %s icons', (type) => {
    const svg = getIconSvgString(type, '#ef4444', 24, 9);

    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
    expect(svg).toContain('#ef4444');
    expect(svg).toContain('>9</text>');
  });

  it.each(['cctv', 'lpr', 'speed', 'ptz'])('returns a valid SVG string for camera icon %s', (type) => {
    const svg = getIconSvgString(type, '#10b981', 36, 1, 0);

    expect(svg).toContain('<svg');
    expect(svg).not.toContain('stroke="#"');
    expect(svg).not.toContain('fill="#"');
    expect(svg).toContain('#10b981');
    expect(svg).toContain('>1</text>');
  });
});
