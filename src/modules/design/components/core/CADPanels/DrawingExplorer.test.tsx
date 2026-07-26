import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureItem } from './FeatureItem';
import { buildExpandedPathForFeature, parseCoordinateInput } from './DrawingExplorer';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@IMPLEMENT/components/import/ImportReviewDialog', () => ({
  ImportReviewDialog: () => null,
}));

describe('DrawingExplorer map-panel focus behavior', () => {
  it('opens the region, group chain, and parent feature chain for a selected feature', () => {
    const expandedPath = buildExpandedPathForFeature(
      'child-feature',
      {
        'parent-feature': {
          id: 'parent-feature',
          layer_id: 'layer-1',
          group_id: 'child-group',
          name: 'Parent',
          geom_type: 'Point',
          coordinates: [106, 10],
          metadata: '{}',
          properties: {},
        },
        'child-feature': {
          id: 'child-feature',
          layer_id: 'layer-1',
          group_id: 'child-group',
          name: 'Child',
          geom_type: 'Point',
          coordinates: [106.001, 10.001],
          metadata: JSON.stringify({ parent_feature_id: 'parent-feature' }),
          properties: {},
        },
      } as any,
      {
        'layer-1': {
          id: 'layer-1',
          region_id: 'region-1',
          name: 'Layer',
        },
      } as any,
      {
        'root-group': {
          id: 'root-group',
          layer_id: 'layer-1',
          parent_id: null,
          name: 'Root',
          group_type: 'FOLDER',
        },
        'child-group': {
          id: 'child-group',
          layer_id: 'layer-1',
          parent_id: 'root-group',
          name: 'Child group',
          group_type: 'FOLDER',
        },
      } as any
    );

    expect(expandedPath).toMatchObject({
      'region-1': true,
      'root-group': true,
      'child-group': true,
      'feature-parent-feature': true,
    });
  });

  it('zooms to a feature when the panel item is double-clicked', () => {
    const onZoomTo = vi.fn();

    render(
      <FeatureItem
        feature={{
          id: 'feature-1',
          layer_id: 'layer-1',
          group_id: 'group-1',
          name: 'Camera 1',
          geom_type: 'Point',
          coordinates: [106, 10],
          metadata: '{}',
          properties: {},
        } as any}
        index={0}
        level={1}
        levelOffset={0}
        selected={false}
        expanded={false}
        hasChildren={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
        onZoomTo={onZoomTo}
        onContextMenu={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText('Camera 1').closest('[id="sidebar-feature-feature-1"]')!);

    expect(onZoomTo).toHaveBeenCalledTimes(1);
  });
});

describe('DrawingExplorer coordinate input', () => {
  it('parses point coordinates from comma separated lng lat input', () => {
    expect(parseCoordinateInput('105.871928, 21.046998', 'Point')).toEqual([105.871928, 21.046998]);
  });

  it('parses vector coordinates from JSON array input', () => {
    expect(parseCoordinateInput('[[105.871928,21.046998],[105.872,21.047]]', 'LineString')).toEqual([
      [105.871928, 21.046998],
      [105.872, 21.047],
    ]);
  });

  it('rejects invalid point coordinates', () => {
    expect(() => parseCoordinateInput('105.871928', 'Point')).toThrow('Tọa độ');
  });
});
