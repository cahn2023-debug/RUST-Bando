import React from 'react';
import { Activity, Cpu, Zap, X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';

export const PerformanceOverlay: React.FC = () => {
    const isSaving = useDesignSync(s => s.isSaving);
    const pendingSync = useDesignSync(s => s.pendingSync);
    const lastSync = useDesignSync(s => s.lastSync);
    const syncError = useDesignSync(s => s.error);
    const showPerformanceOverlay = useLayoutStore(s => s.showPerformanceOverlay);
    const setShowPerformanceOverlay = useLayoutStore(s => s.setShowPerformanceOverlay);

    if (!showPerformanceOverlay) return null;

    const syncLabel = syncError ? 'Error' : pendingSync || isSaving ? 'Saving' : 'Idle';
    const syncTone = syncError ? 'text-red-400' : pendingSync || isSaving ? 'text-yellow-300' : 'text-green-400';
    const lastSyncLabel = lastSync ? `${Math.max(0, Math.round((Date.now() - lastSync) / 1000))}s` : '--';

    return (
        <div
            className="fixed bottom-12 right-4 z-[9999] bg-black/80 backdrop-blur-md border border-cad-accent/40 rounded-lg p-2.5 flex flex-col gap-1.5 shadow-2xl pointer-events-none select-none transition-all duration-500 overflow-hidden"
            style={{ minWidth: '170px' }}
        >
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-0.5">
                <span className="text-[10px] font-black text-cad-accent italic uppercase tracking-tighter flex items-center gap-1.5">
                    <Zap size={11} fill="currentColor" className={pendingSync || isSaving ? 'animate-pulse' : ''} /> Performance
                </span>
                <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" />
                    <button
                        onClick={() => setShowPerformanceOverlay(false)}
                        className="text-white/40 hover:text-white transition-colors cursor-pointer pointer-events-auto"
                        title="Tắt bảng hiệu năng"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="space-y-1">
                <div className="flex items-center justify-between group">
                    <span className="text-[9px] text-white/60 uppercase font-mono tracking-widest flex items-center gap-1.5">
                        <Cpu size={10} className="text-cad-accent/70" /> Sync State
                    </span>
                    <span className={`text-xs font-mono font-bold tabular-nums ${syncTone}`}>
                        {syncLabel}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/60 uppercase font-mono tracking-widest flex items-center gap-1.5">
                        <Activity size={10} className="text-blue-400/70" /> Last Sync
                    </span>
                    <span className="text-xs font-mono text-blue-400 font-bold tabular-nums">
                        {lastSyncLabel}
                    </span>
                </div>
            </div>

            <div className="mt-1 flex flex-col gap-1">
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-green-500 to-cad-accent transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                        style={{ width: pendingSync || isSaving ? '65%' : syncError ? '20%' : '100%' }}
                    />
                </div>
                <div className="flex justify-between items-center text-[7px] font-mono uppercase tracking-tighter text-white/30 italic">
                    <span>Design Sync</span>
                    <span>{syncError ? 'Check' : 'Active'}</span>
                </div>
            </div>

            <div className="absolute -right-4 -bottom-4 opacity-[0.03] text-white pointer-events-none">
                <Zap size={60} />
            </div>
        </div>
    );
};
