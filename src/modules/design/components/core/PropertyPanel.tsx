
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import type { FeatureMetadata, FeatureProperties, IconType } from '@CONTRACT/types';
import {
  Save, Camera, MapPin, Route,
  Info, Palette, Settings, Image as ImageIcon,
  Calculator, Phone, User as UserIcon, Loader2, X, Clock, Grid3X3, Sparkles, FileUp, Briefcase,
  Layers, Zap, Radio, Construction, Pencil, Crop, RotateCw, Circle, Square, Type as TypeIcon, Minus, MoveUpRight, Undo2
} from "lucide-react";
import { IconSelector } from '@DESIGN/components/ui/IconSelector';
import { designLogic } from '@TOOL/utils/designLogic';
import { getFeatureDisplayInfo, safeString, getCleanName, isCameraIcon, getParsedMetadata, getPointCoordinates } from '@TOOL/utils/featureUtils';
import { useCamera } from '@IMPLEMENT/hooks/useCamera';
import { importFromExcel, importFromKML, getExcelHeaders, applyImportedRecords } from '@IMPLEMENT/services/importService';
import { safeOpenDialog } from '@IMPLEMENT/lib/tauri';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { cn } from '@TOOL/utils/cn';
import { useProjectData } from '@IMPLEMENT/hooks/useProjectData';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { deleteMediaAsset, importMediaAsset, resolveMediaAsset } from '@IMPLEMENT/services/mediaAssetService';
import { requestStorageHealthRefresh } from '@IMPLEMENT/services/projectStorageService';

import { normalizeMetadataObject } from '@TOOL/utils/metadataNormalization';
import { buildFeaturePropertiesForPersistence, getTypeForIcon } from '@TOOL/utils/featurePersistence';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import { getDeclaredOrderFieldKey, syncDisplayOrderAliases } from '@TOOL/utils/featureMapping';
import { buildToggleOriginEvents } from '@DESIGN/features/map/network/networkTopology';

interface SegmentItem {
  id?: string | number;
  segment_type?: string;
  type?: string;
  length?: number;
  [key: string]: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asStringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;

const asNumberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getMediaAssetIds = (metadata: FeatureMetadata): string[] => {
  const media = asRecord(metadata.media);
  return asStringArray(media?.imageAssetIds);
};

const getLegacyImageUrls = (metadata: FeatureMetadata): string[] => {
  const media = asRecord(metadata.media);
  const urls = asStringArray(media?.imageUrls);
  const single = typeof media?.imageUrl === 'string' ? media.imageUrl : undefined;
  return single && !urls.includes(single) ? [single, ...urls] : urls;
};

const isRenderableImageUrl = (url: string): boolean =>
  url.startsWith('data:image') || /^https?:\/\//i.test(url);

const withMediaAssets = (metadata: FeatureMetadata, assetIds: string[]): FeatureMetadata => {
  const media = asRecord(metadata.media) || {};
  const nextMedia: Record<string, unknown> = {
    ...media,
    imageAssetIds: assetIds,
    primaryImageAssetId: assetIds[0] || undefined,
  };
  return {
    ...metadata,
    media: nextMedia,
  };
};

const getOrderFieldLabel = (metadata: Record<string, unknown>, properties?: FeatureProperties): string =>
  getDeclaredOrderFieldKey(metadata, properties as Record<string, unknown> | undefined) || 'Mã hiệu (STT)';

const isLineGeometry = (geomType?: string | null): boolean => {
  const normalized = safeString(geomType).toLowerCase();
  return normalized === 'linestring' || normalized === 'polyline' || normalized.includes('line');
};

const getFeatureNameById = (
  features: Record<string, { name?: unknown }> | undefined,
  featureId: unknown
): string => {
  if (typeof featureId !== 'string' || !featureId) return '';
  return safeString(features?.[featureId]?.name);
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Clipboard image could not be read as a data URL.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clipboard image.'));
    reader.readAsDataURL(file);
  });

const readClipboardImageDataUrls = async (clipboardData: DataTransfer): Promise<string[]> => {
  const imageFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);

  return Promise.all(imageFiles.map(readFileAsDataUrl));
};

const isEditablePasteTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
};

type ImageEditTool = 'crop' | 'line' | 'arrow' | 'circle' | 'square' | 'text' | 'stamp';
type StrokePattern = 'solid' | 'dashed' | 'dashdot' | 'dotted' | 'zigzag';
type AssetStamp = 'pole-4m' | 'pole-6m' | 'pole-8m' | 'cabinet-300x520' | 'camera-sim';

interface ImageEditorModalProps {
  imageUrl: string;
  imageIndex: number;
  onCancel: () => void;
  onSave: (imageIndex: number, dataUrl: string) => void | Promise<void>;
}

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

const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): DragPoint => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(rect.width, 1);
  const scaleY = canvas.height / Math.max(rect.height, 1);
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

const normalizeCropRect = (start: DragPoint, end: DragPoint): CropRect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

const applyStrokePattern = (ctx: CanvasRenderingContext2D, pattern: StrokePattern, strokeWidth: number) => {
  if (pattern === 'dashed') ctx.setLineDash([strokeWidth * 4, strokeWidth * 3]);
  else if (pattern === 'dashdot') ctx.setLineDash([strokeWidth * 5, strokeWidth * 2, strokeWidth, strokeWidth * 2]);
  else if (pattern === 'dotted') ctx.setLineDash([strokeWidth, strokeWidth * 2.5]);
  else ctx.setLineDash([]);
};

const drawZigzagLine = (ctx: CanvasRenderingContext2D, start: DragPoint, end: DragPoint, strokeWidth: number) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;

  const step = Math.max(12, strokeWidth * 5);
  const amplitude = Math.max(6, strokeWidth * 2.5);
  const normalX = -dy / length;
  const normalY = dx / length;
  const count = Math.max(1, Math.floor(length / step));

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < count; i++) {
    const ratio = i / count;
    const offset = i % 2 === 0 ? -amplitude : amplitude;
    ctx.lineTo(start.x + dx * ratio + normalX * offset, start.y + dy * ratio + normalY * offset);
  }
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
};

const drawPatternedLine = (ctx: CanvasRenderingContext2D, start: DragPoint, end: DragPoint, strokeWidth: number, pattern: StrokePattern) => {
  if (pattern === 'zigzag') {
    drawZigzagLine(ctx, start, end, strokeWidth);
    return;
  }
  applyStrokePattern(ctx, pattern, strokeWidth);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
};

