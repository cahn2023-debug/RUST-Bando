import type {
  FeatureState,
  FiberCable,
  FiberCablePoint,
  FiberCapacitySummary,
  FiberInventory,
  FiberSplice,
  FiberStrand,
  FiberStrandStatus,
  FiberValidationDiagnostic,
} from '@CONTRACT/types';
import type { NetworkEdge } from './NetworkGraphService';
import { matchesSearchQuery } from '@TOOL/utils/vietnameseSearch';

export type FiberInspectorTab = 'inventory' | 'strands' | 'equipment' | 'circuits' | 'diagnostics';

export const fiberStrandStatusLabel: Record<FiberStrandStatus, string> = {
  available: 'Khả dụng',
  reserved: 'Giữ chỗ',
  active: 'Đang dùng',
  damaged: 'Lỗi',
};

export const fiberStrandStatusClass: Record<FiberStrandStatus, string> = {
  available: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  reserved: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  active: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  damaged: 'border-red-500/25 bg-red-500/10 text-red-300',
};

export interface FiberCableRow {
  cable: FiberCable;
  label: string;
  initialized: boolean;
  strandCount: number;
  points: FiberCablePoint[];
  startPoint?: FiberCablePoint;
  endPoint?: FiberCablePoint;
  enclosureCount: number;
  capacity?: FiberCapacitySummary;
  diagnostics?: FiberValidationDiagnostic[];
}

export interface FiberLegacyCableCandidate {
  id: string;
  feature_id: string;
  label: string;
  cable_type: string | null;
  fiber_count: number | null;
  source_type: NetworkEdge['sourceType'];
  from: string;
  to: string;
}

export interface FiberSpliceChainItem {
  splice: FiberSplice;
  peerStrand?: FiberStrand;
}

export interface FiberDiagnosticGroup {
  type: FiberValidationDiagnostic['type'];
  count: number;
  diagnostics: FiberValidationDiagnostic[];
}

const getMetadataObject = (metadata: FeatureState['metadata'] | undefined): Record<string, any> => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata || '{}') as Record<string, any>;
    } catch {
      return {};
    }
  }
  return metadata as Record<string, any>;
};

export const getFeatureLabel = (
  featuresById: Record<string, FeatureState> | undefined,
  featureId: string | null | undefined
): string => {
  if (!featureId) return 'Chưa chọn';
  const feature = featuresById?.[featureId];
  return feature?.name || featureId;
};

export const buildCableRows = (
  inventory: FiberInventory | null,
  capacity: FiberCapacitySummary[],
  featuresById: Record<string, FeatureState> | undefined,
  diagnostics: FiberValidationDiagnostic[] = []
): FiberCableRow[] => {
  if (!inventory) return [];
  const capacityByCable = new Map(capacity.map(item => [item.cable_id, item]));
  const diagnosticsByCable = new Map<string, FiberValidationDiagnostic[]>();
  diagnostics.forEach(diag => {
    if ('cable_id' in diag && diag.cable_id) {
      const list = diagnosticsByCable.get(diag.cable_id as string) || [];
      list.push(diag);
      diagnosticsByCable.set(diag.cable_id as string, list);
    } else if ('feature_id' in diag && diag.feature_id) {
      // Find cable with this feature_id
      const cable = inventory.cables.find(c => c.feature_id === diag.feature_id);
      if (cable) {
        const list = diagnosticsByCable.get(cable.id) || [];
        list.push(diag);
        diagnosticsByCable.set(cable.id, list);
      }
    }
  });

  const pointsByCable = new Map<string, FiberCablePoint[]>();
  (inventory.cable_points || []).forEach(point => {
    const points = pointsByCable.get(point.cable_id) || [];
    points.push(point);
    pointsByCable.set(point.cable_id, points);
  });

  return inventory.cables.map(cable => {
    const strandCount = inventory.strands.filter(strand => strand.cable_id === cable.id).length;
    const points = pointsByCable.get(cable.id) || [];
    return {
      cable,
      label: getFeatureLabel(featuresById, cable.feature_id),
      initialized: strandCount > 0,
      strandCount,
      points,
      startPoint: points.find(point => point.point_kind === 'cable_start'),
      endPoint: points.find(point => point.point_kind === 'cable_end'),
      enclosureCount: points.filter(point => point.point_kind === 'splice_enclosure').length,
      capacity: capacityByCable.get(cable.id),
      diagnostics: diagnosticsByCable.get(cable.id),
    };
  });
};

export const buildLegacyFiberCableCandidates = (
  edges: NetworkEdge[],
  inventory: FiberInventory | null,
  featuresById: Record<string, FeatureState> | undefined
): FiberLegacyCableCandidate[] => {
  const existingFeatureIds = new Set(inventory?.cables.map(cable => cable.feature_id) || []);

  return edges
    .filter(edge => !existingFeatureIds.has(edge.feature?.id || edge.id))
    .map(edge => {
      const metadata = getMetadataObject(edge.feature?.metadata);
      const infrastructure = metadata.infrastructure && typeof metadata.infrastructure === 'object'
        ? metadata.infrastructure as Record<string, any>
        : {};

      return {
        id: edge.id,
        feature_id: edge.feature?.id || edge.id,
        label: getFeatureLabel(featuresById, edge.feature?.id || edge.id),
        cable_type: infrastructure.cable_type || infrastructure.type || null,
        fiber_count: typeof infrastructure.core_count === 'number' ? infrastructure.core_count : null,
        source_type: edge.sourceType,
        from: edge.from,
        to: edge.to,
      };
    });
};

export const filterFiberStrands = (
  strands: FiberStrand[],
  cableId: string | null,
  status: FiberStrandStatus | 'all',
  query: string
): FiberStrand[] => {
  const normalizedQuery = query.trim();
  return strands.filter(strand => {
    if (cableId && strand.cable_id !== cableId) return false;
    if (status !== 'all' && strand.status !== status) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      strand.id,
      String(strand.strand_no),
      strand.color || '',
      fiberStrandStatusLabel[strand.status],
    ].join(' ');
    return matchesSearchQuery(haystack, normalizedQuery);
  });
};

export const getSpliceChainForStrand = (
  strandId: string | null,
  splices: FiberSplice[],
  strands: FiberStrand[]
): FiberSpliceChainItem[] => {
  if (!strandId) return [];
  const strandsById = new Map(strands.map(strand => [strand.id, strand]));
  return splices
    .filter(splice => splice.from_strand_id === strandId || splice.to_strand_id === strandId)
    .map(splice => {
      const peerId = splice.from_strand_id === strandId ? splice.to_strand_id : splice.from_strand_id;
      return { splice, peerStrand: strandsById.get(peerId) };
    });
};

export const groupFiberDiagnostics = (
  diagnostics: FiberValidationDiagnostic[]
): FiberDiagnosticGroup[] => {
  const byType = new Map<FiberValidationDiagnostic['type'], FiberValidationDiagnostic[]>();
  diagnostics.forEach(diagnostic => {
    const items = byType.get(diagnostic.type) || [];
    items.push(diagnostic);
    byType.set(diagnostic.type, items);
  });
  return [...byType.entries()].map(([type, items]) => ({
    type,
    count: items.length,
    diagnostics: items,
  }));
};
