import type { FiberSplice, FiberStrand } from '@CONTRACT/types';
import { fiberColorAt } from '@DESIGN/features/map/styles/dataColors';

export interface VisibleSpliceDiagramItem {
  splice: FiberSplice;
  leftStrand: FiberStrand;
  rightStrand: FiberStrand;
  leftStrandId: string;
  rightStrandId: string;
}

export interface TubeSpliceDiagramGroup {
  id: string;
  tubeIndex: number;
  startCore: number;
  endCore: number;
  color: string;
  splices: VisibleSpliceDiagramItem[];
}

export interface GroupedSpliceDiagramItems {
  tubeGroups: TubeSpliceDiagramGroup[];
  singleSplices: VisibleSpliceDiagramItem[];
}

export const getTubeIndexForCore = (coreNo: number, tubeSize = 12) =>
  Math.floor((coreNo - 1) / tubeSize);

export const getTubeCoreRange = (tubeIndex: number, tubeSize = 12) => {
  const startCore = tubeIndex * tubeSize + 1;
  return { startCore, endCore: startCore + tubeSize - 1 };
};

export const buildGroupedSpliceDiagramItems = (
  items: VisibleSpliceDiagramItem[],
  tubeSize = 12
): GroupedSpliceDiagramItems => {
  const byTube = new Map<number, VisibleSpliceDiagramItem[]>();
  const groupedSpliceIds = new Set<string>();
  const tubeGroups: TubeSpliceDiagramGroup[] = [];

  items.forEach(item => {
    const tubeIndex = getTubeIndexForCore(item.leftStrand.strand_no, tubeSize);
    byTube.set(tubeIndex, [...(byTube.get(tubeIndex) || []), item]);
  });

  [...byTube.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([tubeIndex, tubeItems]) => {
      const { startCore, endCore } = getTubeCoreRange(tubeIndex, tubeSize);
      const byCore = new Map<number, VisibleSpliceDiagramItem>();
      let isFullTube = true;

      tubeItems.forEach(item => {
        const coreNo = item.leftStrand.strand_no;
        if (
          coreNo < startCore
          || coreNo > endCore
          || item.rightStrand.strand_no !== coreNo
          || byCore.has(coreNo)
        ) {
          isFullTube = false;
          return;
        }
        byCore.set(coreNo, item);
      });

      for (let coreNo = startCore; coreNo <= endCore; coreNo += 1) {
        if (!byCore.has(coreNo)) {
          isFullTube = false;
          break;
        }
      }

      if (!isFullTube) return;

      const splices = [...byCore.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, item]) => item);
      splices.forEach(item => groupedSpliceIds.add(item.splice.id));
      tubeGroups.push({
        id: `tube-${tubeIndex + 1}-${startCore}-${endCore}`,
        tubeIndex,
        startCore,
        endCore,
        color: fiberColorAt(tubeIndex + 1).hex,
        splices,
      });
    });

  return {
    tubeGroups,
    singleSplices: items.filter(item => !groupedSpliceIds.has(item.splice.id)),
  };
};
