import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { deleteFiberSplice, getFiberInventory, upsertFiberSplice } from '@DESIGN/features/map/network/fiberService';
import type { FiberCable, FiberInventory, FiberSplice, FiberStrand } from '@CONTRACT/types';

const STRAND_ROW_HEIGHT = 30;
const STRAND_ROW_OFFSET = 28;

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

const getStrandColor = (strandNo: number) => TIA_598_COLORS[(strandNo - 1) % TIA_598_COLORS.length];

const getStrandBackground = (strandNo: number) => {
    const color = getStrandColor(strandNo);
    if (strandNo <= TIA_598_COLORS.length) return color.hex;
    return `repeating-linear-gradient(90deg, ${color.hex} 0 10px, #f8fafc 10px 14px)`;
};

interface Props {
    enclosureId: string;
    evaluation: any;
    onClose: () => void;
}

export function FiberSpliceDiagramModal({ enclosureId, evaluation, onClose }: Props) {
    const state = useDesignSync(s => s.state) as any;
    const projectId = useDesignSync(s => s.projectId);
    const [localInventory, setLocalInventory] = useState<FiberInventory | null>(null);
    const [requestedLeftCableId, setRequestedLeftCableId] = useState('');
    const [requestedRightCableId, setRequestedRightCableId] = useState('');
    const [selectedLeftStrandId, setSelectedLeftStrandId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const storeInventory = state?.inventory as FiberInventory | null | undefined;
    const inventory: FiberInventory | null = localInventory ?? storeInventory ?? null;

    const refreshInventory = useCallback(async () => {
        if (!projectId) return;
        try {
            setLocalInventory(await getFiberInventory(projectId));
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu fiber.');
        }
    }, [projectId]);

    useEffect(() => {
        if (!projectId) return;
        let isMounted = true;

        getFiberInventory(projectId)
            .then(nextInventory => {
                if (isMounted) setLocalInventory(nextInventory);
            })
            .catch(error => {
                if (isMounted) setStatusMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu fiber.');
            });

        return () => {
            isMounted = false;
        };
    }, [projectId]);

    const connectedCableIds = useMemo(() => {
        const ids = new Set<string>();

        (inventory?.cable_points || [])
            .filter(point => point.feature_id === enclosureId)
            .sort((a, b) => a.sequence_no - b.sequence_no)
            .forEach(point => ids.add(point.cable_id));

        evaluation?.edges?.forEach((edge: any) => {
            if (edge.sourceType !== 'map-polyline' || edge.kind !== 'signal') return;
            if (edge.from !== enclosureId && edge.to !== enclosureId) return;
            if (!edge.feature?.id) return;

            const cable = inventory?.cables.find(item => item.feature_id === edge.feature.id);
            if (cable) ids.add(cable.id);
        });

        return [...ids];
    }, [enclosureId, evaluation?.edges, inventory?.cable_points, inventory?.cables]);

    const connectedCables = useMemo(() => {
        const byId = new Map((inventory?.cables || []).map(cable => [cable.id, cable]));
        return connectedCableIds.map(id => byId.get(id)).filter((cable): cable is FiberCable => !!cable);
    }, [connectedCableIds, inventory?.cables]);

    const { leftCableId, rightCableId } = useMemo(() => {
        const validIds = connectedCables.map(cable => cable.id);
        const nextLeft = validIds.includes(requestedLeftCableId) ? requestedLeftCableId : validIds[0] || '';
        const nextRight = validIds.includes(requestedRightCableId) && requestedRightCableId !== nextLeft
            ? requestedRightCableId
            : validIds.find(id => id !== nextLeft) || '';

        return { leftCableId: nextLeft, rightCableId: nextRight };
    }, [connectedCables, requestedLeftCableId, requestedRightCableId]);

    const leftStrands = useMemo(
        () => (inventory?.strands || [])
            .filter(strand => strand.cable_id === leftCableId)
            .sort((a, b) => a.strand_no - b.strand_no),
        [inventory?.strands, leftCableId]
    );

    const rightStrands = useMemo(
        () => (inventory?.strands || [])
            .filter(strand => strand.cable_id === rightCableId)
            .sort((a, b) => a.strand_no - b.strand_no),
        [inventory?.strands, rightCableId]
    );

    const splices = useMemo(
        () => (inventory?.splices || []).filter(splice => splice.enclosure_feature_id === enclosureId),
        [enclosureId, inventory?.splices]
    );

    const occupiedStrandIds = useMemo(() => {
        const ids = new Set<string>();
        splices.forEach(splice => {
            ids.add(splice.from_strand_id);
            ids.add(splice.to_strand_id);
        });
        return ids;
    }, [splices]);

    const visibleSplices = useMemo(() => {
        const leftIds = new Set(leftStrands.map(strand => strand.id));
        const rightIds = new Set(rightStrands.map(strand => strand.id));

        return splices
            .map(splice => {
                const fromLeft = leftIds.has(splice.from_strand_id);
                const toLeft = leftIds.has(splice.to_strand_id);
                const fromRight = rightIds.has(splice.from_strand_id);
                const toRight = rightIds.has(splice.to_strand_id);
                const leftStrandId = fromLeft ? splice.from_strand_id : toLeft ? splice.to_strand_id : null;
                const rightStrandId = fromRight ? splice.from_strand_id : toRight ? splice.to_strand_id : null;
                if (!leftStrandId || !rightStrandId) return null;

                const leftIndex = leftStrands.findIndex(strand => strand.id === leftStrandId);
                const rightIndex = rightStrands.findIndex(strand => strand.id === rightStrandId);
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
    }, [leftStrands, rightStrands, splices]);

    const getFeatureName = (featureId: string) => state?.features?.[featureId]?.name || featureId;

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

    const handleStrandClick = async (side: 'left' | 'right', strandId: string) => {
        if (side === 'left') {
            setSelectedLeftStrandId(strandId === selectedLeftStrandId ? null : strandId);
            return;
        }

        if (!selectedLeftStrandId || !projectId || occupiedStrandIds.has(strandId) || occupiedStrandIds.has(selectedLeftStrandId)) return;

        await runWrite('Đã tạo mối hàn nối.', () =>
            upsertFiberSplice(projectId, {
                id: crypto.randomUUID(),
                enclosureFeatureId: enclosureId,
                fromStrandId: selectedLeftStrandId,
                toStrandId: strandId,
                lossDb: 0.05,
            })
        );
        setSelectedLeftStrandId(null);
    };

    const handleRemoveSplice = async (spliceId: string) => {
        if (!projectId) return;
        await runWrite('Đã xóa mối hàn nối.', () => deleteFiberSplice(projectId, spliceId));
    };

    const renderStrand = (strand: FiberStrand, side: 'left' | 'right') => {
        const color = getStrandColor(strand.strand_no);
        const isSelected = selectedLeftStrandId === strand.id;
        const isOccupied = occupiedStrandIds.has(strand.id);
        const canClick = side === 'left' ? !isOccupied : !!selectedLeftStrandId && !isOccupied;

        return (
            <button
                key={strand.id}
                type="button"
                onClick={() => void handleStrandClick(side, strand.id)}
                disabled={saving || !canClick}
                className={[
                    'flex h-6 w-full items-center overflow-hidden rounded border border-white/10 bg-black/25 text-[10px] font-bold transition',
                    side === 'left' ? 'justify-end' : 'justify-start',
                    isSelected ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-black' : '',
                    isOccupied ? 'opacity-60' : '',
                    canClick ? 'cursor-pointer hover:border-cyan-400/50' : 'cursor-default',
                ].join(' ')}
                title={`${color.name} #${strand.strand_no}${strand.strand_no > 12 ? ' striped' : ''}`}
            >
                {side === 'right' && <span className="h-px w-8 bg-white/25" />}
                <span
                    className={`flex h-full flex-1 items-center justify-center border-x border-black/30 ${color.textClass}`}
                    style={{ background: getStrandBackground(strand.strand_no) }}
                >
                    {strand.strand_no}
                </span>
                <span className="h-full w-7 shrink-0 bg-sky-600/80" />
                {side === 'left' && <span className="h-px w-8 bg-white/25" />}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
            <div className="flex h-[min(720px,92vh)] w-[min(1040px,96vw)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f141a] font-sans shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-zinc-100">{getFeatureName(enclosureId)}</h3>
                        <div className="mt-0.5 text-[10px] text-zinc-500">Equipment Diagram</div>
                    </div>
                    <button onClick={onClose} className="rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" title="Đóng">
                        <X size={18} />
                    </button>
                </div>

                <div className="grid shrink-0 grid-cols-[1fr_1fr] gap-4 border-b border-white/5 px-4 py-3">
                    <select
                        className="min-w-0 rounded border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-400/50"
                        value={leftCableId}
                        onChange={event => setRequestedLeftCableId(event.target.value)}
                    >
                        <option value="">Chọn cáp IN</option>
                        {connectedCables.map(cable => (
                            <option key={cable.id} value={cable.id}>
                                IN: {getFeatureName(cable.feature_id)} ({cable.fiber_count || '?'} FO)
                            </option>
                        ))}
                    </select>

                    <select
                        className="min-w-0 rounded border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-pink-300 outline-none focus:border-pink-400/50"
                        value={rightCableId}
                        onChange={event => setRequestedRightCableId(event.target.value)}
                    >
                        <option value="">Chọn cáp OUT</option>
                        {connectedCables.map(cable => (
                            <option key={cable.id} value={cable.id} disabled={cable.id === leftCableId}>
                                OUT: {getFeatureName(cable.feature_id)} ({cable.fiber_count || '?'} FO)
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex min-h-0 flex-1 p-4">
                    {connectedCables.length < 2 ? (
                        <div className="flex flex-1 items-center justify-center rounded border border-white/5 bg-black/20 text-xs text-zinc-500">
                            Điểm này chưa có đủ hai cáp đi qua để tạo splice IN/OUT.
                        </div>
                    ) : (
                        <div className="relative flex min-h-0 flex-1 overflow-auto rounded border border-white/5 bg-black/20">
                            <div className="w-[34%] min-w-[260px] p-4">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">IN strands</div>
                                <div className="flex flex-col gap-1.5">{leftStrands.map(strand => renderStrand(strand, 'left'))}</div>
                            </div>

                            <div className="relative w-[32%] min-w-[260px]">
                                <svg className="absolute inset-0 h-full w-full overflow-visible">
                                    {visibleSplices.map(({ splice, leftStrand, y1, y2 }) => (
                                        <g key={splice.id} className="pointer-events-auto cursor-pointer" onClick={() => void handleRemoveSplice(splice.id)}>
                                            <path
                                                d={`M 0 ${y1} C 90 ${y1}, 170 ${y2}, 260 ${y2}`}
                                                fill="none"
                                                stroke={getStrandColor(leftStrand.strand_no).hex}
                                                strokeWidth={3}
                                                className="transition hover:stroke-red-400"
                                            />
                                        </g>
                                    ))}
                                </svg>
                            </div>

                            <div className="w-[34%] min-w-[260px] p-4">
                                <div className="mb-2 text-right text-[10px] font-bold uppercase tracking-wider text-pink-300">OUT strands</div>
                                <div className="flex flex-col gap-1.5">{rightStrands.map(strand => renderStrand(strand, 'right'))}</div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-zinc-500">
                    <div className="min-w-0 truncate">
                        {statusMessage || 'Chọn một sợi bên IN rồi chọn một sợi bên OUT để tạo mối hàn nối. Click đường nối để xóa.'}
                    </div>
                    {saving && (
                        <div className="flex shrink-0 items-center gap-2 text-cyan-300">
                            <Loader2 size={14} className="animate-spin" />
                            Đang lưu
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
