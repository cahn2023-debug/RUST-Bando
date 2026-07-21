import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
  deleteFiberSplice,
  getFiberInventory,
  upsertEquipment,
  upsertFiberSplice,
} from '@DESIGN/features/map/network/fiberService';
import type { FiberInventory, FiberSplice, FiberStrand } from '@CONTRACT/types';

const STRAND_ROW_HEIGHT = 24;
const STRAND_ROW_OFFSET = 24;

const TIA_598_COLORS = [
  { name: 'Blue', hex: '#2563eb', textClass: 'text-white' },
  { name: 'Orange', hex: '#f97316', textClass: 'text-white' },
  { name: 'Green', hex: '#16a34a', textClass: 'text-white' },
  { name: 'Brown', hex: '#8b5a2b', textClass: 'text-white' },
  { name: 'Slate', hex: '#64748b', textClass: 'text-white' },
  { name: 'White', hex: '#ffffff', textClass: 'text-zinc-950' },
  { name: 'Red', hex: '#dc2626', textClass: 'text-white' },
  { name: 'Black', hex: '#111827', textClass: 'text-white' },
  { name: 'Yellow', hex: '#facc15', textClass: 'text-zinc-950' },
  { name: 'Violet', hex: '#7c3aed', textClass: 'text-white' },
  { name: 'Rose', hex: '#ec4899', textClass: 'text-white' },
  { name: 'Aqua', hex: '#06b6d4', textClass: 'text-zinc-950' },
];

type EndpointDirection = 'start' | 'end';
type EquipmentKind = 'splice_enclosure' | 'odf';

interface Props {
  enclosureId: string;
  evaluation: any;
  onClose: () => void;
}

interface CableEndpoint {
  id: string;
  cableId: string;
  cableName: string;
  direction: EndpointDirection;
  fiberCount: number;
}

const equipmentLabels: Record<EquipmentKind, string> = {
  splice_enclosure: 'Măng xông',
  odf: 'ODF',
};

const getStrandColor = (strandNo: number) => TIA_598_COLORS[(strandNo - 1) % TIA_598_COLORS.length];

const getStrandBackground = (strandNo: number) => {
  const color = getStrandColor(strandNo);
  if (strandNo <= TIA_598_COLORS.length) return color.hex;
  return `repeating-linear-gradient(90deg, ${color.hex} 0 8px, #f8fafc 8px 11px)`;
};

