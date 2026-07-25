import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, FileSpreadsheet, X, HelpCircle, Check, ArrowRight } from 'lucide-react';
import { cn } from '@TOOL/utils/cn';
import type { SyncPreview, ConflictResolution } from '@IMPLEMENT/services/analysisService';

interface AnalysisSyncPreviewModalProps {
  isOpen: boolean;
  preview: SyncPreview | null;
  onClose: () => void;
  onApply: (resolutions: ConflictResolution) => void;
  isApplying?: boolean;
}

export const AnalysisSyncPreviewModal: React.FC<AnalysisSyncPreviewModalProps> = ({
  isOpen,
  preview,
  onClose,
  onApply,
  isApplying = false,
}) => {
  const [resolutions, setResolutions] = useState<ConflictResolution>({});

  if (!isOpen || !preview) return null;

  const conflicts = preview.conflicts || [];
  const changes = preview.changes.filter(c => !c.isConflict) || [];
  const newItems = preview.newItems || [];

  const unhandledConflicts = conflicts.filter(c => !resolutions[c.id]);
  const canApply = unhandledConflicts.length === 0;

  const handleResolve = (changeId: string, choice: 'EXCEL' | 'DESIGN') => {
    setResolutions(prev => ({ ...prev, [changeId]: choice }));
  };

  const handleResolveAll = (choice: 'EXCEL' | 'DESIGN') => {
    const nextRes: ConflictResolution = {};
    conflicts.forEach(c => { nextRes[c.id] = choice; });
    setResolutions(nextRes);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="flex flex-col w-full max-w-4xl max-h-[85vh] bg-cad-elevated border border-cad-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cad-border/60 bg-cad-surface/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cad-accent/10 text-cad-accent">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-cad-text-primary uppercase tracking-tight">
                Xem trước & Đồng bộ Excel
              </h3>
              <p className="text-xs text-cad-text-muted">
                So sánh 3 phía (Baseline - DESIGN - Excel) trước khi áp dụng thay đổi
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-cad-text-muted hover:text-white rounded-lg hover:bg-cad-surface transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-cad-border/40 bg-cad-surface/30">
          <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex flex-col">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Excel thay đổi</span>
            <span className="text-lg font-black text-emerald-400">{changes.length}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Xung đột (Conflict)</span>
            <span className="text-lg font-black text-amber-400">{conflicts.length}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 flex flex-col">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Tạo mới từ Excel</span>
            <span className="text-lg font-black text-blue-400">{newItems.length}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-slate-500/20 bg-slate-500/5 flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lỗi / Bỏ qua</span>
            <span className="text-lg font-black text-slate-400">{preview.errors.length + preview.ignoredItems.length}</span>
          </div>
        </div>

        {/* Content Tabs / Scroll area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-cad-bg">
          {/* Conflicts Section */}
          {conflicts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={14} /> Danh sách xung đột (Cần xử lý {unhandledConflicts.length}/{conflicts.length})
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResolveAll('EXCEL')}
                    className="px-2.5 py-1 text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black rounded transition-colors"
                  >
                    Chọn tất cả Excel
                  </button>
                  <button
                    onClick={() => handleResolveAll('DESIGN')}
                    className="px-2.5 py-1 text-[10px] font-bold bg-cad-surface border border-cad-border text-cad-text-secondary hover:text-cad-text-primary rounded transition-colors"
                  >
                    Giữ tất cả DESIGN
                  </button>
                </div>
              </div>

              <div className="border border-cad-border/60 rounded-lg overflow-hidden divide-y divide-cad-border/40 bg-cad-surface/40">
                {conflicts.map(c => {
                  const currentRes = resolutions[c.id];
                  return (
                    <div key={c.id} className="p-3 flex flex-col gap-2 hover:bg-cad-surface/80 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cad-accent">{c.name}</span>
                        <span className="text-[10px] font-mono uppercase bg-cad-bg px-2 py-0.5 rounded text-cad-text-muted border border-cad-border/40">
                          Trường: {c.field}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 rounded bg-cad-bg/50 border border-cad-border/30">
                          <span className="block text-[9px] font-bold text-cad-text-muted uppercase mb-1">Baseline</span>
                          <span className="font-mono text-cad-text-secondary">{String(c.baselineValue || '(Trống)')}</span>
                        </div>
                        <div className={cn("p-2 rounded border transition-all cursor-pointer", currentRes === 'DESIGN' ? "bg-cad-accent/15 border-cad-accent" : "bg-cad-bg/50 border-cad-border/30 hover:border-cad-accent/50")} onClick={() => handleResolve(c.id, 'DESIGN')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-cad-text-muted uppercase">DESIGN</span>
                            {currentRes === 'DESIGN' && <Check size={12} className="text-cad-accent" />}
                          </div>
                          <span className="font-mono font-bold text-cad-text-primary">{String(c.designValue || '(Trống)')}</span>
                        </div>
                        <div className={cn("p-2 rounded border transition-all cursor-pointer", currentRes === 'EXCEL' ? "bg-emerald-500/15 border-emerald-500" : "bg-cad-bg/50 border-cad-border/30 hover:border-emerald-500/50")} onClick={() => handleResolve(c.id, 'EXCEL')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-emerald-400 uppercase">Excel</span>
                            {currentRes === 'EXCEL' && <Check size={12} className="text-emerald-400" />}
                          </div>
                          <span className="font-mono font-bold text-emerald-300">{String(c.excelValue || '(Trống)')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Normal Changes */}
          {changes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle size={14} /> Thay đổi từ Excel ({changes.length})
              </h4>
              <div className="border border-cad-border/40 rounded-lg overflow-hidden bg-cad-surface/30 max-h-48 overflow-y-auto custom-scrollbar divide-y divide-cad-border/30">
                {changes.map(c => (
                  <div key={c.id} className="p-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-cad-text-primary">{c.name}</span>
                    <div className="flex items-center gap-2 font-mono text-cad-text-secondary">
                      <span className="text-cad-text-muted">{c.field}:</span>
                      <span className="line-through text-cad-text-muted">{String(c.baselineValue || '')}</span>
                      <ArrowRight size={12} className="text-emerald-400" />
                      <span className="font-bold text-emerald-400">{String(c.excelValue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Items */}
          {newItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Tạo đối tượng mới ({newItems.length})
              </h4>
              <div className="border border-cad-border/40 rounded-lg bg-cad-surface/30 p-2.5 text-xs text-cad-text-secondary">
                {newItems.map((item, i) => (
                  <div key={i} className="py-1 flex items-center justify-between border-b border-cad-border/20 last:border-0">
                    <span className="font-bold text-cad-text-primary">{item.name}</span>
                    <span className="text-[10px] text-cad-text-muted font-mono">{item.group} / {item.layer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-cad-border/60 bg-cad-surface/80">
          <div className="flex items-center gap-2">
            {!canApply && (
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <HelpCircle size={14} /> Vui lòng chọn resolution cho tất cả {unhandledConflicts.length} xung đột
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 bg-cad-surface hover:bg-cad-elevated border border-cad-border text-cad-text-secondary hover:text-cad-text-primary rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => onApply(resolutions)}
              disabled={!canApply || isApplying}
              className="px-5 py-2 bg-cad-accent text-black hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] cursor-pointer"
            >
              {isApplying ? 'Đang áp dụng...' : 'Áp dụng đồng bộ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
