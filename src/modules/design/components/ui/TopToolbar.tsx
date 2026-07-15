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
    <div className="cad-toolbar select-none">
      <div className="flex items-center gap-1">
        <button
          onClick={onSave}
          className="cad-icon-button relative"
          title="Save (Ctrl+S)"
        >
          <Save size={16} className={syncStatus !== 0 ? "text-cad-warn" : "text-cad-text-muted"} />
          {syncStatus !== 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cad-warn" />
          )}
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          onClick={onUndo}
          className="cad-icon-button"
          title="Undo (Ctrl+Z)"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={onRedo}
          className="cad-icon-button"
          title="Redo (Ctrl+Y)"
        >
          <RotateCw size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted" />
          <input
            type="text"
            placeholder="Search projects or commands..."
            className="cad-search w-56 focus:w-72"
          />
        </div>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <div className="flex items-center gap-1">
          <button className="cad-icon-button h-8 w-auto gap-1 px-2" title="Language">
            <Globe size={14} />
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cad-text-muted">EN</span>
          </button>
          <button className="cad-icon-button" title="Theme">
            <Sun size={14} />
          </button>
        </div>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold leading-none capitalize text-cad-text-primary">
              {user?.email?.split('@')[0] || "Anonymous"}
            </span>
            <span className="text-[8px] font-medium uppercase tracking-[0.14em] text-cad-accent">
              {'role' in (user ?? {}) ? ((user as { role?: string }).role || "Staff Engineer") : "Staff Engineer"}
            </span>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-cad-border bg-gradient-to-br from-cad-accent to-blue-600 shadow-lg shadow-cad-accent/10">
            <User size={14} className="text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
