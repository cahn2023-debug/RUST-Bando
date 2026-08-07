import { useState, useRef } from "react";
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
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "@IMPLEMENT/hooks/useClickOutside";
import { KeytipBadge } from "./KeytipBadge";
import { Project } from "@CONTRACT/types";
import { cn } from "@TOOL/utils/cn";

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
  const [searchTerm, setSearchTerm] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose, isOpen);

  if (!isOpen) return null;

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9990] bg-black/40 backdrop-blur-xs flex items-start justify-start pt-10 pl-2 animate-in fade-in duration-100">
      <div
        ref={menuRef}
        className="w-[780px] bg-[#1E1E1E] border-2 border-[#D32F2F] rounded-lg shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col text-cad-text-primary select-none animate-in zoom-in-95 duration-100"
      >
        {/* TOP SEARCH HEADER */}
        <div className="bg-[#141414] border-b border-[#2A2A2A] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md bg-[#252525] border border-[#383838] rounded px-3 py-1.5 focus-within:border-[#D32F2F] transition-all">
            <Search size={15} className="text-cad-text-muted" />
            <input
              type="text"
              placeholder={t('common.search', 'Search commands or recent projects...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-white placeholder:text-cad-text-muted w-full"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider text-[#D32F2F] uppercase bg-[#D32F2F]/10 px-2 py-1 rounded border border-[#D32F2F]/20">
              AutoCAD Style App Menu
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded text-cad-text-muted hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* MAIN 2-COLUMN CONTENT */}
        <div className="grid grid-cols-12 min-h-[420px]">
          {/* LEFT COLUMN: CORE COMMANDS (5 COLS) */}
          <div className="col-span-5 border-r border-[#2A2A2A] bg-[#181818] p-2 flex flex-col justify-between">
            <div className="space-y-1">
              <button
                onClick={() => handleAction(() => onShowCreate?.())}
                className="w-full flex items-center justify-between p-2.5 rounded hover:bg-[#2A2A2A] hover:border-l-4 hover:border-l-[#D32F2F] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#D32F2F]/20 rounded border border-[#D32F2F]/40 text-[#D32F2F] group-hover:scale-105 transition-transform">
                    <FilePlus size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.createNew', 'Tạo dự án mới')}
                      {keytipsActive && <KeytipBadge label="N" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">Khởi tạo bản vẽ mới</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted bg-[#252525] px-1.5 py-0.5 rounded">Ctrl+N</span>
              </button>

              <button
                onClick={() => handleAction(() => onNavigateTab?.('HOME'))}
                className="w-full flex items-center justify-between p-2.5 rounded hover:bg-[#2A2A2A] hover:border-l-4 hover:border-l-[#D32F2F] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded border border-blue-500/40 text-blue-400 group-hover:scale-105 transition-transform">
                    <FolderOpen size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('project.openProject', 'Mở dự án')}
                      {keytipsActive && <KeytipBadge label="O" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">Xem danh sách workspace</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted bg-[#252525] px-1.5 py-0.5 rounded">Ctrl+O</span>
              </button>

              <div className="my-1.5 h-px bg-[#2A2A2A]" />

              <button
                onClick={() => handleAction(() => onSave?.())}
                disabled={!selectedProject}
                className={cn(
                  "w-full flex items-center justify-between p-2.5 rounded transition-all text-left group",
                  selectedProject ? "hover:bg-[#2A2A2A] hover:border-l-4 hover:border-l-[#D32F2F] cursor-pointer" : "opacity-40 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded border border-emerald-500/40 text-emerald-400 group-hover:scale-105 transition-transform">
                    <Save size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      {t('common.save', 'Lưu bản vẽ')}
                      {keytipsActive && <KeytipBadge label="S" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">Cập nhật thay đổi</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted bg-[#252525] px-1.5 py-0.5 rounded">Ctrl+S</span>
              </button>

              <button
                onClick={() => handleAction(() => onForceSave?.())}
                disabled={!selectedProject}
                className={cn(
                  "w-full flex items-center justify-between p-2.5 rounded transition-all text-left group",
                  selectedProject ? "hover:bg-[#2A2A2A] hover:border-l-4 hover:border-l-[#D32F2F] cursor-pointer" : "opacity-40 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded border border-amber-500/40 text-amber-400 group-hover:scale-105 transition-transform">
                    <HardDriveUpload size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      Force Save & Checkpoint
                      {keytipsActive && <KeytipBadge label="F" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">Flush toàn bộ dữ liệu SQLite</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted bg-[#252525] px-1.5 py-0.5 rounded">Ctrl+Shift+S</span>
              </button>

              <button
                onClick={() => handleAction(() => onNavigateTab?.('DESIGN'))}
                className="w-full flex items-center justify-between p-2.5 rounded hover:bg-[#2A2A2A] hover:border-l-4 hover:border-l-[#D32F2F] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded border border-purple-500/40 text-purple-400 group-hover:scale-105 transition-transform">
                    <Printer size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      In ấn & Xuất bản (Print)
                      {keytipsActive && <KeytipBadge label="P" />}
                    </div>
                    <div className="text-[10px] text-cad-text-muted">Xuất PDF / Khung in CAD</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted bg-[#252525] px-1.5 py-0.5 rounded">Ctrl+P</span>
              </button>
            </div>

            <div className="space-y-1 pt-2 border-t border-[#2A2A2A]">
              <button
                onClick={() => handleAction(() => onNavigateTab?.('ADMIN'))}
                className="w-full flex items-center justify-between p-2 rounded hover:bg-[#2A2A2A] transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-cad-text-secondary hover:text-white">
                  <Shield size={16} className="text-indigo-400" />
                  <span>Quản trị Hệ thống</span>
                  {keytipsActive && <KeytipBadge label="A" />}
                </div>
                <ChevronRight size={14} className="text-cad-text-muted" />
              </button>

              <button
                onClick={() => handleAction(() => onLogout?.())}
                className="w-full flex items-center justify-between p-2 rounded hover:bg-red-500/20 hover:text-red-400 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-red-400">
                  <LogOut size={16} />
                  <span>Đăng xuất / Exit</span>
                  {keytipsActive && <KeytipBadge label="X" />}
                </div>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: RECENT PROJECTS (7 COLS) */}
          <div className="col-span-7 bg-[#141414] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#D32F2F]" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">Dự án gần đây (Recent Documents)</span>
                </div>
                <span className="text-[10px] text-cad-text-muted">{filteredProjects.length} dự án</span>
              </div>

              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredProjects.length === 0 ? (
                  <div className="py-10 text-center text-xs text-cad-text-muted">
                    Không tìm thấy dự án phù hợp
                  </div>
                ) : (
                  filteredProjects.map((project) => (
                    <div
                      key={project.path}
                      onClick={() => handleAction(() => onOpenProject?.(project.path))}
                      className={cn(
                        "p-2.5 rounded border transition-all cursor-pointer flex items-center justify-between group",
                        selectedProject?.path === project.path
                          ? "bg-[#D32F2F]/15 border-[#D32F2F]/50"
                          : "bg-[#1E1E1E] border-[#2A2A2A] hover:bg-[#252525] hover:border-[#383838]"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-xs font-bold text-white group-hover:text-[#D32F2F] transition-colors truncate">
                          {project.name}
                        </div>
                        <div className="text-[10px] text-cad-text-muted truncate mt-0.5 font-mono">
                          {project.path}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-cad-text-muted group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#2A2A2A] flex items-center justify-between text-[10px] text-cad-text-muted">
              <span>Bando CAD Project Manager v1.2.0</span>
              <span>Bấm Esc để đóng</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
