import { useState } from "react";
import { X, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { type ImportMapping } from "@IMPLEMENT/services/importService";

interface MappingDialogProps {
  headers: string[];
  filename: string;
  onConfirm: (mapping: ImportMapping) => void;
  onClose: () => void;
}

export function MappingDialog({ headers, filename, onConfirm, onClose }: MappingDialogProps) {
  const [mapping, setMapping] = useState<ImportMapping>(() => {
    const initial: ImportMapping = {
      name_column: "",
      lat_column: "",
      lng_column: "",
      description_column: ""
    };
    
    headers.forEach(h => {
      const lower = h.toLowerCase().trim();
      const includes = (terms: string[]) => terms.some(t => lower.includes(t.toLowerCase()));

      if (includes(["tên", "name", "đối tượng", "label"])) {
        initial.name_column = h;
      } else if (includes(["lat", "latitude", "vĩ độ"]) || lower === "x") {
        initial.lat_column = h;
      } else if (includes(["lng", "longitude", "kinh độ", "long"]) || lower === "y") {
        initial.lng_column = h;
      } else if (includes(["mô tả", "description", "ghi chú"])) {
        initial.description_column = h;
      } else if (includes(["stt", "mã hiệu", "mã", "index", "order", "số tt"]) || lower === "id") {
        initial.order_column = h;
      }
    });
    
    return initial;
  });

  const isValid = mapping.name_column && mapping.lat_column && mapping.lng_column;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(mapping);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-cad-surface border border-cad-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cad-border bg-cad-elevated">
          <div className="flex items-center gap-3">
            <div className="bg-cad-accent/20 p-2 rounded-lg">
              <FileSpreadsheet size={18} className="text-cad-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-cad-text-primary uppercase tracking-wider">Mapping Dữ liệu Excel</h2>
              <p className="text-[10px] text-cad-text-muted truncate max-w-[240px] mt-0.5">{filename}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-cad-text-muted hover:text-cad-text-primary transition-colors p-1 hover:bg-cad-elevated rounded-full"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-3">
            <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-400 leading-relaxed">
              Vui lòng chọn các cột tương ứng từ file Excel của bạn. Các cột không được chọn sẽ tự động được đưa vào phần <b>Thông tin bổ sung</b> (Properties).
            </p>
          </div>

          <div className="grid gap-4">
            {/* Name Column */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-black text-cad-text-muted">Cột Tên / Nhãn</label>
                  {mapping.name_column && <span className="text-[9px] text-cad-accent flex items-center gap-1 font-bold"><CheckCircle2 size={10} /></span>}
                </div>
                <select 
                  value={mapping.name_column}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping(prev => ({ ...prev, name_column: e.target.value }))}
                  className="w-full bg-cad-bg border border-cad-border rounded-lg p-2.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all ring-cad-accent/20 focus:ring-4"
                >
                  <option value="">-- Chọn cột --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Order Column - NEW */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-black text-cad-text-muted">Mã hiệu (STT)</label>
                  {mapping.order_column && <span className="text-[9px] text-cad-accent flex items-center gap-1 font-bold"><CheckCircle2 size={10} /></span>}
                </div>
                <select 
                  value={mapping.order_column || ""}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping(prev => ({ ...prev, order_column: e.target.value }))}
                  className="w-full bg-cad-bg border border-cad-border rounded-lg p-2.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all ring-cad-accent/20 focus:ring-4"
                >
                  <option value="">-- Không sử dụng --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Latitude Column */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-cad-text-muted">Vĩ độ (Latitude / X)</label>
                <select 
                  value={mapping.lat_column}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping(prev => ({ ...prev, lat_column: e.target.value }))}
                  className="w-full bg-cad-bg border border-cad-border rounded-lg p-2.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all"
                >
                  <option value="">-- Chọn cột --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Longitude Column */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-cad-text-muted">Kinh độ (Longitude / Y)</label>
                <select 
                  value={mapping.lng_column}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping(prev => ({ ...prev, lng_column: e.target.value }))}
                  className="w-full bg-cad-bg border border-cad-border rounded-lg p-2.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all"
                >
                  <option value="">-- Chọn cột --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            {/* Description Column */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-black text-cad-text-muted">Mô tả (Tùy chọn)</label>
              <select 
                value={mapping.description_column}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping(prev => ({ ...prev, description_column: e.target.value }))}
                className="w-full bg-cad-bg border border-cad-border rounded-lg p-2.5 text-xs text-cad-text-primary outline-none focus:border-cad-accent transition-all"
              >
                <option value="">-- Không sử dụng --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-cad-border bg-cad-elevated flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-xs font-bold text-cad-text-secondary hover:text-white hover:bg-white/5 transition-all"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-6 py-2.5 rounded-lg text-xs font-black bg-cad-accent text-black hover:bg-cad-accent/90 transition-all flex items-center gap-2 disabled:opacity-30 disabled:grayscale cursor-pointer shadow-lg shadow-cad-accent/10 active:scale-95"
          >
            <CheckCircle2 size={14} />
            Hoàn tất Mapping
          </button>
        </div>

      </div>
    </div>
  );
}
