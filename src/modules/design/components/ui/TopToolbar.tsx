import { Save, RotateCcw, RotateCw, Search, Sun, Moon, User } from "lucide-react";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useThemeStore } from "@DESIGN/stores/themeStore";
import { useTranslation } from "react-i18next";
import { cn } from "@TOOL/utils/cn";
import { StorageHealthIndicator } from "./StorageHealthIndicator";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface TopToolbarProps {
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function TopToolbar({ onSave, onUndo, onRedo }: TopToolbarProps) {
  const { user } = useAuthStore();
  const syncStatus = useDesignSync((s) => s.syncStatus);
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { t } = useTranslation();

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
        <StorageHealthIndicator />
        <div className="mx-1 h-4 w-px bg-cad-border" />
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
            placeholder={t('common.search', 'Search projects or commands...')}
            className="cad-search w-56 focus:w-72"
          />
        </div>

        <div className="mx-1 h-4 w-px bg-cad-border" />

        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />

          <button
            onClick={toggleTheme}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md border transition-all cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.25)]",
              resolvedTheme === 'dark'
                ? "border-cad-accent/90 bg-cad-accent/10 text-cad-warn hover:bg-cad-accent/20 hover:border-cad-accent"
                : "border-cad-accent/90 bg-cad-accent/10 text-cad-text-secondary hover:bg-cad-accent/20 hover:border-cad-accent"
            )}
            title={resolvedTheme === 'dark' ? t('settings.light', 'Switch to Light Mode') : t('settings.dark', 'Switch to Dark Mode')}
            aria-label="Toggle Theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun size={15} className="text-cad-warn stroke-[2.2]" aria-hidden="true" />
            ) : (
              <Moon size={15} className="text-cad-text-secondary stroke-[2.2]" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="mx-1 h-4 w-px bg-cad-border" />

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold leading-none capitalize text-cad-text-primary">
              {user?.email?.split('@')[0] || "Anonymous"}
            </span>
            <span className="text-[8px] font-medium uppercase tracking-[0.14em] text-cad-accent">
              {'role' in (user ?? {}) ? ((user as { role?: string }).role || "Staff Engineer") : "Staff Engineer"}
            </span>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-cad-border bg-gradient-to-br from-cad-accent to-cad-active shadow-lg shadow-cad-accent/10">
            <User size={14} className="text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
