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

  it('renders intersection through the same SVG contract with exact dimensions', () => {
    const svg = getIconSvgString('intersection', '#8b5cf6', 30, 'N1');

    expect(svg).toContain('width="30" height="30"');
    expect(svg).toContain('M8 2 L8 8 L2 8');
    expect(svg).toContain('>N1</text>');
  });

  it('normalizes invalid SVG inputs before rendering', () => {
    const svg = getIconSvgString('unknown', 'red;fill:black', 1000, '<bad>');

    expect(svg).toContain('width="100" height="100"');
    expect(svg).toContain('#6366f1');
    expect(svg).toContain('&lt;bad&gt;');
    expect(svg).not.toContain('red;fill:black');
  });

  it('keeps generated map SVG free of non-portable HTML/CSS filter markup', () => {
    const svg = getIconSvgString('cctv', '#10b981', 36, 1, 0);

    expect(svg).not.toContain('<div');
    expect(svg).not.toContain('style=');
    expect(svg).not.toContain('filter=');
  });
});
