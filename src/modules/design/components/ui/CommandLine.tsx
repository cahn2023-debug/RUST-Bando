export function CommandLine() {
  return (
    <div className="h-[60px] bg-black border-t border-cad-border flex flex-col px-4 py-1.5 gap-1 shrink-0">
      <div className="flex-1 flex items-center bg-[#0a0a0a] border border-cad-border/50 px-3 rounded-sm">
        <span className="font-mono text-cad-accent text-[11px] mr-2">COMMAND:</span>
        <input 
          type="text" 
          defaultValue="_OPEN_PROJECT_RECORDS"
          className="bg-transparent outline-none border-none font-mono text-cad-text-primary text-[11px] w-full"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </div>
      <div className="flex justify-between items-center text-[9px] font-mono text-cad-text-secondary px-1">
        <div className="flex gap-4">
          <span>COORDINATES: <span className="text-cad-text-primary">105.78, 21.02</span></span>
          <span className="opacity-50">/</span>
          <span>ELEVATION: <span className="text-cad-text-primary">0.00</span></span>
        </div>
        <div className="flex gap-3 text-cad-accent font-bold">
          <span>SNAP</span>
          <span>GRID</span>
          <span className="text-cad-text-muted">ORTHO</span>
          <span>TRACK</span>
        </div>
      </div>
    </div>
  );
}
