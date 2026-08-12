// Standardized metadata schema
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, MapPin, Route, Trash, Camera, Image as ImageIcon, Plus, Loader2, Download, ChevronLeft, ChevronRight, Star, MessageSquare, Clock, Maximize2 } from 'lucide-react';
import { IconSelector } from '@DESIGN/components/ui/IconSelector';
import { Button } from '@DESIGN/components/ui/Button';
import type { IconType, VertexMetadata } from '@CONTRACT/types';
import { FeatureState } from '@CONTRACT/types';
import { normalizeMetadataObject, normalizeMetadataWithAI } from '@TOOL/utils/metadataNormalization';

const parseCoordinateList = (coordinates: unknown): [number, number][] => {
  if (Array.isArray(coordinates)) {
    return Array.isArray(coordinates[0]) ? coordinates as [number, number][] : [coordinates as [number, number]];
  }

  if (typeof coordinates === 'string') {
    const parsed = JSON.parse(coordinates);
    return Array.isArray(parsed[0]) ? parsed as [number, number][] : [parsed as [number, number]];
  }

  return [];
};
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { confirmUserAction } from '@SHARED/utils/userConfirmation';

interface FeatureEditorProps {
  feature: FeatureState;
  selectedVertexIndex?: number | null;
  onVertexSelect?: (index: number | null) => void;
  onSave: (id: string, updates: any) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export const FeatureEditor: React.FC<FeatureEditorProps> = ({
  feature, selectedVertexIndex, onVertexSelect, onSave, onClose, onDelete
}) => {
  const metaObj = normalizeMetadataObject(typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {}));

