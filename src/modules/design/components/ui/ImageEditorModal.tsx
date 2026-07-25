import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Pencil, Crop, RotateCw, Circle, Square, Type as TypeIcon, Minus, MoveUpRight,
  Undo2, Radio, Eraser, X, Check
} from 'lucide-react';
import { cn } from '@TOOL/utils/cn';
import { Button } from '@DESIGN/components/ui/Button';

export interface ImageEditorSaveResult {
  dataUrl: string;
  textAnnotations: string[];
}

export interface ImageEditorModalProps {
  imageUrl: string;
  onCancel: () => void;
  onSave: (result: ImageEditorSaveResult) => Promise<void> | void;
  title?: string;
  saveLabel?: string;
}

export type ImageEditTool = 'crop' | 'pencil' | 'eraser' | 'line' | 'arrow' | 'circle' | 'square' | 'text' | 'stamp';
export type StrokePattern = 'solid' | 'dashed' | 'dashdot' | 'dotted' | 'zigzag';
export type AssetStamp = 'pole-4m' | 'pole-6m' | 'pole-8m' | 'cabinet-300x520' | 'camera-sim';

interface DragPoint {
  x: number;
  y: number;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageEditSnapshot {
  bgDataUrl: string;
  annotationDataUrl: string;
  textAnnotations: string[];
  canvasWidth: number;
  canvasHeight: number;
}

const QUICK_SWATCHES = [
  { label: 'Cam', color: '#f97316' },
  { label: 'Vàng', color: '#facc15' },
  { label: 'Đỏ', color: '#ef4444' },
  { label: 'Xanh lá', color: '#10b981' },
  { label: 'Xanh dương', color: '#3b82f6' },
  { label: 'Trắng', color: '#ffffff' },
];

const isEditableInputTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
};

const normalizeCropRect = (start: DragPoint, end: DragPoint): CropRect => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
};

const applyStrokePattern = (ctx: CanvasRenderingContext2D, pattern: StrokePattern, strokeWidth: number) => {
  const scale = strokeWidth / 4;
  if (pattern === 'dashed') {
    ctx.setLineDash([8 * scale, 6 * scale]);
  } else if (pattern === 'dashdot') {
    ctx.setLineDash([12 * scale, 4 * scale, 3 * scale, 4 * scale]);
  } else if (pattern === 'dotted') {
    ctx.setLineDash([3 * scale, 4 * scale]);
  } else {
    ctx.setLineDash([]);
  }
};

