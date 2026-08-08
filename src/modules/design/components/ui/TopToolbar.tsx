import { Save, RotateCcw, RotateCw, Search, Sun, Moon, User } from "lucide-react";
import { useAuthStore } from "@CORE/stores/useAuthStore";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useThemeStore } from "@CORE/stores/themeStore";
import { useTranslation } from "react-i18next";
import { cn } from "@SHARED/utils/cn";
import { StorageHealthIndicator } from "./StorageHealthIndicator";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { KeytipBadge } from "./KeytipBadge";

interface TopToolbarProps {
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenAppMenu?: () => void;
  keytipsActive?: boolean;
}

export function TopToolbar({ onSave, onUndo, onRedo, onOpenAppMenu, keytipsActive = false }: TopToolbarProps) {
  const { user } = useAuthStore();
  const syncStatus = useDesignSync((s) => s.syncStatus);
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { t } = useTranslation();

  return (
    <div className="cad-toolbar select-none flex items-center justify-between px-2 bg-cad-header border-b border-cad-border h-9">
      <div className="flex items-center gap-1.5">
        {/* AUTOCAD RED 'P' APP MENU BUTTON */}
        <button
          onClick={onOpenAppMenu}
          className="relative group flex items-center justify-center w-7 h-7 bg-cad-danger hover:bg-cad-danger/80 transition-all rounded shadow-md cursor-pointer border border-cad-danger/50"
          title="Application Menu (Alt+F)"
          aria-label="Application menu"
        >
          <span className="text-white font-black text-sm italic group-hover:scale-110 transition-transform">
            P
          </span>
          {keytipsActive && (
            <div className="absolute -bottom-2 -right-1">
              <KeytipBadge label="F" />
            </div>
          )}
        </button>

        <div className="mx-0.5 h-4 w-px bg-cad-border/60" />

        {/* QUICK ACCESS TOOLBAR */}
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            className="cad-icon-button relative p-1.5 rounded hover:bg-cad-text-primary/10 transition-colors"
            title="Save (Ctrl+S)"
            aria-label="Save project"
          >
            <Save size={15} className={syncStatus !== 0 ? "text-cad-warn" : "text-cad-text-muted"} />
            {syncStatus !== 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cad-warn" />
            )}
            {keytipsActive && (
              <div className="absolute -bottom-2 right-0">
                <KeytipBadge label="1" />
              </div>
            )}
          </button>

          <StorageHealthIndicator />

          <div className="mx-0.5 h-4 w-px bg-cad-border/60" />

          <button
            onClick={onUndo}
            className="cad-icon-button relative p-1.5 rounded hover:bg-cad-text-primary/10 transition-colors"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <RotateCcw size={15} />
            {keytipsActive && (
              <div className="absolute -bottom-2 right-0">
                <KeytipBadge label="2" />
              </div>
            )}
          </button>
          <button
            onClick={onRedo}
            className="cad-icon-button relative p-1.5 rounded hover:bg-cad-text-primary/10 transition-colors"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <RotateCw size={15} />
            {keytipsActive && (
              <div className="absolute -bottom-2 right-0">
                <KeytipBadge label="3" />
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cad-text-muted" />
          <input
            type="text"
            placeholder={t('common.search', 'Search projects or commands...')}
            className="cad-search w-52 focus:w-64 text-[11px] pl-7 py-1"
          />
        </div>

        <div className="mx-0.5 h-4 w-px bg-cad-border/60" />

        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />

          <button
            onClick={toggleTheme}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded border transition-all cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.25)]",
              resolvedTheme === 'dark'
                ? "border-cad-accent/90 bg-cad-accent/10 text-cad-warn hover:bg-cad-accent/20 hover:border-cad-accent"
                : "border-cad-accent/90 bg-cad-accent/10 text-cad-text-secondary hover:bg-cad-accent/20 hover:border-cad-accent"
            )}
            title={resolvedTheme === 'dark' ? t('settings.light', 'Switch to Light Mode') : t('settings.dark', 'Switch to Dark Mode')}
            aria-label="Toggle Theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun size={14} className="text-cad-warn stroke-[2.2]" aria-hidden="true" />
            ) : (
              <Moon size={14} className="text-cad-text-secondary stroke-[2.2]" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="mx-0.5 h-4 w-px bg-cad-border/60" />

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold leading-none capitalize text-cad-text-primary">
              {user?.email?.split('@')[0] || "Anonymous"}
            </span>
            <span className="text-[8px] font-medium uppercase tracking-[0.14em] text-cad-accent">
              {'role' in (user ?? {}) ? ((user as { role?: string }).role || "Staff Engineer") : "Staff Engineer"}
            </span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-cad-border bg-gradient-to-br from-cad-accent to-cad-active shadow-lg shadow-cad-accent/10">
            <User size={13} className="text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
