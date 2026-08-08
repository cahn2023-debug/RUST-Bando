import { useState, useMemo, useEffect } from 'react';
import { X, Printer, Minus, Square, Copy } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureUtils';
import { PRINT_PREVIEW_COLORS } from '@DESIGN/features/print/printColors';
import { PrintExportControls } from '@DESIGN/features/print/PrintExportControls';
import { PrintPageSetup } from '@DESIGN/features/print/PrintPageSetup';
import { PrintPreview } from '@DESIGN/features/print/PrintPreview';
import { cn, pointInBounds } from '@DESIGN/features/print/printDialogUtils';
import { requestMapCapture, usePrintExport } from '@DESIGN/features/print/usePrintExport';

interface PrintDialogProps {
  onClose: () => void;
}

export function PrintDialog({ onClose }: PrintDialogProps) {
  const isStandalone = typeof window !== 'undefined' && window.location.search.includes('view=');
  const { drawingMode, setDrawingMode, printArea, setPrintArea, state } = useDesignSync();
  const projectId = useDesignSync.getState().projectId;
  const [printTitle, setPrintTitle] = useState('BẢN ĐỒ THIẾT KẾ CÔNG TRÌNH');
  const [paperSize, setPaperSize] = useState('A4');
  const [isMaximized, setIsMaximized] = useState(false);

  // Đồng bộ trạng thái Maximize với Tauri window
  useEffect(() => {
    if (isStandalone) {
      import('@tauri-apps/api/webviewWindow').then(m => {
        const win = m.getCurrentWebviewWindow();

        // Kiểm tra trạng thái ban đầu
        win.isMaximized().then(setIsMaximized);

        // Lắng nghe sự kiện thay đổi
        const unlisten = win.onResized(async () => {
          const maximized = await win.isMaximized();
          setIsMaximized(prev => prev !== maximized ? maximized : prev);
        });

        return () => {
          unlisten.then(u => u());
        };
      });
    }
  }, [isStandalone]);
  const [includeBaseMap, setIncludeBaseMap] = useState(true);
  const [includeFeatures, setIncludeFeatures] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());

  // Automatic preview capture when printArea changes
  useEffect(() => {
    let active = true;
    if (printArea) {
      const captureForPreview = async () => {
        try {
          console.log('[PrintDialog] Requesting preview capture...');
          const result = await requestMapCapture(printArea);
          if (active) setPreviewImage(result.dataUrl);
        } catch (err) {
          console.error('[PrintDialog] Preview capture failed:', err);
        }
      };
      captureForPreview();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewImage(null);
    }
    return () => { active = false; };
  }, [printArea, isStandalone]);

  useEffect(() => {
    if (state?.layers) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedLayerIds(new Set(Object.keys(state.layers)));
    }
  }, [state?.layers]);

  const features = useMemo(() => Object.values(state?.features || {}), [state?.features]);

  // Tự động tạo Legend dựa trên các feature trong vùng in
  const dynamicLegend = useMemo(() => {
    if (!printArea || features.length === 0 || !state?.feature_groups) return [];

    const visibleFeatures = features.filter(f => {
      try {
        const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
        if (f.geom_type === 'Point' || f.geom_type === 'POINT') {
          return pointInBounds(coords[0], coords[1], printArea);
        }
        if (Array.isArray(coords)) {
          const flatCoords = (f.geom_type === 'Polygon' || f.geom_type === 'POLYGON') ? (Array.isArray(coords[0]) ? coords[0] : coords) : coords;
          return flatCoords.some((c: any) => pointInBounds(c[0], c[1], printArea));
        }
        return false;
      } catch { return false; }
    });

    const legendMap = new Map();
    visibleFeatures.forEach(f => {
      const group = f.group_id ? state.feature_groups?.[f.group_id] : null;
      if (!group || !selectedLayerIds.has(group.layer_id)) return;
      const info = getFeatureDisplayInfo(f, group.type, group.name);
      if (!legendMap.has(info.label)) {
        legendMap.set(info.label, {
          label: info.label,
          color: info.color,
          gType: info.gType,
          isLine: info.isLine,
          isPolygon: info.isPolygon
        });
      }
    });

    return Array.from(legendMap.values());
  }, [printArea, features, state?.feature_groups]);

  const { capturing, handlePrint } = usePrintExport({
    printArea,
    isStandalone,
    includeLegend,
    paperSize,
    printTitle,
    projectId,
  });

  return (
    <div className={cn(
      "z-cad-modal flex items-center justify-center animate-in fade-in duration-200",
      isStandalone ? "w-full h-full min-h-0 min-w-0 bg-transparent p-0" : "fixed inset-0 bg-black/60 backdrop-blur-sm p-8"
    )}>
      <div className={cn(
        "bg-cad-surface border border-cad-border shadow-2xl overflow-hidden flex flex-col",
        isStandalone ? "w-full h-full rounded-none border-none" : "w-full max-w-5xl rounded-xl h-[90vh]"
      )}>
        {/* Header */}
        <div
          onMouseDown={(e) => {
            // Chỉ bắt đầu kéo nếu click vào chính header hoặc các phần tử không tương tác
            if (e.currentTarget === e.target || (e.target as HTMLElement).hasAttribute('data-tauri-drag-region')) {
              import('@tauri-apps/api/webviewWindow').then(m => {
                m.getCurrentWebviewWindow().startDragging();
              });
            }
          }}
          data-tauri-drag-region
          className="p-4 border-b border-cad-border flex items-center justify-between bg-cad-header select-none"
        >          <div data-tauri-drag-region className="flex items-center gap-3">
            <div data-tauri-drag-region className="p-2 bg-cad-warn/20 rounded-lg">
              <Printer data-tauri-drag-region className="w-5 h-5 text-cad-warn" />
            </div>
            <div data-tauri-drag-region>
              <h2 data-tauri-drag-region className="text-lg font-bold tracking-tight text-cad-text-primary">XUẤT BẢN ĐỒ & HỒ SƠ</h2>
              <p data-tauri-drag-region className="text-xs text-cad-text-muted uppercase tracking-widest font-mono">DPI: 300 | CAD EXPORT SYSTEM</p>
            </div>
          </div>
          <div className="flex bg-cad-elevated border border-cad-border rounded-lg overflow-hidden border-separate">
            {isStandalone && (
              <>
                <button
                  onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().minimize())}
                  className="p-2.5 hover:bg-cad-elevated text-cad-text-muted transition-colors border-r border-cad-border"
                  title="Thu nhỏ"
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().toggleMaximize())}
                  className="p-2.5 hover:bg-cad-elevated text-cad-text-muted transition-colors border-r border-cad-border"
                  title={isMaximized ? "Khôi phục" : "Phóng to"}
                >
                  {isMaximized ? <Copy size={14} className="rotate-180" /> : <Square size={14} />}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2.5 hover:bg-cad-danger hover:text-white text-cad-text-muted transition-colors" title="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <PrintPageSetup
            printArea={printArea}
            setPrintArea={setPrintArea}
            drawingMode={drawingMode}
            setDrawingMode={setDrawingMode}
            isStandalone={isStandalone}
            onClose={onClose}
            printTitle={printTitle}
            setPrintTitle={setPrintTitle}
            paperSize={paperSize}
            setPaperSize={setPaperSize}
            includeBaseMap={includeBaseMap}
            setIncludeBaseMap={setIncludeBaseMap}
            includeFeatures={includeFeatures}
            setIncludeFeatures={setIncludeFeatures}
            includeLegend={includeLegend}
            setIncludeLegend={setIncludeLegend}
            selectedLayerIds={selectedLayerIds}
            setSelectedLayerIds={setSelectedLayerIds}
            layers={state?.layers || {}}
          />

          <PrintPreview
            printArea={printArea}
            paperSize={paperSize}
            printTitle={printTitle}
            previewImage={previewImage}
            includeLegend={includeLegend}
            dynamicLegend={dynamicLegend}
          />
        </div>

        <PrintExportControls
          paperSize={paperSize}
          printArea={printArea}
          capturing={capturing}
          onClose={onClose}
          onPrint={handlePrint}
        />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--color-cad-text-muted);
          border-radius: 10px;
        }
        .custom-scrollbar-light::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-light::-webkit-scrollbar-track {
          background: ${PRINT_PREVIEW_COLORS.scrollTrack};
        }
        .custom-scrollbar-light::-webkit-scrollbar-thumb {
          background: ${PRINT_PREVIEW_COLORS.scrollThumb};
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