  const [name, setName] = useState(feature.name || '');
  const [description, setDescription] = useState(metaObj.description || '');
  const [imageUrl, setImageUrl] = useState(metaObj.media?.imageUrl || '');
  const [imageUrls, setImageUrls] = useState<string[]>(metaObj.media?.imageUrls || []);
  const [vertexMetadata, setVertexMetadata] = useState<Record<number, VertexMetadata>>(metaObj.vertexMetadata || {});
  const [color, setColor] = useState(metaObj.color || '#3b82f6');
  const [size, setSize] = useState(metaObj.size || 32);
  const [icon, setIcon] = useState<IconType>((metaObj.icon as IconType) || 'default');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'main' | number>('main');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString('vi-VN'));
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteModalConfig, setDeleteModalConfig] = useState<{ isOpen: boolean; type: 'feature' | 'image' | null; targetIdx: number | null }>({
    isOpen: false,
    type: null,
    targetIdx: null
  });

  useEffect(() => {
    const raw = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
    const meta = normalizeMetadataObject(raw);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(feature.name || '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDescription(meta.description || '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(meta.media?.imageUrl || '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrls(meta.media?.imageUrls || []);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVertexMetadata(meta.vertexMetadata || {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColor(meta.color || '#3b82f6');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(meta.size || (feature.geom_type === 'Point' ? 32 : 4));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIcon((meta.icon as IconType) || 'default');
  }, [feature?.id]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleString('vi-VN')), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isCameraOpen && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [isCameraOpen, stream]);

  const startCamera = (target: 'main' | number) => {
    setCameraTarget(target);
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(s => {
      setStream(s);
      setIsCameraOpen(true);
    }).catch(() => {
      setIsCameraOpen(true);
    });
  };

  const stopCamera = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsCameraOpen(false);
    setIsCapturing(false);
  };

  const applyWatermark = (source: HTMLVideoElement | HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsCapturing(true);
    const isVideo = source instanceof HTMLVideoElement;
    canvas.width = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
    canvas.height = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;

    if (canvas.width === 0) { canvas.width = 1280; canvas.height = 720; }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const timestamp = new Date().toLocaleString('vi-VN');

      let targetCoords: [number, number] | null = null;
      let coords: [number, number][] = [];
      try {
        coords = parseCoordinateList(feature.coordinates);
      } catch (e) {
        console.error('[FeatureEditor] Failed to parse coordinates:', e);
        coords = [];
      }

      if (cameraTarget === 'main') {
        const first = Array.isArray(coords[0]) ? coords[0] : coords;
        targetCoords = (first as any) || null;
      } else {
        targetCoords = coords[cameraTarget as number];
      }

      const fontSize = Math.max(18, Math.floor(canvas.height / 35));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const padding = fontSize;
      const lineHeight = fontSize * 1.5;
      const lines = [
        targetCoords ? `📍 Tọa độ: ${targetCoords[0].toFixed(6)}, ${targetCoords[1].toFixed(6)}` : null,
        `⏰ Thời gian: ${timestamp}`,
        `🏢 Đối tượng: ${name || 'N/A'}`
      ].filter(Boolean);

      const boxWidth = Math.min(canvas.width * 0.8, 600);
      const boxHeight = lines.length * lineHeight + padding;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, canvas.height - boxHeight, boxWidth, boxHeight);
      ctx.fillStyle = "white";
      let currentY = canvas.height - padding;
      lines.reverse().forEach(line => { if (line) { ctx.fillText(line, padding, currentY); currentY -= lineHeight; } });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      if (cameraTarget === 'main') {
        setImageUrls(prev => [...prev, dataUrl]);
        if (!imageUrl) setImageUrl(dataUrl);
      } else {
        const idx = cameraTarget as number;
        setVertexMetadata(prev => {
          const currentMeta = prev[idx] || {};
          const currentImages = currentMeta.imageUrls || (currentMeta.imageUrl ? [currentMeta.imageUrl] : []);
          return { ...prev, [idx]: { ...currentMeta, imageUrls: [...currentImages, dataUrl], imageUrl: dataUrl } };
        });
      }
      stopCamera();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => applyWatermark(img);
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `CAD_${name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
    link.click();
  };

  const removeVertexImage = (vIdx: number, imgIdx: number) => {
    setVertexMetadata(prev => {
      const meta = { ...prev[vIdx] };
      const imgs = [...(meta.imageUrls || [])];
      imgs.splice(imgIdx, 1);
      return { ...prev, [vIdx]: { ...meta, imageUrls: imgs, imageUrl: imgs.length > 0 ? imgs[0] : undefined } };
    });
  };

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    setIsDeleteModalOpen(false);
    onDelete(feature.id);
  };

  const handleSave = async () => {
    if (!(await confirmUserAction(`Xác nhận lưu cấu hình và vị trí của đối tượng "${name}"?`))) return;
    const metadata = {
      description,
      imageUrl,
      imageUrls,
      vertexMetadata,
      color,
      size,
      icon
    };

    const normalizedMeta = await normalizeMetadataWithAI(metadata, name);
    onSave(feature.id, {
      name,
      metadata: JSON.stringify(normalizedMeta)
    });
  };

  let coords: [number, number][] = [];
  try {
    coords = parseCoordinateList(feature.coordinates);
  } catch (e) {
    console.error('[FeatureEditor] Failed to parse feature coordinates:', e);
    coords = [];
  }

  return (
    <div className="flex flex-col h-full bg-cad-bg text-cad-text-primary w-full border-l border-cad-border overflow-hidden">

      {/* Lightbox / SlideShow */}
      {viewingImageIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          tabIndex={-1}
          className="fixed inset-0 z-cad-modal-nested bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingImageIndex(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setViewingImageIndex(null);
          }}
        >
          <div className="absolute top-6 right-6 flex gap-3">
              <button onClick={(e) => { e.stopPropagation(); downloadImage(imageUrls[viewingImageIndex]); }} className="p-3 bg-cad-text-primary/10 hover:bg-cad-text-primary/20 text-cad-text-primary rounded-full border border-cad-text-primary/10"><Download className="w-5 h-5" /></button>
              <button onClick={() => setViewingImageIndex(null)} className="p-3 bg-cad-text-primary/10 hover:bg-cad-text-primary/20 text-cad-text-primary rounded-full border border-cad-text-primary/10"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative w-full flex items-center justify-center gap-4">
            {imageUrls.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(p => p! > 0 ? p! - 1 : imageUrls.length - 1); }} className="p-4 bg-cad-text-primary/5 hover:bg-cad-text-primary/10 text-cad-text-primary rounded-full"><ChevronLeft className="w-8 h-8" /></button>
            )}
            <img src={imageUrls[viewingImageIndex]} alt="Selected feature" className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10" />
            {imageUrls.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(p => p! < imageUrls.length - 1 ? p! + 1 : 0); }} className="p-4 bg-cad-text-primary/5 hover:bg-cad-text-primary/10 text-cad-text-primary rounded-full"><ChevronRight className="w-8 h-8" /></button>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-b border-cad-border bg-cad-surface flex justify-between items-center shrink-0">
        <h2 className="font-bold text-cad-text-primary flex items-center gap-2">
          {feature.geom_type === 'LineString' ? <Route className="w-4 h-4 text-cad-accent" /> : <MapPin className="w-4 h-4 text-cad-accent" />}
          Cấu hình {feature.geom_type === 'LineString' ? 'Tuyến' : 'Điểm'}
        </h2>
        <Button
          onClick={onClose}
          variant="ghost"
          size="md"
          icon={X}
          ariaLabel="Đóng bảng cấu hình"
          className="rounded-full"
        />
      </div>

      <div className="p-4 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
        {/* Camera UI Overlay */}
        {isCameraOpen && (
          <div className="absolute inset-0 z-10 bg-black flex flex-col">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!stream ? 'hidden' : ''}`} />
            <div className="absolute top-6 left-6 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-lg text-[10px] text-white font-mono flex items-center gap-2 border border-white/10"><Clock className="w-3 h-3 text-cad-accent" /> {currentTime}</div>
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-10 px-4">
              <button onClick={stopCamera} className="w-14 h-14 bg-cad-text-primary/20 hover:bg-cad-text-primary/30 text-cad-text-primary rounded-full backdrop-blur-md flex items-center justify-center border border-cad-text-primary/10"><X className="w-6 h-6" /></button>
              <button onClick={() => videoRef.current && applyWatermark(videoRef.current)} disabled={!stream || isCapturing} className="w-20 h-20 bg-cad-text-primary text-cad-accent rounded-full shadow-2xl border-4 border-cad-accent/20 flex items-center justify-center active:scale-90 transition-transform">{isCapturing ? <Loader2 className="w-10 h-10 animate-spin" /> : <Camera className="w-10 h-10" />}</button>
              <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-cad-text-primary/20 hover:bg-cad-text-primary/30 text-cad-text-primary rounded-full backdrop-blur-md flex items-center justify-center border border-cad-text-primary/10"><ImageIcon className="w-6 h-6" /></button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest ml-1">Tên đối tượng</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-3 bg-cad-bg border border-cad-border rounded-xl text-sm font-bold text-cad-text-primary outline-none focus:border-cad-accent" />
          </div>

          <div>
            <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest ml-1">Mô tả tổng quát</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full mt-1 p-3 bg-cad-bg border border-cad-border rounded-xl text-sm text-cad-text-primary outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest ml-1">Màu sắc</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full rounded-xl cursor-pointer border-0 p-0" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest ml-1">{feature.geom_type === 'Point' ? 'Kích thước' : 'Độ dày'}</label>
              <div className="mt-1 flex items-center gap-2 bg-cad-surface border border-cad-border rounded-xl px-3 h-10">
                <input
                  type="number"
                  value={size}
                  onChange={e => setSize(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
                <span className="text-xs text-cad-text-muted font-bold">px</span>
              </div>
            </div>
          </div>

          {feature.geom_type === 'Point' && (
            <IconSelector value={icon} onChange={setIcon} />
          )}

          {feature.geom_type === 'LineString' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-cad-accent uppercase tracking-widest">Danh sách điểm chốt</label>
                <span className="text-[9px] font-bold text-cad-text-muted uppercase">{coords.length} điểm</span>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {coords.map((c, idx) => {
                  const isSelected = selectedVertexIndex === idx;
                  const meta = vertexMetadata[idx] || {};
                  const images = meta.imageUrls || (meta.imageUrl ? [meta.imageUrl] : []);

                  return (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      className={`rounded-2xl border-2 transition-all overflow-hidden ${isSelected ? 'border-cad-accent bg-cad-accent/10 shadow-md' : 'border-cad-border bg-cad-surface'}`}
                      onClick={() => onVertexSelect?.(idx)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        onVertexSelect?.(idx);
                      }}
                    >
                      <div className="p-3 flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px] ${isSelected ? 'bg-cad-accent text-black' : 'bg-cad-elevated text-cad-text-muted'}`}>
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-cad-text-primary">Điểm chốt {idx + 1}</p>
                            <p className="text-[9px] font-mono text-cad-text-muted">{c[0].toFixed(5)}, {c[1].toFixed(5)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {images.length > 0 && (
                            <div className="flex -space-x-2">
                              {images.slice(0, 3).map((img, i) => (
                                <div key={i} className="w-6 h-6 rounded-md border-2 border-cad-border overflow-hidden">
                                  <img src={img} className="w-full h-full object-cover" />
                                </div>
                              ))}
                              {images.length > 3 && <div className="w-6 h-6 rounded-md border-2 border-cad-border bg-cad-elevated text-[8px] flex items-center justify-center font-black text-cad-text-primary">+{images.length - 3}</div>}
                            </div>
                          )}
                          <ChevronRight className={`w-4 h-4 text-cad-text-muted transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {isSelected && (
                        <div className="p-3 pt-0 space-y-3 animate-in slide-in-from-top-2">
                          <div className="h-px bg-cad-border mx-2" />

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-cad-accent uppercase flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Ghi chú cho điểm này</label>
                            <textarea
                              value={meta.description || ''}
                              onChange={(e) => setVertexMetadata(v => ({ ...v, [idx]: { ...(v[idx] || {}), description: e.target.value } }))}
                              placeholder="Nhập nội dung quan sát tại điểm..."
                              className="w-full p-3 bg-cad-bg border border-cad-border rounded-xl text-xs text-cad-text-primary outline-none focus:border-cad-accent resize-none"
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-black text-cad-accent uppercase flex items-center gap-1.5"><ImageIcon className="w-3 h-3" /> Hình ảnh hiện trường</label>
                              <Button
                                onClick={(e) => { e.stopPropagation(); startCamera(idx); }}
                                variant="primary"
                                size="sm"
                                icon={Camera}
                                className="rounded-lg"
                              >
                                Chụp ảnh
                              </Button>
                            </div>

                            {images.length > 0 ? (
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {images.map((img, iIdx) => (
                                  <div key={iIdx} className="relative group shrink-0 w-24 aspect-square rounded-xl overflow-hidden border border-cad-border">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <Button
                                      onClick={(e) => { e.stopPropagation(); removeVertexImage(idx, iIdx); }}
                                      variant="danger"
                                      size="sm"
                                      icon={Trash}
                                      ariaLabel="Xóa ảnh điểm chốt"
                                      className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-4 border-2 border-dashed border-cad-border rounded-xl text-center">
                                <p className="text-[9px] font-bold text-cad-text-muted uppercase">Chưa có ảnh cho điểm này</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-cad-border">
            <div className="flex justify-between items-center px-1 mb-3">
              <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Ảnh dự án / Hiện trường chung ({imageUrls.length})</label>
              <Button
                onClick={() => startCamera('main')}
                variant="ghost"
                size="sm"
                icon={Plus}
                className="text-[10px] font-black uppercase text-cad-accent hover:text-cad-active hover:bg-transparent hover:underline"
              >
                Thêm ảnh
              </Button>
            </div>

            {imageUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {imageUrls.map((url, idx) => {
                  const isMain = url === imageUrl;
                  return (
                    <div key={idx} className={`group relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${isMain ? 'border-cad-accent shadow-lg' : 'border-cad-border'}`}>
                      <img src={url} className="w-full h-full object-cover" />
                      {isMain && <div className="absolute top-2 left-2 bg-cad-accent text-black p-1 rounded-md shadow-lg"><Star className="w-3 h-3 fill-current" /></div>}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setViewingImageIndex(idx)}
                            variant="secondary"
                            size="md"
                            icon={Maximize2}
                            ariaLabel="Xem ảnh phóng to"
                            className="bg-cad-surface text-cad-accent rounded-lg hover:bg-cad-surface hover:scale-110 transition-transform"
                          />
                          <Button
                            onClick={() => downloadImage(url)}
                            variant="secondary"
                            size="md"
                            icon={Download}
                            ariaLabel="Tải ảnh xuống"
                            className="bg-cad-surface text-cad-text-secondary rounded-lg hover:bg-cad-surface hover:scale-110 transition-transform"
                          />
                        </div>
                        <div className="flex gap-2">
                          {!isMain && (
                            <Button
                              onClick={() => setImageUrl(url)}
                              variant="primary"
                              size="sm"
                              className="px-3 rounded-lg text-[8px] font-black uppercase tracking-widest"
                            >
                              Làm ảnh chính
                            </Button>
                          )}
                          <Button
                            onClick={() => {
                              setDeleteModalConfig({ isOpen: true, type: 'image', targetIdx: idx });
                            }}
                            variant="danger"
                            size="md"
                            icon={Trash}
                            ariaLabel="Xóa ảnh"
                            className="rounded-lg hover:scale-110 transition-transform"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button onClick={() => startCamera('main')} className="w-full aspect-video bg-cad-surface border-2 border-dashed border-cad-border rounded-2xl flex flex-col items-center justify-center gap-3 text-cad-text-muted hover:text-cad-accent hover:border-cad-accent/40 transition-all">
                <Camera className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">Thêm ảnh tổng quát</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-cad-border bg-cad-surface flex justify-between gap-3 shrink-0">
        <Button
          onClick={handleDelete}
          variant="ghost"
          size="lg"
          className="px-5 text-xs font-black uppercase text-cad-danger hover:bg-cad-danger/10 hover:text-cad-danger rounded-xl"
        >
          Xóa
        </Button>
        <Button
          onClick={handleSave}
          variant="primary"
          size="lg"
          icon={Save}
          className="flex-1 h-auto py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95"
        >
          Lưu cấu hình
        </Button>
      </div>
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa đối tượng"
        itemName={name}
        message="Bạn có chắc chắn muốn xóa đối tượng này khỏi bản vẽ? Hành động này không thể hoàn tác."
      />

      {/* Thêm state cho việc xóa ảnh riêng lẻ nếu cần, nhưng tạm thời dùng modal chung cho object */}
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen && deleteModalConfig.type === 'image'}
        onClose={() => setDeleteModalConfig({ isOpen: false, type: null, targetIdx: null })}
        onConfirm={() => {
          if (deleteModalConfig.targetIdx === null) return;
          const newImgs = [...imageUrls];
          newImgs.splice(deleteModalConfig.targetIdx, 1);
          setImageUrls(newImgs);
          if (imageUrl === imageUrls[deleteModalConfig.targetIdx]) setImageUrl(newImgs[0] || '');
          setDeleteModalConfig({ isOpen: false, type: null, targetIdx: null });
        }}
        title="Xác nhận xóa hình ảnh"
        itemName="Hình ảnh hiện trường"
        message="Bạn có chắc chắn muốn xóa hình ảnh này?"
      />
    </div>
  );
};
