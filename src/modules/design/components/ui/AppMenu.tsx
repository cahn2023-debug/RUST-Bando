import { useEffect, useState, useRef } from 'react';
import {
  FilePlus,
  FolderOpen,
  Save,
  Printer,
  Shield,
  LogOut,
  Search,
  Clock,
  ChevronRight,
  HardDriveUpload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '@IMPLEMENT/hooks/useClickOutside';
import { KeytipBadge } from './KeytipBadge';
import { Project } from '@CONTRACT/types';
import { cn } from '@SHARED/utils/cn';

export interface AppMenuProps {
  isOpen: boolean;
  onClose: () => void;
  projects?: Project[];
  selectedProject?: Project | null;
  onSave?: () => void;
  onForceSave?: () => void;
  onOpenProject?: (path: string) => Promise<boolean> | void;
  onShowCreate?: () => void;
  onNavigateTab?: (tab: string) => void;
  onLogout?: () => void;
  keytipsActive?: boolean;
}

export function AppMenu({
  isOpen,
  onClose,
  projects = [],
  selectedProject,
  onSave,
  onForceSave,
  onOpenProject,
  onShowCreate,
  onNavigateTab,
  onLogout,
  keytipsActive = false,
}: AppMenuProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useClickOutside(menuRef, onClose, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-cad-overlay flex items-start justify-start bg-black/40 p-2 pt-10 backdrop-blur-xs animate-in fade-in duration-100">
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('common.applicationMenu', 'Application menu')}
        className="flex max-h-[calc(100vh-3rem)] w-[min(780px,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border-2 border-cad-danger bg-cad-surface text-cad-text-primary shadow-2xl select-none animate-in zoom-in-95 duration-100"
      >
        {/* TOP SEARCH HEADER */}
        <div className="flex items-center justify-between border-b border-cad-border bg-cad-header px-4 py-2.5">
          <div className="flex max-w-md flex-1 items-center gap-2 rounded border border-cad-border bg-cad-elevated px-3 py-1.5 transition-all focus-within:border-cad-accent">
            <Search size={15} className="text-cad-text-muted" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label={t('common.searchCommandsProjects', 'Search commands or recent projects')}
              placeholder={t('common.search', 'Search commands or recent projects...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-none bg-transparent text-xs text-cad-text-primary outline-none placeholder:text-cad-text-muted"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded border border-cad-danger/20 bg-cad-danger/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cad-danger">
              {t('common.applicationMenuStyle', 'Application menu')}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.closeApplicationMenu', 'Close application menu')}
              className="cursor-pointer rounded p-1 text-cad-text-muted transition-colors hover:bg-cad-text-primary/5 hover:text-cad-text-primary"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* MAIN 2-COLUMN CONTENT */}
        <div className="grid min-h-[420px] grid-cols-1 overflow-y-auto md:grid-cols-12">
          {/* LEFT COLUMN: CORE COMMANDS (5 COLS) */}
          <div className="flex flex-col justify-between border-b border-cad-border bg-cad-bg p-2 md:col-span-5 md:border-b-0 md:border-r">
            <div className="space-y-1">
              <button
                onClick={() => handleAction(() => onShowCreate?.())}
                className="group flex w-full cursor-pointer items-center justify-between rounded p-2.5 text-left transition-all hover:border-l-4 hover:border-l-cad-danger hover:bg-cad-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded border border-cad-danger/40 bg-cad-danger/20 p-2 text-cad-danger transition-transform group-hover:scale-105">
                    <FilePlus size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.createNew', 'Tạo dự án mới')}
                      {keytipsActive && <KeytipBadge label="N" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">
                      {t('project.createNewDescription', 'Khởi tạo bản vẽ mới')}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-cad-elevated px-1.5 py-0.5 font-mono text-[9px] text-cad-text-muted">
                  Ctrl+N
                </span>
              </button>

              <button
                onClick={() => handleAction(() => onNavigateTab?.('HOME'))}
                className="group flex w-full cursor-pointer items-center justify-between rounded p-2.5 text-left transition-all hover:border-l-4 hover:border-l-cad-danger hover:bg-cad-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded border border-cad-accent/40 bg-cad-accent/20 p-2 text-cad-accent transition-transform group-hover:scale-105">
                    <FolderOpen size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.openProject', 'Mở dự án')}
                      {keytipsActive && <KeytipBadge label="O" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">
                      {t('project.openProjectDescription', 'Xem danh sách workspace')}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-cad-elevated px-1.5 py-0.5 font-mono text-[9px] text-cad-text-muted">
                  Ctrl+O
                </span>
              </button>

              <div className="my-1.5 h-px bg-cad-border" aria-hidden="true" />

              <button
                onClick={() => handleAction(() => onSave?.())}
                disabled={!selectedProject}
                className={cn(
                  'group flex w-full items-center justify-between rounded p-2.5 text-left transition-all',
                  selectedProject
                    ? 'cursor-pointer hover:border-l-4 hover:border-l-cad-danger hover:bg-cad-elevated'
                    : 'cursor-not-allowed opacity-40'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded border border-cad-accent/40 bg-cad-accent/20 p-2 text-cad-accent transition-transform group-hover:scale-105">
                    <Save size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('common.save', 'Lưu bản vẽ')}
                      {keytipsActive && <KeytipBadge label="S" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">
                      {t('project.saveDescription', 'Cập nhật thay đổi')}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-cad-elevated px-1.5 py-0.5 font-mono text-[9px] text-cad-text-muted">
                  Ctrl+S
                </span>
              </button>

              <button
                onClick={() => handleAction(() => onForceSave?.())}
                disabled={!selectedProject}
                className={cn(
                  'group flex w-full items-center justify-between rounded p-2.5 text-left transition-all',
                  selectedProject
                    ? 'cursor-pointer hover:border-l-4 hover:border-l-cad-danger hover:bg-cad-elevated'
                    : 'cursor-not-allowed opacity-40'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded border border-cad-warn/40 bg-cad-warn/20 p-2 text-cad-warn transition-transform group-hover:scale-105">
                    <HardDriveUpload size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.forceSave', 'Force Save & Checkpoint')}
                      {keytipsActive && <KeytipBadge label="F" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">
                      {t('project.forceSaveDescription', 'Flush toàn bộ dữ liệu SQLite')}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-cad-elevated px-1.5 py-0.5 font-mono text-[9px] text-cad-text-muted">
                  Ctrl+Shift+S
                </span>
              </button>

              <button
                onClick={() => handleAction(() => onNavigateTab?.('DESIGN'))}
                className="group flex w-full cursor-pointer items-center justify-between rounded p-2.5 text-left transition-all hover:border-l-4 hover:border-l-cad-danger hover:bg-cad-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded border border-cad-accent/40 bg-cad-accent/20 p-2 text-cad-accent transition-transform group-hover:scale-105">
                    <Printer size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.printExport', 'In ấn & Xuất bản (Print)')}
                      {keytipsActive && <KeytipBadge label="P" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">
                      {t('project.printExportDescription', 'Xuất PDF / Khung in CAD')}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-cad-elevated px-1.5 py-0.5 font-mono text-[9px] text-cad-text-muted">
                  Ctrl+P
                </span>
              </button>
            </div>

            <div className="space-y-1 border-t border-cad-border pt-2">
              <button
                onClick={() => handleAction(() => onNavigateTab?.('ADMIN'))}
                className="flex w-full cursor-pointer items-center justify-between rounded p-2 text-left transition-all hover:bg-cad-elevated"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-cad-text-secondary hover:text-cad-text-primary">
                  <Shield size={16} className="text-cad-accent" aria-hidden="true" />
                  <span>{t('project.admin', 'Quản trị hệ thống')}</span>
                  {keytipsActive && <KeytipBadge label="A" />}
                </div>
                <ChevronRight size={14} className="text-cad-text-muted" aria-hidden="true" />
              </button>

              <button
                onClick={() => handleAction(() => onLogout?.())}
                className="flex w-full cursor-pointer items-center justify-between rounded p-2 text-left transition-all hover:bg-cad-danger/10 hover:text-cad-danger"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-cad-danger">
                  <LogOut size={16} aria-hidden="true" />
                  <span>{t('common.logout', 'Đăng xuất')}</span>
                  {keytipsActive && <KeytipBadge label="X" />}
                </div>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: RECENT PROJECTS (7 COLS) */}
          <div className="flex flex-col justify-between bg-cad-header p-4 md:col-span-7">
            <div>
              <div className="flex items-center justify-between border-b border-cad-border pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-cad-danger" aria-hidden="true" />
                  <span className="text-xs font-black uppercase tracking-wider text-cad-text-primary">
                    {t('project.recentDocuments', 'Dự án gần đây')}
                  </span>
                </div>
                <span className="text-[10px] text-cad-text-muted">
                  {t('project.projectCount', '{{count}} dự án', { count: filteredProjects.length })}
                </span>
              </div>

              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredProjects.length === 0 ? (
                  <div className="py-10 text-center text-xs text-cad-text-muted">
                    {t('project.noProjectMatches', 'Không tìm thấy dự án phù hợp')}
                  </div>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      type="button"
                      key={project.path}
                      onClick={() => handleAction(() => onOpenProject?.(project.path))}
                      className={cn(
                        'group flex w-full cursor-pointer items-center justify-between rounded border p-2.5 text-left transition-all',
                        selectedProject?.path === project.path
                          ? 'border-cad-danger/50 bg-cad-danger/15'
                          : 'border-cad-border bg-cad-surface hover:border-cad-text-secondary hover:bg-cad-elevated'
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="truncate text-xs font-bold text-cad-text-primary transition-colors group-hover:text-cad-danger">
                          {project.name}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-cad-text-muted">
                          {project.path}
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-cad-text-muted transition-all group-hover:translate-x-0.5 group-hover:text-cad-text-primary"
                        aria-hidden="true"
                      />
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-cad-border pt-3 text-[10px] text-cad-text-muted">
              <span>{t('common.applicationVersion', 'Bando CAD Project Manager v1.2.0')}</span>
              <span>{t('common.pressEscapeToClose', 'Bấm Esc để đóng')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
