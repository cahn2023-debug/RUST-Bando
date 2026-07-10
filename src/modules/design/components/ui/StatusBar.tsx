import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { SyncController } from './SyncController';

export function StatusBar() {
  const syncStatus = useDesignSync((s) => s.syncStatus);

  return (
    <div className="h-[22px] bg-[#1A1A1A] border-t border-[#000000] flex items-center px-3 justify-between shrink-0 select-none text-cad-text-muted">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cad-accent animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">READY</span>
        </div>
      </div>

      <div className="flex items-center gap-6 text-[9px] font-medium">
        <span className="opacity-40 hover:opacity-100 transition-opacity cursor-default uppercase">UTF-8</span>

        {/* Sync Controller keeps its internal design but fits in the bar */}
        <SyncController />

        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <div className={`w-1 h-1 rounded-full ${syncStatus === 0 ? 'bg-cad-accent' : 'bg-cad-warn'}`} />
          <span className="uppercase tracking-tighter text-[8px]">{syncStatus === 0 ? 'Saved' : 'Changes'}</span>
        </div>
      </div>
    </div>
  );
}
