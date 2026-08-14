import React from 'react';
import { useSyncV2 } from '../../hooks/useSyncV2';
import {
    Cloud,
    CloudOff,
    RefreshCw,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';

export const SyncController: React.FC = () => {
    const {
        isSyncing,
        isOnline,
        lastError,
        lastResult,
        triggerSync,
        toggleOnline
    } = useSyncV2();

    const getStatusColor = () => {
        if (lastError) return 'text-cad-danger';
        if (isSyncing) return 'text-cad-warn';
        if (!isOnline) return 'text-cad-text-muted';
        return 'text-cad-accent';
    };

    return (
        <div className="flex items-center gap-3 border-l border-cad-border pl-3 ml-3">
            {/* Online/Offline Toggle */}
            <button
                onClick={toggleOnline}
                className={`flex items-center gap-1.5 hover:bg-cad-hover px-1.5 py-0.5 rounded transition-colors ${isOnline ? 'text-cad-accent' : 'text-cad-text-muted'}`}
                title={isOnline ? "Device is Online (Click to go Offline)" : "Device is Offline (Click to go Online)"}
            >
                {isOnline ? <Cloud size={12} /> : <CloudOff size={12} />}
                <span className="text-[9px] uppercase font-bold">{isOnline ? 'On' : 'Off'}</span>
            </button>

            {/* Sync Status / Trigger */}
            <button
                onClick={triggerSync}
                disabled={isSyncing || !isOnline}
                className={`flex items-center gap-1.5 hover:bg-cad-hover px-1.5 py-0.5 rounded transition-colors ${getStatusColor()} ${isSyncing ? 'animate-pulse' : ''}`}
                title={lastError || "Manual Sync"}
            >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />

                <div className="flex flex-col items-start leading-none">
                    <span className="text-[9px] font-bold uppercase">
                        {isSyncing ? 'Syncing...' : lastError ? 'Error' : 'Sync'}
                    </span>
                    {lastResult && !isSyncing && !lastError && (
                        <span className="text-[7px] opacity-70">
                            +{lastResult.pulled} / -{lastResult.pushed}
                        </span>
                    )}
                </div>

                {lastError && <AlertCircle size={10} className="text-cad-danger" />}
                {!lastError && !isSyncing && <CheckCircle2 size={10} className="text-cad-accent opacity-50" />}
            </button>
        </div>
    );
};