export function FiberSpliceDiagramModal({ enclosureId, evaluation, onClose }: Props) {
  const state = useDesignSync(s => s.state) as any;
  const projectId = useDesignSync(s => s.projectId);
  const [localInventory, setLocalInventory] = useState<FiberInventory | null>(null);
  const [requestedLeftCableId, setRequestedLeftCableId] = useState('');
  const [requestedRightCableId, setRequestedRightCableId] = useState('');
  const [selectedLeftStrandId, setSelectedLeftStrandId] = useState<string | null>(null);
  const [selectedRightStrandId, setSelectedRightStrandId] = useState<string | null>(null);
  const [draggingLeftStrandId, setDraggingLeftStrandId] = useState<string | null>(null);
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>('splice_enclosure');
  const [lossDb, setLossDb] = useState(0.05);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const storeInventory = state?.inventory as FiberInventory | null | undefined;
  const inventory: FiberInventory | null = localInventory ?? storeInventory ?? null;
  const getFeatureName = (featureId: string) => state?.features?.[featureId]?.name || featureId;

  const refreshInventory = useCallback(async () => {
    if (!projectId) return;
    try {
      setLocalInventory(await getFiberInventory(projectId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu fiber.');
    }
  }, [projectId]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  const currentEquipment = useMemo(
    () => (inventory?.equipment || []).find(item => item.feature_id === enclosureId) || null,
    [enclosureId, inventory?.equipment]
  );

  useEffect(() => {
    if (currentEquipment?.equipment_type === 'odf') {
      setEquipmentKind('odf');
    } else if (currentEquipment?.equipment_type === 'splice_enclosure') {
      setEquipmentKind('splice_enclosure');
    }
  }, [currentEquipment?.equipment_type]);

  const connectedCableEndpoints = useMemo(() => {
    const endpoints: CableEndpoint[] = [];
    const endpointIds = new Set<string>();
    const byId = new Map((inventory?.cables || []).map(cable => [cable.id, cable]));
    const pushEndpoint = (endpoint: CableEndpoint) => {
      if (endpointIds.has(endpoint.id)) return;
      endpointIds.add(endpoint.id);
      endpoints.push(endpoint);
    };

    (inventory?.cable_points || [])
      .filter(point => point.feature_id === enclosureId)
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .forEach(point => {
        const cable = byId.get(point.cable_id);
        if (!cable) return;

        if (point.point_kind === 'cable_start') {
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'cable_end') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đến)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'splice_enclosure') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Về trước)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Về sau)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        }
      });

    evaluation?.edges?.forEach((edge: any) => {
      if (edge.sourceType !== 'map-polyline' || edge.kind !== 'signal') return;
      if (edge.from !== enclosureId && edge.to !== enclosureId) return;
      if (!edge.feature?.id) return;

      const cable = inventory?.cables.find(item => item.feature_id === edge.feature.id);
      if (cable) {
        if (edge.from === enclosureId) {
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đến)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
        }
      }
    });

    return endpoints.filter((endpoint, index, all) => all.findIndex(item => item.id === endpoint.id) === index);
  }, [enclosureId, evaluation?.edges, inventory?.cable_points, inventory?.cables]);

  const { leftEndpointId, rightEndpointId } = useMemo(() => {
    const validIds = connectedCableEndpoints.map(endpoint => endpoint.id);
    const findId = (requested?: string) => {
      if (!requested) return undefined;
      if (validIds.includes(requested)) return requested;
      return validIds.find(id => connectedCableEndpoints.find(endpoint => endpoint.id === id)?.cableId === requested);
    };
    const reqLeft = findId(requestedLeftCableId);
    const reqRight = findId(requestedRightCableId);
    const nextLeft = reqLeft || validIds[0] || '';
    const nextRight = reqRight && reqRight !== nextLeft ? reqRight : validIds.find(id => id !== nextLeft) || '';
    return { leftEndpointId: nextLeft, rightEndpointId: nextRight };
  }, [connectedCableEndpoints, requestedLeftCableId, requestedRightCableId]);

  const leftEndpoint = connectedCableEndpoints.find(endpoint => endpoint.id === leftEndpointId);
  const rightEndpoint = connectedCableEndpoints.find(endpoint => endpoint.id === rightEndpointId);

  const leftStrands = useMemo(
    () => (inventory?.strands || [])
      .filter(strand => strand.cable_id === leftEndpoint?.cableId)
      .sort((a, b) => a.strand_no - b.strand_no),
    [inventory?.strands, leftEndpoint?.cableId]
  );

  const rightStrands = useMemo(
    () => (inventory?.strands || [])
      .filter(strand => strand.cable_id === rightEndpoint?.cableId)
      .sort((a, b) => a.strand_no - b.strand_no),
    [inventory?.strands, rightEndpoint?.cableId]
  );

  const selectedLeftStrand = leftStrands.find(strand => strand.id === selectedLeftStrandId) || null;
  const selectedRightStrand = rightStrands.find(strand => strand.id === selectedRightStrandId) || null;

  const splices = useMemo(
    () => (inventory?.splices || []).filter(splice => splice.enclosure_feature_id === enclosureId),
    [enclosureId, inventory?.splices]
  );

  const occupiedStrands = useMemo(() => {
    const occupied = new Set<string>();
    splices.forEach(splice => {
      occupied.add(`${splice.from_strand_id}-${splice.from_direction}`);
      occupied.add(`${splice.to_strand_id}-${splice.to_direction}`);
    });
    return occupied;
  }, [splices]);

  const visibleSplices = useMemo(() => {
    if (!leftEndpoint || !rightEndpoint) return [];
    const leftIndexes = new Map(leftStrands.map((strand, index) => [`${strand.id}-${leftEndpoint.direction}`, index]));
    const rightIndexes = new Map(rightStrands.map((strand, index) => [`${strand.id}-${rightEndpoint.direction}`, index]));
    const leftIdIndexes = new Map(leftStrands.map((strand, index) => [strand.id, index]));
    const rightIdIndexes = new Map(rightStrands.map((strand, index) => [strand.id, index]));

    return splices
      .map(splice => {
        const directLeftIndex = leftIndexes.get(`${splice.from_strand_id}-${splice.from_direction}`);
        const directRightIndex = rightIndexes.get(`${splice.to_strand_id}-${splice.to_direction}`);
        const reverseLeftIndex = leftIndexes.get(`${splice.to_strand_id}-${splice.to_direction}`);
        const reverseRightIndex = rightIndexes.get(`${splice.from_strand_id}-${splice.from_direction}`);

        let leftIndex = -1;
        let rightIndex = -1;
        if (directLeftIndex !== undefined && directRightIndex !== undefined) {
          leftIndex = directLeftIndex;
          rightIndex = directRightIndex;
        } else if (reverseLeftIndex !== undefined && reverseRightIndex !== undefined) {
          leftIndex = reverseLeftIndex;
          rightIndex = reverseRightIndex;
        } else {
          leftIndex = leftIdIndexes.get(splice.from_strand_id) ?? leftIdIndexes.get(splice.to_strand_id) ?? -1;
          rightIndex = rightIdIndexes.get(splice.to_strand_id) ?? rightIdIndexes.get(splice.from_strand_id) ?? -1;
        }

        const leftStrand = leftStrands[leftIndex];
        if (leftIndex < 0 || rightIndex < 0 || !leftStrand) return null;

        return {
          splice,
          leftStrand,
          y1: STRAND_ROW_OFFSET + leftIndex * STRAND_ROW_HEIGHT,
          y2: STRAND_ROW_OFFSET + rightIndex * STRAND_ROW_HEIGHT,
        };
      })
      .filter((item): item is { splice: FiberSplice; leftStrand: FiberStrand; y1: number; y2: number } => !!item);
  }, [leftEndpoint, leftStrands, rightEndpoint, rightStrands, splices]);

  const runWrite = async (successMessage: string, action: () => Promise<unknown>) => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await action();
      setStatusMessage(successMessage);
      await refreshInventory();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Thao tác splice thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleEquipmentKindChange = async (value: EquipmentKind) => {
    setEquipmentKind(value);
    if (!projectId) return;
    await runWrite(`Đã cập nhật loại điểm nối: ${equipmentLabels[value]}.`, () =>
      upsertEquipment({
        id: currentEquipment?.id || enclosureId,
        projectId,
        featureId: enclosureId,
        equipmentType: value,
        status: currentEquipment?.status || 'active',
      })
    );
  };

  const handleStrandClick = (side: 'left' | 'right', strand: FiberStrand) => {
    if (side === 'left') {
      setSelectedLeftStrandId(current => current === strand.id ? null : strand.id);
      return;
    }
    setSelectedRightStrandId(current => current === strand.id ? null : strand.id);
  };

  const handleConnectSelectedStrands = async (leftStrandId = selectedLeftStrandId, rightStrandId = selectedRightStrandId) => {
    if (!projectId || !leftEndpoint || !rightEndpoint || !leftStrandId || !rightStrandId) return;
    if (occupiedStrands.has(`${leftStrandId}-${leftEndpoint.direction}`)) return;
    if (occupiedStrands.has(`${rightStrandId}-${rightEndpoint.direction}`)) return;

    await runWrite('Đã nối core quang.', () =>
      upsertFiberSplice(projectId, {
        id: crypto.randomUUID(),
        enclosureFeatureId: enclosureId,
        fromStrandId: leftStrandId,
        toStrandId: rightStrandId,
        fromDirection: leftEndpoint.direction,
        toDirection: rightEndpoint.direction,
        lossDb,
      })
    );
    setSelectedLeftStrandId(null);
    setSelectedRightStrandId(null);
  };

  useEffect(() => {
    if (!draggingLeftStrandId) return;

    const handlePointerUp = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const dropTarget = target?.closest('[data-fiber-drop-strand-id]') as HTMLElement | null;
      const rightStrandId = dropTarget?.dataset.fiberDropStrandId;

      setDraggingLeftStrandId(null);
      if (!rightStrandId) return;

      setSelectedLeftStrandId(draggingLeftStrandId);
      setSelectedRightStrandId(rightStrandId);
      void handleConnectSelectedStrands(draggingLeftStrandId, rightStrandId);
    };

    const handlePointerCancel = () => setDraggingLeftStrandId(null);

    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [draggingLeftStrandId, handleConnectSelectedStrands]);

  const handleRemoveSplice = async (spliceId: string) => {
    if (!projectId) return;
    await runWrite('Đã xóa mối nối.', () => deleteFiberSplice(projectId, spliceId));
  };

  const renderStrand = (strand: FiberStrand, side: 'left' | 'right') => {
    const color = getStrandColor(strand.strand_no);
    const endpoint = side === 'left' ? leftEndpoint : rightEndpoint;
    const isSelected = side === 'left' ? selectedLeftStrandId === strand.id : selectedRightStrandId === strand.id;
    const isOccupied = occupiedStrands.has(`${strand.id}-${endpoint?.direction}`);
    const canClick = !saving && !isOccupied;

    return (
      <button
        key={strand.id}
        type="button"
        data-fiber-drop-strand-id={side === 'right' && canClick ? strand.id : undefined}
        onClick={() => handleStrandClick(side, strand)}
        onPointerDown={event => {
          if (side !== 'left' || !canClick || event.button !== 0) return;
          event.stopPropagation();
          setDraggingLeftStrandId(strand.id);
        }}
        draggable={false}
        disabled={!canClick}
        className={[
          'flex h-5 w-full items-center overflow-hidden rounded border border-white/10 bg-black/25 text-[9px] font-bold transition',
          side === 'left' ? 'justify-end' : 'justify-start',
          isSelected ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-black' : '',
          side === 'right' && draggingLeftStrandId && canClick ? 'border-cyan-400/60 bg-cyan-500/10' : '',
          isOccupied ? 'opacity-50' : '',
          canClick ? (side === 'left' ? 'cursor-grab hover:border-cyan-400/50 active:cursor-grabbing' : 'cursor-pointer hover:border-cyan-400/50') : 'cursor-default',
        ].join(' ')}
        title={`${color.name} #${strand.strand_no}${strand.strand_no > 12 ? ' striped' : ''}`}
      >
        {side === 'right' && <span className="h-px w-6 bg-white/25" />}
        <span
          className={`flex h-full flex-1 items-center justify-center border-x border-black/30 ${color.textClass}`}
          style={{ background: getStrandBackground(strand.strand_no) }}
        >
          {strand.strand_no}
        </span>
        <span className="h-full w-5 shrink-0 bg-sky-600/80" />
        {side === 'left' && <span className="h-px w-6 bg-white/25" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <div className="flex h-[min(600px,88vh)] w-[min(900px,94vw)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f141a] font-sans shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">{getFeatureName(enclosureId)}</h3>
            <div className="mt-0.5 text-[9px] text-zinc-500">Sơ đồ nối core quang</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-[9px] font-semibold text-zinc-500">Loại điểm nối</label>
            <select
              value={equipmentKind}
              onChange={event => void handleEquipmentKindChange(event.target.value as EquipmentKind)}
              disabled={saving}
              className="rounded border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-semibold text-zinc-100 outline-none focus:border-cyan-400/50"
            >
              <option value="splice_enclosure">Măng xông</option>
              <option value="odf">ODF</option>
            </select>
            <button onClick={onClose} className="rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" title="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr] gap-3 border-b border-white/5 px-3 py-2">
          <select
            className="min-w-0 rounded border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-semibold text-cyan-300 outline-none focus:border-cyan-400/50"
            value={leftEndpointId}
            onChange={event => {
              setRequestedLeftCableId(event.target.value);
              setSelectedLeftStrandId(null);
            }}
          >
            <option value="">Chọn cáp IN</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`in-${endpoint.id}-${index}`} value={endpoint.id}>
                IN: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>

          <select
            className="min-w-0 rounded border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-semibold text-pink-300 outline-none focus:border-pink-400/50"
            value={rightEndpointId}
            onChange={event => {
              setRequestedRightCableId(event.target.value);
              setSelectedRightStrandId(null);
            }}
          >
            <option value="">Chọn cáp OUT</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`out-${endpoint.id}-${index}`} value={endpoint.id} disabled={endpoint.id === leftEndpointId}>
                OUT: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr_auto_auto] items-end gap-2 border-b border-white/5 px-3 py-2 text-[10px]">
          <div className="min-w-0 rounded border border-cyan-500/15 bg-cyan-500/5 px-2 py-1 text-cyan-100">
            IN core: {selectedLeftStrand ? `#${selectedLeftStrand.strand_no}` : 'Chưa chọn'}
          </div>
          <div className="min-w-0 rounded border border-pink-500/15 bg-pink-500/5 px-2 py-1 text-pink-100">
            OUT core: {selectedRightStrand ? `#${selectedRightStrand.strand_no}` : 'Chưa chọn'}
          </div>
          <label className="flex items-center gap-1 text-zinc-400">
            Loss
            <input
              type="number"
              min={0}
              step={0.01}
              value={lossDb}
              onChange={event => setLossDb(Number(event.target.value) || 0)}
              className="w-16 rounded border border-white/10 bg-black/45 px-2 py-1 text-zinc-100 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleConnectSelectedStrands()}
            disabled={saving || !selectedLeftStrandId || !selectedRightStrandId}
            className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 size={12} />
            Nối core
          </button>
        </div>

        <div className="flex min-h-0 flex-1 p-3">
          {connectedCableEndpoints.length < 2 ? (
            <div className="flex flex-1 items-center justify-center rounded border border-white/5 bg-black/20 text-xs text-zinc-500">
              Điểm này chưa có đủ cáp đi qua để tạo splice IN/OUT.
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 overflow-auto rounded border border-white/5 bg-black/20">
              <div className="w-[34%] min-w-[210px] p-3">
                <div className="mb-2 text-[10px] font-bold uppercase text-cyan-300">IN cores</div>
                <div className="flex flex-col gap-1">{leftStrands.map(strand => renderStrand(strand, 'left'))}</div>
              </div>

              <div className="relative w-[32%] min-w-[200px]">
                <svg className="absolute inset-0 h-full w-full overflow-visible">
                  {visibleSplices.map(({ splice, leftStrand, y1, y2 }) => (
                    <g key={splice.id} className="pointer-events-auto cursor-pointer" onClick={() => void handleRemoveSplice(splice.id)}>
                      <path
                        d={`M 0 ${y1} C 68 ${y1}, 132 ${y2}, 200 ${y2}`}
                        fill="none"
                        stroke={getStrandColor(leftStrand.strand_no).hex}
                        strokeWidth={2.5}
                        className="transition hover:stroke-red-400"
                      />
                    </g>
                  ))}
                </svg>
              </div>

              <div className="w-[34%] min-w-[210px] p-3">
                <div className="mb-2 text-right text-[10px] font-bold uppercase text-pink-300">OUT cores</div>
                <div className="flex flex-col gap-1">{rightStrands.map(strand => renderStrand(strand, 'right'))}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-[11px] text-zinc-500">
          <div className="min-w-0 truncate">
            {statusMessage || 'Kéo core bên IN sang core bên OUT để nối nhanh, hoặc chọn hai core rồi bấm Nối core. Click đường nối để xóa.'}
          </div>
          {saving && (
            <div className="flex shrink-0 items-center gap-2 text-cyan-300">
              <Loader2 size={13} className="animate-spin" />
              Đang lưu
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
