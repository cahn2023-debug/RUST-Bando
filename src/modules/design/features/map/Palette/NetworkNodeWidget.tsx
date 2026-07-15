import { Handle, Position } from '@xyflow/react';
import { cn } from '@TOOL/utils/cn';
import type { NetworkComputedStatus } from '../network/NetworkGraphService';

interface NetworkNodeData {
    label: string;
    role: string;
    status: NetworkComputedStatus;
    telemetryId?: string;
    isSelected?: boolean;
    affectedDownstreamCount?: number;
    memberCount?: number;
}

const statusClass: Record<NetworkComputedStatus, string> = {
    online: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.15)] hover:border-emerald-500/50 hover:shadow-[0_0_18px_rgba(52,211,153,0.25)]',
    'direct-offline': 'border-red-500/30 bg-red-950/40 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.25)] hover:border-red-500/50 hover:shadow-[0_0_18px_rgba(239,68,68,0.35)]',
    'upstream-offline': 'border-orange-500/30 bg-orange-950/40 text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.18)] hover:border-orange-500/50 hover:shadow-[0_0_18px_rgba(249,115,22,0.28)]',
    unknown: 'border-zinc-700/30 bg-zinc-950/40 text-zinc-400 shadow-none hover:border-zinc-600/50',
    'configuration-error': 'border-purple-500/30 bg-purple-950/40 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.18)] hover:border-purple-500/50 hover:shadow-[0_0_18px_rgba(168,85,247,0.28)]',
};

const statusLabel: Record<NetworkComputedStatus, string> = {
    online: 'Online',
    'direct-offline': 'Lỗi trực tiếp',
    'upstream-offline': 'Mất upstream',
    unknown: 'Unknown',
    'configuration-error': 'Chưa cấu hình',
};

export const NetworkNodeWidget = ({ data }: { data: NetworkNodeData }) => {
    return (
        <div
            className={cn(
                'w-[152px] rounded-lg border backdrop-blur-md px-2.5 py-2 text-left shadow transition-all duration-300 ease-out hover:-translate-y-0.5',
                statusClass[data.status || 'unknown'],
                data.isSelected && 'ring-2 ring-cyan-400 border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.25)]'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="h-2 w-2 !border-zinc-950 !bg-cyan-400 !shadow-[0_0_6px_rgba(34,211,238,0.6)]"
            />
            <div className="flex items-start justify-between gap-1.5">
                <span className="truncate text-[10.5px] font-bold leading-tight text-zinc-100" title={data.label}>
                    {data.label}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {!!data.memberCount && data.memberCount > 1 && (
                        <span className="rounded bg-cyan-400/15 px-1 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-cyan-200">
                            {data.memberCount} obj
                        </span>
                    )}
                    <span className="rounded bg-black/45 px-1 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-zinc-300">
                        {data.role}
                    </span>
                </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
                <div className="text-[9px] font-medium opacity-90">{statusLabel[data.status || 'unknown']}</div>
                {!!data.affectedDownstreamCount && data.affectedDownstreamCount > 0 && (
                    <div className="rounded bg-red-500/20 px-1 py-0.2 text-[8px] font-black text-red-200 animate-pulse">
                        -{data.affectedDownstreamCount} Downstream
                    </div>
                )}
            </div>
            <div className="mt-1.5 font-mono text-[8px] text-zinc-400 bg-black/35 px-1 py-0.5 rounded truncate select-all" title={data.telemetryId || data.label}>
                ID: {data.telemetryId || 'Chưa gán'}
            </div>
            <Handle
                type="source"
                position={Position.Right}
                className="h-2 w-2 !border-zinc-950 !bg-cyan-400 !shadow-[0_0_6px_rgba(34,211,238,0.6)]"
            />
        </div>
    );
};
