import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FiberCapacitySummary,
  FiberCircuitServiceType,
  FiberInventory,
  FiberStrand,
  FiberStrandStatus,
  FiberTraceResult,
  FiberCable,
  FiberValidationDiagnostic,
} from '@CONTRACT/types';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { NetworkGraphService } from '@DESIGN/features/map/network/NetworkGraphService';
import {
  getFiberCapacity,
  getFiberInventory,
  initializeCableStrands,
  materializeFiberFromPolylines,
  traceFiberCircuit,
  upsertFiberCable,
  upsertFiberCircuit,
  upsertFiberSplice,
  validateFiberNetwork,
} from '@DESIGN/features/map/network/fiberService';
import {
  buildCableRows,
  buildLegacyFiberCableCandidates,
  fiberStrandStatusClass,
  fiberStrandStatusLabel,
  filterFiberStrands,
  getFeatureLabel,
  getSpliceChainForStrand,
  groupFiberDiagnostics,
  type FiberLegacyCableCandidate,
  type FiberInspectorTab,
} from '@DESIGN/features/map/network/fiberUiModel';
import { FiberCapacityPanel } from './FiberCapacityPanel';
import { FiberCircuitPanel } from './FiberCircuitPanel';
import { EquipmentPanel } from './EquipmentPanel';
import {
  CheckCircle2,
  CircleDot,
  GitBranch,
  ListChecks,
  Loader2,
  RefreshCcw,
  Route,
  Sigma,
  TriangleAlert,
} from 'lucide-react';

interface FiberInspectorProps {
  projectId: string | null;
  selectedFeatureId?: string | null;
}

const tabs: Array<{ id: FiberInspectorTab; label: string }> = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'strands', label: 'Strands' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'circuits', label: 'Circuits' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const statusOptions: Array<FiberStrandStatus | 'all'> = ['all', 'available', 'reserved', 'active', 'damaged'];
const statusLabel = (status: FiberStrandStatus | 'all') => status === 'all' ? 'Tất cả' : fiberStrandStatusLabel[status];

const PREDEFINED_CABLE_TYPES = [
  'ADSS khoảng vượt 100',
  'ADSS khoảng vượt 200',
  'Cáp DB',
  'Cáp CKL',
  'Cáp CPKL',
];
const PREDEFINED_CAPACITIES = [8, 12, 24, 48, 96, 144];

