import React from 'react';
import { useExportStore } from '@IMPLEMENT/stores/useExportStore';
import { Loader2, XCircle, CheckCircle2, FileDown } from 'lucide-react';

export const ExportProgressModal: React.FC = () => {
  const { isExporting, progress, statusText, error } = useExportStore();

  if (!isExporting) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[400px] bg-cad-surface border border-cad-border p-6 shadow-2xl rounded-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cad-accent/10 rounded-sm">
            <FileDown className="text-cad-accent" size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-cad-text-primary">Đang xuất dữ liệu</h3>
            <p className="text-[10px] text-cad-text-muted font-mono uppercase">Vui lòng không đóng phần mềm</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-end text-[10px] font-mono">
             <span className="text-cad-accent uppercase truncate max-w-[280px]">{statusText}</span>
             <span className="text-cad-text-primary">{Math.round(progress)}%</span>
          </div>

          <div className="h-1.5 w-full bg-cad-bg border border-cad-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-cad-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {error ? (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-sm mt-4">
                <XCircle className="text-red-500 shrink-0" size={16} />
                <div className="flex-1 min-w-0">
                   <p className="text-[10px] text-red-500 font-bold uppercase">Lỗi quá trình:</p>
                   <p className="text-[10px] text-cad-text-primary mt-1 break-words">{error}</p>
                   <button 
                     onClick={() => useExportStore.setState({ isExporting: false })}
                     className="mt-3 px-3 py-1 bg-red-500 text-white text-[9px] font-bold uppercase rounded-sm hover:bg-red-600 transition-colors"
                   >
                     Đóng & Thử lại
                   </button>
                </div>
              </div>
          ) : progress === 100 ? (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-sm mt-4 animate-in fade-in slide-in-from-bottom-2">
                 <CheckCircle2 className="text-green-500" size={16} />
                 <p className="text-[10px] text-green-500 font-bold uppercase text-center flex-1">
                   Xuất thành công!
                 </p>
              </div>
          ) : (
              <div className="flex items-center justify-center gap-2 py-4">
                 <Loader2 className="animate-spin text-cad-accent" size={16} />
                 <span className="text-[9px] font-mono text-cad-text-muted uppercase animate-pulse">Processing...</span>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