const drawPatternedLine = (ctx: CanvasRenderingContext2D, start: DragPoint, end: DragPoint, strokeWidth: number, pattern: StrokePattern) => {
  if (pattern === 'zigzag') {
    ctx.save();
    ctx.setLineDash([]);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      ctx.restore();
      return;
    }
    const angle = Math.atan2(dy, dx);
    const waveLength = 12 * Math.max(1, strokeWidth / 4);
    const waveAmplitude = 6 * Math.max(1, strokeWidth / 4);
    const steps = Math.floor(dist / waveLength);

    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= steps; i++) {
      const x = i * waveLength;
      const y = i % 2 === 0 ? 0 : waveAmplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(dist, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
};

const drawArrowHead = (ctx: CanvasRenderingContext2D, start: DragPoint, end: DragPoint, strokeWidth: number) => {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 14 * Math.max(1, strokeWidth / 3);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
};

const drawAssetStamp = (ctx: CanvasRenderingContext2D, point: DragPoint, stamp: AssetStamp, color: string, strokeWidth: number) => {
  const scale = Math.max(1, strokeWidth / 4);
  const x = point.x;
  const y = point.y;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, strokeWidth);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stamp.startsWith('pole')) {
    const armLength = stamp === 'pole-4m' ? 70 : stamp === 'pole-6m' ? 95 : 120;
    const poleHeight = 120 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleHeight);
    ctx.lineTo(x + armLength * scale, y - poleHeight - 18 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + armLength * scale + 8 * scale, y - poleHeight - 18 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `bold ${14 * scale}px sans-serif`;
    ctx.fillText(stamp === 'pole-4m' ? 'Cột 6m - TV 4m' : stamp === 'pole-6m' ? 'Cột 6m - TV 6m' : 'Cột 6m - TV 8m', x + 10 * scale, y + 18 * scale);
  } else if (stamp === 'cabinet-300x520') {
    ctx.strokeRect(x - 26 * scale, y - 42 * scale, 52 * scale, 84 * scale);
    ctx.beginPath();
    ctx.moveTo(x - 18 * scale, y - 20 * scale);
    ctx.lineTo(x + 18 * scale, y - 20 * scale);
    ctx.moveTo(x - 18 * scale, y);
    ctx.lineTo(x + 18 * scale, y);
    ctx.stroke();
    ctx.font = `bold ${13 * scale}px sans-serif`;
    ctx.fillText('Tủ 300x520', x + 34 * scale, y + 4 * scale);
  } else {
    ctx.strokeRect(x - 34 * scale, y - 18 * scale, 54 * scale, 34 * scale);
    ctx.beginPath();
    ctx.moveTo(x + 20 * scale, y - 8 * scale);
    ctx.lineTo(x + 48 * scale, y - 18 * scale);
    ctx.lineTo(x + 48 * scale, y + 18 * scale);
    ctx.lineTo(x + 20 * scale, y + 8 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 8 * scale, y, 7 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `bold ${13 * scale}px sans-serif`;
    ctx.fillText('Camera mô phỏng', x - 34 * scale, y + 36 * scale);
  }

  ctx.restore();
};

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  imageUrl,
  onCancel,
  onSave,
  title = 'Edit Photo',
  saveLabel = 'Save photo'
}) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const snapshotRef = useRef<ImageData | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
  const lastPencilPointRef = useRef<DragPoint | null>(null);
  const cropRectRef = useRef<CropRect | null>(null);

  const [tool, setTool] = useState<ImageEditTool>('crop');
  const [strokeColor, setStrokeColor] = useState('#f97316');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokePattern, setStrokePattern] = useState<StrokePattern>('solid');
  const [textValue, setTextValue] = useState('Ghi chú');
  const [textSize, setTextSize] = useState(28);
  const [pendingTextPoint, setPendingTextPoint] = useState<DragPoint | null>(null);
  const [assetStamp, setAssetStamp] = useState<AssetStamp>('pole-4m');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState('');
  const [undoStack, setUndoStack] = useState<ImageEditSnapshot[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [canvasDisplaySize, setCanvasDisplaySize] = useState<{ width: number; height: number } | null>(null);

  const updateCanvasDisplaySize = (size = canvasSize) => {
    const container = containerRef.current;
    if (!container || !size || size.width <= 0 || size.height <= 0) return;

    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;
    const scale = Math.min(availableWidth / size.width, availableHeight / size.height);
    setCanvasDisplaySize({
      width: Math.max(1, Math.floor(size.width * scale)),
      height: Math.max(1, Math.floor(size.height * scale)),
    });
  };

  const setBitmapSize = (width: number, height: number) => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (bgCanvas) {
      bgCanvas.width = width;
      bgCanvas.height = height;
    }
    if (annCanvas) {
      annCanvas.width = width;
      annCanvas.height = height;
    }
    const nextSize = { width, height };
    setCanvasSize(nextSize);
    requestAnimationFrame(() => updateCanvasDisplaySize(nextSize));
  };

  const pushUndoSnapshot = () => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (!bgCanvas || !annCanvas) return;

    const snapshot: ImageEditSnapshot = {
      bgDataUrl: bgCanvas.toDataURL('image/png'),
      annotationDataUrl: annCanvas.toDataURL('image/png'),
      textAnnotations: [...textAnnotations],
      canvasWidth: bgCanvas.width,
      canvasHeight: bgCanvas.height
    };
    setUndoStack(prev => [...prev, snapshot].slice(-20));
  };

  const undoLastEdit = () => {
    setUndoStack(prev => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;

      setBitmapSize(snapshot.canvasWidth, snapshot.canvasHeight);

      const bgCanvas = bgCanvasRef.current;
      const annCanvas = annotationCanvasRef.current;
      const bgCtx = bgCanvas?.getContext('2d');
      const annCtx = annCanvas?.getContext('2d');

      if (bgCanvas && bgCtx) {
        const bgImg = new Image();
        bgImg.onload = () => {
          bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
          bgCtx.drawImage(bgImg, 0, 0);
        };
        bgImg.src = snapshot.bgDataUrl;
      }

      if (annCanvas && annCtx) {
        const annImg = new Image();
        annImg.onload = () => {
          annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
          annCtx.drawImage(annImg, 0, 0);
        };
        annImg.src = snapshot.annotationDataUrl;
      }

      setTextAnnotations(snapshot.textAnnotations);
      setCropRect(null);
      cropRectRef.current = null;
      setCropPreviewUrl('');
      return prev.slice(0, -1);
    });
  };

  // Initialize canvas with imageUrl
  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');

    if (!bgCanvas || !bgCtx || !annCanvas || !annCtx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || 1280;
      const h = img.naturalHeight || 720;
      setBitmapSize(w, h);
      bgCtx.clearRect(0, 0, w, h);
      bgCtx.drawImage(img, 0, 0, w, h);

      annCtx.clearRect(0, 0, w, h);
      setCropRect(null);
      cropRectRef.current = null;
      setCropPreviewUrl('');
      setUndoStack([]);
      setTextAnnotations([]);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // ResizeObserver for canvas display size
  useEffect(() => {
    updateCanvasDisplaySize();
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => updateCanvasDisplaySize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver(() => updateCanvasDisplaySize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasSize]);

  // Hotkeys handling (only when focused outside inputs)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableInputTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastEdit();
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const toolMap: Partial<Record<string, ImageEditTool>> = {
          l: 'line',
          t: 'text',
          c: 'circle',
          r: 'square',
          b: 'pencil',
          e: 'eraser'
        };
        const nextTool = toolMap[event.key.toLowerCase()];
        if (nextTool) {
          event.preventDefault();
          setTool(nextTool);
          setPendingTextPoint(null);
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (cropRect) {
          setCropRect(null);
          cropRectRef.current = null;
          setCropPreviewUrl('');
          return;
        }
        if (tool !== 'crop') {
          setTool('crop');
          setPendingTextPoint(null);
          return;
        }
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropRect, tool, onCancel]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): DragPoint => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const drawCropGuide = (rect: CropRect) => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    if (!annCanvas || !ctx) return;
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, strokeWidth);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  };

  const updateCropPreview = (rect: CropRect) => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (!bgCanvas || !annCanvas || rect.width < 2 || rect.height < 2) {
      setCropPreviewUrl('');
      return;
    }

    const temp = document.createElement('canvas');
    temp.width = Math.max(1, Math.floor(rect.width));
    temp.height = Math.max(1, Math.floor(rect.height));
    const tempCtx = temp.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(bgCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, temp.width, temp.height);
      tempCtx.drawImage(annCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, temp.width, temp.height);
      setCropPreviewUrl(temp.toDataURL('image/png'));
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    if (!annCanvas || !ctx) return;

    const point = getCanvasPoint(event, annCanvas);
    dragStartRef.current = point;
    lastPencilPointRef.current = point;

    // Capture snapshot of annotation canvas for live shape preview
    snapshotRef.current = ctx.getImageData(0, 0, annCanvas.width, annCanvas.height);

    if (tool === 'text') {
      setPendingTextPoint(point);
      dragStartRef.current = null;
      snapshotRef.current = null;
    } else if (tool === 'stamp') {
      pushUndoSnapshot();
      drawAssetStamp(ctx, point, assetStamp, strokeColor, strokeWidth);
      dragStartRef.current = null;
      snapshotRef.current = null;
    } else if (tool === 'pencil' || tool === 'eraser') {
      pushUndoSnapshot();
      ctx.save();
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = strokeWidth * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        applyStrokePattern(ctx, strokePattern, strokeWidth);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
    } else if (tool !== 'crop') {
      pushUndoSnapshot();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    const start = dragStartRef.current;
    const snapshot = snapshotRef.current;
    if (!annCanvas || !ctx || !start || tool === 'text' || tool === 'stamp') return;

    const point = getCanvasPoint(event, annCanvas);

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.save();
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = strokeWidth * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        applyStrokePattern(ctx, strokePattern, strokeWidth);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const lastPoint = lastPencilPointRef.current || start;
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
      lastPencilPointRef.current = point;
      return;
    }

    if (!snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    applyStrokePattern(ctx, strokePattern, strokeWidth);

    if (tool === 'crop') {
      const rect = normalizeCropRect(start, point);
      cropRectRef.current = rect;
      setCropRect(rect);
      drawCropGuide(rect);
      updateCropPreview(rect);
    } else if (tool === 'line') {
      drawPatternedLine(ctx, start, point, strokeWidth, strokePattern);
    } else if (tool === 'arrow') {
      drawPatternedLine(ctx, start, point, strokeWidth, strokePattern);
      ctx.setLineDash([]);
      drawArrowHead(ctx, start, point, strokeWidth);
    } else if (tool === 'circle') {
      const rect = normalizeCropRect(start, point);
      ctx.beginPath();
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(1, rect.width / 2), Math.max(1, rect.height / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'square') {
      const rect = normalizeCropRect(start, point);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    ctx.restore();
  };

  const handlePointerUp = () => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    const snapshot = snapshotRef.current;
    if (tool === 'crop' && annCanvas && ctx && snapshot) {
      ctx.putImageData(snapshot, 0, 0);
      if (cropRectRef.current) drawCropGuide(cropRectRef.current);
    }
    dragStartRef.current = null;
    lastPencilPointRef.current = null;
    snapshotRef.current = null;
  };

  const rotateCanvas = () => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');
    if (!bgCanvas || !bgCtx || !annCanvas || !annCtx) return;

    pushUndoSnapshot();

    // Rotate Base Canvas
    const bgSource = document.createElement('canvas');
    bgSource.width = bgCanvas.width;
    bgSource.height = bgCanvas.height;
    bgSource.getContext('2d')?.drawImage(bgCanvas, 0, 0);

    // Rotate Annotation Canvas
    const annSource = document.createElement('canvas');
    annSource.width = annCanvas.width;
    annSource.height = annCanvas.height;
    annSource.getContext('2d')?.drawImage(annCanvas, 0, 0);

    const newW = bgCanvas.height;
    const newH = bgCanvas.width;
    setBitmapSize(newW, newH);

    bgCtx.save();
    bgCtx.translate(newW / 2, newH / 2);
    bgCtx.rotate(Math.PI / 2);
    bgCtx.drawImage(bgSource, -bgSource.width / 2, -bgSource.height / 2);
    bgCtx.restore();

    annCtx.save();
    annCtx.translate(newW / 2, newH / 2);
    annCtx.rotate(Math.PI / 2);
    annCtx.drawImage(annSource, -annSource.width / 2, -annSource.height / 2);
    annCtx.restore();

    setCropRect(null);
  };

  const applyCrop = () => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');

    if (!bgCanvas || !bgCtx || !annCanvas || !annCtx || !cropRect || cropRect.width < 2 || cropRect.height < 2) return;

    pushUndoSnapshot();

    const w = cropRect.width;
    const h = cropRect.height;

    const bgSource = document.createElement('canvas');
    bgSource.width = w;
    bgSource.height = h;
    bgSource.getContext('2d')?.drawImage(bgCanvas, cropRect.x, cropRect.y, w, h, 0, 0, w, h);

    const annSource = document.createElement('canvas');
    annSource.width = w;
    annSource.height = h;
    annSource.getContext('2d')?.drawImage(annCanvas, cropRect.x, cropRect.y, w, h, 0, 0, w, h);

    setBitmapSize(w, h);

    bgCtx.clearRect(0, 0, w, h);
    bgCtx.drawImage(bgSource, 0, 0);

    annCtx.clearRect(0, 0, w, h);
    annCtx.drawImage(annSource, 0, 0);

    setCropRect(null);
    cropRectRef.current = null;
    setCropPreviewUrl('');
  };

  const applyPendingText = () => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    if (!annCanvas || !ctx || !pendingTextPoint) return;

    pushUndoSnapshot();
    const renderedText = textValue.trim() || 'Text';

    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `bold ${textSize}px sans-serif`;
    ctx.fillText(renderedText, pendingTextPoint.x, pendingTextPoint.y);
    ctx.restore();

    setTextAnnotations(prev => [...prev, renderedText]);
    setPendingTextPoint(null);
  };

  const handleSavePhoto = async () => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (!bgCanvas || !annCanvas) return;

    setIsSaving(true);
    try {
      const composite = document.createElement('canvas');
      composite.width = bgCanvas.width;
      composite.height = bgCanvas.height;
      const compCtx = composite.getContext('2d');
      if (compCtx) {
        compCtx.drawImage(bgCanvas, 0, 0);
        compCtx.drawImage(annCanvas, 0, 0);
      }
      const dataUrl = composite.toDataURL('image/png');
      await onSave({
        dataUrl,
        textAnnotations,
      });
    } catch (err) {
      console.error('[ImageEditorModal] Failed to save photo:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const toolButtonClass = (candidate: ImageEditTool) =>
    cn(
      "p-2 rounded border text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1",
      tool === candidate ? "bg-cad-accent border-cad-accent text-black" : "bg-cad-bg border-cad-border text-cad-text-secondary hover:text-cad-text-primary"
    );

  return createPortal(
    <div className="fixed inset-0 z-cad-modal bg-black/90 backdrop-blur-sm flex flex-col">
      <div className="h-full w-full bg-cad-surface border border-cad-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-cad-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
            <Pencil className="w-4 h-4 text-cad-accent" /> {title}
          </div>
          <Button variant="ghost" size="md" icon={X} ariaLabel="Close editor" onClick={onCancel} />
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-cad-border flex flex-wrap items-center gap-3 shrink-0 bg-cad-surface">
          <button aria-label="Crop tool" title="Crop tool (Select region)" onClick={() => setTool('crop')} className={toolButtonClass('crop')}>
            <Crop className="w-4 h-4" />
          </button>
          <button aria-label="Pencil tool (B)" title="Pencil tool - Bút vẽ tự do (B)" onClick={() => setTool('pencil')} className={toolButtonClass('pencil')}>
            <Pencil className="w-4 h-4" />
          </button>
          <button aria-label="Eraser tool (E)" title="Eraser tool - Tẩy xóa (E)" onClick={() => setTool('eraser')} className={toolButtonClass('eraser')}>
            <Eraser className="w-4 h-4" />
          </button>
          <button aria-label="Line tool (L)" title="Line tool - Đường thẳng (L)" onClick={() => setTool('line')} className={toolButtonClass('line')}>
            <Minus className="w-4 h-4" />
          </button>
          <button aria-label="Arrow tool" title="Arrow tool - Mũi tên" onClick={() => setTool('arrow')} className={toolButtonClass('arrow')}>
            <MoveUpRight className="w-4 h-4" />
          </button>
          <button aria-label="Circle tool (C)" title="Circle tool - Hình tròn (C)" onClick={() => setTool('circle')} className={toolButtonClass('circle')}>
            <Circle className="w-4 h-4" />
          </button>
          <button aria-label="Square tool (R)" title="Square tool - Hình vuông/chữ nhật (R)" onClick={() => setTool('square')} className={toolButtonClass('square')}>
            <Square className="w-4 h-4" />
          </button>
          <button aria-label="Text tool (T)" title="Text tool - Chữ ghi chú (T)" onClick={() => setTool('text')} className={toolButtonClass('text')}>
            <TypeIcon className="w-4 h-4" />
          </button>
          <button aria-label="Stamp tool" title="Stamp tool - Dán tem CAD" onClick={() => setTool('stamp')} className={toolButtonClass('stamp')}>
            <Radio className="w-4 h-4" />
          </button>

          <button aria-label="Rotate 90 deg" onClick={rotateCanvas} title="Rotate 90 deg clockwise" className="p-2 rounded bg-cad-bg border border-cad-border text-cad-text-secondary hover:text-cad-text-primary">
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            onClick={undoLastEdit}
            disabled={undoStack.length === 0}
            className="p-2 rounded bg-cad-bg border border-cad-border text-cad-text-secondary hover:text-cad-text-primary disabled:opacity-40 disabled:hover:text-cad-text-secondary"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={applyCrop}
            disabled={!cropRect}
            className="px-3 py-2 rounded bg-cad-accent/30 border border-cad-accent/50 text-[10px] font-black uppercase text-cad-accent hover:bg-cad-accent/50 disabled:opacity-40"
          >
            Apply crop
          </button>

          <div className="h-6 w-px bg-cad-border mx-1" />

          {/* Stroke pattern & width */}
          <select
            aria-label="Stroke pattern"
            value={strokePattern}
            onChange={e => setStrokePattern(e.target.value as StrokePattern)}
            className="bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary outline-none"
          >
            <option value="solid">Nét liền</option>
            <option value="dashed">Nét đứt</option>
            <option value="dashdot">Chấm gạch</option>
            <option value="dotted">Nét chấm</option>
            <option value="zigzag">Zigzag</option>
          </select>

          {/* Quick Swatches */}
          <div className="flex items-center gap-1 bg-cad-bg border border-cad-border p-1 rounded">
            {QUICK_SWATCHES.map((swatch) => (
              <button
                key={swatch.color}
                onClick={() => setStrokeColor(swatch.color)}
                title={swatch.label}
                className={cn(
                  "w-5 h-5 rounded-full border border-black/40 transition-transform flex items-center justify-center",
                  strokeColor === swatch.color ? "scale-110 ring-2 ring-cad-accent" : "hover:scale-105"
                )}
                style={{ backgroundColor: swatch.color }}
              >
                {strokeColor === swatch.color && (
                  <Check className={cn("w-3 h-3", swatch.color === '#ffffff' ? "text-black" : "text-white")} />
                )}
              </button>
            ))}
            <input
              aria-label="Custom Stroke color"
              title="Màu tùy chỉnh"
              type="color"
              value={strokeColor}
              onChange={e => setStrokeColor(e.target.value)}
              className="h-5 w-6 bg-transparent cursor-pointer rounded overflow-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] text-cad-text-secondary font-mono">W: {strokeWidth}px</span>
            <input
              aria-label="Stroke width"
              type="range"
              min={1}
              max={18}
              value={strokeWidth}
              onChange={e => setStrokeWidth(Number(e.target.value))}
              className="w-20 accent-cad-accent cursor-pointer"
            />
          </div>

          <select
            aria-label="Asset stamp"
            value={assetStamp}
            onChange={e => setAssetStamp(e.target.value as AssetStamp)}
            className={cn(
              "bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary outline-none",
              tool === 'stamp' ? "opacity-100" : "opacity-60"
            )}
          >
              <option value="pole-4m">Cột 6m tay vươn 4m</option>
              <option value="pole-6m">Cột 6m tay vươn 6m</option>
              <option value="pole-8m">Cột 6m tay vươn 8m</option>
              <option value="cabinet-300x520">Tủ 300x520</option>
              <option value="camera-sim">Camera mô phỏng</option>
          </select>

          {/* Text Controls */}
          <div className="flex items-center gap-2">
            <input
              aria-label="Text size"
              type="number"
              min={10}
              max={120}
              value={textSize}
              onChange={e => setTextSize(Number(e.target.value))}
              className="w-16 bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary outline-none"
              placeholder="Size"
            />
            <input
              aria-label="Text value"
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              className="min-w-32 flex-1 bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary outline-none"
              placeholder="Nội dung ghi chú..."
            />
            <Button
              variant="primary"
              size="md"
              onClick={applyPendingText}
              disabled={!pendingTextPoint}
              className="uppercase"
            >
              OK text
            </Button>
          </div>
        </div>

        {/* Canvas Display Viewport */}
        <div ref={containerRef} className="relative flex-1 min-h-0 bg-cad-bg p-4 overflow-hidden flex items-center justify-center">
          <div
            className="relative border border-cad-border rounded bg-black overflow-hidden"
            style={{
              width: canvasDisplaySize ? `${canvasDisplaySize.width}px` : 'auto',
              height: canvasDisplaySize ? `${canvasDisplaySize.height}px` : 'auto',
            }}
          >
            {/* Base Image Layer */}
            <canvas
              ref={bgCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {/* Annotation Drawing Layer */}
            <canvas
              ref={annotationCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            />
          </div>

          {/* Inline Text Input Preview Overlay */}
          {pendingTextPoint && canvasDisplaySize && canvasSize && (
            <input
              aria-label="Text preview"
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyPendingText();
                }
              }}
              className="absolute min-w-24 max-w-[420px] bg-white/95 text-black border-2 border-cad-accent rounded px-2 py-1 font-bold shadow-lg outline-none"
              style={{
                left: `calc(50% - ${canvasDisplaySize.width / 2}px + ${(pendingTextPoint.x / canvasSize.width) * canvasDisplaySize.width}px)`,
                top: `calc(50% - ${canvasDisplaySize.height / 2}px + ${(pendingTextPoint.y / canvasSize.height) * canvasDisplaySize.height}px)`,
                fontSize: `${Math.max(10, textSize * (canvasDisplaySize.width / canvasSize.width))}px`,
                lineHeight: 1.15,
                width: `${Math.max(96, Math.min(420, (textValue.length || 1) * Math.max(10, textSize * (canvasDisplaySize.width / canvasSize.width)) * 0.72 + 24))}px`,
                color: strokeColor,
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          )}

          {/* Crop Preview Box */}
          {cropRect && cropPreviewUrl && (
            <div className="absolute right-6 top-6 w-64 rounded-lg border border-cad-accent bg-cad-surface/95 p-2 shadow-2xl z-20">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-cad-accent">Crop preview</div>
              <img src={cropPreviewUrl} alt="Crop preview" className="max-h-48 w-full rounded border border-cad-border object-contain bg-black" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cad-border flex justify-end gap-3 shrink-0 bg-cad-surface">
          <Button variant="secondary" size="lg" onClick={onCancel} className="uppercase">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSavePhoto}
            disabled={isSaving}
            loading={isSaving}
            className="uppercase"
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
