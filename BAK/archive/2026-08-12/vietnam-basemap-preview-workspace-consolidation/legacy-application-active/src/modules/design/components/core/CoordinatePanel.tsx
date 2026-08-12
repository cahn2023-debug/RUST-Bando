import { Search } from "lucide-react";



export function CoordinatePanel() {
  // Note: We keep a minimal search bar because it's essential for navigation,
  // but we remove the "Geo-Spatial Locator" coordinate display as requested
  // and replace it with a premium "Selection Summary" when active.

  return (
    <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
      <div className="flex items-center bg-cad-surface/90 border border-cad-border shadow-2xl backdrop-blur-md rounded-sm overflow-hidden w-80 group focus-within:border-cad-accent/50 transition-all">
        <div className="pl-3 pr-2 py-2 text-cad-text-muted group-focus-within:text-cad-accent transition-colors">
          <Search size={14} />
        </div>
        <input 
          type="text" 
          placeholder="TÌM KIẾM TỌA ĐỘ HOẶC ĐỊA DANH..."
          className="bg-transparent border-none outline-none text-[11px] text-cad-text font-medium w-full py-2.5 placeholder:text-cad-text-muted/40 uppercase tracking-widest font-mono"
        />
        <div className="px-3 border-l border-cad-border/50 text-[9px] text-cad-text-muted/50 font-black tracking-tighter bg-cad-elevated/30">
          WGS84
        </div>
      </div>
    </div>
  );
}
