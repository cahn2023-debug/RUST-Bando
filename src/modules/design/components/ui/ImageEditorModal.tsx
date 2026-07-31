import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Pencil, Crop, RotateCw, Circle, Square, Type as TypeIcon, Minus, MoveUpRight,
  Undo2, Radio, Eraser, X, Check, RotateCcw
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

interface RotationPreviewSource {
  bgCanvas: HTMLCanvasElement;
  annotationCanvas: HTMLCanvasElement;
}

/**
 * Annotation ink colors. These are paint values written onto the annotation canvas
 * and burned into the exported PNG, so they must stay literal hexes regardless of
 * app theme — see MASTER.md §2. Module scope keeps the array identity stable.
 */
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
  const cropOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const snapshotRef = useRef<ImageData | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
  const pendingTextPointRef = useRef<DragPoint | null>(null);
  const lastCanvasPointRef = useRef<DragPoint | null>(null);
  const lastPencilPointRef = useRef<DragPoint | null>(null);
  const cropRectRef = useRef<CropRect | null>(null);
  const rotationPreviewSourceRef = useRef<RotationPreviewSource | null>(null);
  /** Initial focus target: the crop tool, a safe non-destructive control. */
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  const [tool, setTool] = useState<ImageEditTool>('crop');
  const [strokeColor, setStrokeColor] = useState('#f97316');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokePattern, setStrokePattern] = useState<StrokePattern>('solid');
  const [textValue, setTextValue] = useState('Ghi chú');
  const [textSize, setTextSize] = useState(28);
  const [pendingTextPoint, setPendingTextPoint] = useState<DragPoint | null>(null);
  const [assetStamp, setAssetStamp] = useState<AssetStamp>('pole-4m');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropRotation, setCropRotation] = useState(0);
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
    const cropOverlayCanvas = cropOverlayCanvasRef.current;
    if (bgCanvas) {
      bgCanvas.width = width;
      bgCanvas.height = height;
    }
    if (annCanvas) {
      annCanvas.width = width;
      annCanvas.height = height;
    }
    if (cropOverlayCanvas) {
      cropOverlayCanvas.width = width;
      cropOverlayCanvas.height = height;
    }
    const nextSize = { width, height };
    setCanvasSize(nextSize);
    requestAnimationFrame(() => updateCanvasDisplaySize(nextSize));
  };

  const clearCropGuide = () => {
    const cropOverlayCanvas = cropOverlayCanvasRef.current;
    const ctx = cropOverlayCanvas?.getContext('2d');
    if (!cropOverlayCanvas || !ctx) return;
    ctx.clearRect(0, 0, cropOverlayCanvas.width, cropOverlayCanvas.height);
  };

  const resetCropSelection = () => {
    setCropRect(null);
    cropRectRef.current = null;
    setCropPreviewUrl('');
    clearCropGuide();
  };

  const copyCanvas = (source: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d')?.drawImage(source, 0, 0);
    return copy;
  };

  const drawRotatedSources = (
    bgSource: HTMLCanvasElement,
    annSource: HTMLCanvasElement,
    angleDegrees: number
  ) => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');
    if (!bgCanvas || !bgCtx || !annCanvas || !annCtx) return;

    const angleRadians = (angleDegrees * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(angleRadians));
    const absSin = Math.abs(Math.sin(angleRadians));
    const newW = Math.max(1, Math.ceil(bgSource.width * absCos + bgSource.height * absSin));
    const newH = Math.max(1, Math.ceil(bgSource.width * absSin + bgSource.height * absCos));
    setBitmapSize(newW, newH);

    bgCtx.clearRect(0, 0, newW, newH);
    bgCtx.save();
    bgCtx.translate(newW / 2, newH / 2);
    bgCtx.rotate(angleRadians);
    bgCtx.drawImage(bgSource, -bgSource.width / 2, -bgSource.height / 2);
    bgCtx.restore();

    annCtx.clearRect(0, 0, newW, newH);
    annCtx.save();
    annCtx.translate(newW / 2, newH / 2);
    annCtx.rotate(angleRadians);
    annCtx.drawImage(annSource, -annSource.width / 2, -annSource.height / 2);
    annCtx.restore();
  };

  const restoreRotationPreviewSource = () => {
    const source = rotationPreviewSourceRef.current;
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');
    if (!source || !bgCanvas || !bgCtx || !annCanvas || !annCtx) return;

    setBitmapSize(source.bgCanvas.width, source.bgCanvas.height);
    bgCtx.clearRect(0, 0, source.bgCanvas.width, source.bgCanvas.height);
    bgCtx.drawImage(source.bgCanvas, 0, 0);
    annCtx.clearRect(0, 0, source.annotationCanvas.width, source.annotationCanvas.height);
    annCtx.drawImage(source.annotationCanvas, 0, 0);
  };

  const clearRotationPreviewSource = () => {
    rotationPreviewSourceRef.current = null;
  };

  const commitRotationPreviewSourceToUndo = () => {
    const source = rotationPreviewSourceRef.current;
    if (!source) return false;

    const snapshot: ImageEditSnapshot = {
      bgDataUrl: source.bgCanvas.toDataURL('image/png'),
      annotationDataUrl: source.annotationCanvas.toDataURL('image/png'),
      textAnnotations: [...textAnnotations],
      canvasWidth: source.bgCanvas.width,
      canvasHeight: source.bgCanvas.height
    };
    setUndoStack(prev => [...prev, snapshot].slice(-20));
    clearRotationPreviewSource();
    return true;
  };

  const updateCropRotation = (nextRotation: number) => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (!bgCanvas || !annCanvas) return;

    const clampedRotation = Math.max(-45, Math.min(45, nextRotation));
    resetCropSelection();

    if (clampedRotation === 0) {
      restoreRotationPreviewSource();
      clearRotationPreviewSource();
      setCropRotation(0);
      return;
    }

    if (!rotationPreviewSourceRef.current) {
      rotationPreviewSourceRef.current = {
        bgCanvas: copyCanvas(bgCanvas),
        annotationCanvas: copyCanvas(annCanvas),
      };
    }

    const source = rotationPreviewSourceRef.current;
    drawRotatedSources(source.bgCanvas, source.annotationCanvas, clampedRotation);
    setCropRotation(clampedRotation);
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
      resetCropSelection();
      clearRotationPreviewSource();
      setCropRotation(0);
      return prev.slice(0, -1);
    });
  };

  // Move focus into the dialog on mount so keyboard users are not left on the
  // invoking control behind the scrim (MASTER.md §7). Escape handling lives in the
  // hotkey effect below, which already implements the layered cancel behaviour.
  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

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
      resetCropSelection();
      clearRotationPreviewSource();
      setCropRotation(0);
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
          selectTool(nextTool);
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (cropRect) {
          resetCropSelection();
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

  useEffect(() => {
    if (tool !== 'crop') resetCropSelection();
  }, [tool]);

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
    const cropOverlayCanvas = cropOverlayCanvasRef.current;
    const ctx = cropOverlayCanvas?.getContext('2d');
    if (!cropOverlayCanvas || !ctx) return;
    ctx.clearRect(0, 0, cropOverlayCanvas.width, cropOverlayCanvas.height);
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
    lastCanvasPointRef.current = point;
    dragStartRef.current = point;
    lastPencilPointRef.current = point;

    // Capture snapshot of annotation canvas for live shape preview
    snapshotRef.current = ctx.getImageData(0, 0, annCanvas.width, annCanvas.height);

    if (tool === 'text') {
      pendingTextPointRef.current = point;
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

  const rotateCanvasByAngle = (angleDegrees: number) => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const annCtx = annCanvas?.getContext('2d');
    if (!bgCanvas || !bgCtx || !annCanvas || !annCtx) return;

    const angleRadians = (angleDegrees * Math.PI) / 180;
    if (Math.abs(angleRadians) < 0.0001) return;

    pushUndoSnapshot();

    const bgSource = document.createElement('canvas');
    bgSource.width = bgCanvas.width;
    bgSource.height = bgCanvas.height;
    bgSource.getContext('2d')?.drawImage(bgCanvas, 0, 0);

    const annSource = document.createElement('canvas');
    annSource.width = annCanvas.width;
    annSource.height = annCanvas.height;
    annSource.getContext('2d')?.drawImage(annCanvas, 0, 0);

    const absCos = Math.abs(Math.cos(angleRadians));
    const absSin = Math.abs(Math.sin(angleRadians));
    const newW = Math.max(1, Math.ceil(bgCanvas.width * absCos + bgCanvas.height * absSin));
    const newH = Math.max(1, Math.ceil(bgCanvas.width * absSin + bgCanvas.height * absCos));
    setBitmapSize(newW, newH);

    bgCtx.clearRect(0, 0, newW, newH);
    bgCtx.save();
    bgCtx.translate(newW / 2, newH / 2);
    bgCtx.rotate(angleRadians);
    bgCtx.drawImage(bgSource, -bgSource.width / 2, -bgSource.height / 2);
    bgCtx.restore();

    annCtx.clearRect(0, 0, newW, newH);
    annCtx.save();
    annCtx.translate(newW / 2, newH / 2);
    annCtx.rotate(angleRadians);
    annCtx.drawImage(annSource, -annSource.width / 2, -annSource.height / 2);
    annCtx.restore();

    resetCropSelection();
    setCropRotation(0);
  };

  const applyCropRotation = () => {
    if (cropRotation === 0) return;
    if (commitRotationPreviewSourceToUndo()) {
      resetCropSelection();
      setCropRotation(0);
      return;
    }
    rotateCanvasByAngle(cropRotation);
  };

  const rotateCanvas = () => {
    if (rotationPreviewSourceRef.current) {
      commitRotationPreviewSourceToUndo();
      setCropRotation(0);
    }
    rotateCanvasByAngle(90);
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

    resetCropSelection();
    clearRotationPreviewSource();
    setCropRotation(0);
  };

  const applyPendingText = () => {
    const annCanvas = annotationCanvasRef.current;
    const ctx = annCanvas?.getContext('2d');
    const point = pendingTextPointRef.current || pendingTextPoint || lastCanvasPointRef.current || (
      annCanvas ? { x: annCanvas.width / 2, y: annCanvas.height / 2 } : null
    );
    if (!annCanvas || !ctx || !point) return;

    pushUndoSnapshot();
    const renderedText = textValue.trim() || 'Text';

    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `bold ${textSize}px sans-serif`;
    ctx.fillText(renderedText, point.x, point.y);
    ctx.restore();

    setTextAnnotations(prev => [...prev, renderedText]);
    pendingTextPointRef.current = null;
    setPendingTextPoint(null);
  };

  const handleSavePhoto = async () => {
    const bgCanvas = bgCanvasRef.current;
    const annCanvas = annotationCanvasRef.current;
    if (!bgCanvas || !annCanvas) return;

    setIsSaving(true);
    try {
      clearCropGuide();
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
      "p-2 rounded border text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer",
      "focus-visible:ring-2 focus-visible:ring-cad-accent focus-visible:ring-offset-1 focus-visible:ring-offset-cad-surface",
      tool === candidate ? "bg-cad-accent border-cad-accent text-black" : "bg-cad-bg border-cad-border text-cad-text-secondary hover:text-cad-text-primary"
    );

  const selectTool = (nextTool: ImageEditTool) => {
    if (nextTool !== 'crop') {
      if (rotationPreviewSourceRef.current) {
        commitRotationPreviewSourceToUndo();
        setCropRotation(0);
      }
      resetCropSelection();
    }
    setTool(nextTool);
    pendingTextPointRef.current = null;
    setPendingTextPoint(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-cad-modal bg-black/90 backdrop-blur-sm flex flex-col">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-editor-title"
        className="h-full w-full bg-cad-surface border border-cad-border shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-cad-border flex items-center justify-between shrink-0">
          <div
            id="image-editor-title"
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cad-text-primary"
          >
            <Pencil className="w-4 h-4 text-cad-accent" aria-hidden="true" /> {title}
          </div>
          <Button variant="ghost" size="md" icon={X} ariaLabel="Đóng trình chỉnh sửa ảnh" onClick={onCancel} />
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-cad-border flex flex-wrap items-center gap-3 shrink-0 bg-cad-surface">
          <button ref={initialFocusRef} type="button" aria-label="Công cụ cắt ảnh" aria-pressed={tool === 'crop'} title="Crop tool (Select region)" onClick={() => selectTool('crop')} className={toolButtonClass('crop')}>
            <Crop className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Bút vẽ tự do (B)" aria-pressed={tool === 'pencil'} title="Pencil tool - Bút vẽ tự do (B)" onClick={() => selectTool('pencil')} className={toolButtonClass('pencil')}>
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Tẩy xóa (E)" aria-pressed={tool === 'eraser'} title="Eraser tool - Tẩy xóa (E)" onClick={() => selectTool('eraser')} className={toolButtonClass('eraser')}>
            <Eraser className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Line tool (L)" aria-pressed={tool === 'line'} title="Line tool - Đường thẳng (L)" onClick={() => selectTool('line')} className={toolButtonClass('line')}>
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Arrow tool" aria-pressed={tool === 'arrow'} title="Arrow tool - Mũi tên" onClick={() => selectTool('arrow')} className={toolButtonClass('arrow')}>
            <MoveUpRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Circle tool (C)" aria-pressed={tool === 'circle'} title="Circle tool - Hình tròn (C)" onClick={() => selectTool('circle')} className={toolButtonClass('circle')}>
            <Circle className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Square tool (R)" aria-pressed={tool === 'square'} title="Square tool - Hình vuông/chữ nhật (R)" onClick={() => selectTool('square')} className={toolButtonClass('square')}>
            <Square className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Text tool (T)" aria-pressed={tool === 'text'} title="Text tool - Chữ ghi chú (T)" onClick={() => selectTool('text')} className={toolButtonClass('text')}>
            <TypeIcon className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Stamp tool" aria-pressed={tool === 'stamp'} title="Stamp tool - Dán tem CAD" onClick={() => selectTool('stamp')} className={toolButtonClass('stamp')}>
            <Radio className="w-4 h-4" aria-hidden="true" />
          </button>

          <Button variant="secondary" size="md" icon={RotateCw} ariaLabel="Xoay 90 độ theo chiều kim đồng hồ" title="Rotate 90 deg clockwise" onClick={rotateCanvas} />
          <Button
            variant="secondary"
            size="md"
            icon={Undo2}
            ariaLabel="Undo"
            title="Undo (Ctrl+Z)"
            onClick={undoLastEdit}
            disabled={undoStack.length === 0}
          />

          <Button
            variant="accent"
            size="md"
            onClick={applyCrop}
            disabled={!cropRect}
            className="uppercase"
          >
            Apply crop
          </Button>

          {tool === 'crop' && (
            <div className="flex items-center gap-2 rounded border border-cad-border bg-cad-bg px-2 py-1">
              <span className="text-[9px] font-mono text-cad-text-secondary">ROT</span>
              <input
                aria-label="Crop rotation angle"
                type="range"
                min={-45}
                max={45}
                step={0.1}
                value={cropRotation}
                onChange={e => updateCropRotation(Number(e.target.value))}
                className="w-28 accent-cad-accent cursor-pointer"
              />
              <input
                aria-label="Crop rotation degrees"
                type="number"
                min={-45}
                max={45}
                step={0.1}
                value={cropRotation}
                onChange={e => updateCropRotation(Number(e.target.value) || 0)}
                className="w-16 bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs text-cad-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
              />
              <Button
                variant="secondary"
                size="md"
                icon={RotateCcw}
                ariaLabel="Reset crop rotation"
                title="Reset crop rotation"
                onClick={() => updateCropRotation(0)}
                disabled={cropRotation === 0}
              />
              <Button
                variant="secondary"
                size="md"
                icon={RotateCw}
                ariaLabel="Apply crop rotation"
                title="Apply crop rotation"
                onClick={applyCropRotation}
                disabled={cropRotation === 0}
              />
            </div>
          )}

          <div className="h-6 w-px bg-cad-border mx-1" />

          {/* Stroke pattern & width */}
          <select
            aria-label="Stroke pattern"
            value={strokePattern}
            onChange={e => setStrokePattern(e.target.value as StrokePattern)}
            className="bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
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
                type="button"
                onClick={() => setStrokeColor(swatch.color)}
                title={swatch.label}
                aria-label={`Màu nét vẽ: ${swatch.label}`}
                aria-pressed={strokeColor === swatch.color}
                className={cn(
                  "w-5 h-5 cursor-pointer rounded-full border border-black/40 transition-transform flex items-center justify-center",
                  "focus-visible:ring-2 focus-visible:ring-cad-accent focus-visible:ring-offset-1 focus-visible:ring-offset-cad-bg",
                  strokeColor === swatch.color ? "scale-110 ring-2 ring-cad-accent" : "hover:scale-105"
                )}
                style={{ backgroundColor: swatch.color }}
              >
                {strokeColor === swatch.color && (
                  <Check
                    aria-hidden="true"
                    className={cn("w-3 h-3", swatch.color === '#ffffff' ? "text-black" : "text-white")}
                  />
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
              "bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent",
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
              className="w-16 bg-cad-bg border border-cad-border rounded px-2 py-1.5 text-xs text-cad-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
              placeholder="Size"
            />
            <input
              aria-label="Text value"
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              className="min-w-32 flex-1 bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-xs text-cad-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
              placeholder="Nội dung ghi chú..."
            />
            <Button
              variant="primary"
              size="md"
              onClick={applyPendingText}
              className="uppercase"
            >
              OK text
            </Button>
          </div>
        </div>

        {/* Canvas Display Viewport */}
        <div ref={containerRef} className="relative flex-1 min-h-0 bg-cad-bg p-4 overflow-hidden flex items-center justify-center">
          <div
            data-testid="image-editor-canvas-frame"
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
            {/* Crop guide overlay: visual only, never exported. */}
            <canvas
              ref={cropOverlayCanvasRef}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full pointer-events-none"
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
              className="absolute min-w-24 max-w-[420px] bg-white/95 text-black border-2 border-cad-accent rounded px-2 py-1 font-bold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
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
