import React from 'react';
import { Activity, Cpu, Zap, X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';

export const PerformanceOverlay: React.FC = () => {
    const isSaving = useDesignSync(s => s.isSaving);
    const pendingSync = useDesignSync(s => s.pendingSync);
    const lastSync = useDesignSync(s => s.lastSync);
    const syncError = useDesignSync(s => s.error);
    const renderMetrics = useDesignSync(s => s.renderMetrics);
    const showPerformanceOverlay = useLayoutStore(s => s.showPerformanceOverlay);
    const setShowPerformanceOverlay = useLayoutStore(s => s.setShowPerformanceOverlay);

    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        if (!showPerformanceOverlay) return;
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, [showPerformanceOverlay]);

    if (!showPerformanceOverlay) return null;

    const syncLabel = syncError ? 'Error' : pendingSync || isSaving ? 'Saving' : 'Idle';
    const syncTone = syncError ? 'text-cad-danger' : pendingSync || isSaving ? 'text-cad-warn' : 'text-cad-accent';
    const lastSyncLabel = lastSync ? `${Math.max(0, Math.round((now - lastSync) / 1000))}s` : '--';

    return (
        <div
            className="fixed bottom-12 right-4 z-cad-debug bg-cad-elevated/95 backdrop-blur-md border border-cad-accent/40 rounded-lg p-2.5 flex flex-col gap-1.5 shadow-2xl pointer-events-none select-none transition-all duration-500 overflow-hidden"
            style={{ minWidth: '170px' }}
        >
            <div className="flex items-center justify-between border-b border-cad-border pb-1.5 mb-0.5">
                <span className="text-[10px] font-black text-cad-accent italic uppercase tracking-tighter flex items-center gap-1.5">
                    <Zap size={11} fill="currentColor" className={pendingSync || isSaving ? 'animate-pulse' : ''} /> Performance
                </span>
                <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cad-accent shadow-[0_0_5px_var(--color-cad-accent)]" />
                    <button
                        onClick={() => setShowPerformanceOverlay(false)}
                        className="text-cad-text-muted hover:text-cad-text-primary transition-colors cursor-pointer pointer-events-auto"
                        title="Tắt bảng hiệu năng"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="space-y-1">
                <div className="flex items-center justify-between group">
                    <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest flex items-center gap-1.5">
                        <Cpu size={10} className="text-cad-accent/70" /> Sync State
                    </span>
                    <span className={`text-xs font-mono font-bold tabular-nums ${syncTone}`}>
                        {syncLabel}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest flex items-center gap-1.5">
                        <Activity size={10} className="text-cad-text-secondary" /> Last Sync
                    </span>
                    <span className="text-xs font-mono text-cad-text-secondary font-bold tabular-nums">
                        {lastSyncLabel}
                    </span>
                </div>

                {renderMetrics && (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest">
                                Engine
                            </span>
                            <span className="text-xs font-mono text-cad-text-primary font-bold tabular-nums">
                                {renderMetrics.engine}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest">
                                LOD / Features
                            </span>
                            <span className="text-xs font-mono text-cad-accent font-bold tabular-nums">
                                {renderMetrics.lodLevel} / {renderMetrics.featureCount}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest">
                                Frame p50 / p95
                            </span>
                            <span className="text-xs font-mono text-cad-text-primary font-bold tabular-nums">
                                {renderMetrics.p50FrameMs.toFixed(2)}ms / {renderMetrics.p95FrameMs.toFixed(2)}ms
                            </span>
                        </div>
                        {renderMetrics.viewportQueryMs !== undefined && (
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest">
                                    VP Query / Build
                                </span>
                                <span className="text-xs font-mono text-cad-text-secondary font-bold tabular-nums">
                                    {renderMetrics.viewportQueryMs.toFixed(1)}ms / {renderMetrics.sourceBuildMs.toFixed(1)}ms
                                </span>
                            </div>
                        )}
                        {renderMetrics.mapLibreSetDataMs !== undefined && (
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-cad-text-secondary uppercase font-mono tracking-widest">
                                    SetData
                                </span>
                                <span className="text-xs font-mono text-cad-text-secondary font-bold tabular-nums">
                                    {renderMetrics.mapLibreSetDataMs.toFixed(1)}ms
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="mt-1 flex flex-col gap-1">
                <div className="h-1 bg-cad-text-primary/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-cad-accent to-cad-accent transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                        style={{ width: pendingSync || isSaving ? '65%' : syncError ? '20%' : '100%' }}
                    />
                </div>
                <div className="flex justify-between items-center text-[7px] font-mono uppercase tracking-tighter text-cad-text-muted italic">
                    <span>Design Sync</span>
                    <span>{syncError ? 'Check' : 'Active'}</span>
                </div>
            </div>

            <div className="absolute -right-4 -bottom-4 opacity-[0.03] text-cad-text-primary pointer-events-none">
                <Zap size={60} />
            </div>
        </div>
    );
};
