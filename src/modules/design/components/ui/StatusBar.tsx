import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { SyncController } from './SyncController';

export function StatusBar() {
  const syncStatus = useDesignSync((s) => s.syncStatus);

  return (
    <div className="h-[24px] bg-cad-surface border-t border-cad-border flex items-center px-4 justify-between shrink-0 select-none">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cad-accent" />
        <span className="text-[10px] font-mono text-cad-text-secondary">READY / SYSTEM_STABLE</span>
      </div>

      <div className="flex items-center gap-4 text-[10px] font-mono">
        <span className="text-cad-text-muted">UTF-8</span>

        {/* New Enhanced Sync V2 Controller */}
        <SyncController />

        {/* Legacy design sync indicator (optional, keeping small dot for saved status) */}
        <div className="flex items-center gap-1 border-l border-cad-border pl-3">
          <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 0 ? 'bg-cad-accent' : 'bg-cad-warn'}`} />
          <span className="text-cad-text-secondary">{syncStatus === 0 ? 'SAVED' : 'CHANGES'}</span>
        </div>
      </div>
    </div>
  );
}