const parseFeatureMetadata = (metadata: unknown): Record<string, any> => {
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

const isLineFeature = (feature: { geom_type?: string; geometry_type?: string; coordinates?: unknown } | undefined) => {
  if (!feature) return false;
  const geomType = `${feature.geom_type || feature.geometry_type || ''}`.toLowerCase();
  return (geomType.includes('line') || geomType.includes('polyline')) && Array.isArray(feature.coordinates);
};

interface StrandRowProps {
  strand: FiberStrand;
  selected: boolean;
  onToggle: (strandId: string) => void;
}

/**
 * One row in the strand list. Memoized because the list re-renders on every keystroke
 * in the filter box, and a cable can carry up to 144 strands.
 */
const StrandRow = React.memo<StrandRowProps>(function StrandRow({ strand, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(strand.id)}
      aria-pressed={selected}
      className={selected
        ? 'flex w-full cursor-pointer items-center justify-between gap-2 border-b border-cad-accent/10 bg-cad-accent/10 px-3 py-2 text-left'
        : 'flex w-full cursor-pointer items-center justify-between gap-2 border-b border-cad-border px-3 py-2 text-left hover:bg-cad-text-primary/5'}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold text-cad-text-primary">Sợi #{strand.strand_no}</span>
        <span className="block truncate text-[9px] text-cad-text-muted">{strand.color || 'Chưa gán màu'} · {strand.id}</span>
      </span>
      <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] ${fiberStrandStatusClass[strand.status]}`}>
        {fiberStrandStatusLabel[strand.status]}
      </span>
    </button>
  );
});

export const FiberInspector: React.FC<FiberInspectorProps> = ({ projectId, selectedFeatureId }) => {
  const featuresFromStore = useDesignSync(s => s.state?.features);
  /**
   * `?? {}` inline would mint a new object on every render, invalidating every memo
   * keyed on `featuresById` — including the `NetworkGraphService.build` call below.
   */
  const featuresById = useMemo(() => featuresFromStore ?? {}, [featuresFromStore]);
  const selectFeature = useDesignSync(s => s.selectFeature);
  const zoomTo = useDesignSync(s => s.zoomTo);

  const [activeTab, setActiveTab] = useState<FiberInspectorTab>('inventory');
  const [inventory, setInventory] = useState<FiberInventory | null>(null);
  const [capacity, setCapacity] = useState<FiberCapacitySummary[]>([]);
  const [diagnostics, setDiagnostics] = useState<FiberValidationDiagnostic[]>([]);
  const [traceResult, setTraceResult] = useState<FiberTraceResult | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [selectedLegacyCandidateId, setSelectedLegacyCandidateId] = useState<string | null>(null);
  const [selectedStrandId, setSelectedStrandId] = useState<string | null>(null);
  const [selectedStrandIds, setSelectedStrandIds] = useState<Set<string>>(new Set());
  const [selectedCircuitId, setSelectedCircuitId] = useState<string | null>(null);
  const [strandStatusFilter, setStrandStatusFilter] = useState<FiberStrandStatus | 'all'>('all');
  const [strandQuery, setStrandQuery] = useState('');
  const [cableType, setCableType] = useState<string>('');
  const [fiberCount, setFiberCount] = useState<number | ''>(12);
  const [spliceLossDb, setSpliceLossDb] = useState(0.05);
  const [circuitName, setCircuitName] = useState('');
  const [serviceType, setServiceType] = useState<FiberCircuitServiceType>('data');
  const [aFeatureId, setAFeatureId] = useState('');
  const [zFeatureId, setZFeatureId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const featureOptions = useMemo(
    () => Object.values(featuresById).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [featuresById]
  );
  const networkGraph = useMemo(() => NetworkGraphService.build(featuresById), [featuresById]);
  const cableRows = useMemo(() => buildCableRows(inventory, capacity, featuresById, diagnostics), [capacity, featuresById, inventory, diagnostics]);
  const legacyCableCandidates = useMemo(
    () => buildLegacyFiberCableCandidates(networkGraph.edges, inventory, featuresById),
    [featuresById, inventory, networkGraph.edges]
  );
  const selectedCable = useMemo(
    () => inventory?.cables.find(cable => cable.id === selectedCableId) || null,
    [inventory?.cables, selectedCableId]
  );
  const selectedPolylineCandidate = useMemo<FiberLegacyCableCandidate | null>(() => {
    if (!selectedFeatureId) return null;
    if (inventory?.cables.some(cable => cable.feature_id === selectedFeatureId)) return null;
    const existingCandidate = legacyCableCandidates.find(item => item.feature_id === selectedFeatureId);
    if (existingCandidate) return existingCandidate;

    const feature = featuresById[selectedFeatureId];
    if (!isLineFeature(feature)) return null;

    const metadata = parseFeatureMetadata(feature.metadata);
    const infrastructure = metadata.infrastructure && typeof metadata.infrastructure === 'object'
      ? metadata.infrastructure as Record<string, any>
      : {};

    return {
      id: feature.id,
      feature_id: feature.id,
      label: feature.name || feature.id,
      cable_type: infrastructure.cable_type || infrastructure.type || null,
      fiber_count: typeof infrastructure.core_count === 'number' ? infrastructure.core_count : null,
      source_type: 'map-polyline',
      from: '',
      to: '',
    };
  }, [featuresById, inventory?.cables, legacyCableCandidates, selectedFeatureId]);
  const selectedLegacyCandidate = useMemo(() => {
    if (selectedPolylineCandidate) return selectedPolylineCandidate;
    if (selectedFeatureId) {
      const bySelectedFeature = legacyCableCandidates.find(item => item.feature_id === selectedFeatureId);
      if (bySelectedFeature) return bySelectedFeature;
    }
    if (selectedLegacyCandidateId) {
      return legacyCableCandidates.find(item => item.id === selectedLegacyCandidateId) || null;
    }
    return null;
  }, [legacyCableCandidates, selectedFeatureId, selectedLegacyCandidateId, selectedPolylineCandidate]);
  const filteredStrands = useMemo(
    () => filterFiberStrands(inventory?.strands || [], selectedCableId, strandStatusFilter, strandQuery),
    [inventory?.strands, selectedCableId, strandQuery, strandStatusFilter]
  );
  const selectedStrand = useMemo(
    () => inventory?.strands.find(strand => strand.id === selectedStrandId) || null,
    [inventory?.strands, selectedStrandId]
  );
  const spliceChain = useMemo(
    () => getSpliceChainForStrand(selectedStrandId, inventory?.splices || [], inventory?.strands || []),
    [inventory?.splices, inventory?.strands, selectedStrandId]
  );
  const diagnosticGroups = useMemo(() => groupFiberDiagnostics(diagnostics), [diagnostics]);
  const pickedStrands = useMemo(
    () => (inventory?.strands || []).filter(strand => selectedStrandIds.has(strand.id)),
    [inventory?.strands, selectedStrandIds]
  );
  const selectedCableEnclosures = useMemo(
    () => (inventory?.cable_points || [])
      .filter(point => point.cable_id === selectedCableId && point.point_kind === 'splice_enclosure'),
    [inventory?.cable_points, selectedCableId]
  );
  const hasCableInventory = cableRows.length > 0;

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const nextInventory = await getFiberInventory(projectId);
      setInventory(nextInventory);
      try {
        const nextCapacity = await getFiberCapacity(projectId);
        setCapacity(nextCapacity.items);
      } catch {
        setCapacity([]);
      }
      try {
        const nextValidation = await validateFiberNetwork(projectId, {}, featuresById);
        setDiagnostics(nextValidation.diagnostics);
      } catch {
        setDiagnostics([]);
      }
      setSelectedCableId(current => {
        if (current && nextInventory.cables.some(cable => cable.id === current)) return current;
        const byFeature = nextInventory.cables.find(cable => cable.feature_id === selectedFeatureId);
        return byFeature?.id || nextInventory.cables[0]?.id || null;
      });
      setSelectedCircuitId(current => {
        if (current && nextInventory.circuits.some(circuit => circuit.id === current)) return current;
        return nextInventory.circuits[0]?.id || null;
      });
      setAFeatureId(current => current || selectedFeatureId || nextInventory.cables[0]?.feature_id || '');
      setZFeatureId(current => current || selectedFeatureId || nextInventory.cables[1]?.feature_id || nextInventory.cables[0]?.feature_id || '');
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu FiberMap.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(refreshTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!selectedFeatureId) return;
    const cable = inventory?.cables.find(item => item.feature_id === selectedFeatureId);
    if (cable) {
      const selectionTimer = window.setTimeout(() => {
        setSelectedCableId(cable.id);
        setSelectedLegacyCandidateId(null);
      }, 0);
      return () => window.clearTimeout(selectionTimer);
    } else {
      const candidate = legacyCableCandidates.find(item => item.feature_id === selectedFeatureId);
      if (candidate) {
        const selectionTimer = window.setTimeout(() => {
          setSelectedLegacyCandidateId(candidate.id);
        }, 0);
        return () => window.clearTimeout(selectionTimer);
      }
    }
  }, [inventory, selectedFeatureId, legacyCableCandidates]);

  useEffect(() => {
    if (!selectedLegacyCandidateId && legacyCableCandidates.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedLegacyCandidateId(legacyCableCandidates[0].id);
    }
  }, [legacyCableCandidates, selectedLegacyCandidateId]);

  useEffect(() => {
    if (selectedCable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCableType(selectedCable.cable_type || '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiberCount(selectedCable.fiber_count || 12);
    } else if (selectedLegacyCandidate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCableType(selectedLegacyCandidate.cable_type || '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiberCount(selectedLegacyCandidate.fiber_count || 12);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCableType('');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiberCount(12);
    }
  }, [selectedCable, selectedLegacyCandidate]);

  const focusFeature = (featureId: string | null | undefined) => {
    if (!featureId) return;
    selectFeature(featureId);
    zoomTo(featureId, 'feature');
  };

  const showStrand = (strand: FiberStrand) => {
    setSelectedCableId(strand.cable_id);
    setSelectedStrandId(strand.id);
    setActiveTab('strands');
  };

  const runWrite = async (message: string, action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      setStatusMessage(message);
      await refresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Thao tác FiberMap thất bại.');
      setStatusMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCableConfig = async () => {
    if (!projectId) return;
    const targetCable = selectedCable;
    const targetCandidate = selectedLegacyCandidate;
    if (!targetCable && !targetCandidate) {
      setStatusMessage('Hãy chọn một polyline/cáp trên bản đồ trước khi lưu cấu hình.');
      return;
    }
    const capacity = typeof fiberCount === 'number' ? fiberCount : parseInt(fiberCount, 10);
    if (isNaN(capacity) || capacity < 1) {
      setStatusMessage('Dung lượng cáp không hợp lệ.');
      return;
    }
    await runWrite('Đã lưu cấu hình cáp.', async () => {
      const updatedCable = {
        id: targetCable?.id || targetCandidate!.id,
        projectId,
        featureId: targetCable?.feature_id || targetCandidate!.feature_id,
        cableType: cableType.trim() || null,
        fiberCount: capacity,
        owner: targetCable?.owner ?? null,
        status: targetCable?.status ?? 'planned',
        source: targetCable?.source ?? 'legacy',
      };
      await upsertFiberCable(updatedCable);

      const existingStrands = inventory?.strands.filter(s => s.cable_id === updatedCable.id) || [];
      if (existingStrands.length === 0) {
        await initializeCableStrands({ projectId, cableId: updatedCable.id, fiberCount: capacity });
      }

      const newInventory = await getFiberInventory(projectId);

      const newCableData = {
        id: updatedCable.id,
        project_id: updatedCable.projectId,
        feature_id: updatedCable.featureId,
        cable_type: updatedCable.cableType,
        fiber_count: updatedCable.fiberCount,
        owner: updatedCable.owner,
        status: updatedCable.status,
        source: updatedCable.source,
      } as FiberCable;

      const cableIndex = newInventory.cables.findIndex(c => c.id === newCableData.id);
      if (cableIndex >= 0) {
        newInventory.cables[cableIndex] = { ...newInventory.cables[cableIndex], ...newCableData };
      } else {
        newInventory.cables.push(newCableData);
      }

      const singleFeature = featuresById[newCableData.feature_id];
      if (!singleFeature) {
        throw new Error('Không tìm thấy dữ liệu feature cho tuyến cáp này.');
      }

      await materializeFiberFromPolylines(
        projectId,
        featuresById,
        newInventory,
        { targetFeatureIds: [newCableData.feature_id] }
      );
    });
    if (targetCandidate) {
      setSelectedCableId(targetCandidate.id);
      setSelectedLegacyCandidateId(null);
    }
  };

  const handleInitialize = async (cableId = selectedCableId, count?: number | '') => {
    const cable = inventory?.cables.find(item => item.id === cableId);
    const requestedCount = count ?? cable?.fiber_count ?? fiberCount;
    const finalCount = typeof requestedCount === 'number' ? requestedCount : parseInt(requestedCount as string, 10);
    if (!projectId || !cableId || isNaN(finalCount) || finalCount < 1) return;
    await runWrite('Đã khởi tạo sợi cho cáp.', () =>
      initializeCableStrands({ projectId, cableId, fiberCount: finalCount })
    );
    setActiveTab('strands');
  };

  const handleCreateLegacyCable = async (candidateId: string) => {
    if (!projectId) return;
    const candidate = legacyCableCandidates.find(item => item.id === candidateId) || selectedPolylineCandidate;
    if (!candidate) return;
    await runWrite('Đã tạo cable legacy từ tuyến Network.', () =>
      upsertFiberCable({
        id: candidate.id,
        projectId,
        featureId: candidate.feature_id,
        cableType: candidate.cable_type,
        fiberCount: candidate.fiber_count,
        source: 'legacy',
        status: 'planned',
      })
    );
    setSelectedCableId(candidate.id);
    setSelectedLegacyCandidateId(null);
    setActiveTab('inventory');
  };

  const handleCreateAllLegacyCables = async () => {
    if (!projectId || legacyCableCandidates.length === 0) return;
    await runWrite('Đã tạo cable legacy cho toàn bộ tuyến Network.', async () => {
      await Promise.all(legacyCableCandidates.map(candidate =>
        upsertFiberCable({
          id: candidate.id,
          projectId,
          featureId: candidate.feature_id,
          cableType: candidate.cable_type,
          fiberCount: candidate.fiber_count,
          source: 'legacy',
          status: 'planned',
        })
      ));
    });
    setActiveTab('inventory');
  };

  const handleMaterializePolylines = async () => {
    if (!projectId) return;
    await runWrite('Đã nhận diện tuyến fiber từ polyline và materialize măng xông.', () =>
      materializeFiberFromPolylines(projectId, featuresById, inventory)
    );
    setActiveTab('inventory');
  };

  const handleChangeSelectedStatus = async (status: FiberStrandStatus) => {
    if (!projectId || !selectedCable || selectedStrandIds.size === 0) return;
    const cableStrands = (inventory?.strands || []).filter(strand => strand.cable_id === selectedCable.id);
    await runWrite(`Đã chuyển ${selectedStrandIds.size} sợi sang ${fiberStrandStatusLabel[status]}.`, () =>
      initializeCableStrands({
        projectId,
        cableId: selectedCable.id,
        fiberCount: selectedCable.fiber_count || cableStrands.length,
        strands: cableStrands.map(strand => ({
          strandNo: strand.strand_no,
          color: strand.color,
          status: selectedStrandIds.has(strand.id) ? status : strand.status,
        })),
      })
    );
    setSelectedStrandIds(new Set());
  };

  const handleCreateSplice = async () => {
    const [fromStrand, toStrand] = pickedStrands;
    const fromCable = inventory?.cables.find(cable => cable.id === fromStrand?.cable_id);
    const enclosureFeatureId = selectedCableEnclosures[0]?.feature_id || selectedCable?.feature_id || fromCable?.feature_id || selectedFeatureId;
    if (!projectId || !fromStrand || !toStrand || !enclosureFeatureId) return;
    await runWrite('Đã tạo mối nối giữa hai sợi.', () =>
      upsertFiberSplice(projectId, {
        id: crypto.randomUUID(),
        enclosureFeatureId,
        fromStrandId: fromStrand.id,
        toStrandId: toStrand.id,
        fromDirection: 'end',
        toDirection: 'start',
        lossDb: spliceLossDb,
      })
    );
  };

  const handleCreateCircuit = async () => {
    if (!projectId || !circuitName.trim() || !aFeatureId || !zFeatureId) return;
    const hops = pickedStrands.map((strand, index) => ({
      sequenceNo: index + 1,
      strandId: strand.id,
      portId: null,
    }));
    const circuitId = crypto.randomUUID();
    await runWrite('Đã tạo tuyến A–Z.', () =>
      upsertFiberCircuit({
        id: circuitId,
        projectId,
        name: circuitName.trim(),
        serviceType,
        aFeatureId,
        zFeatureId,
        hops,
      })
    );
    setCircuitName('');
    setSelectedCircuitId(circuitId);
    setActiveTab('circuits');
  };

  const handleTrace = async (circuitId: string) => {
    setSelectedCircuitId(circuitId);
    try {
      const result = await traceFiberCircuit(circuitId);
      setTraceResult(result);
      if (result.strands[0]) showStrand(result.strands[0]);
      setActiveTab('circuits');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Không trace được tuyến A–Z.');
    }
  };

  const handleDiagnosticFocus = (diagnostic: FiberValidationDiagnostic) => {
    if (diagnostic.feature_id || diagnostic.edge_id) {
      focusFeature(diagnostic.feature_id || diagnostic.edge_id);
      return;
    }
    if (diagnostic.strand_id) {
      const strand = inventory?.strands.find(item => item.id === diagnostic.strand_id);
      if (strand) showStrand(strand);
      return;
    }
    if (diagnostic.cable_id) {
      setSelectedCableId(diagnostic.cable_id);
      setActiveTab('inventory');
    }
  };

  /**
   * Stable across renders (only setState calls, all in updater form), so the memoized
   * `StrandRow` children can actually skip re-rendering.
   */
  const toggleStrand = useCallback((strandId: string) => {
    setSelectedStrandIds(current => {
      const next = new Set(current);
      if (next.has(strandId)) next.delete(strandId);
      else next.add(strandId);
      return next;
    });
    setSelectedStrandId(strandId);
  }, []);

  const total = inventory?.summary.total_strands || 0;
  const initializedCableIds = useMemo(
    () => new Set((inventory?.strands || []).map(strand => strand.cable_id)),
    [inventory?.strands]
  );
  const selectedCableInitialized = selectedCableId ? initializedCableIds.has(selectedCableId) : false;
  const canConfigureCable = Boolean(selectedCable || selectedLegacyCandidate);
  const cableConfigLabel = selectedCable
    ? getFeatureLabel(featuresById, selectedCable.feature_id)
    : selectedLegacyCandidate?.label;
  const cableConfigIsMaterialized = Boolean(selectedCable);

  if (!projectId) {
    return (
      <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10.5px] text-cad-text-muted">
        Chưa có project để tải dữ liệu FiberMap.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-cad-border bg-cad-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-cad-text-primary">
          <Route size={13} className="text-cad-accent" />
          FiberMap
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || saving}
          className="inline-flex items-center gap-1 rounded border border-cad-border px-2 py-1 text-[9px] font-semibold text-cad-text-primary hover:bg-cad-text-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCcw size={10} />}
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 rounded-lg border border-cad-border bg-cad-surface p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id
              ? 'rounded bg-cad-accent/15 px-2 py-1 text-[9px] font-semibold text-cad-accent'
              : 'rounded px-2 py-1 text-[9px] font-semibold text-cad-text-muted hover:bg-cad-text-primary/5 hover:text-cad-text-primary'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="rounded border border-cad-border bg-cad-surface p-2 text-[10px] text-cad-text-primary">
          {statusMessage}
        </div>
      )}

      <div className="rounded-lg border border-cad-border bg-cad-surface p-3 space-y-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-cad-text-primary">
          <Sigma size={11} /> Cấu hình Cáp
        </div>
        <div className="text-[9px] text-cad-text-muted">
          {canConfigureCable
            ? `${cableConfigIsMaterialized ? 'Đang chọn cáp' : 'Đang chọn polyline'}: ${cableConfigLabel}`
            : 'Chọn một polyline/cáp trên bản đồ hoặc trong danh sách cáp để cấu hình.'}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] text-cad-text-secondary">Loại cáp</label>
            <input
              type="text"
              list="cable-types"
              value={cableType}
              onChange={event => setCableType(event.target.value)}
              placeholder="VD: ADSS khoảng vượt 100"
              disabled={!canConfigureCable || saving}
              className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none focus:border-cad-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <datalist id="cable-types">
              {PREDEFINED_CABLE_TYPES.map(type => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-cad-text-secondary">Dung lượng (FO)</label>
            <input
              type="number"
              list="cable-capacities"
              min={1}
              value={fiberCount}
              onChange={event => setFiberCount(event.target.value === '' ? '' : Number(event.target.value))}
              placeholder="VD: 48"
              disabled={!canConfigureCable || saving}
              className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none focus:border-cad-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <datalist id="cable-capacities">
              {PREDEFINED_CAPACITIES.map(cap => (
                <option key={cap} value={cap} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleSaveCableConfig()}
            disabled={!canConfigureCable || saving}
            className="rounded border border-cad-accent/30 bg-cad-accent/10 px-3 py-1.5 text-[10px] font-semibold text-cad-accent hover:bg-cad-accent/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            Lưu cấu hình
          </button>

          {cableConfigIsMaterialized && !selectedCableInitialized && selectedCableId && (
            <button
              type="button"
              onClick={() => void handleInitialize()}
              disabled={!selectedCable?.fiber_count || selectedCable.fiber_count < 1 || saving}
              className="rounded border border-cad-warn/30 bg-cad-warn/10 px-3 py-1.5 text-[10px] font-semibold text-cad-warn hover:bg-cad-warn/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              Khởi tạo sợi
            </button>
          )}
        </div>

        {!cableConfigIsMaterialized && selectedLegacyCandidate && (
          <div className="text-[9px] text-cad-warn">
            Polyline này chưa có cable trong FiberMap. Nhấn Lưu cấu hình để tạo cable và lưu loại/dung lượng.
          </div>
        )}
        {cableConfigIsMaterialized && !selectedCableInitialized && selectedCableId && (
          <div className="text-[9px] text-cad-warn">
            Cáp này chưa có danh sách sợi. Hãy lưu cấu hình trước, rồi nhấn Khởi tạo sợi.
          </div>
        )}
      </div>

      {activeTab === 'inventory' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-cad-accent/15 bg-cad-accent/5 p-3 text-[10px] text-cad-text-primary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-cad-accent">Nhận diện tuyến fiber từ polyline</div>
                <div className="mt-0.5 text-cad-text-secondary">
                  Tạo cable từ polyline, dùng điểm đầu/cuối đã có và chỉ sinh măng xông tại điểm rẽ/giao tuyến.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleMaterializePolylines()}
                disabled={saving || loading || Object.keys(featuresById).length === 0}
                className="rounded border border-cad-accent/30 bg-cad-accent/10 px-2 py-1 font-semibold text-cad-accent hover:bg-cad-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nhận diện tuyến fiber từ polyline
              </button>
            </div>
          </div>

          {!hasCableInventory && legacyCableCandidates.length > 0 && (
            <div className="space-y-2 rounded-lg border border-cad-warn/20 bg-cad-warn/5 p-3 text-[10px] text-cad-warn">
              <div>
                Chưa có cáp fiber trong bảng. Có {legacyCableCandidates.length} tuyến Network có thể chuyển thành cáp.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateLegacyCable(selectedLegacyCandidateId || legacyCableCandidates[0].id)}
                  disabled={!selectedLegacyCandidateId || saving}
                  className="rounded border border-cad-warn/30 bg-cad-warn/10 px-2 py-1 font-semibold text-cad-warn disabled:opacity-50"
                >
                  Tạo cable từ tuyến đã chọn
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateAllLegacyCables()}
                  disabled={saving}
                  className="rounded border border-cad-border px-2 py-1 font-semibold text-cad-text-primary hover:bg-cad-text-primary/10 disabled:opacity-50"
                >
                  Tự tạo từ tất cả tuyến Network
                </button>
              </div>
              <div className="max-h-28 overflow-auto rounded border border-cad-border bg-cad-surface">
                {legacyCableCandidates.map(candidate => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedLegacyCandidateId(candidate.id)}
                    className={selectedLegacyCandidateId === candidate.id
                      ? 'block w-full border-b border-cad-warn/10 bg-cad-warn/10 px-3 py-2 text-left'
                      : 'block w-full border-b border-cad-border px-3 py-2 text-left hover:bg-cad-text-primary/5'}
                  >
                    <div className="font-semibold text-cad-text-primary">{candidate.label}</div>
                    <div className="text-[9px] text-cad-text-muted">
                      {candidate.source_type} · {candidate.cable_type || 'Cáp'} · {candidate.fiber_count ?? 'fiber_count chưa rõ'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1 text-[9px]">
            {[
              ['Tổng', total],
              ['Khả dụng', inventory?.summary.available_strands || 0],
              ['Giữ chỗ', inventory?.summary.reserved_strands || 0],
              ['Đang dùng', inventory?.summary.active_strands || 0],
              ['Lỗi', inventory?.summary.damaged_strands || 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded border border-cad-border bg-cad-surface p-2">
                <div className="text-cad-text-muted">{label}</div>
                <div className="text-[12px] font-semibold text-cad-text-primary">{value as number}</div>
              </div>
            ))}
          </div>

          {hasCableInventory ? (
            <FiberCapacityPanel
              rows={cableRows}
              selectedCableId={selectedCableId}
              onSelectCable={setSelectedCableId}
            />
          ) : legacyCableCandidates.length > 0 ? (
            <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10px] text-cad-text-muted">
              Hãy tạo cable legacy ở khung trên để bắt đầu workflow FiberMap.
            </div>
          ) : (
            <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10px] text-cad-text-muted">
              Chưa có cáp fiber trong bảng. Fiber tab sẽ hiện khi project có tuyến Network hợp lệ.
            </div>
          )}

        </div>
      )}

      {activeTab === 'strands' && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              value={selectedCableId || ''}
              onChange={event => setSelectedCableId(event.target.value || null)}
              className="rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
            >
              <option value="">Chọn cáp</option>
              {cableRows.map(row => (
                <option key={row.cable.id} value={row.cable.id}>
                  {row.label} · {row.strandCount}/{row.cable.fiber_count || '?'} sợi
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => selectedCable && focusFeature(selectedCable.feature_id)}
              disabled={!selectedCable}
              className="rounded border border-cad-border px-2 py-1 text-[9px] font-semibold text-cad-text-primary hover:bg-cad-text-primary/10 disabled:opacity-50"
            >
              Focus
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={strandStatusFilter}
              onChange={event => setStrandStatusFilter(event.target.value as FiberStrandStatus | 'all')}
              className="w-28 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
            >
              {statusOptions.map(option => (
                <option key={option} value={option}>{statusLabel(option)}</option>
              ))}
            </select>
            <input
              value={strandQuery}
              onChange={event => setStrandQuery(event.target.value)}
              placeholder="Tìm số sợi, màu, ID"
              className="min-w-0 flex-1 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
            />
          </div>

          {filteredStrands.length === 0 ? (
            <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10px] text-cad-text-muted">
              {selectedCableId ? 'Cáp chưa initialize hoặc không có sợi khớp bộ lọc.' : 'Chọn một cáp để xem danh sách sợi.'}
            </div>
          ) : (
            <div className="max-h-56 overflow-auto rounded-lg border border-cad-border bg-cad-surface">
              {filteredStrands.map(strand => (
                <StrandRow
                  key={strand.id}
                  strand={strand}
                  selected={selectedStrandIds.has(strand.id)}
                  onToggle={toggleStrand}
                />
              ))}
            </div>
          )}

          <div className="rounded-lg border border-cad-border bg-cad-surface p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-cad-text-primary">
              <ListChecks size={11} /> Thao tác sợi đã chọn ({selectedStrandIds.size})
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['available', 'reserved', 'active', 'damaged'] as FiberStrandStatus[]).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void handleChangeSelectedStatus(status)}
                  disabled={selectedStrandIds.size === 0 || saving}
                  className="rounded border border-cad-border px-2 py-1 text-[9px] font-semibold text-cad-text-primary hover:bg-cad-text-primary/10 disabled:opacity-50"
                >
                  {fiberStrandStatusLabel[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-cad-border bg-cad-surface p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-cad-text-primary">
              <GitBranch size={11} /> Mối nối
            </div>
            <div className="text-[9px] text-cad-text-muted">
              Chọn đúng 2 sợi trong bảng để tạo splice. Loss mặc định nhẹ, có thể chỉnh trước khi lưu.
            </div>
            <div className="rounded border border-cad-border bg-cad-elevated p-2 text-[9px] text-cad-text-secondary">
              Măng xông sử dụng:{' '}
              {selectedCableEnclosures[0]
                ? getFeatureLabel(featuresById, selectedCableEnclosures[0].feature_id)
                : 'Chưa có măng xông materialize; tạm dùng feature cáp đang chọn.'}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step={0.01}
                min={0}
                value={spliceLossDb}
                onChange={event => setSpliceLossDb(Number(event.target.value))}
                className="w-20 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCreateSplice()}
                disabled={pickedStrands.length !== 2 || saving}
                className="rounded border border-cad-accent/30 bg-cad-accent/10 px-2 py-1 text-[10px] font-semibold text-cad-accent hover:bg-cad-accent/20 disabled:opacity-50"
              >
                Tạo mối nối
              </button>
            </div>
            {selectedStrand && (
              <div className="rounded border border-cad-border bg-cad-elevated p-2 text-[9px] text-cad-text-secondary">
                <div className="font-semibold text-cad-text-primary">Splice chain của sợi #{selectedStrand.strand_no}</div>
                {spliceChain.length === 0 ? (
                  <div className="mt-1 text-cad-text-muted">Chưa có mối nối.</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {spliceChain.map(item => (
                      <div key={item.splice.id} className="rounded bg-cad-bg px-2 py-1">
                        → Sợi #{item.peerStrand?.strand_no || '?'} · loss {item.splice.loss_db ?? 0} dB
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'equipment' && (
        <EquipmentPanel
          projectId={projectId}
          selectedFeatureId={selectedFeatureId ?? null}
          inventory={inventory}
          featuresById={featuresById}
        />
      )}

      {activeTab === 'circuits' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-cad-border bg-cad-surface p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-cad-text-primary">
              <CircleDot size={11} /> Tạo tuyến A–Z
            </div>
            <input
              value={circuitName}
              onChange={event => setCircuitName(event.target.value)}
              placeholder="Tên tuyến / circuit"
              className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={aFeatureId}
                onChange={event => setAFeatureId(event.target.value)}
                className="min-w-0 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
              >
                <option value="">Chọn A endpoint</option>
                {featureOptions.map(feature => (
                  <option key={feature.id} value={feature.id}>{getFeatureLabel(featuresById, feature.id)}</option>
                ))}
              </select>
              <select
                value={zFeatureId}
                onChange={event => setZFeatureId(event.target.value)}
                className="min-w-0 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
              >
                <option value="">Chọn Z endpoint</option>
                {featureOptions.map(feature => (
                  <option key={feature.id} value={feature.id}>{getFeatureLabel(featuresById, feature.id)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={serviceType}
                onChange={event => setServiceType(event.target.value as FiberCircuitServiceType)}
                className="min-w-0 flex-1 rounded border border-cad-border bg-cad-bg px-2 py-1 text-[10px] text-cad-text-primary outline-none"
              >
                <option value="data">Data</option>
                <option value="voice">Voice</option>
                <option value="video">Video</option>
                <option value="backhaul">Backhaul</option>
                <option value="other">Khác</option>
              </select>
              <button
                type="button"
                onClick={() => void handleCreateCircuit()}
                disabled={!circuitName.trim() || !aFeatureId || !zFeatureId || saving}
                className="rounded border border-cad-accent/30 bg-cad-accent/10 px-2 py-1 text-[10px] font-semibold text-cad-accent hover:bg-cad-accent/20 disabled:opacity-50"
              >
                Tạo tuyến
              </button>
            </div>
            <div className="text-[9px] text-cad-text-muted">
              Hops sẽ lấy theo thứ tự các sợi đang chọn trong tab Strands: {pickedStrands.length} sợi.
            </div>
          </div>

          <FiberCircuitPanel
            circuits={inventory?.circuits || []}
            selectedCircuitId={selectedCircuitId}
            traceResult={traceResult}
            getFeatureLabel={featureId => getFeatureLabel(featuresById, featureId)}
            onSelectCircuit={setSelectedCircuitId}
            onTraceCircuit={handleTrace}
            onFocusFeature={focusFeature}
          />
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="space-y-3">
          {diagnostics.length === 0 ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-cad-accent/10 bg-cad-accent/5 p-3 text-[10px] text-cad-accent">
              <CheckCircle2 size={12} /> Không có lỗi FiberMap đang phát hiện.
            </div>
          ) : (
            diagnosticGroups.map(group => (
              <div key={group.type} className="rounded-lg border border-cad-warn/20 bg-cad-warn/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-cad-warn">
                    <TriangleAlert size={11} /> {group.type}
                  </div>
                  <span className="rounded bg-cad-surface px-2 py-0.5 text-[9px] text-cad-warn">{group.count}</span>
                </div>
                <div className="space-y-2">
                  {group.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.type}-${index}`} className="rounded border border-cad-border bg-cad-surface p-2 text-[9px]">
                      <div className="text-cad-text-primary">{diagnostic.message}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => handleDiagnosticFocus(diagnostic)}
                          className="rounded border border-cad-border px-2 py-0.5 font-semibold text-cad-text-primary hover:bg-cad-text-primary/10"
                        >
                          Focus đối tượng
                        </button>
                        {diagnostic.type === 'uninitialized-cable' && diagnostic.cable_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCableId(diagnostic.cable_id || null);
                              void handleInitialize(diagnostic.cable_id || null);
                            }}
                            disabled={saving}
                            className="rounded border border-cad-accent/30 bg-cad-accent/10 px-2 py-0.5 font-semibold text-cad-accent disabled:opacity-50"
                          >
                            Initialize cable
                          </button>
                        )}
                        {diagnostic.circuit_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCircuitId(diagnostic.circuit_id || null);
                              setActiveTab('circuits');
                            }}
                            className="rounded border border-cad-border px-2 py-0.5 font-semibold text-cad-text-primary hover:bg-cad-text-primary/10"
                          >
                            Mở tuyến lỗi
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {(loading || saving) && (
        <div className="text-[10px] text-cad-text-muted">
          {saving ? 'Đang lưu thay đổi FiberMap...' : 'Đang tải dữ liệu FiberMap...'}
        </div>
      )}
    </div>
  );
};
