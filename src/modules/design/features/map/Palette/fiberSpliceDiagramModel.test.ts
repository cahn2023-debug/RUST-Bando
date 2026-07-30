import { describe, expect, it } from 'vitest';
import type { FiberSplice, FiberStrand } from '@CONTRACT/types';
import { fiberColorAt } from '@DESIGN/features/map/styles/dataColors';
import { buildGroupedSpliceDiagramItems, type VisibleSpliceDiagramItem } from './fiberSpliceDiagramModel';

const strand = (id: string, strandNo: number): FiberStrand => ({
  id,
  cable_id: id.startsWith('left') ? 'left-cable' : 'right-cable',
  strand_no: strandNo,
  color: null,
  status: 'available',
  created_at: '',
  updated_at: '',
});

const splice = (id: string, left: FiberStrand, right: FiberStrand): VisibleSpliceDiagramItem => ({
  splice: {
    id,
    enclosure_feature_id: 'enclosure-1',
    from_strand_id: left.id,
    to_strand_id: right.id,
    from_direction: 'end',
    to_direction: 'start',
    loss_db: 0.05,
    created_at: '',
    updated_at: '',
  } satisfies FiberSplice,
  leftStrand: left,
  rightStrand: right,
  leftStrandId: left.id,
  rightStrandId: right.id,
});

const splicesForRange = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => {
    const core = start + index;
    return splice(`splice-${core}`, strand(`left-${core}`, core), strand(`right-${core}`, core));
  });

describe('buildGroupedSpliceDiagramItems', () => {
  it('groups a fully spliced 12-core tube into one tube item', () => {
    const grouped = buildGroupedSpliceDiagramItems(splicesForRange(1, 12));

    expect(grouped.singleSplices).toHaveLength(0);
    expect(grouped.tubeGroups).toHaveLength(1);
    expect(grouped.tubeGroups[0]).toMatchObject({
      startCore: 1,
      endCore: 12,
      color: fiberColorAt(1).hex,
    });
  });

  it('keeps splices separate when a tube is missing a core', () => {
    const items = splicesForRange(1, 12).filter(item => item.leftStrand.strand_no !== 7);
    const grouped = buildGroupedSpliceDiagramItems(items);

    expect(grouped.tubeGroups).toHaveLength(0);
    expect(grouped.singleSplices).toHaveLength(11);
  });

  it('labels core range 13-24 with the second tube color', () => {
    const grouped = buildGroupedSpliceDiagramItems(splicesForRange(13, 24));

    expect(grouped.tubeGroups).toHaveLength(1);
    expect(grouped.tubeGroups[0]).toMatchObject({
      startCore: 13,
      endCore: 24,
      color: fiberColorAt(2).hex,
    });
  });
});
