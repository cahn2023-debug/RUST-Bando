import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { handleFeatureSelection } from './SelectionManager';

describe('handleFeatureSelection', () => {
  const selectFeature = vi.fn();
  const setSelectedGroup = vi.fn();
  const zoomTo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useDesignSync.setState({
      drawingMode: 'none',
      selectFeature,
      setSelectedGroup,
      zoomTo,
    } as any);
  });

  it('selects the clicked map feature, points the panel to its group, and zooms on single select', () => {
    handleFeatureSelection('feature-1', 'group-1', {
      latlng: { lat: 10, lng: 106 },
      originalEvent: {},
    });

    expect(selectFeature).toHaveBeenCalledWith('feature-1', false, [10, 106]);
    expect(setSelectedGroup).toHaveBeenCalledWith('group-1');
    expect(zoomTo).toHaveBeenCalledWith('feature-1', 'feature');
  });

  it('keeps shift-click as multi-select without auto-zooming', () => {
    handleFeatureSelection('feature-1', 'group-1', {
      latlng: { lat: 10, lng: 106 },
      originalEvent: { shiftKey: true },
    });

    expect(selectFeature).toHaveBeenCalledWith('feature-1', true, [10, 106]);
    expect(setSelectedGroup).toHaveBeenCalledWith('group-1');
    expect(zoomTo).not.toHaveBeenCalled();
  });
});
