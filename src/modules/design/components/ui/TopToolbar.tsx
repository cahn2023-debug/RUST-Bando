import { Save, RotateCcw, RotateCw, Search, Globe, Sun, User } from "lucide-react";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";

interface TopToolbarProps {
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function TopToolbar({ onSave, onUndo, onRedo }: TopToolbarProps) {
  const { user } = useAuthStore();
  const syncStatus = useDesignSync((s) => s.syncStatus);

  return (
    <div className="h-10 bg-[#1E1E1E] border-b border-[#111111] flex items-center px-4 justify-between shrink-0 select-none">
      {/* Left Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onSave}
          className="p-1.5 hover:bg-white/5 rounded-md transition-colors group relative"
          title="Save (Ctrl+S)"
        >
          <Save size={16} className={syncStatus !== 0 ? "text-cad-warn" : "text-cad-text-muted group-hover:text-white"} />
          {syncStatus !== 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-cad-warn rounded-full border border-[#1E1E1E]" />
          )}
        </button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <button
          onClick={onUndo}
          className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-cad-text-muted hover:text-white"
          title="Undo (Ctrl+Z)"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-cad-text-muted hover:text-white"
          title="Redo (Ctrl+Y)"
        >
          <RotateCw size={16} />
        </button>
      </div>

      {/* Right Tools */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted group-focus-within:text-cad-accent transition-colors" />
          <input
            type="text"
            placeholder="Search projects or commands..."
            className="bg-white/5 border border-white/10 rounded-full py-1 pl-9 pr-4 text-[11px] w-48 focus:w-64 focus:bg-white/10 focus:border-cad-accent/50 outline-none transition-all placeholder:text-white/20"
          />
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        {/* Language & Theme */}
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded-md transition-colors text-[10px] font-bold text-cad-text-muted hover:text-white uppercase">
            <Globe size={14} />
            <span>EN</span>
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-cad-text-muted hover:text-white">
            <Sun size={14} />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        {/* Account */}
        <div className="flex items-center gap-2.5 pl-1 group cursor-pointer">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-white leading-none capitalize">
              {user?.email?.split('@')[0] || "Anonymous"}
            </span>
            <span className="text-[8px] text-cad-accent font-medium tracking-tighter uppercase">
              {'role' in (user ?? {}) ? ((user as { role?: string }).role || "Staff Engineer") : "Staff Engineer"}
            </span>
          </div>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cad-accent to-blue-600 flex items-center justify-center border border-white/10 group-hover:border-cad-accent/50 transition-colors shadow-lg">
            <User size={14} className="text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
