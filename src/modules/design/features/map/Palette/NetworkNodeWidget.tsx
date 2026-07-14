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
}

const statusClass: Record<NetworkComputedStatus, string> = {
    online: 'border-emerald-400 bg-emerald-500/10 text-emerald-100',
    'direct-offline': 'border-red-400 bg-red-500/10 text-red-100',
    'upstream-offline': 'border-orange-400 bg-orange-500/10 text-orange-100',
    unknown: 'border-zinc-500 bg-zinc-500/10 text-zinc-200',
    'configuration-error': 'border-purple-400 bg-purple-500/10 text-purple-100',
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
                'w-[132px] rounded border px-2 py-1.5 text-left shadow transition',
                statusClass[data.status || 'unknown'],
                data.isSelected && 'ring-2 ring-cyan-300'
            )}
        >
            <Handle type="target" position={Position.Left} className="h-2 w-2 border border-zinc-950 bg-cyan-300" />
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold leading-4">{data.label}</span>
                <span className="rounded bg-black/25 px-1 py-0.5 text-[8px] uppercase">{data.role}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
                <div className="text-[9px] text-current/80">{statusLabel[data.status || 'unknown']}</div>
                {!!data.affectedDownstreamCount && data.affectedDownstreamCount > 0 && (
                    <div className="text-[8px] font-bold opacity-80">
                        -{data.affectedDownstreamCount} ảnh hưởng
                    </div>
                )}
            </div>
            <div className="mt-0.5 truncate text-[8px] text-current/60">{data.telemetryId || 'Chưa gán ID'}</div>
            <Handle type="source" position={Position.Right} className="h-2 w-2 border border-zinc-950 bg-cyan-300" />
        </div>
    );
};
