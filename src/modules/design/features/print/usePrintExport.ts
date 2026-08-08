import { useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import html2canvas from 'html2canvas';
import { PRINT_COLORS } from '@DESIGN/features/print/printColors';

type PrintArea = [number, number, number, number];

interface UsePrintExportArgs {
  printArea: PrintArea | null;
  isStandalone: boolean;
  includeLegend: boolean;
  paperSize: string;
  printTitle: string;
  projectId: string | null | undefined;
}

export const requestMapCapture = async (printArea: PrintArea) => {
  const captureId = `print_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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

    listen<{ captureId?: string; dataUrl: string }>('map-capture-result', (event) => {
      if (event.payload.captureId && event.payload.captureId !== captureId) return;
      cleanup();
      resolve(event.payload);
    }).then(f => { unlistenResult = f; });

    listen<{ captureId?: string; error: string }>('map-capture-error', (event) => {
      if (event.payload.captureId && event.payload.captureId !== captureId) return;
      cleanup();
      reject(new Error(event.payload.error));
    }).then(f => { unlistenError = f; });
  });

  emit('request-map-capture', { captureId, printArea, fitToBounds: true, captureKind: 'export' });
  return capturePromise;
};

export function usePrintExport({
  printArea,
  isStandalone,
  includeLegend,
  paperSize,
  printTitle,
  projectId,
}: UsePrintExportArgs) {
  const [capturing, setCapturing] = useState(false);

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
        const mapContainer = document.querySelector('.design-maplibre-fast') as HTMLElement;
        if (!mapContainer) throw new Error("Không tìm thấy bản đồ");

        mapCanvas = await html2canvas(mapContainer, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          ignoreElements: (el) => {
            const className = typeof el.className === 'string' ? el.className : "";
            return className.includes('maplibregl-control-container') ||
              className.includes('maplibregl-ctrl');
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

      ctx.fillStyle = PRINT_COLORS.paper;
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      ctx.strokeStyle = PRINT_COLORS.stroke;
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

      ctx.fillStyle = PRINT_COLORS.text;
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(printTitle.toUpperCase(), finalCanvas.width / 2, mapY + drawH + 120);

      ctx.font = '36px Arial';
      ctx.fillStyle = PRINT_COLORS.textMuted;
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

  return { capturing, handlePrint };
}
