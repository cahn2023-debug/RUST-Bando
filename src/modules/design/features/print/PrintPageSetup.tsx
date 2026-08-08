import { MousePointer2, Search } from 'lucide-react';
import { cn } from '@DESIGN/features/print/printDialogUtils';

type PrintArea = [number, number, number, number];
type DrawingMode = 'none' | 'point' | 'polyline' | 'image' | 'intersection' | 'move' | 'print_area';

interface PrintPageSetupProps {
  printArea: PrintArea | null;
  setPrintArea: (printArea: PrintArea | null) => void;
  drawingMode: DrawingMode;
  setDrawingMode: (mode: DrawingMode) => void;
  isStandalone: boolean;
  onClose: () => void;
  printTitle: string;
  setPrintTitle: (title: string) => void;
  paperSize: string;
  setPaperSize: (size: string) => void;
  includeBaseMap: boolean;
  setIncludeBaseMap: (include: boolean) => void;
  includeFeatures: boolean;
  setIncludeFeatures: (include: boolean) => void;
  includeLegend: boolean;
  setIncludeLegend: (include: boolean) => void;
  selectedLayerIds: Set<string>;
  setSelectedLayerIds: (layerIds: Set<string>) => void;
  layers: Record<string, any>;
}

export function PrintPageSetup({
  printArea,
  setPrintArea,
  drawingMode,
  setDrawingMode,
  isStandalone,
  onClose,
  printTitle,
  setPrintTitle,
  paperSize,
  setPaperSize,
  includeBaseMap,
  setIncludeBaseMap,
  includeFeatures,
  setIncludeFeatures,
  includeLegend,
  setIncludeLegend,
  selectedLayerIds,
  setSelectedLayerIds,
  layers,
}: PrintPageSetupProps) {
  return (
    <div className="w-80 border-r border-cad-border p-5 flex flex-col gap-6 bg-cad-header overflow-y-auto custom-scrollbar">
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-cad-text-primary font-black text-[10px] uppercase tracking-widest border-b border-cad-border pb-2">
          <span className="w-5 h-5 rounded bg-cad-warn text-cad-bg flex items-center justify-center font-bold">1</span>
          Vùng chọn in
        </div>

        {printArea ? (
          <div className="space-y-3 p-3 bg-cad-surface rounded-lg border border-cad-border shadow-inner">
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-cad-accent">
              <div className="p-1.5 bg-cad-bg rounded border border-cad-border">S: {printArea[0].toFixed(4)}</div>
              <div className="p-1.5 bg-cad-bg rounded border border-cad-border">W: {printArea[1].toFixed(4)}</div>
              <div className="p-1.5 bg-cad-bg rounded border border-cad-border">N: {printArea[2].toFixed(4)}</div>
              <div className="p-1.5 bg-cad-bg rounded border border-cad-border">E: {printArea[3].toFixed(4)}</div>
            </div>
            <button
              onClick={() => setPrintArea(null)}
              className="w-full py-2 bg-cad-danger/10 text-cad-danger text-[10px] font-black uppercase tracking-widest rounded border border-cad-danger/30 hover:bg-cad-danger hover:text-white transition-all shadow-sm"
            >
              Hủy vùng chọn
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              const newMode = drawingMode === 'print_area' ? 'none' : 'print_area';
              setDrawingMode(newMode);
              // Close only if in integrated modal (not standalone)
              if (newMode === 'print_area' && !isStandalone) onClose();
            }}
            className={cn(
              "w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed transition-all active:scale-95",
              drawingMode === 'print_area'
                ? 'bg-cad-warn/10 border-cad-warn text-cad-warn shadow-[0_0_20px_rgba(234,179,8,0.1)]'
                : 'bg-cad-elevated border-cad-border text-cad-text-muted hover:border-cad-warn/50 hover:text-cad-warn/70'
            )}
          >
            <MousePointer2 className={cn("w-6 h-6", drawingMode === 'print_area' && "animate-pulse")} />
            <span className="text-[10px] font-black uppercase tracking-widest">Quét vùng trên Map</span>
          </button>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-cad-text-primary font-black text-[10px] uppercase tracking-widest border-b border-cad-border pb-2">
          <span className="w-5 h-5 rounded bg-blue-500 text-white flex items-center justify-center font-bold">2</span>
          Tiêu đề & Khổ giấy
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-black text-cad-text-muted uppercase tracking-widest px-1">Tiêu đề bản in</label>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cad-text-muted group-focus-within:text-blue-500" />
            <input
              type="text"
              value={printTitle}
              onChange={e => setPrintTitle(e.target.value)}
              placeholder="Tên bản vẽ..."
              className="w-full bg-cad-bg border border-cad-border rounded-lg pl-9 pr-4 py-2 text-xs text-cad-text-primary focus:border-blue-500 outline-none transition-all placeholder:text-cad-text-muted/60 font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          {['A0', 'A1', 'A2', 'A3', 'A4'].map(size => (
            <button
              key={size}
              onClick={() => setPaperSize(size)}
              className={cn(
                "p-2 rounded border text-[10px] uppercase font-black tracking-widest transition-all",
                paperSize === size
                  ? 'bg-blue-500/20 border-blue-500 text-blue-500 shadow-sm'
                  : 'bg-cad-bg border-cad-border text-cad-text-muted hover:border-cad-text-muted hover:text-cad-text-secondary'
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-cad-text-primary font-black text-[10px] uppercase tracking-widest border-b border-cad-border pb-2">
          <span className="w-5 h-5 rounded bg-cad-accent text-black flex items-center justify-center font-bold">3</span>
          Nội dung chú giải
        </div>
        <div className="space-y-2">
          {[
            { id: 'basemap', label: 'Bản đồ nền', state: includeBaseMap, setter: setIncludeBaseMap },
            { id: 'features', label: 'Dữ liệu thiết kế', state: includeFeatures, setter: setIncludeFeatures },
            { id: 'legend', label: 'Bảng chú giải', state: includeLegend, setter: setIncludeLegend },
          ].map(layer => (
            <label key={layer.id} className="flex items-center justify-between p-3 bg-cad-bg rounded border border-cad-border cursor-pointer hover:bg-cad-header transition-colors group">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-cad-text-secondary group-hover:text-cad-text-primary transition-colors uppercase tracking-tight">{layer.label}</span>
                {layer.id === 'features' && includeFeatures && (
                  <span className="text-[8px] text-cad-text-muted font-mono mt-0.5">Filter by Layer/Group enabled</span>
                )}
              </div>
              <input
                type="checkbox"
                checked={layer.state}
                onChange={e => layer.setter(e.target.checked)}
                className="w-4 h-4 rounded-sm border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent focus:ring-offset-cad-surface"
              />
            </label>
          ))}
        </div>

        {includeFeatures && (
          <div className="space-y-4 pt-2">
            <div className="text-[9px] font-black text-cad-text-muted uppercase tracking-widest px-1">Lọc theo lớp dữ liệu</div>
            <div className="max-h-40 overflow-y-auto custom-scrollbar pr-1 space-y-1">
              {Object.values(layers).map(layer => (
                <label key={layer.id} className="flex items-center justify-between p-2 bg-cad-surface rounded border border-cad-border cursor-pointer hover:bg-cad-elevated transition-colors">
                  <span className="text-[9px] text-cad-text-secondary truncate pr-2 uppercase font-bold">{layer.name}</span>
                  <input
                    type="checkbox"
                    checked={selectedLayerIds.has(layer.id)}
                    onChange={e => {
                      const next = new Set(selectedLayerIds);
                      if (e.target.checked) next.add(layer.id);
                      else next.delete(layer.id);
                      setSelectedLayerIds(next);
                    }}
                    className="w-3.5 h-3.5 rounded-sm border-cad-border bg-cad-bg text-cad-accent"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
