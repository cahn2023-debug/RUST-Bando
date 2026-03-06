export function StatusBar() {
  return (
    <div className="h-[24px] bg-cad-surface border-t border-cad-border flex items-center px-4 justify-between shrink-0 select-none">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cad-accent animate-pulse" />
        <span className="text-[10px] font-mono text-cad-text-secondary">READY // SYSTEM_STABLE</span>
      </div>
      
      <div className="flex items-center gap-4 text-[10px] font-mono">
        <span className="text-cad-text-muted">UTF-8</span>
        <span className="text-cad-text-primary hover:text-cad-accent cursor-pointer">BRANCH: MAIN</span>
        <div className="flex items-center gap-1 text-cad-warn">
          <div className="w-1.5 h-1.5 rounded-full bg-cad-warn" />
          <span>SYNCING...</span>
        </div>
      </div>
    </div>
  );
}
