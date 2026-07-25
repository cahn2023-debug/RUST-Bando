import { describe, expect, it } from 'vitest';
import type { FeatureProperties, FeatureState } from '@CONTRACT/types';
import { buildFiberRouteDisplay } from './fiberRouteDisplay';

const pointFeature = (
  id: string,
  name: string,
  metadata: Record<string, unknown> = {},
  properties: FeatureProperties = {}
): FeatureState => ({
  id,
  layer_id: 'layer-1',
  group_id: null,
  name,
  geom_type: 'Point',
  metadata,
  properties,
  coordinates: [0, 0],
});

const lineFeature = (metadata: Record<string, unknown>): FeatureState => ({
  id: 'line-1',
  layer_id: 'layer-1',
  group_id: null,
  name: 'Line 1',
  geom_type: 'LineString',
  metadata,
  properties: {},
  coordinates: [[0, 0], [1, 1]],
});

describe('fiberRouteDisplay', () => {
  it('orders snap links by vertex index and formats available STT aliases', () => {
    const features = {
      start: pointFeature('start', 'Node A', { display_order: '01' }),
      mid: pointFeature('mid', 'Position B'),
      end: pointFeature('end', 'Node C', {}, { STT: '03' }),
    };
    const line = lineFeature({ snap_links: { v2: 'end', v0: 'start', v1: 'mid' } });

    expect(buildFiberRouteDisplay(line, features)).toBe('01.Node A - Position B - 03.Node C');
  });

  it('falls back to endpoint ids and skips broken or consecutive duplicate references', () => {
    const features = {
      start: pointFeature('start', '01.Node A', { stt: '01' }),
      end: pointFeature('end', 'Node C'),
    };
    const line = lineFeature({
      snap_links: { v0: 'start', v1: 'start', v2: 'missing', v3: 'end' },
      network: { from_feature_id: 'missing-start', to_feature_id: 'missing-end' },
      start_node_id: 'start',
      end_node_id: 'end',
    });

    expect(buildFiberRouteDisplay(line, features)).toBe('01.Node A - Node C');
  });

  it('uses start and end metadata when snap links are absent', () => {
    const features = {
      start: pointFeature('start', 'Node A'),
      end: pointFeature('end', 'Node C', { STT: '03' }),
    };
    const line = lineFeature({ start_node_id: 'start', end_node_id: 'end' });

    expect(buildFiberRouteDisplay(line, features)).toBe('Node A - 03.Node C');
  });
});
