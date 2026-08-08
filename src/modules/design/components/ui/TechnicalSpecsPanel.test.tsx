import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TechnicalSpecsPanel } from './TechnicalSpecsPanel';
import { getFeatureDetailV2 } from '@SHARED/utils/designIpc';

const mockState = vi.hoisted(() => ({
  store: {
    state: {
      features: {},
      feature_groups: {},
    },
    projectId: 'project-1',
    selectedFeatureId: 'feature-1',
    featureDetailsCache: {},
    visibleFeatures: {},
  } as any,
  cacheFeatureDetail: vi.fn(),
}));

const mockUseDesignSync = vi.hoisted(() => {
  const useDesignSync = vi.fn(() => ({
    ...mockState.store,
  })) as any;
  useDesignSync.getState = vi.fn(() => ({
    cacheFeatureDetail: mockState.cacheFeatureDetail,
  }));
  return useDesignSync;
});

vi.mock('@IMPLEMENT/stores/useDesignSync', () => ({
  useDesignSync: mockUseDesignSync,
}));

vi.mock('@SHARED/utils/designIpc', () => ({
  getFeatureDetailV2: vi.fn(),
}));

describe('TechnicalSpecsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.store.state = {
      features: {},
      feature_groups: {},
    };
    mockState.store.projectId = 'project-1';
    mockState.store.selectedFeatureId = 'feature-1';
    mockState.store.featureDetailsCache = {};
    mockState.store.visibleFeatures = {};
  });

  it('fetches and caches the selected feature when it is missing from local state', async () => {
    const fetchedFeature = {
      id: 'feature-1',
      layer_id: 'layer-1',
      group_id: null,
      name: 'Camera A',
      geom_type: 'Point',
      coordinates: [105.8, 21.02],
      properties: {},
      metadata: JSON.stringify({ specs: { focal_length: 4 } }),
    };
    vi.mocked(getFeatureDetailV2).mockResolvedValue(fetchedFeature as any);

    render(<TechnicalSpecsPanel />);

    expect(screen.getByText('Chọn đối tượng để xem thông số kỹ thuật')).toBeTruthy();

    await waitFor(() => {
      expect(getFeatureDetailV2).toHaveBeenCalledWith('project-1', 'feature-1');
      expect(mockState.cacheFeatureDetail).toHaveBeenCalledWith(fetchedFeature);
    });
  });
});
