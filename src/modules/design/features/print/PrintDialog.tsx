import { useState, useMemo, useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { X, Printer, MousePointer2, Loader2, Download, Search, Minus, Square, Copy } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureUtils';
import html2canvas from 'html2canvas';
import L from 'leaflet';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PrintDialogProps {
  onClose: () => void;
}

export function PrintDialog({ onClose }: PrintDialogProps) {
  const isStandalone = typeof window !== 'undefined' && window.location.search.includes('view=');
  const { drawingMode, setDrawingMode, printArea, setPrintArea, state } = useDesignSync();
  const projectId = useDesignSync.getState().projectId;
  const [printTitle, setPrintTitle] = useState('BẢN ĐỒ THIẾT KẾ CÔNG TRÌNH');
  const [paperSize, setPaperSize] = useState('A4');
  const [capturing, setCapturing] = useState(false);
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
          if (isStandalone) {
            console.log('[PrintDialog] Requesting preview capture...');
            const capturePromise = new Promise<{ dataUrl: string }>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
              let unlistenResult: (() => void) | undefined;
              listen<{ dataUrl: string }>('map-capture-result', (event) => {
                if (unlistenResult) unlistenResult();
                clearTimeout(timeout);
                resolve(event.payload);
              }).then(f => { unlistenResult = f; });
            });
            emit('request-map-capture', { printArea });

            const result = await capturePromise;
            if (active) setPreviewImage(result.dataUrl);
          } else {
            const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
            if (mapContainer) {
              const canvas = await html2canvas(mapContainer, {
                useCORS: true,
                scale: 1, // Preview doesn't need high res
                ignoreElements: (el) => {
                  const className = typeof el.className === 'string' ? el.className : "";
                  return className.includes('leaflet-control-container');
                }
              });
              if (active) setPreviewImage(canvas.toDataURL('image/png'));
            }
          }
        } catch (err) {
          console.error('[PrintDialog] Preview capture failed:', err);
        }
      };
      captureForPreview();
    } else {
      setPreviewImage(null);
    }
    return () => { active = false; };
  }, [printArea, isStandalone]);

  // Initialize selections
  useMemo(() => {
    if (state?.layers) {
      setSelectedLayerIds(new Set(Object.keys(state.layers)));
    }
  }, [state?.layers]);

  const features = useMemo(() => Object.values(state?.features || {}), [state?.features]);

  // Tự động tạo Legend dựa trên các feature trong vùng in
  const dynamicLegend = useMemo(() => {
    if (!printArea || features.length === 0 || !state?.feature_groups) return [];

    // printArea: [minLat, minLng, maxLat, maxLng]
    const [minLat, minLng, maxLat, maxLng] = printArea;
    const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);

    const visibleFeatures = features.filter(f => {
      try {
        const coords = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
        if (f.geom_type === 'Point' || f.geom_type === 'POINT') {
          return bounds.contains([coords[1], coords[0]]);
        }
        if (Array.isArray(coords)) {
          const flatCoords = (f.geom_type === 'Polygon' || f.geom_type === 'POLYGON') ? (Array.isArray(coords[0]) ? coords[0] : coords) : coords;
          return flatCoords.some((c: any) => bounds.contains([c[1], c[0]]));
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

  const handlePrint = async () => {
    if (!printArea) {
      alert("Vui lòng chọn vùng in trên bản đồ trước!");
      return;
    }

    setCapturing(true);
    try {
      let mapCanvas: HTMLCanvasElement | HTMLImageElement | null = null;

      if (isStandalone) {
        // Cross-window capture
        console.log('[PrintDialog] Requesting cross-window map capture...');
        const capturePromise = new Promise<{ dataUrl: string }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Timeout waiting for map capture"));
          }, 10000);

          let unlistenResult: (() => void) | undefined;
          let unlistenError: (() => void) | undefined;

          const cleanup = () => {
            if (unlistenResult) unlistenResult();
            if (unlistenError) unlistenError();
            clearTimeout(timeout);
          };

          listen<{ dataUrl: string }>('map-capture-result', (event) => {
            cleanup();
            resolve(event.payload);
          }).then(f => { unlistenResult = f; });

          listen<{ error: string }>('map-capture-error', (event) => {
            cleanup();
            reject(new Error(event.payload.error));
          }).then(f => { unlistenError = f; });
        });

        emit('request-map-capture', { printArea });

        const result = await capturePromise;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = result.dataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        mapCanvas = img;
      } else {
        const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
        if (!mapContainer) throw new Error("Không tìm thấy bản đồ");

        mapCanvas = await html2canvas(mapContainer, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          ignoreElements: (el) => {
            const className = typeof el.className === 'string' ? el.className : "";
            return className.includes('leaflet-control-container') ||
              className.includes('leaflet-draw-toolbar');
          }
        });
      }

      let legendCanvas = null;
      if (includeLegend) {
        const legendEl = document.getElementById('print-legend-box');
        if (legendEl) {
          legendCanvas = await html2canvas(legendEl, { scale: 2 });
        }
      }

      const finalCanvas = document.createElement('canvas');
      const ctx = finalCanvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");

      const isA4 = paperSize === 'A4';
      finalCanvas.width = isA4 ? 2480 : 3508;
      finalCanvas.height = isA4 ? 3508 : 4961;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 10;
      ctx.strokeRect(40, 40, finalCanvas.width - 80, finalCanvas.height - 80);
      ctx.lineWidth = 2;
      ctx.strokeRect(60, 60, finalCanvas.width - 120, finalCanvas.height - 120);

      const mapY = 80;
      const mapMaxH = finalCanvas.height * 0.7;
      const mapMaxW = finalCanvas.width - 160;

      // Calculate aspect ratio and centering
      const mapRatio = mapCanvas.width / mapCanvas.height;
      const targetRatio = mapMaxW / mapMaxH;

      let drawW, drawH, drawX, drawY;

      if (mapRatio > targetRatio) {
        // Limited by width
        drawW = mapMaxW;
        drawH = mapMaxW / mapRatio;
      } else {
        // Limited by height
        drawH = mapMaxH;
        drawW = mapMaxH * mapRatio;
      }

      drawX = 80 + (mapMaxW - drawW) / 2;
      drawY = mapY + (mapMaxH - drawH) / 2;

      ctx.drawImage(mapCanvas, drawX, drawY, drawW, drawH);

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(printTitle.toUpperCase(), finalCanvas.width / 2, mapY + drawH + 120);

      ctx.font = '36px Arial';
      ctx.fillStyle = '#666';
      ctx.fillText(`Project: ${projectId || 'N/A'} | Paper Size: ${paperSize} | Date: ${new Date().toLocaleDateString('vi-VN')}`, finalCanvas.width / 2, mapY + drawH + 180);

      if (legendCanvas) {
        const legendX = 100;
        const legendY = mapY + drawH + 250;
        ctx.drawImage(legendCanvas, legendX, legendY);
      }

      const link = document.createElement('a');
      link.download = `Print_${paperSize}_${new Date().getTime()}.png`;
      link.href = finalCanvas.toDataURL('image/png');
      link.click();

    } catch (error) {
      console.error("Print error:", error);
      alert("Lỗi chụp ảnh: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className={cn(
      "z-[200] flex items-center justify-center animate-in fade-in duration-200",
      isStandalone ? "w-screen h-screen bg-transparent p-0" : "fixed inset-0 bg-black/60 backdrop-blur-sm p-8"
    )}>
      <div className={cn(
        "bg-[#1e1e1e] border border-[#333] shadow-2xl overflow-hidden flex flex-col",
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
          className="p-4 border-b border-[#333] flex items-center justify-between bg-[#252526] select-none"
        >          <div data-tauri-drag-region className="flex items-center gap-3">
            <div data-tauri-drag-region className="p-2 bg-yellow-500/20 rounded-lg">
              <Printer data-tauri-drag-region className="w-5 h-5 text-yellow-500" />
            </div>
            <div data-tauri-drag-region>
              <h2 data-tauri-drag-region className="text-lg font-bold tracking-tight text-white">XUẤT BẢN ĐỒ & HỒ SƠ</h2>
              <p data-tauri-drag-region className="text-xs text-gray-500 uppercase tracking-widest font-mono">DPI: 300 | CAD EXPORT SYSTEM</p>
            </div>
          </div>
          <div className="flex bg-[#2d2d2d] border border-[#444] rounded-lg overflow-hidden border-separate">
            {isStandalone && (
              <>
                <button
                  onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().minimize())}
                  className="p-2.5 hover:bg-[#3d3d3d] text-gray-400 transition-colors border-r border-[#444]"
                  title="Thu nhỏ"
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().toggleMaximize())}
                  className="p-2.5 hover:bg-[#3d3d3d] text-gray-400 transition-colors border-r border-[#444]"
                  title={isMaximized ? "Khôi phục" : "Phóng to"}
                >
                  {isMaximized ? <Copy size={14} className="rotate-180" /> : <Square size={14} />}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2.5 hover:bg-rose-500 hover:text-white text-gray-400 transition-colors" title="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Settings Panel */}
          <div className="w-80 border-r border-[#333] p-5 flex flex-col gap-6 bg-[#252526] overflow-y-auto custom-scrollbar">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest border-b border-[#333] pb-2">
                <span className="w-5 h-5 rounded bg-yellow-500 text-[#1e1e1e] flex items-center justify-center font-bold">1</span>
                Vùng chọn in
              </div>

              {printArea ? (
                <div className="space-y-3 p-3 bg-black/40 rounded-lg border border-[#444] shadow-inner">
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-emerald-400">
                    <div className="p-1.5 bg-black/30 rounded border border-[#333]">S: {printArea[0].toFixed(4)}</div>
                    <div className="p-1.5 bg-black/30 rounded border border-[#333]">W: {printArea[1].toFixed(4)}</div>
                    <div className="p-1.5 bg-black/30 rounded border border-[#333]">N: {printArea[2].toFixed(4)}</div>
                    <div className="p-1.5 bg-black/30 rounded border border-[#333]">E: {printArea[3].toFixed(4)}</div>
                  </div>
                  <button
                    onClick={() => setPrintArea(null)}
                    className="w-full py-2 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
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
                      ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.1)]'
                      : 'bg-[#2d2d2d] border-[#444] text-gray-500 hover:border-yellow-500/50 hover:text-yellow-500/70'
                  )}
                >
                  <MousePointer2 className={cn("w-6 h-6", drawingMode === 'print_area' && "animate-pulse")} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Quét vùng trên Map</span>
                </button>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest border-b border-[#333] pb-2">
                <span className="w-5 h-5 rounded bg-blue-500 text-white flex items-center justify-center font-bold">2</span>
                Tiêu đề & Khổ giấy
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Tiêu đề bản in</label>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 group-focus-within:text-blue-500" />
                  <input
                    type="text"
                    value={printTitle}
                    onChange={e => setPrintTitle(e.target.value)}
                    placeholder="Tên bản vẽ..."
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:border-blue-500 outline-none transition-all placeholder:text-gray-700 font-bold"
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
                        : 'bg-[#1a1a1a] border-[#333] text-gray-600 hover:border-gray-500 hover:text-gray-400'
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest border-b border-[#333] pb-2">
                <span className="w-5 h-5 rounded bg-emerald-500 text-white flex items-center justify-center font-bold">3</span>
                Nội dung chú giải
              </div>
              <div className="space-y-2">
                {[
                  { id: 'basemap', label: 'Bản đồ nền', state: includeBaseMap, setter: setIncludeBaseMap },
                  { id: 'features', label: 'Dữ liệu thiết kế', state: includeFeatures, setter: setIncludeFeatures },
                  { id: 'legend', label: 'Bảng chú giải', state: includeLegend, setter: setIncludeLegend },
                ].map(layer => (
                  <label key={layer.id} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded border border-[#333] cursor-pointer hover:bg-[#252526] transition-colors group">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-200 transition-colors uppercase tracking-tight">{layer.label}</span>
                      {layer.id === 'features' && includeFeatures && (
                        <span className="text-[8px] text-gray-600 font-mono mt-0.5">Filter by Layer/Group enabled</span>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={layer.state}
                      onChange={e => layer.setter(e.target.checked)}
                      className="w-4 h-4 rounded-sm border-[#333] bg-[#000] text-emerald-500 focus:ring-emerald-500 focus:ring-offset-[#1a1a1a]"
                    />
                  </label>
                ))}
              </div>

              {includeFeatures && (
                <div className="space-y-4 pt-2">
                  <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Lọc theo lớp dữ liệu</div>
                  <div className="max-h-40 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                    {Object.values(state?.layers || {}).map(layer => (
                      <label key={layer.id} className="flex items-center justify-between p-2 bg-black/20 rounded border border-[#333] cursor-pointer hover:bg-black/30 transition-colors">
                        <span className="text-[9px] text-gray-400 truncate pr-2 uppercase font-bold">{layer.name}</span>
                        <input
                          type="checkbox"
                          checked={selectedLayerIds.has(layer.id)}
                          onChange={e => {
                            const next = new Set(selectedLayerIds);
                            if (e.target.checked) next.add(layer.id);
                            else next.delete(layer.id);
                            setSelectedLayerIds(next);
                          }}
                          className="w-3.5 h-3.5 rounded-sm border-[#444] bg-black text-blue-500"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Preview Area */}
          <div className="flex-1 bg-[#0f0f0f] p-10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

            <div
              className="bg-white shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative flex flex-col overflow-hidden transition-all duration-500"
              style={{
                width: paperSize === 'A4' ? '420px' : paperSize === 'A3' ? '580px' : '720px',
                aspectRatio: '0.707', // Portrait A4 orientation in preview
              }}
            >
              {/* Layout in preview represents the final exported PNG structure */}
              <div className="flex-1 bg-[#1a1a1a] overflow-hidden relative border-b-2 border-black flex flex-col">
                <div className="p-3 border-b border-white/5 bg-black/40 flex justify-between items-center z-10">
                  <span className="text-[8px] font-black text-gray-600 tracking-widest uppercase">GIS Viewport [{paperSize}]</span>
                  <span className="text-[8px] font-black text-yellow-500 antialiased">CAD SYSTEM V4</span>
                </div>
                {!printArea ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#333] p-10 text-center">
                    <Printer className="w-16 h-16 mb-4 opacity-5" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-800">No area selected</p>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-[#111] relative overflow-hidden">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-500"
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
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[#333] flex items-center justify-between bg-[#252526]">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">System Ready</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono">Format: High-Res PNG | Output: {paperSize} Portrait</span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="px-8 py-2.5 rounded-xl border border-[#444] text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-[#333] hover:text-white transition-all active:scale-95"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handlePrint}
              disabled={capturing || !printArea}
              className={cn(
                "px-10 py-2.5 rounded-xl bg-yellow-500 text-[#1e1e1e] font-black text-xs uppercase tracking-widest shadow-[0_10px_30px_rgba(234,179,8,0.2)] hover:shadow-yellow-500/40 transition-all flex items-center gap-3 group",
                capturing ? 'opacity-70 cursor-wait' : 'hover:scale-105 active:scale-95',
                !printArea && 'opacity-50 grayscale cursor-not-allowed'
              )}
            >
              {capturing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  Xuất bản in
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar-light::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-light::-webkit-scrollbar-track {
          background: #fafafa;
        }
        .custom-scrollbar-light::-webkit-scrollbar-thumb {
          background: #eee;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
