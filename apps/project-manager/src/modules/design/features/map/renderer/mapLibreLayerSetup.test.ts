import { describe, expect, it } from 'vitest';
import { createMapStyle } from './mapLibreLayerSetup';

describe('createMapStyle', () => {
  it('creates a transparent feature-only style without basemap sources', () => {
    const style = createMapStyle();

    expect(style.sources).toEqual({});
    expect(style.layers).toEqual([]);
  });
});
