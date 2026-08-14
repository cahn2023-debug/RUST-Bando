import { Printer } from 'lucide-react';
import { PRINT_PREVIEW_COLORS } from '@DESIGN/features/print/printColors';

type PrintArea = [number, number, number, number];

interface LegendItem {
  label: string;
  color: string;
  isLine: boolean;
  isPolygon: boolean;
}

interface PrintPreviewProps {
  printArea: PrintArea | null;
  paperSize: string;
  printTitle: string;
  previewImage: string | null;
  includeLegend: boolean;
  dynamicLegend: LegendItem[];
}

export function PrintPreview({
  printArea,
  paperSize,
  printTitle,
  previewImage,
  includeLegend,
  dynamicLegend,
}: PrintPreviewProps) {
  return (
    <div className="flex-1 bg-cad-bg p-10 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${PRINT_PREVIEW_COLORS.placeholder} 1px, transparent 1px)`,
          backgroundSize: '30px 30px',
        }} />

      <div
        className="bg-white shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative flex flex-col overflow-hidden transition-all duration-200"
        style={{
          width: paperSize === 'A4' ? '420px' : paperSize === 'A3' ? '580px' : '720px',
          aspectRatio: '0.707', // Portrait A4 orientation in preview
        }}
      >
        {/* Layout in preview represents the final exported PNG structure */}
        <div
          className="flex-1 overflow-hidden relative border-b-2 border-black flex flex-col"
          style={{ backgroundColor: PRINT_PREVIEW_COLORS.viewport }}
        >
          <div className="p-3 border-b border-white/5 bg-black/40 flex justify-between items-center z-10">
            <span className="text-[8px] font-black text-gray-600 tracking-widest uppercase">GIS Viewport [{paperSize}]</span>
            <span className="text-[8px] font-black text-yellow-500 antialiased">CAD SYSTEM V4</span>
          </div>
          {!printArea ? (
            <div
              className="flex-1 flex flex-col items-center justify-center p-10 text-center"
              style={{ color: PRINT_PREVIEW_COLORS.placeholder }}
            >
              <Printer className="w-16 h-16 mb-4 opacity-5" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-800">No area selected</p>
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center relative overflow-hidden"
              style={{ backgroundColor: PRINT_PREVIEW_COLORS.viewportFilled }}
            >
              {previewImage ? (
                <img
                  src={previewImage}
                  className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-200"
                  alt="Map Preview"
                />
              ) : (
                <div className="w-32 h-32 border border-yellow-500/20 rounded-full animate-pulse flex items-center justify-center">
                  <span className="text-[8px] text-yellow-500 font-mono uppercase">Capturing...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 bg-white min-h-[140px] flex flex-col">
          <div className="text-center mb-4">
            <h3 className="text-sm font-black text-black uppercase tracking-tight leading-none mb-1">{printTitle || "BẢN ĐỒ DỰ ÁN"}</h3>
            <div className="h-[1px] w-20 bg-black/10 mx-auto mb-1" />
            <p className="text-[8px] font-bold text-gray-400 tracking-widest uppercase">Scale: Fit to Frame | VN2000 System</p>
          </div>

          {includeLegend && (
            <div id="print-legend-box" className="flex-1 border-t border-gray-100 pt-3">
              <div className="grid grid-cols-3 gap-y-2 gap-x-4">
                {dynamicLegend.length > 0 ? (
                  dynamicLegend.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {item.isLine ? (
                        <div className="w-4 h-1 rounded-full" style={{ backgroundColor: item.color }} />
                      ) : item.isPolygon ? (
                        <div className="w-3 h-3 border border-black/10" style={{ backgroundColor: item.color }} />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                      )}
                      <span className="text-[8px] text-black font-bold truncate leading-none uppercase">{item.label}</span>
                    </div>
                  ))
                ) : (
                  <p className="col-span-3 text-[7px] text-gray-300 italic uppercase text-center mt-2">Dữ liệu ngoài vùng chọn</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Professional Stamp/Footer Placeholder */}
        <div className="h-10 bg-gray-50 border-t border-gray-200 px-4 flex items-center justify-between">
          <span className="text-[6px] font-black text-gray-400 uppercase">Authenticated by Antigravity CAD</span>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-sm bg-black/5" />
            <div className="w-12 h-2 rounded-full bg-black/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
