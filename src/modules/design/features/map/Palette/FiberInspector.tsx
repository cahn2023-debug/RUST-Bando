import React, { useEffect, useMemo, useState } from 'react';
import type {
  FiberCapacitySummary,
  FiberCircuitServiceType,
  FiberInventory,
  FiberStrand,
  FiberStrandStatus,
  FiberTraceResult,
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
  type FiberInspectorTab,
} from '@DESIGN/features/map/network/fiberUiModel';
import { FiberCapacityPanel } from './FiberCapacityPanel';
import { FiberCircuitPanel } from './FiberCircuitPanel';
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
  { id: 'circuits', label: 'Circuits' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const statusOptions: Array<FiberStrandStatus | 'all'> = ['all', 'available', 'reserved', 'active', 'damaged'];
const statusLabel = (status: FiberStrandStatus | 'all') => status === 'all' ? 'Tất cả' : fiberStrandStatusLabel[status];

export const FiberInspector: React.FC<FiberInspectorProps> = ({ projectId, selectedFeatureId }) => {
  const featuresById = useDesignSync(s => s.state?.features ?? {});
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
  const [fiberCount, setFiberCount] = useState(12);
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
      const [nextInventory, nextCapacity, nextValidation] = await Promise.all([
        getFiberInventory(projectId),
        getFiberCapacity(projectId),
        validateFiberNetwork(projectId),
      ]);
      setInventory(nextInventory);
      setCapacity(nextCapacity.items);
      setDiagnostics(nextValidation.diagnostics);
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
      setFiberCount(current => nextInventory.cables[0]?.fiber_count || current);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu FiberMap.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!selectedFeatureId || !inventory) return;
    const cable = inventory.cables.find(item => item.feature_id === selectedFeatureId);
    if (cable) {
      setSelectedCableId(cable.id);
    } else {
      const candidate = legacyCableCandidates.find(item => item.feature_id === selectedFeatureId);
      if (candidate) {
        setSelectedLegacyCandidateId(candidate.id);
      }
    }
  }, [inventory, selectedFeatureId, legacyCableCandidates]);

  useEffect(() => {
    if (!selectedLegacyCandidateId && legacyCableCandidates.length > 0) {
      setSelectedLegacyCandidateId(legacyCableCandidates[0].id);
    }
  }, [legacyCableCandidates, selectedLegacyCandidateId]);

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
      setStatusMessage(error instanceof Error ? error.message : 'Thao tác FiberMap thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = async (cableId = selectedCableId, count = fiberCount) => {
    if (!projectId || !cableId || count < 1) return;
    await runWrite('Đã khởi tạo sợi cho cáp.', () =>
      initializeCableStrands({ projectId, cableId, fiberCount: count })
    );
    setActiveTab('strands');
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

  const toggleStrand = (strandId: string) => {
    setSelectedStrandIds(current => {
      const next = new Set(current);
      if (next.has(strandId)) next.delete(strandId);
      else next.add(strandId);
      return next;
    });
    setSelectedStrandId(strandId);
  };

  const handleCreateLegacyCable = async (candidateId: string) => {
    if (!projectId) return;
    const candidate = legacyCableCandidates.find(item => item.id === candidateId);
    if (!candidate) return;
    await runWrite('Đã tạo cáp legacy từ tuyến Network.', () =>
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
    await runWrite('Đã nhận diện tuyến fiber từ polyline, tạo đầu/cuối cáp và măng xông.', () =>
      materializeFiberFromPolylines(projectId, featuresById, inventory)
    );
    setActiveTab('inventory');
  };

  const total = inventory?.summary.total_strands || 0;
  const initializedCableIds = new Set((inventory?.strands || []).map(strand => strand.cable_id));
  const selectedCableInitialized = selectedCableId ? initializedCableIds.has(selectedCableId) : false;

  if (!projectId) {
    return (
      <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10.5px] text-zinc-500">
        Chưa có project để tải dữ liệu FiberMap.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-100">
          <Route size={13} className="text-cyan-300" />
          FiberMap
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || saving}
          className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9px] font-semibold text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCcw size={10} />}
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/5 bg-black/25 p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id
              ? 'rounded bg-cyan-500/15 px-2 py-1 text-[9px] font-semibold text-cyan-200'
              : 'rounded px-2 py-1 text-[9px] font-semibold text-zinc-500 hover:bg-white/5 hover:text-zinc-200'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="rounded border border-white/5 bg-black/25 p-2 text-[10px] text-zinc-300">
          {statusMessage}
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3 text-[10px] text-cyan-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-cyan-100">Nhận diện tuyến fiber từ polyline</div>
                <div className="mt-0.5 text-cyan-100/70">
                  Tạo cable từ mọi polyline, tự sinh điểm đầu/cuối cáp và măng xông tại điểm rẽ/giao tuyến.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleMaterializePolylines()}
                disabled={saving || loading || Object.keys(featuresById).length === 0}
                className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nhận diện tuyến fiber từ polyline
              </button>
            </div>
          </div>

          {!hasCableInventory && legacyCableCandidates.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-200">
              <div>
                Chưa có cáp fiber trong bảng. Có {legacyCableCandidates.length} tuyến Network có thể chuyển thành cáp.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateLegacyCable(selectedLegacyCandidateId || legacyCableCandidates[0].id)}
                  disabled={!selectedLegacyCandidateId || saving}
                  className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 font-semibold text-amber-100 disabled:opacity-50"
                >
                  Tạo cable từ tuyến đã chọn
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateAllLegacyCables()}
                  disabled={saving}
                  className="rounded border border-white/10 px-2 py-1 font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Tự tạo từ tất cả tuyến Network
                </button>
              </div>
              <div className="max-h-28 overflow-auto rounded border border-white/5 bg-black/20">
                {legacyCableCandidates.map(candidate => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedLegacyCandidateId(candidate.id)}
                    className={selectedLegacyCandidateId === candidate.id
                      ? 'block w-full border-b border-amber-500/10 bg-amber-500/10 px-3 py-2 text-left'
                      : 'block w-full border-b border-white/5 px-3 py-2 text-left hover:bg-white/5'}
                  >
                    <div className="font-semibold text-zinc-100">{candidate.label}</div>
                    <div className="text-[9px] text-zinc-500">
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
              <div key={label as string} className="rounded border border-white/5 bg-black/30 p-2">
                <div className="text-zinc-500">{label}</div>
                <div className="text-[12px] font-semibold text-zinc-100">{value as number}</div>
              </div>
            ))}
          </div>

          {hasCableInventory ? (
            <FiberCapacityPanel
              rows={cableRows}
              selectedCableId={selectedCableId}
              onSelectCable={setSelectedCableId}
              onInitializeCable={(cableId, count) => {
                setFiberCount(count);
                void handleInitialize(cableId, count);
              }}
            />
          ) : legacyCableCandidates.length > 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10px] text-zinc-500">
              Hãy tạo cable legacy ở khung trên để bắt đầu workflow FiberMap.
            </div>
          ) : (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10px] text-zinc-500">
              Chưa có cáp fiber trong bảng. Fiber tab sẽ hiện khi project có tuyến Network hợp lệ.
            </div>
          )}

          <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
              <Sigma size={11} /> Khởi tạo sợi cho cáp
            </div>
            <div className="text-[9px] text-zinc-500">
              {selectedCable ? `Cáp: ${getFeatureLabel(featuresById, selectedCable.feature_id)}` : 'Chưa chọn cáp.'}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={fiberCount}
                onChange={event => setFiberCount(Number(event.target.value))}
                className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleInitialize()}
                disabled={!selectedCableId || fiberCount < 1 || saving}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Initialize strands
              </button>
            </div>
            {!selectedCableInitialized && selectedCableId && (
              <div className="text-[9px] text-amber-300">Cáp này chưa có danh sách sợi.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'strands' && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              value={selectedCableId || ''}
              onChange={event => setSelectedCableId(event.target.value || null)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
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
              className="rounded border border-white/10 px-2 py-1 text-[9px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-50"
            >
              Focus
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={strandStatusFilter}
              onChange={event => setStrandStatusFilter(event.target.value as FiberStrandStatus | 'all')}
              className="w-28 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
            >
              {statusOptions.map(option => (
                <option key={option} value={option}>{statusLabel(option)}</option>
              ))}
            </select>
            <input
              value={strandQuery}
              onChange={event => setStrandQuery(event.target.value)}
              placeholder="Tìm số sợi, màu, ID"
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
            />
          </div>

          {filteredStrands.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10px] text-zinc-500">
              {selectedCableId ? 'Cáp chưa initialize hoặc không có sợi khớp bộ lọc.' : 'Chọn một cáp để xem danh sách sợi.'}
            </div>
          ) : (
            <div className="max-h-56 overflow-auto rounded-lg border border-white/5 bg-black/20">
              {filteredStrands.map(strand => (
                <button
                  type="button"
                  key={strand.id}
                  onClick={() => toggleStrand(strand.id)}
                  className={selectedStrandIds.has(strand.id)
                    ? 'flex w-full items-center justify-between gap-2 border-b border-cyan-500/10 bg-cyan-500/10 px-3 py-2 text-left'
                    : 'flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left hover:bg-white/5'}
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold text-zinc-100">Sợi #{strand.strand_no}</span>
                    <span className="block truncate text-[9px] text-zinc-500">{strand.color || 'Chưa gán màu'} · {strand.id}</span>
                  </span>
                  <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] ${fiberStrandStatusClass[strand.status]}`}>
                    {fiberStrandStatusLabel[strand.status]}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
              <ListChecks size={11} /> Thao tác sợi đã chọn ({selectedStrandIds.size})
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['available', 'reserved', 'active', 'damaged'] as FiberStrandStatus[]).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void handleChangeSelectedStatus(status)}
                  disabled={selectedStrandIds.size === 0 || saving}
                  className="rounded border border-white/10 px-2 py-1 text-[9px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {fiberStrandStatusLabel[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
              <GitBranch size={11} /> Mối nối
            </div>
            <div className="text-[9px] text-zinc-500">
              Chọn đúng 2 sợi trong bảng để tạo splice. Loss mặc định nhẹ, có thể chỉnh trước khi lưu.
            </div>
            <div className="rounded border border-white/5 bg-black/25 p-2 text-[9px] text-zinc-400">
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
                className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCreateSplice()}
                disabled={pickedStrands.length !== 2 || saving}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                Tạo mối nối
              </button>
            </div>
            {selectedStrand && (
              <div className="rounded border border-white/5 bg-black/25 p-2 text-[9px] text-zinc-400">
                <div className="font-semibold text-zinc-300">Splice chain của sợi #{selectedStrand.strand_no}</div>
                {spliceChain.length === 0 ? (
                  <div className="mt-1 text-zinc-500">Chưa có mối nối.</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {spliceChain.map(item => (
                      <div key={item.splice.id} className="rounded bg-black/30 px-2 py-1">
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

      {activeTab === 'circuits' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
              <CircleDot size={11} /> Tạo tuyến A–Z
            </div>
            <input
              value={circuitName}
              onChange={event => setCircuitName(event.target.value)}
              placeholder="Tên tuyến / circuit"
              className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={aFeatureId}
                onChange={event => setAFeatureId(event.target.value)}
                className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
              >
                <option value="">Chọn A endpoint</option>
                {featureOptions.map(feature => (
                  <option key={feature.id} value={feature.id}>{getFeatureLabel(featuresById, feature.id)}</option>
                ))}
              </select>
              <select
                value={zFeatureId}
                onChange={event => setZFeatureId(event.target.value)}
                className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
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
                className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
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
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                Tạo tuyến
              </button>
            </div>
            <div className="text-[9px] text-zinc-500">
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
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3 text-[10px] text-emerald-300">
              <CheckCircle2 size={12} /> Không có lỗi FiberMap đang phát hiện.
            </div>
          ) : (
            diagnosticGroups.map(group => (
              <div key={group.type} className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-purple-200">
                    <TriangleAlert size={11} /> {group.type}
                  </div>
                  <span className="rounded bg-black/25 px-2 py-0.5 text-[9px] text-purple-200">{group.count}</span>
                </div>
                <div className="space-y-2">
                  {group.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.type}-${index}`} className="rounded border border-white/5 bg-black/25 p-2 text-[9px]">
                      <div className="text-zinc-300">{diagnostic.message}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => handleDiagnosticFocus(diagnostic)}
                          className="rounded border border-white/10 px-2 py-0.5 font-semibold text-zinc-300 hover:bg-white/10"
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
                            className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-semibold text-cyan-200 disabled:opacity-50"
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
                            className="rounded border border-white/10 px-2 py-0.5 font-semibold text-zinc-300 hover:bg-white/10"
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
        <div className="text-[10px] text-zinc-500">
          {saving ? 'Đang lưu thay đổi FiberMap...' : 'Đang tải dữ liệu FiberMap...'}
        </div>
      )}
    </div>
  );
};
