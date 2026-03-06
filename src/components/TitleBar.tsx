import { X, Square, Minus } from "lucide-react";

export function TitleBar() {
  return (
    <div className="h-[32px] bg-cad-bg flex items-center justify-between px-3 shrink-0 select-none border-b border-cad-border">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 bg-cad-accent rounded-sm flex items-center justify-center font-display font-bold text-[10px] text-black">
          PM
        </div>
        <div className="flex gap-1 text-[10px] font-bold text-cad-text-secondary tracking-widest font-display">
          <span>PROJECT MANAGER</span>
          <span className="opacity-30">|</span>
          <span className="text-cad-accent uppercase">PRO MAX V4</span>
        </div>
      </div>

      <div className="flex-1 text-center">
        <span className="text-[10px] font-mono text-cad-text-muted tracking-tighter">
          SYSTEM_ID: 0x7FF8A2BC -- MODE: PRODUCTION_STABLE
        </span>
      </div>

      <div className="flex items-center h-full">
        <button className="h-full px-4 hover:bg-white/5 transition-colors text-cad-text-secondary">
          <Minus size={14} />
        </button>
        <button className="h-full px-4 hover:bg-white/5 transition-colors text-cad-text-secondary">
          <Square size={10} />
        </button>
        <button className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors text-cad-text-secondary">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
