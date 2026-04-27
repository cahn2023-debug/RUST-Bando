import { useState, useEffect, useRef, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Minus,
  Square,
  X,
  Save,
  RotateCcw,
  RotateCw,
  Search,
  HelpCircle,
  User as UserIcon,
  RefreshCw,
  LogOut
} from "lucide-react";
import { Project } from "@CONTRACT/types";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { useClickOutside } from "@IMPLEMENT/hooks/useClickOutside";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { cn } from "@TOOL/utils/cn";
import { moveFocus, announce } from "@TOOL/utils/accessibility";
import { LanguageSwitcher } from "./LanguageSwitcher";

export interface TitleBarProps {
  project: Project | null;
  titleOverride?: string;
  showExtraControls?: boolean;
  onSave?: () => void;
  onForceSave?: () => void;
  children?: React.ReactNode;
}

export function TitleBar({ project, titleOverride, showExtraControls = true, onSave, onForceSave, children }: TitleBarProps) {
  const { t } = useTranslation();
  const [appWindow, setAppWindow] = useState<{ minimize: () => void; toggleMaximize: () => void; close: () => void } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const { user, logout } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(userMenuRef, () => setShowUserMenu(false), showUserMenu);

  useEffect(() => {
    const checkRole = async () => {
      if (user?.email) {
        try {
          const config = await safeInvoke<Record<string, unknown>>('get_app_config');
          if (config?.admins && (config.admins as Record<string, unknown>)[user.email!] === 'Admin') {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        } catch (e) {
          console.error("Failed to check admin role:", e);
        }
      }
    };
    checkRole();
  }, [user]);

  useEffect(() => {
    // Dynamically import to avoid crash in non-tauri environments
    const initWindow = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();
        setAppWindow(currentWindow);

        const updateMaximized = async () => {
          setIsMaximized(await currentWindow.isMaximized());
        };
        updateMaximized();

        const interval = setInterval(updateMaximized, 500);
        return () => clearInterval(interval);
      } catch (e) {
        console.warn("Not running in Tauri environment, skipping window controls init");
      }
    };
    initWindow();
  }, []);

  const handleMinimize = () => {
    appWindow?.minimize();
    announce("Window minimized");
  };
  const handleMaximize = () => {
    appWindow?.toggleMaximize();
    announce(isMaximized ? "Window restored" : "Window maximized");
  };
  const handleClose = () => appWindow?.close();

  /** Keyboard handler for the title bar container — arrow key navigation between buttons. */
  const handleContainerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const target = e.nativeEvent.target as HTMLElement | null;
      if (target) {
        moveFocus(target, e.key === "ArrowRight" ? "next" : "previous", e.currentTarget);
      }
    }
  };

  return (
    <div
      role="banner"
      aria-label="Application title bar"
      data-tauri-drag-region
      onKeyDown={handleContainerKeyDown}
      onDoubleClick={handleMaximize}
      className="h-10 bg-[#2B2B2B] flex items-center justify-between border-b border-[#1A1A1A] select-none"
    >
      {/* LEFT: App Icon & Quick Access */}
      <div className="flex items-center h-full px-1 gap-1" role="toolbar" aria-label="Quick access toolbar">
        <div className="w-9 h-9 flex items-center justify-center bg-[#A70000] hover:bg-[#850000] cursor-pointer transition-colors rounded-sm ml-1 group">
          <span className="text-white font-black text-xl italic group-hover:scale-110 transition-transform">P</span>
        </div>

        {showExtraControls && (
          <>
            <div className="h-6 w-[1px] bg-cad-text-muted mx-1 opacity-50" aria-hidden="true" />

            <div className="flex items-center gap-0.5 pointer-events-auto relative z-10">
              <button
                onClick={onForceSave || onSave}
                disabled={!project}
                className={cn(
                  "p-1.5 rounded-sm text-cad-text-secondary transition-colors",
                  project ? "hover:bg-white/10 cursor-pointer" : "opacity-30 cursor-not-allowed"
                )}
                title={`${t('common.save')} (Force Save - Ctrl+S)`}
                aria-label={t('common.save')}
              >
                <Save size={14} className={cn(onForceSave && "text-cad-accent")} aria-hidden="true" />
              </button>
              <button
                className="p-1.5 hover:bg-white/10 rounded-sm text-cad-text-secondary transition-colors"
                title={t('common.refresh')}
                aria-label={t('common.refresh')}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
              <button
                className="p-1.5 hover:bg-white/10 rounded-sm text-cad-text-secondary transition-colors"
                title={t('common.undo')}
                aria-label={t('common.undo')}
              >
                <RotateCcw size={14} aria-hidden="true" />
              </button>
              <button
                className="p-1.5 hover:bg-white/10 rounded-sm text-cad-text-secondary transition-colors"
                title={t('common.redo')}
                aria-label={t('common.redo')}
              >
                <RotateCw size={14} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* CENTER: Project Name & Path OR Tabs */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex-1 flex h-full overflow-hidden px-4",
          children ? "justify-start" : "justify-center items-center pointer-events-none"
        )}
      >
        {children ? children : (
          <p className="text-[11px] font-medium text-cad-text-secondary truncate">
            <span className="text-cad-text-primary mr-1">{t('project.newProject')}</span>
            {titleOverride ? ` - ${titleOverride}` : (project ? ` - ${project.name.toUpperCase()} [${project.path}]` : ` - ${t('project.createFirst')}`)}
          </p>
        )}
      </div>

      {/* RIGHT: Search, Profile, Window Controls */}
      <div className="flex items-center h-full">
        {showExtraControls && (
          <>
            {/* AutoCAD Style Command Search */}
            <div className="hidden lg:flex items-center bg-[#1A1A1A] h-7 px-3 rounded-md border border-white/5 mr-4 w-64 group focus-within:border-cad-accent/50 transition-all">
              <Search size={14} className="text-cad-text-muted mr-2 group-focus-within:text-cad-accent" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('common.search')}
                aria-label={t('common.search')}
                className="bg-transparent border-none outline-none text-[11px] text-cad-text-primary w-full placeholder:text-cad-text-muted"
              />
            </div>

            <div className="flex items-center mr-1 pointer-events-auto relative z-20 gap-1" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label={t('settings.settings')}
                aria-expanded={showUserMenu}
                aria-haspopup="true"
                className="flex items-center bg-[#1A1A1A] hover:bg-[#252525] h-7 px-2 rounded-sm border border-white/5 mr-1 group transition-colors"
                title={t('settings.settings')}
              >
                <div className="w-5 h-5 rounded-full bg-cad-accent/20 flex items-center justify-center mr-2 border border-cad-accent/30 overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={`Avatar for ${user?.email || 'user'}`} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={12} className="text-cad-accent" aria-hidden="true" />
                  )}
                </div>
                <span className="text-[10px] text-cad-text-primary font-bold mr-2 max-w-[120px] truncate">
                  {user?.email?.split('@')[0].toUpperCase() || 'ANONYMOUS'}
                </span>
                <span className="text-[8px] font-black text-cad-accent/60 uppercase tracking-tighter mr-1">
                  {isAdmin ? 'ADMIN' : 'USER'}
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute top-full right-1 mt-1 w-56 bg-cad-elevated border border-cad-border rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-[100] animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl">
                  <div className="px-4 py-3 border-b border-cad-border mb-1">
                    <p className="text-[9px] font-black uppercase text-cad-text-muted tracking-widest mb-1">Authenticated Identity</p>
                    <p className="text-xs font-bold text-white truncate">{user?.email}</p>
                    <p className="text-[8px] font-bold text-cad-accent uppercase mt-1">Role: {isAdmin ? 'System Admin' : 'Workspace User'}</p>
                  </div>

                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    aria-label={t('common.close')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition-colors group"
                  >
                    <LogOut size={14} className="group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
                    {t('common.close').toUpperCase()}
                  </button>
                </div>
              )}

              <LanguageSwitcher />

              <button
                className="p-2 hover:bg-white/10 text-cad-text-secondary"
                aria-label={t('common.help')}
                title={t('common.help')}
              >
                <HelpCircle size={16} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {/* WINDOW CONTROLS */}
        <div className="flex h-full pointer-events-auto relative z-10" role="toolbar" aria-label="Window controls">
          <button
            onClick={handleMinimize}
            aria-label="Minimize window"
            className="w-11 h-full flex items-center justify-center hover:bg-white/10 text-white transition-colors"
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            onClick={handleMaximize}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            className="w-11 h-full flex items-center justify-center hover:bg-white/10 text-white transition-colors"
          >
            {isMaximized ? (
              <div className="relative w-3 h-3 border border-white top-[1px] left-[1px]" aria-hidden="true">
                <div className="absolute -top-1 -right-1 w-3 h-3 border border-white bg-[#2B2B2B]" />
              </div>
            ) : (
              <Square size={12} aria-hidden="true" />
            )}
          </button>
          <button
            onClick={handleClose}
            aria-label="Close window"
            className="w-11 h-full flex items-center justify-center hover:bg-[#E81123] text-white transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