const drawArrowHead = (ctx: CanvasRenderingContext2D, start: DragPoint, end: DragPoint, strokeWidth: number) => {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(14, strokeWidth * 4);

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

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ imageUrl, imageIndex, onCancel, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
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
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [canvasDisplaySize, setCanvasDisplaySize] = useState<{ width: number; height: number } | null>(null);

  const updateCanvasDisplaySize = (size = canvasSize) => {
    const container = canvasContainerRef.current;
    if (!container || !size || size.width <= 0 || size.height <= 0) return;

    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;
    const scale = Math.min(availableWidth / size.width, availableHeight / size.height);
    setCanvasDisplaySize({
      width: Math.max(1, Math.floor(size.width * scale)),
      height: Math.max(1, Math.floor(size.height * scale)),
    });
  };

  const setCanvasBitmapSize = (width: number, height: number) => {
    const nextSize = { width, height };
    setCanvasSize(nextSize);
    requestAnimationFrame(() => updateCanvasDisplaySize(nextSize));
  };

  const restoreCanvasFromDataUrl = (dataUrl: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;
      setCanvasBitmapSize(canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setCropRect(null);
      cropRectRef.current = null;
      setCropPreviewUrl('');
    };
    img.src = dataUrl;
  };

  const pushUndoSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snapshot = canvas.toDataURL('image/png');
    setUndoStack(prev => [...prev, snapshot].slice(-20));
  };

  const undoLastEdit = () => {
    setUndoStack(prev => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      restoreCanvasFromDataUrl(snapshot);
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;
      setCanvasBitmapSize(canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setCropRect(null);
      cropRectRef.current = null;
      setCropPreviewUrl('');
      setUndoStack([]);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    updateCanvasDisplaySize();
    const container = canvasContainerRef.current;
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastEdit();
        return;
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

  const drawCropGuide = (rect: CropRect) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  };

  const updateCropPreview = (rect: CropRect) => {
    const canvas = canvasRef.current;
    if (!canvas || rect.width < 2 || rect.height < 2) {
      setCropPreviewUrl('');
      return;
    }

    const source = document.createElement('canvas');
    source.width = Math.max(1, Math.floor(rect.width));
    source.height = Math.max(1, Math.floor(rect.height));
    source.getContext('2d')?.drawImage(
      canvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      source.width,
      source.height
    );
    setCropPreviewUrl(source.toDataURL('image/png'));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const point = getCanvasPoint(event, canvas);
    dragStartRef.current = point;
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'text') {
      setPendingTextPoint(point);
      dragStartRef.current = null;
      snapshotRef.current = null;
    } else if (tool === 'stamp') {
      pushUndoSnapshot();
      drawAssetStamp(ctx, point, assetStamp, strokeColor, strokeWidth);
      dragStartRef.current = null;
      snapshotRef.current = null;
    } else if (tool !== 'crop') {
      pushUndoSnapshot();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const start = dragStartRef.current;
    const snapshot = snapshotRef.current;
    if (!canvas || !ctx || !start || !snapshot || tool === 'text' || tool === 'stamp') return;

    const point = getCanvasPoint(event, canvas);
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
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'square') {
      const rect = normalizeCropRect(start, point);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    ctx.restore();
  };

  const handlePointerUp = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const snapshot = snapshotRef.current;
    if (tool === 'crop' && canvas && ctx && snapshot) {
      ctx.putImageData(snapshot, 0, 0);
      if (cropRectRef.current) drawCropGuide(cropRectRef.current);
    }
    dragStartRef.current = null;
    snapshotRef.current = null;
  };

  const rotateCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    pushUndoSnapshot();
    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    source.getContext('2d')?.drawImage(canvas, 0, 0);

    canvas.width = source.height;
    canvas.height = source.width;
    setCanvasBitmapSize(canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    ctx.restore();
    setCropRect(null);
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !cropRect || cropRect.width < 2 || cropRect.height < 2) return;

    pushUndoSnapshot();
    const source = document.createElement('canvas');
    source.width = cropRect.width;
    source.height = cropRect.height;
    source.getContext('2d')?.drawImage(
      canvas,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0,
      0,
      cropRect.width,
      cropRect.height
    );

    canvas.width = source.width;
    canvas.height = source.height;
    setCanvasBitmapSize(canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    setCropRect(null);
    cropRectRef.current = null;
    setCropPreviewUrl('');
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(imageIndex, canvas.toDataURL('image/png'));
  };

  const applyPendingText = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !pendingTextPoint) return;

    pushUndoSnapshot();
    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `bold ${textSize}px sans-serif`;
    ctx.fillText(textValue || 'Text', pendingTextPoint.x, pendingTextPoint.y);
    ctx.restore();
    setPendingTextPoint(null);
  };

  const toolButtonClass = (candidate: ImageEditTool) =>
    cn(
      "p-2 rounded border text-[10px] font-black uppercase transition-colors",
      tool === candidate ? "bg-indigo-500 border-indigo-400 text-white" : "bg-[#111] border-[#333] text-[#aaa] hover:text-white"
    );

  return createPortal(
    <div className="fixed inset-0 z-[7000] bg-black/90 backdrop-blur-sm flex flex-col">
      <div className="h-full w-full bg-[#1f1f1f] border border-[#333] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[#333] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white">
            <Pencil className="w-4 h-4 text-indigo-400" /> Edit Photo
          </div>
          <button onClick={onCancel} className="p-1.5 text-[#aaa] hover:text-white hover:bg-[#333] rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-[#333] flex flex-wrap items-center gap-3 shrink-0">
          <button aria-label="Crop tool" onClick={() => setTool('crop')} className={toolButtonClass('crop')}><Crop className="w-4 h-4" /></button>
          <button aria-label="Line tool" onClick={() => setTool('line')} className={toolButtonClass('line')}><Minus className="w-4 h-4" /></button>
          <button aria-label="Arrow tool" onClick={() => setTool('arrow')} className={toolButtonClass('arrow')}><MoveUpRight className="w-4 h-4" /></button>
          <button aria-label="Circle tool" onClick={() => setTool('circle')} className={toolButtonClass('circle')}><Circle className="w-4 h-4" /></button>
          <button aria-label="Square tool" onClick={() => setTool('square')} className={toolButtonClass('square')}><Square className="w-4 h-4" /></button>
          <button aria-label="Text tool" onClick={() => setTool('text')} className={toolButtonClass('text')}><TypeIcon className="w-4 h-4" /></button>
          <button aria-label="Stamp tool" onClick={() => setTool('stamp')} className={toolButtonClass('stamp')}><Radio className="w-4 h-4" /></button>
          <button onClick={rotateCanvas} className="p-2 rounded bg-[#111] border border-[#333] text-[#aaa] hover:text-white"><RotateCw className="w-4 h-4" /></button>
          <button
            aria-label="Back"
            onClick={undoLastEdit}
            disabled={undoStack.length === 0}
            className="p-2 rounded bg-[#111] border border-[#333] text-[#aaa] hover:text-white disabled:opacity-40 disabled:hover:text-[#aaa]"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={applyCrop} disabled={!cropRect} className="px-3 py-2 rounded bg-[#111] border border-[#333] text-[10px] font-black uppercase text-[#aaa] hover:text-white disabled:opacity-40">Apply crop</button>
          <select aria-label="Stroke pattern" value={strokePattern} onChange={e => setStrokePattern(e.target.value as StrokePattern)} className="bg-[#111] border border-[#333] rounded px-2 py-2 text-xs text-white outline-none">
            <option value="solid">Nét liền</option>
            <option value="dashed">Nét đứt</option>
            <option value="dashdot">Chấm gạch</option>
            <option value="dotted">Nét chấm</option>
            <option value="zigzag">Zigzag</option>
          </select>
          <input aria-label="Stroke color" type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} className="h-9 w-10 bg-[#111] border border-[#333] rounded" />
          <input aria-label="Stroke width" type="range" min={1} max={18} value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="w-24" />
          <select aria-label="Asset stamp" value={assetStamp} onChange={e => setAssetStamp(e.target.value as AssetStamp)} className="bg-[#111] border border-[#333] rounded px-2 py-2 text-xs text-white outline-none">
            <option value="pole-4m">Cột 6m tay vươn 4m</option>
            <option value="pole-6m">Cột 6m tay vươn 6m</option>
            <option value="pole-8m">Cột 6m tay vươn 8m</option>
            <option value="cabinet-300x520">Tủ 300x520</option>
            <option value="camera-sim">Camera mô phỏng</option>
          </select>
          <input aria-label="Text size" type="number" min={10} max={120} value={textSize} onChange={e => setTextSize(Number(e.target.value))} className="w-20 bg-[#111] border border-[#333] rounded px-2 py-2 text-xs text-white outline-none" />
          <input
            aria-label="Text value"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            className="min-w-0 flex-1 bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white outline-none"
          />
          <button onClick={applyPendingText} disabled={!pendingTextPoint} className="px-3 py-2 rounded bg-indigo-500 text-white text-[10px] font-black uppercase hover:bg-indigo-400 disabled:opacity-40">OK text</button>
        </div>

        <div ref={canvasContainerRef} className="relative flex-1 min-h-0 bg-[#111] p-4 overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="bg-black rounded border border-[#333] touch-none"
            style={{
              width: canvasDisplaySize ? `${canvasDisplaySize.width}px` : 'auto',
              height: canvasDisplaySize ? `${canvasDisplaySize.height}px` : 'auto',
            }}
          />
          {pendingTextPoint && canvasDisplaySize && canvasSize && (
            <input
              aria-label="Text preview"
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              className="absolute min-w-24 max-w-[420px] bg-white/95 text-black border-2 border-indigo-500 rounded px-2 py-1 font-bold shadow-lg outline-none"
              style={{
                left: `calc(50% - ${canvasDisplaySize.width / 2}px + ${(pendingTextPoint.x / canvasSize.width) * canvasDisplaySize.width}px)`,
                top: `calc(50% - ${canvasDisplaySize.height / 2}px + ${(pendingTextPoint.y / canvasSize.height) * canvasDisplaySize.height}px)`,
                fontSize: `${Math.max(10, textSize * (canvasDisplaySize.width / canvasSize.width))}px`,
                lineHeight: 1.15,
                width: `${Math.max(96, Math.min(420, (textValue.length || 1) * Math.max(10, textSize * (canvasDisplaySize.width / canvasSize.width)) * 0.72 + 24))}px`,
                color: strokeColor,
              }}
              autoFocus
            />
          )}
          {cropRect && cropPreviewUrl && (
            <div className="absolute right-6 top-6 w-64 rounded-lg border border-indigo-400 bg-[#1f1f1f]/95 p-2 shadow-2xl">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-indigo-300">Crop preview</div>
              <img src={cropPreviewUrl} className="max-h-48 w-full rounded border border-[#333] object-contain bg-black" />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#333] flex justify-end gap-3 shrink-0">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-[#111] border border-[#333] text-[10px] font-black uppercase text-[#aaa] hover:text-white">Cancel</button>
          <button onClick={saveImage} className="px-4 py-2 rounded bg-indigo-500 text-white text-[10px] font-black uppercase hover:bg-indigo-400">Save photo</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const preparePropertyMetadata = (metaInput: unknown, properties?: FeatureProperties): FeatureMetadata => {
  const metaToSave = { ...((metaInput || {}) as FeatureMetadata) };

  if (metaToSave.size !== undefined && metaToSave.size !== null) {
    metaToSave.size = Number(metaToSave.size);
    if (isNaN(metaToSave.size)) {
      metaToSave.size = 4;
    }
  }

  const standardizedMeta = syncDisplayOrderAliases(
    normalizeMetadataObject(metaToSave) as Record<string, unknown>,
    undefined,
    properties as Record<string, unknown> | undefined
  ) as FeatureMetadata;
  if (!standardizedMeta.size && metaToSave.size) {
    standardizedMeta.size = metaToSave.size;
  }

  return standardizedMeta;
};

export const PropertyPanel: React.FC = () => {
  const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext() || {};
  const {
    state,
    selectedFeatureId,
    selectFeature,
    dispatchEvent,
    dispatchEvents,
    queueEvent,
    setDrawingMode,
    setSelectedGroup,
    setActiveParentFeature,
    setPreview,
    previewMetadata,
    editingFeatureId,
    setEditingFeatureId,
    projectId,
    selectionSet
  } = useDesignSync();

  // Load contracts for the project
  const { contracts } = useProjectData({
    id: String(projectId ?? ''),
    name: '',
    pmp_path: '',
    path: '',
    description: null,
    contract_number: null,
    investor: null,
    contractor: null,
    signed_date: null,
    duration: null,
    end_date: null,
    status: 'active',
    created_at: '',
    updated_at: '',
  });
  const [isImporting, setIsImporting] = useState(false);

  // Multi-selection check will be handled in the final return block to avoid hook violations.

  const feature = selectedFeatureId && state?.features ? state.features[selectedFeatureId] : null;
  const group = feature?.group_id ? state?.feature_groups?.[feature.group_id] : null;

  const [localName, setLocalName] = useState('');
  const [localMeta, setLocalMeta] = useState<FeatureMetadata>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingImage, setEditingImage] = useState<{ index: number; url: string } | null>(null);
  const [isImportingMedia, setIsImportingMedia] = useState(false);
  const [mediaImportError, setMediaImportError] = useState<string | null>(null);
  const togglePalette = useLayoutStore(s => s.togglePalette);
  const paletteConfigs = useLayoutStore(s => s.paletteConfigs);
  const displayInfo = feature && group ? getFeatureDisplayInfo(feature, group.type, group.name, localMeta) : null;
  const isIntersectionFeature = !!displayInfo?.isIntersection;
  const isPolyline = isLineGeometry(feature?.geom_type);
  const isCameraFeature = !!displayInfo?.isCamera || isCameraIcon(asStringValue(localMeta.icon || localMeta.type));

  let persistedMeta: FeatureMetadata = {};
  let persistedMetaJson = '{}';
  if (feature) {
    try {
      const parsed = getParsedMetadata(feature);
      persistedMeta = preparePropertyMetadata(parsed, feature.properties as FeatureProperties);
      persistedMetaJson = JSON.stringify(persistedMeta);
    } catch {
      persistedMeta = {};
      persistedMetaJson = '{}';
    }
  }

  const persistedName = feature ? getCleanName(feature, String(persistedMeta.display_order || persistedMeta.stt || persistedMeta.STT || '')) : '';
  const draftMeta = (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata)
    ? previewMetadata.metadata as FeatureMetadata
    : localMeta;
  const draftName = (previewMetadata?.id === selectedFeatureId && previewMetadata.name !== undefined)
    ? previewMetadata.name
    : localName;
  const isMetadataDirty = !!feature && JSON.stringify(preparePropertyMetadata(draftMeta, feature.properties as FeatureProperties)) !== persistedMetaJson;
  const isNameDirty = !!feature && draftName !== persistedName;
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const mediaSourceMeta = draftMeta || localMeta;
  const imageAssetIds = getMediaAssetIds(mediaSourceMeta);
  const legacyImageUrls = getLegacyImageUrls(mediaSourceMeta).filter(isRenderableImageUrl);
  const displayImageUrls = imageAssetIds
    .map((assetId) => resolvedMediaUrls[assetId])
    .filter((url): url is string => !!url)
    .concat(legacyImageUrls);

  // Cleanup preview on unmount or when changing feature
  useEffect(() => {
    return () => {
      setPreview(null, null);
    };
  }, [selectedFeatureId]);

  useEffect(() => {
    if (!projectId || imageAssetIds.length === 0) {
      setResolvedMediaUrls({});
      return;
    }
    let cancelled = false;
    Promise.all(
      imageAssetIds.map(async (assetId) => {
        const asset = await resolveMediaAsset(String(projectId), assetId);
        return [assetId, asset.src] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setResolvedMediaUrls(Object.fromEntries(entries));
        }
      })
      .catch((error) => {
        void error;
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, imageAssetIds.join('|')]);

  // Helper to get nested metadata values with legacy fallback
  const getMetaValue = (path: string, legacyKey?: string): unknown => {
    const parts = path.split('.');
    let current: unknown = localMeta;
    for (const part of parts) {
      const currentRecord = asRecord(current);
      if (!currentRecord) {
        current = undefined;
        break;
      }
      current = currentRecord[part];
    }
    if (current !== undefined && current !== null && current !== '') return current;
    if (legacyKey) {
      const metaRecord = localMeta as Record<string, unknown>;
      const legacyVal = metaRecord[legacyKey];
      if (legacyVal !== undefined) return legacyVal;
    }
    return undefined;
  };

  // Helper to update nested metadata
  const updateNestedMeta = (path: string, value: unknown) => {
    const next = { ...localMeta } as Record<string, unknown>;
    const parts = path.split('.');
    let current: Record<string, unknown> = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current[part] = { ...(current[part] as Record<string, unknown>) };
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;

    setLocalMeta(next as FeatureMetadata);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next as FeatureMetadata, localName);
    }
  };

  const orderFieldLabel = getOrderFieldLabel(localMeta as Record<string, unknown>, feature?.properties as FeatureProperties | undefined);
  const updateOrderMeta = (value: string) => {
    const next = syncDisplayOrderAliases(
      localMeta as Record<string, unknown>,
      value,
      feature?.properties as Record<string, unknown> | undefined
    ) as FeatureMetadata;
    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
  };

  const persistMediaAssetMetadata = async (nextMeta: FeatureMetadata) => {
    if (!feature) return;
    const standardizedMeta = preparePropertyMetadata(nextMeta, feature.properties as FeatureProperties);
    const nextProperties = buildFeaturePropertiesForPersistence(
      feature.properties as FeatureProperties | undefined,
      standardizedMeta
    );
    await queueEvent({
      type: 'FeatureUpdated',
      payload: {
        id: feature.id,
        name: localName,
        metadata: JSON.stringify(standardizedMeta),
        properties: nextProperties,
      },
    });
  };

  const appendImageUrls = async (dataUrls: string[]) => {
    if (dataUrls.length === 0) return;
    if (!feature || !projectId) {
      setMediaImportError('Không thể lưu ảnh khi thiếu project hoặc đối tượng.');
      return;
    }

    setIsImportingMedia(true);
    setMediaImportError(null);

    const importedAssetIds: string[] = [];
    const importedAssets: Array<{ assetId: string; src: string }> = [];

    try {
      for (const dataUrl of dataUrls) {
        const imported = await importMediaAsset(String(projectId), feature.id, dataUrl);
        const assetId = imported.assetId || imported.id;
        importedAssetIds.push(assetId);
        importedAssets.push({ assetId, src: imported.src });
      }

      setResolvedMediaUrls((prev) => {
        const next = { ...prev };
        for (const asset of importedAssets) {
          next[asset.assetId] = asset.src;
        }
        return next;
      });

      const nextMeta = updateMediaAssets([...imageAssetIds, ...importedAssetIds]);
      await persistMediaAssetMetadata(nextMeta);
      setPreview(null, null);
      requestStorageHealthRefresh();
    } catch (error) {
      await Promise.all(
        importedAssetIds.map(async (assetId) => {
          try {
            await deleteMediaAsset(String(projectId), assetId);
          } catch (cleanupError) {
            void cleanupError;
          }
        })
      );
      setMediaImportError('Không thể lưu ảnh vào thư mục dự án. Vui lòng thử lại.');
      throw error;
    } finally {
      setIsImportingMedia(false);
    }
  };

  const updateMediaAssets = (assetIds: string[]): FeatureMetadata => {
    const next = withMediaAssets(localMeta, assetIds);
    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
    return next;
  };

  const updateMediaImages = (imageUrls: string[]): FeatureMetadata => {
    const next = {
      ...localMeta,
      media: {
        ...(asRecord(localMeta.media) || {}),
        imageUrl: imageUrls[0] || undefined,
        imageUrls,
      },
    } as FeatureMetadata;

    setLocalMeta(next);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, next, localName);
    }
    return next;
  };

  const removeImageUrl = async (index: number) => {
    if (index < imageAssetIds.length) {
      const removedAssetId = imageAssetIds[index];
      const nextAssetIds = [...imageAssetIds];
      nextAssetIds.splice(index, 1);
      if (projectId) {
        await deleteMediaAsset(String(projectId), removedAssetId);
      }
      setResolvedMediaUrls((prev) => {
        const next = { ...prev };
        delete next[removedAssetId];
        return next;
      });
      const nextMeta = updateMediaAssets(nextAssetIds);
      await persistMediaAssetMetadata(nextMeta);
      requestStorageHealthRefresh();
      return;
    }
    const legacyIndex = index - imageAssetIds.length;
    const newImgs = [...legacyImageUrls];
    newImgs.splice(legacyIndex, 1);
    updateMediaImages(newImgs);
  };

  const replaceImageUrl = async (index: number, dataUrl: string) => {
    if (!feature) return;
    let nextMeta: FeatureMetadata;

    if (index < imageAssetIds.length && projectId) {
      const imported = await importMediaAsset(String(projectId), feature.id, dataUrl);
      const assetId = imported.assetId || imported.id;
      const nextAssetIds = [...imageAssetIds];
      const replacedAssetId = nextAssetIds[index];
      nextAssetIds[index] = assetId;
      if (replacedAssetId && replacedAssetId !== assetId) {
        await deleteMediaAsset(String(projectId), replacedAssetId);
      }
      setResolvedMediaUrls((prev) => ({
        ...prev,
        [assetId]: dataUrl,
      }));
      nextMeta = updateMediaAssets(nextAssetIds);
    } else {
      const legacyIndex = Math.max(index - imageAssetIds.length, 0);
      const nextImageUrls = [...legacyImageUrls];
      nextImageUrls[legacyIndex] = dataUrl;
      nextMeta = updateMediaImages(nextImageUrls);
    }

    const standardizedMeta = preparePropertyMetadata(nextMeta, feature.properties as FeatureProperties);
    const nextProperties = buildFeaturePropertiesForPersistence(
      feature.properties as FeatureProperties | undefined,
      standardizedMeta
    );

    await queueEvent({
      type: 'FeatureUpdated',
      payload: {
        id: feature.id,
        name: localName,
        metadata: JSON.stringify(standardizedMeta),
        properties: nextProperties,
      },
    });
    setPreview(null, null);
    setEditingImage(null);
    requestStorageHealthRefresh();
  };

  const pasteClipboardImages = async (
    clipboardData: DataTransfer,
    source: 'panel' | 'window',
    preventDefault: () => void,
    stopPropagation?: () => void,
  ) => {
    const items = Array.from(clipboardData.items);
    const imageItems = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'));

    console.log('[PropertyPanel][Paste] event', {
      source,
      selectedFeatureId,
      itemCount: items.length,
      items: items.map((item) => ({ kind: item.kind, type: item.type })),
      imageCount: imageItems.length,
      activeElement: document.activeElement?.tagName ?? null,
    });

    if (imageItems.length === 0) return;

    preventDefault();
    stopPropagation?.();
    try {
      const dataUrls = await readClipboardImageDataUrls(clipboardData);
      console.log('[PropertyPanel][Paste] read images', {
        source,
        count: dataUrls.length,
        existingCount: legacyImageUrls.length,
      });
      await appendImageUrls(dataUrls);
      console.log('[PropertyPanel][Paste] appended images', {
        source,
        nextCount: imageAssetIds.length + legacyImageUrls.length + dataUrls.length,
      });
    } catch (error) {
      console.error('[PropertyPanel][Paste] failed', error);
    }
  };

  const handleMediaPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    await pasteClipboardImages(
      event.clipboardData,
      'panel',
      () => event.preventDefault(),
      () => event.stopPropagation(),
    );
  };

  const openCameraPalettes = () => {
    const deviceConfig = paletteConfigs['device-config'];
    const cameraView = paletteConfigs['camera-view'];

    if (deviceConfig && !deviceConfig.isVisible) {
      togglePalette('device-config');
    }
    if (cameraView && !cameraView.isVisible) {
      togglePalette('camera-view');
    }
  };

  const handleIconChange = (icon: IconType) => {
    const nextMeta = {
      ...(localMeta || {}),
      icon,
      type: getTypeForIcon(icon),
    } as FeatureMetadata;

    setLocalMeta(nextMeta);
    if (selectedFeatureId) {
      setPreview(selectedFeatureId, nextMeta, localName);
    }

    if (isCameraIcon(icon)) {
      openCameraPalettes();
    }
  };

  // Camera integration
  const {
    isCameraOpen,
    isCapturing,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    capture
  } = useCamera({
    onCapture: (dataUrl) => {
      void appendImageUrls([dataUrl]).catch((error) => {
        void error;
      });
    },
    watermarkData: {
      location: feature ? (getPointCoordinates(feature) ?? undefined) : undefined,
      label: localName || 'Đối tượng khảo sát'
    }
  });

  // Sync local state when selection changes
  useEffect(() => {
    if (feature) {
      try {
        const meta = getParsedMetadata(feature);
        const normalized = normalizeMetadataObject(meta);

        // Cập nhật tên (làm sạch STT nếu có)
        const sttValue = asStringValue(normalized.display_order ?? normalized.stt ?? normalized.STT);
        setLocalName(getCleanName(feature, sttValue));

        // Cập nhật metadata
        setLocalMeta(normalized);
      } catch (e) {
        setLocalName(safeString(feature.name) || '');
        setLocalMeta({});
      }
    }
  }, [feature?.id]);

  useEffect(() => {
    if (previewMetadata?.id === selectedFeatureId && previewMetadata.metadata) {
      setLocalMeta((prev) => {
        const incoming = previewMetadata.metadata as FeatureMetadata;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
      if (previewMetadata.name !== undefined) {
        setLocalName((prev) => prev !== previewMetadata.name ? previewMetadata.name! : prev);
      }
    }
  }, [previewMetadata, selectedFeatureId]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingImage) return;
        selectFeature(null);
        setActiveParentFeature(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingImage, selectFeature, setActiveParentFeature]);

  useEffect(() => {
    if (!feature) return;
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData || isEditablePasteTarget(event.target)) return;
      void pasteClipboardImages(
        event.clipboardData,
        'window',
        () => event.preventDefault(),
        () => event.stopPropagation(),
      );
    };
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [feature?.id, legacyImageUrls, selectedFeatureId, localMeta, localName]);

  const handleSave = async () => {
    if (!feature || (!isNameDirty && !isMetadataDirty)) return;
    setIsSaving(true);
    setIsSaved(false);

    try {
      const standardizedMeta = preparePropertyMetadata(draftMeta, feature.properties as FeatureProperties);
      const nextProperties = buildFeaturePropertiesForPersistence(
        feature.properties as FeatureProperties | undefined,
        standardizedMeta
      );

      // Save to database via event queue
      await queueEvent({
        type: 'FeatureUpdated',
        payload: {
          id: feature.id,
          name: draftName,
          metadata: JSON.stringify(standardizedMeta),
          properties: nextProperties
        }
      });
      // CRITICAL: Force state update to trigger map re-render
      const currentState = useDesignSync.getState().state;
      if (currentState) {
        useDesignSync.setState({ state: { ...currentState } });
      }

      // CRITICAL: Verify save was successful
      await new Promise(resolve => setTimeout(resolve, 300));
      const verifyState = useDesignSync.getState().state;
      const verifyFeature = verifyState?.features[feature.id];
      if (verifyFeature) {
        const verifyMeta = getParsedMetadata(verifyFeature);
        const normalizedVerifyMeta = preparePropertyMetadata(verifyMeta, feature.properties as FeatureProperties);

        if (
          verifyMeta.size !== standardizedMeta.size ||
          normalizedVerifyMeta.icon !== standardizedMeta.icon ||
          normalizedVerifyMeta.type !== standardizedMeta.type ||
          verifyFeature.properties?.iconKey !== nextProperties.iconKey ||
          verifyFeature.properties?.type !== nextProperties.type
        ) {
          // Keep non-paste diagnostics silent while isolating clipboard paste issues.
        }
      }

      // Success feedback
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);

      // Clear preview after save
      setPreview(null, null);
    } catch (error) {
      void error;
      alert("Lỗi khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleOrigin = async () => {
    if (!selectedFeatureId || !state?.features) return;
    const events = buildToggleOriginEvents(state.features, selectedFeatureId);
    if (events.length === 0) return;
    await dispatchEvents(events);
  };

  const handleFileUpload = async () => {
    if (!feature || !state) return;
    setIsImporting(true);
    try {
      const selected = await safeOpenDialog({
        filters: [{ name: 'GIS Data', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb', 'kml', 'kmz'] }],
        multiple: false,
        directory: false,
      });
      if (!selected || typeof selected !== 'string') {
        return;
      }

      const filePath = selected;
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      // Virtual Folder Logic: Data goes to the same group, but is tied to this feature's ID
      const targetGroupId = feature.group_id;

      if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext)) {
        const headers = await getExcelHeaders(filePath);
        if (headers.length === 0) { alert('File Excel rỗng hoặc không đọc được.'); return; }
        const records = await importFromExcel(filePath, {
          name_column: headers[0] || '',
          lat_column: headers.find((header) => /lat|vĩ|vi_do|latitude/i.test(header)) || '',
          lng_column: headers.find((header) => /lng|lon|kinh|longitude/i.test(header)) || '',
          description_column: headers.find((header) => /mô tả|mo ta|description|ghi chú/i.test(header)),
          order_column: headers.find((header) => /stt|order|mã hiệu|ma hieu|id/i.test(header)),
        });
        const importedCount = await applyImportedRecords(records, targetGroupId ?? undefined);
        alert(`✅ Đã import ${importedCount} đối tượng từ ${fileName}.`);
      } else if (['kml', 'kmz'].includes(ext)) {
        const records = await importFromKML(filePath);
        const importedCount = await applyImportedRecords(records, targetGroupId ?? undefined);
        alert(`✅ Đã import ${importedCount} đối tượng từ ${fileName}.`);
      } else if (['gpx'].includes(ext)) {
        alert('Định dạng GPX sẽ được hỗ trợ trong phiên bản tiếp theo.');
      } else {
        alert('Định dạng file không được hỗ trợ. Vui lòng chọn Excel, KML, hoặc KMZ.');
      }

      // Auto-select the target group to expand it in sidebar
      setSelectedGroup(targetGroupId);
      setPreview(null, null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      void err;
      alert('Lỗi import: ' + errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = () => {
    if (!feature) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!feature) return;
    await dispatchEvent({
      type: 'FeatureDeleted',
      payload: { id: feature.id }
    });
    selectFeature(null);
    setShowDeleteModal(false);
  };


  // Removed the second `selectionSet` declaration as per instruction.
  // The `selectionSet` is now declared at the top.

  if (selectionSet.size > 1) {
    return (
      <aside className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-[#444]" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-50">
          <div className="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4 text-cad-accent">
            <Layers className="w-8 h-8" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest">Multi-Selection Active</p>
          <p className="text-[9px] mt-2 mb-4 max-w-[200px]">
            Please use the <strong>Bulk Edit</strong> palette to modify multiple items.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => selectFeature(null)}
              className="px-3 py-1 bg-cad-bg border border-cad-border text-[8px] font-bold uppercase rounded-sm hover:bg-cad-elevated"
            >
              Deselect All
            </button>
          </div>
        </div>
      </aside>
    );
  }

  if (!feature) {
    return (
      <aside className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-cad-text-muted rounded-xl overflow-hidden">
        <div className="flex items-center justify-between w-full p-3 border-b border-[#333] bg-[#252525] drag-handle cursor-move" {...dragHandleProps}>
            <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-[#444]" />
                <span className="text-[10px] font-black tracking-widest uppercase text-cad-text-muted">THÔNG SỐ THIẾT KẾ</span>
            </div>
            <button onClick={onClose} className="p-1 text-cad-text-muted hover:bg-[#333] hover:text-white transition-all rounded"><X size={12} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center opacity-50">
          <div className="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4">
            <Settings className="w-8 h-8 text-[#444]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest">No Selection</p>
          <p className="text-[9px] mt-1">Select an entity to configure</p>
        </div>
      </aside>
    );
  }

  const distance = isPolyline ? asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')) : 0;
  const linkBudget = isPolyline ? designLogic.calculateFiberLinkBudget(distance) : 0;

  // Detect polyline type for specific metadata
  const polyType = asStringValue(
    getMetaValue('infrastructure.type'),
    safeString(feature.name).toLowerCase().includes('điện') ? 'PowerLine' : safeString(feature.name).toLowerCase().includes('cáp') ? 'SignalLine' : ''
  );

  return (
    <aside
      className="w-full h-full bg-[#1e1e1e] border border-[#333] flex flex-col shadow-2xl text-white font-mono rounded-xl overflow-hidden"
      onPaste={handleMediaPaste}
      onContextMenu={(e) => {
        e.preventDefault();
        selectFeature(null);
      }}
    >

      {/* Camera UI Overlay */}
      {isCameraOpen && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-lg text-[10px] text-white flex items-center gap-2 border border-white/10">
            <Clock className="w-3 h-3 text-indigo-400" /> {new Date().toLocaleTimeString()}
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 px-4">
            <button onClick={stopCamera} className="w-12 h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-md border border-white/10">
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={capture}
              disabled={isCapturing}
              className="w-16 h-16 bg-white text-indigo-600 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
            >
              {isCapturing ? <Loader2 className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div 
        {...dragHandleProps}
        className="p-3 border-b border-[#333] flex justify-between items-center bg-[#252525] sticky top-0 backdrop-blur-md z-11 drag-handle cursor-move"
      >
        <div className="flex items-center gap-2">
          {displayInfo?.icon ? (
            <displayInfo.icon className={cn("w-3.5 h-3.5", displayInfo.tailwindColor || "text-cad-accent")} />
          ) : (
            isPolyline ? <Route className="w-3.5 h-3.5 text-cad-accent" /> : <MapPin className="w-3.5 h-3.5 text-cad-accent" />
          )}
          <h2 className="text-[10px] font-black tracking-widest uppercase text-cad-accent">THÔNG SỐ THIẾT KẾ</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="p-1 px-2 hover:bg-red-500/20 text-red-400 rounded transition-colors text-[9px] font-bold uppercase border border-red-500/10"
            title="Xóa đối tượng"
          >
            Delete
          </button>
          {(isPolyline || feature.geom_type === 'Polygon') && (
            <button
              onClick={() => setEditingFeatureId(editingFeatureId === feature.id ? null : feature.id)}
              className={cn(
                "p-1 px-2 rounded transition-all text-[9px] font-bold uppercase border",
                editingFeatureId === feature.id
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                  : "hover:bg-[#333] text-cad-text-muted border-transparent"
              )}
              title="Chỉnh sửa điểm (Vertex Editing)"
            >
              <div className="flex items-center gap-1">
                <Pencil className={cn("w-3 h-3", editingFeatureId === feature.id ? "animate-pulse" : "")} />
                Edit
              </div>
            </button>
          )}
          <button
            onClick={onPin}
            className={`p-1 px-2 hover:bg-[#333] transition-colors rounded text-[9px] font-bold uppercase ${isPinned ? 'text-cad-accent bg-[#333]' : 'text-cad-text-muted'}`}
            title={isPinned ? "Auto-hide" : "Pin"}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            onClick={() => { if(onClose) onClose(); selectFeature(null); setActiveParentFeature(null); }}
            className="p-1 px-2 hover:bg-[#333] text-cad-text-muted rounded transition-colors text-[9px] font-bold uppercase"
          >
            Close
          </button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-8 custom-scrollbar">

        {/* IDENTIFICATION */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Info className="w-3 h-3" /> Identification
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Object Name</label>
              <input
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all"
                value={localName}
                onChange={e => {
                  const nextName = e.target.value;
                  setLocalName(nextName);
                  if (selectedFeatureId) {
                    setPreview(selectedFeatureId, localMeta, nextName);
                  }
                }}
                placeholder="Enter name..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{orderFieldLabel}</label>
              <input
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all"
                value={asStringValue(getMetaValue('display_order', orderFieldLabel))}
                onChange={e => updateOrderMeta(e.target.value)}
                placeholder="Enter code..."
              />
            </div>

            {!isPolyline && feature.geom_type === 'Point' && (
              <button
                onClick={handleToggleOrigin}
                className={cn(
                  'w-full rounded border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
                  localMeta.network?.is_origin
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-[#333] bg-[#111] text-white hover:border-emerald-500/40 hover:bg-emerald-500/10'
                )}
              >
                {localMeta.network?.is_origin ? 'Bỏ điểm gốc Network' : 'Đặt điểm gốc Network'}
              </button>
            )}

            {feature.geom_type === 'Point' && isIntersectionFeature && (
              <div className="pt-2 space-y-3">
                <div className="space-y-2 p-3 bg-orange-500/5 border border-orange-500/10 rounded-md">
                  <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Grid3X3 size={12} /> Bảng điều khiển Nút giao
                  </p>
                  <button
                    onClick={handleFileUpload}
                    disabled={isImporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-60 text-white rounded-md transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 group"
                  >
                    {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />}
                    {isImporting ? 'Đang import...' : 'Upload dữ liệu (Excel/KML/KMZ)'}
                  </button>
                  <p className="text-[7px] text-[#555] px-1 leading-relaxed">
                    Hỗ trợ: .xlsx, .xls, .xlsm, .xlsb, .kml, .kmz
                  </p>
                  <div className="h-px bg-orange-500/10 my-1" />
                  <p className="text-[8px] text-[#666] uppercase tracking-wider font-bold mb-1">Thêm thủ công:</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      onClick={() => { setDrawingMode('point'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-indigo-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <MapPin size={10} className="text-indigo-400" /> Thêm Điểm Khảo Sát
                    </button>
                    <button
                      onClick={() => { setDrawingMode('polyline'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-emerald-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <Route size={10} className="text-emerald-400" /> Thêm Tuyến/Cáp
                    </button>
                    <button
                      onClick={() => { setDrawingMode('image'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
                      className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-amber-600 text-white rounded text-[8px] font-bold uppercase transition-all"
                    >
                      <ImageIcon size={10} className="text-amber-400" /> Thêm Ảnh Hiện Trường
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Description</label>
              <textarea
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all resize-none"
                rows={2}
                value={asStringValue(getMetaValue('description', 'description'))}
                onChange={e => updateNestedMeta('description', e.target.value)}
                placeholder="Technical notes..."
              />
            </div>
          </div>
        </section>

        {/* GEOMETRY & VN2000 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Calculator className="w-3 h-3" /> Coordinates (VN-2000)
          </div>
          <div className="grid grid-cols-2 gap-2 bg-[#111] p-3 rounded border border-[#333]">
            {(() => {
              try {
                const coords = typeof feature.coordinates === 'string' ? JSON.parse(feature.coordinates) : feature.coordinates;
                if (Array.isArray(coords)) {
                  const first = Array.isArray(coords[0]) ? coords[0] : coords;
                  const vnx = asNumberValue(getMetaValue('gis.vn2000_x', 'vn2000_x'));
                  const vny = asNumberValue(getMetaValue('gis.vn2000_y', 'vn2000_y'));
                  return (
                    <>
                      <ReadOnlyField label="Lng" value={first[0]?.toFixed(6) || '0'} />
                      <ReadOnlyField label="Lat" value={first[1]?.toFixed(6) || '0'} />
                      {vnx && vny ? (
                        <>
                          <div className="col-span-2 h-[1px] bg-[#333] my-1"></div>
                          <ReadOnlyField label="X (VN2000)" value={Number(vnx).toFixed(3)} />
                          <ReadOnlyField label="Y (VN2000)" value={Number(vny).toFixed(3)} />
                        </>
                      ) : null}
                    </>
                  );
                }
              } catch (e) {
                void e;
                return <p className="col-span-2 text-[9px] text-red-500">Error loading feature data</p>;
              }
            })()}
          </div>
        </section>

        {/* STYLING */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Palette className="w-3 h-3" /> Styling & Symbols
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Color</label>
                <input
                  type="color"
                  className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                  value={asStringValue(getMetaValue('color', 'color'), '#3b82f6')}
                  onChange={e => updateNestedMeta('color', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{isPolyline ? 'Stroke' : 'Size'}</label>
                <input
                  type="number"
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white mt-1 focus:border-cad-accent outline-none"
                  value={asNumberValue(getMetaValue('size', 'size'), isPolyline ? 4 : 32)}
                  onChange={e => updateNestedMeta('size', Number(e.target.value))}
                />
              </div>
            </div>
            {!isPolyline && (
              <IconSelector
                value={((getMetaValue('icon', 'icon') as IconType) || (isIntersectionFeature ? 'intersection' : 'default'))}
                onChange={handleIconChange}
                className="pt-2"
              />
            )}
          </div>
        </section>


        {/* INFRASTRUCTURE SPECS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-indigo-400 uppercase">
            <Settings className="w-3 h-3" /> Infrastructure Details
          </div>
          <div className="bg-[#111] p-3 rounded border border-indigo-500/10 space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">Type</label>
              <select
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white outline-none active:border-indigo-500"
                value={asStringValue(getMetaValue('infrastructure.type'), polyType)}
                onChange={e => updateNestedMeta('infrastructure.type', e.target.value)}
              >
                <option value="">Select Type...</option>
                <option value="PowerLine">Power Line (Lưới điện)</option>
                <option value="SignalLine">Signal / Fiber (Thông tin)</option>
                <option value="TrenchLine">Trench / Pipe (Mương cáp)</option>
              </select>
            </div>

            {(getMetaValue('infrastructure.type') || polyType) === 'PowerLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Voltage" icon={<Zap className="w-3 h-3" />} value={getMetaValue('infrastructure.voltage')} onChange={v => updateNestedMeta('infrastructure.voltage', v)} />
                <DesignField label="Owner" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('infrastructure.owner')} onChange={v => updateNestedMeta('infrastructure.owner', v)} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'SignalLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Cable" icon={<Radio className="w-3 h-3" />} value={getMetaValue('infrastructure.cable_type')} onChange={v => updateNestedMeta('infrastructure.cable_type', v)} />
                <DesignField label="Cores" icon={<Layers className="w-3 h-3" />} value={getMetaValue('infrastructure.core_count')} onChange={v => updateNestedMeta('infrastructure.core_count', asNumberValue(v))} />
              </div>
            )}

            {(getMetaValue('infrastructure.type') || polyType) === 'TrenchLine' && (
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Depth" icon={<Construction className="w-3 h-3" />} value={getMetaValue('infrastructure.depth')} onChange={v => updateNestedMeta('infrastructure.depth', asNumberValue(v))} />
                <DesignField label="Surface" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('infrastructure.surface_type')} onChange={v => updateNestedMeta('infrastructure.surface_type', v)} />
              </div>
            )}
          </div>
        </section>

        {/* AUTOMATED SEGMENTS */}
        {isPolyline && feature.properties?.segments && (
          <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
              <Sparkles className="w-3 h-3 text-amber-400" /> Automated Segments
            </div>
            <div className="space-y-1.5">
              {((feature.properties.segments ?? []) as SegmentItem[]).map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="p-2.5 bg-[#111] border border-[#333] rounded-md flex items-center justify-between hover:border-indigo-500/30 transition-all hover:bg-[#161616] animate-in fade-in slide-in-from-right-2 fill-mode-both"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-[#222] rounded flex items-center justify-center text-[9px] font-bold text-cad-text-muted border border-[#333]">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white uppercase tracking-tight">{seg.segment_type || 'Unknown'}</p>
                      <p className="text-[8px] text-[#444] font-mono">ID: {typeof seg.id === 'string' ? seg.id.slice(0, 8) : seg.id ?? ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                      seg.segment_type === 'AsphaltRoad' ? 'bg-zinc-600' :
                        seg.segment_type === 'StoneSidewalk' ? 'bg-stone-500' :
                          seg.segment_type === 'SoilSidewalk' ? 'bg-amber-900' :
                            'bg-indigo-500/20'
                    )} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* DESIGN SPECS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
            <Settings className="w-3 h-3" /> Construction Info
          </div>
          <div className="space-y-3">
            <DesignField label="Contractor" icon={<UserIcon className="w-3 h-3" />} value={getMetaValue('business.contractor', 'contractor')} onChange={v => updateNestedMeta('business.contractor', v)} />
            <DesignField label="Phone" icon={<Phone className="w-3 h-3" />} value={getMetaValue('business.phoneNumber', 'phoneNumber')} onChange={v => updateNestedMeta('business.phoneNumber', v)} />

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" /> Contract
              </label>
              <select
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white outline-none focus:border-cad-accent transition-all"
                value={asStringValue(getMetaValue('business.contract_id', 'contract_id'))}
                onChange={e => updateNestedMeta('business.contract_id', e.target.value ? e.target.value : null)}
              >
                <option value="">No Contract Linked</option>
                {(contracts || []).map(c => (
                  <option key={c.id} value={c.id}>{c.contract_number ? `[${c.contract_number}] ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* CALCULATIONS */}
        {isPolyline && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-amber-500 uppercase">
              <Sparkles className="w-3 h-3" /> Technical Stats
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded p-4 space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#666]">Length</span>
                <span className="font-bold text-amber-500">{asNumberValue(getMetaValue('gis.lengthKm', 'lengthKm')).toFixed(3)} KM</span>
              </div>
              <div className="flex justify-between items-center border-t border-amber-500/5 pt-2 text-[10px]">
                <span className="text-[#666]">Est. Loss</span>
                <span className="font-bold text-amber-500">{linkBudget.toFixed(2)} dB</span>
              </div>
            </div>
          </section>
        )}

        {/* METADATA CARDS */}
        <section className="space-y-4 pt-4 border-t border-[#333]">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-indigo-400 uppercase">
            <Settings className="w-3 h-3" /> Object Metadata
          </div>
          <div className="bg-[#111] p-3 rounded border border-indigo-500/10 space-y-3">
            <DesignField
              label="Object Type"
              icon={<Info className="w-3 h-3" />}
              value={getMetaValue('type', 'type')}
              onChange={v => updateNestedMeta('type', v)}
            />
            <DesignField
              label="Survey Notes"
              icon={<Pencil className="w-3 h-3" />}
              value={getMetaValue('description', 'description')}
              onChange={v => updateNestedMeta('description', v)}
            />
          </div>
        </section>

        {isCameraFeature && (
          <section className="space-y-4 pt-4 border-t border-[#333]">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-blue-400 uppercase">
              <Camera className="w-3 h-3" /> Camera Metadata
            </div>
            <div className="bg-[#111] p-3 rounded border border-blue-500/10 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <DesignField label="Telemetry ID" icon={<Radio className="w-3 h-3" />} value={getMetaValue('network.telemetry_id')} onChange={v => updateNestedMeta('network.telemetry_id', v)} />
                <DesignField label="Install Height" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('specs.install_height')} onChange={v => updateNestedMeta('specs.install_height', asNumberValue(v))} />
                <DesignField label="Focal Length" icon={<Camera className="w-3 h-3" />} value={getMetaValue('specs.focal_length')} onChange={v => updateNestedMeta('specs.focal_length', asNumberValue(v))} />
                <DesignField label="Sensor Size" icon={<Square className="w-3 h-3" />} value={getMetaValue('specs.sensor_size')} onChange={v => updateNestedMeta('specs.sensor_size', v)} />
                <DesignField label="Resolution X" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('specs.resolution_x')} onChange={v => updateNestedMeta('specs.resolution_x', asNumberValue(v))} />
                <DesignField label="Resolution Y" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('specs.resolution_y')} onChange={v => updateNestedMeta('specs.resolution_y', asNumberValue(v))} />
                <DesignField label="Rotation" icon={<RotateCw className="w-3 h-3" />} value={getMetaValue('gis.rotation', 'rotation')} onChange={v => updateNestedMeta('gis.rotation', asNumberValue(v))} />
                <DesignField label="FOV Angle" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('gis.fov_angle', 'fov_angle')} onChange={v => updateNestedMeta('gis.fov_angle', asNumberValue(v))} />
                <DesignField label="FOV Radius" icon={<Circle className="w-3 h-3" />} value={getMetaValue('gis.fov_radius', 'fov_radius')} onChange={v => updateNestedMeta('gis.fov_radius', asNumberValue(v))} />
                <DesignField label="Target Distance" icon={<MapPin className="w-3 h-3" />} value={getMetaValue('specs.target_distance')} onChange={v => updateNestedMeta('specs.target_distance', asNumberValue(v))} />
                <DesignField label="Target Height" icon={<MoveUpRight className="w-3 h-3" />} value={getMetaValue('specs.target_height')} onChange={v => updateNestedMeta('specs.target_height', asNumberValue(v))} />
              </div>
              <label className="flex items-center justify-between rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cad-text-muted">
                <span className="flex items-center gap-1.5"><Circle className="w-3 h-3" /> Show FOV</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-blue-500"
                  checked={getMetaValue('gis.fov_visible', 'fov_visible') === true}
                  onChange={e => updateNestedMeta('gis.fov_visible', e.target.checked)}
                />
              </label>
            </div>
          </section>
        )}

        {isIntersectionFeature && (
          <section className="space-y-4 pt-4 border-t border-[#333]">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-orange-400 uppercase">
              <Grid3X3 className="w-3 h-3" /> Intersection Metadata
            </div>
            <div className="bg-[#111] p-3 rounded border border-orange-500/10 space-y-3">
              <DesignField
                label="Network Role"
                icon={<Radio className="w-3 h-3" />}
                value={getMetaValue('network.role')}
                onChange={v => updateNestedMeta('network.role', v)}
              />
              <label className="flex items-center justify-between rounded border border-[#333] bg-[#0a0a0a] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cad-text-muted">
                <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Network Origin</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-orange-500"
                  checked={getMetaValue('network.is_origin') === true}
                  onChange={e => updateNestedMeta('network.is_origin', e.target.checked)}
                />
              </label>
            </div>
          </section>
        )}

        {isPolyline && (
          <section className="space-y-4 pt-4 border-t border-[#333]">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-emerald-400 uppercase">
              <Route className="w-3 h-3" /> Line Metadata
            </div>
            <div className="bg-[#111] p-3 rounded border border-emerald-500/10 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <ReadOnlyField label="Start Object" value={getFeatureNameById(state?.features, getMetaValue('network.from_feature_id') || getMetaValue('start_node_id')) || 'Not linked'} />
                <ReadOnlyField label="End Object" value={getFeatureNameById(state?.features, getMetaValue('network.to_feature_id') || getMetaValue('end_node_id')) || 'Not linked'} />
                <DesignField label="Cable Type" icon={<Radio className="w-3 h-3" />} value={getMetaValue('infrastructure.cable_type')} onChange={v => updateNestedMeta('infrastructure.cable_type', v)} />
                <DesignField label="Core Count" icon={<Layers className="w-3 h-3" />} value={getMetaValue('infrastructure.core_count')} onChange={v => updateNestedMeta('infrastructure.core_count', asNumberValue(v))} />
                <DesignField label="Depth" icon={<Construction className="w-3 h-3" />} value={getMetaValue('infrastructure.depth')} onChange={v => updateNestedMeta('infrastructure.depth', asNumberValue(v))} />
                <DesignField label="Surface" icon={<Grid3X3 className="w-3 h-3" />} value={getMetaValue('infrastructure.surface_type')} onChange={v => updateNestedMeta('infrastructure.surface_type', v)} />
              </div>
            </div>
          </section>
        )}

        {/* MEDIA */}
        <section
          className="space-y-4 pt-4 border-t border-[#333] outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/60"
          tabIndex={0}
          onPaste={handleMediaPaste}
          onClick={(event) => event.currentTarget.focus()}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#555] uppercase">
              <ImageIcon className="w-3 h-3" /> Site Photos
            </div>
            <button
              onClick={startCamera}
              disabled={isImportingMedia}
              className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase flex items-center gap-1"
            >
              {isImportingMedia ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              {isImportingMedia ? 'Saving...' : 'Capture'}
            </button>
          </div>

          {mediaImportError ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-red-300">
              {mediaImportError}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {displayImageUrls.length > 0 ? (
              displayImageUrls.map((url, idx) => (
                <div key={idx} className="aspect-video rounded overflow-hidden border border-[#333] relative group">
                  <img src={url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                    <button
                      onClick={() => setEditingImage({ index: idx, url })}
                      className="p-1 px-2 bg-indigo-500 text-white rounded text-[10px] font-bold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeImageUrl(idx)}
                      className="p-1 px-2 bg-red-500 text-white rounded text-[10px] font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div
                onClick={startCamera}
                className="col-span-2 py-8 border border-dashed border-[#333] rounded flex flex-col items-center justify-center gap-2 text-[#444] cursor-pointer hover:border-[#555] transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">No photos attached</span>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-[#333] bg-[#222]">
        <button
          onClick={handleSave}
          disabled={isSaving || (!isNameDirty && !isMetadataDirty)}
          className={cn(
            "w-full py-2.5 rounded text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
            isSaved
              ? "bg-emerald-500 text-white"
              : "bg-cad-accent hover:bg-cad-accent/90 disabled:bg-[#333] text-[#111]"
          )}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSaved ? (
            <Zap className="w-3.5 h-3.5 animate-bounce" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? 'PERSISTING...' : isSaved ? 'SAVED SUCCESSFUL' : 'SAVE SPECS'}
        </button>
      </div>
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Xóa Đối Tượng"
        message={`Bạn có chắc chắn muốn xóa đối tượng "${localName || feature.id}"? Hành động này không thể hoàn tác.`}
        itemName={localName || feature.id}
      />
      {editingImage && (
        <ImageEditorModal
          imageUrl={editingImage.url}
          imageIndex={editingImage.index}
          onCancel={() => setEditingImage(null)}
          onSave={replaceImageUrl}
        />
      )}
    </aside >
  );
};

const ReadOnlyField = ({ label, value }: { label: string, value: string }) => (
  <div className="space-y-1">
    <label className="text-[8px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1">{label}</label>
    <div className="bg-[#0a0a0a] rounded px-2 py-1 text-[10px] font-mono text-cad-accent/70 border border-[#222]">
      {value}
    </div>
  </div>
);

const DesignField = ({ label, icon, value, onChange }: { label: string, icon: React.ReactNode, value: unknown, onChange: (v: string) => void }) => {
  const inputId = React.useId();

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-[9px] font-bold text-cad-text-muted uppercase tracking-tighter ml-1 flex items-center gap-1.5">
        {icon} {label}
      </label>
      <input
        id={inputId}
        className="w-full bg-[#111] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:border-cad-accent outline-none transition-all"
        value={asStringValue(value)}
        onChange={e => onChange(e.target.value)}
        placeholder={`Enter ${safeString(label).toLowerCase()}...`}
      />
    </div>
  );
};
