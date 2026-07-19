import { describe, expect, it } from 'vitest';
import type {
  FeatureState,
  FiberCable,
  FiberCapacitySummary,
  FiberInventory,
  FiberSplice,
  FiberStrand,
  FiberValidationDiagnostic,
} from '@CONTRACT/types';
import {
  buildCableRows,
  buildLegacyFiberCableCandidates,
  filterFiberStrands,
  getSpliceChainForStrand,
  groupFiberDiagnostics,
} from './fiberUiModel';
import type { NetworkEdge } from './NetworkGraphService';

const cable = (id: string, featureId = `${id}-feature`): FiberCable => ({
  id,
  project_id: 'project-1',
  feature_id: featureId,
  cable_type: '12F',
  fiber_count: 12,
  owner: null,
  status: 'planned',
  source: 'legacy',
  created_at: '',
  updated_at: '',
});

const strand = (
  id: string,
  cableId: string,
  strandNo: number,
  status: FiberStrand['status'] = 'available'
): FiberStrand => ({
  id,
  cable_id: cableId,
  strand_no: strandNo,
  color: strandNo === 1 ? 'blue' : null,
  status,
  created_at: '',
  updated_at: '',
});

const inventory = (overrides: Partial<FiberInventory> = {}): FiberInventory => ({
  project_id: 'project-1',
  scope: {},
  cables: [cable('cable-1', 'feature-1')],
  strands: [strand('strand-1', 'cable-1', 1), strand('strand-2', 'cable-1', 2, 'damaged')],
  ports: [],
  splices: [],
  circuits: [],
  summary: {
    total_strands: 2,
    available_strands: 1,
    reserved_strands: 0,
    active_strands: 0,
    damaged_strands: 1,
    free_strands: 1,
  },
  ...overrides,
});

describe('fiberUiModel', () => {
  it('maps inventory and capacity into cable rows with feature labels', () => {
    const capacity: FiberCapacitySummary[] = [{
      cable_id: 'cable-1',
      feature_id: 'feature-1',
      cable_type: '12F',
      fiber_count: 12,
      available_count: 10,
      reserved_count: 1,
      active_count: 1,
      damaged_count: 0,
      occupied_count: 2,
      utilization: 0.16,
    }];
    const features = {
      'feature-1': { id: 'feature-1', name: 'Cáp trục chính' } as FeatureState,
    };

    const rows = buildCableRows(inventory(), capacity, features);

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Cáp trục chính');
    expect(rows[0].initialized).toBe(true);
    expect(rows[0].strandCount).toBe(2);
    expect(rows[0].capacity?.available_count).toBe(10);
  });

  it('filters strands by cable, status and text query', () => {
    const strands = inventory().strands;

    expect(filterFiberStrands(strands, 'cable-1', 'damaged', '')).toEqual([strands[1]]);
    expect(filterFiberStrands(strands, 'other-cable', 'all', '')).toEqual([]);
    expect(filterFiberStrands(strands, 'cable-1', 'all', 'blue')).toEqual([strands[0]]);
  });

  it('returns splice chain peers for a selected strand', () => {
    const strands = inventory().strands;
    const splices: FiberSplice[] = [{
      id: 'splice-1',
      enclosure_feature_id: 'feature-1',
      from_strand_id: 'strand-1',
      to_strand_id: 'strand-2',
      loss_db: 0.05,
      created_at: '',
      updated_at: '',
    }];

    const chain = getSpliceChainForStrand('strand-1', splices, strands);

    expect(chain).toHaveLength(1);
    expect(chain[0].peerStrand?.id).toBe('strand-2');
  });

  it('groups diagnostics by type', () => {
    const diagnostics: FiberValidationDiagnostic[] = [
      { type: 'uninitialized-cable', message: 'Cable missing strands', cable_id: 'cable-1' },
      { type: 'uninitialized-cable', message: 'Cable missing strands', cable_id: 'cable-2' },
      { type: 'damaged-strand', message: 'Damaged strand', strand_id: 'strand-2' },
    ];

    const groups = groupFiberDiagnostics(diagnostics);

    expect(groups).toEqual([
      { type: 'uninitialized-cable', count: 2, diagnostics: diagnostics.slice(0, 2) },
      { type: 'damaged-strand', count: 1, diagnostics: diagnostics.slice(2) },
    ]);
  });

  it('builds legacy cable candidates from network edges when inventory is empty', () => {
    const edge = {
      id: 'edge-1',
      label: 'Line 1',
      from: 'node-a',
      to: 'node-b',
      kind: 'signal',
      sourceType: 'map-polyline',
      fromEndpoint: { type: 'feature', id: 'node-a' },
      toEndpoint: { type: 'feature', id: 'node-b' },
      fromEndpointKey: 'feature:node-a',
      toEndpointKey: 'feature:node-b',
      directionMode: 'auto',
      directionState: 'confirmed',
      feature: {
        id: 'feature-1',
        name: 'Tuyến A',
        metadata: {
          infrastructure: {
            type: 'SignalLine',
            core_count: 24,
          },
        },
      } as FeatureState,
    } as NetworkEdge;

    const candidates = buildLegacyFiberCableCandidates([edge], null, {
      'feature-1': edge.feature as FeatureState,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].feature_id).toBe('feature-1');
    expect(candidates[0].fiber_count).toBe(24);
  });
});
