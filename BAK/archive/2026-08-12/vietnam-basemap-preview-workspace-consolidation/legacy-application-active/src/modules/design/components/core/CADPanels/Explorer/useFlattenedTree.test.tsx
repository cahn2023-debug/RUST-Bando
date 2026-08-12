import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORPHAN_REGION_ID, useFlattenedTree } from './useFlattenedTree';

describe('useFlattenedTree', () => {
  it('keeps features visible when their hierarchy links are missing', () => {
    const { result } = renderHook(() => useFlattenedTree({
      regionsMap: {},
      layersMap: {},
      groupsMap: {},
      featuresMap: {
        'feature-orphan': {
          id: 'feature-orphan',
          layer_id: 'missing-layer',
          group_id: 'missing-group',
          name: 'Camera without parent',
          geom_type: 'Point',
          coordinates: [106, 10],
          metadata: '{}',
          properties: {},
        } as any,
      },
      expanded: { [ORPHAN_REGION_ID]: true },
      treeSearchQuery: '',
      filterType: null,
      reverseOrder: false,
      sortField: 'name',
    }));

    expect(result.current.filteredRegions).toEqual([
      expect.objectContaining({ id: ORPHAN_REGION_ID }),
    ]);
    expect(result.current.flattenedItems).toEqual([
      expect.objectContaining({ type: 'region', id: ORPHAN_REGION_ID }),
      expect.objectContaining({ type: 'feature', id: 'feature-orphan' }),
    ]);
  });
});
