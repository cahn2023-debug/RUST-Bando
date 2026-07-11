// Standardized metadata schema
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, MapPin, Route, Trash, Camera, Image as ImageIcon, Plus, Loader2, Download, ChevronLeft, ChevronRight, Star, MessageSquare, Clock, Maximize2 } from 'lucide-react';
import { IconSelector } from '@DESIGN/components/ui/IconSelector';
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

    setName(feature.name || '');
    setDescription(meta.description || '');
    setImageUrl(meta.media?.imageUrl || '');
    setImageUrls(meta.media?.imageUrls || []);
    setVertexMetadata(meta.vertexMetadata || {});
    setColor(meta.color || '#3b82f6');
    setSize(meta.size || (feature.geom_type === 'Point' ? 32 : 4));
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
    <div className="flex flex-col h-full bg-white w-full border-l border-gray-100 overflow-hidden">

      {/* Lightbox / SlideShow */}
      {viewingImageIndex !== null && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setViewingImageIndex(null)}>
          <div className="absolute top-6 right-6 flex gap-3">
            <button onClick={(e) => { e.stopPropagation(); downloadImage(imageUrls[viewingImageIndex]); }} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/10"><Download className="w-5 h-5" /></button>
            <button onClick={() => setViewingImageIndex(null)} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/10"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative w-full flex items-center justify-center gap-4">
            {imageUrls.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(p => p! > 0 ? p! - 1 : imageUrls.length - 1); }} className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-full"><ChevronLeft className="w-8 h-8" /></button>
            )}
            <img src={imageUrls[viewingImageIndex]} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()} />
            {imageUrls.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(p => p! < imageUrls.length - 1 ? p! + 1 : 0); }} className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-full"><ChevronRight className="w-8 h-8" /></button>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          {feature.geom_type === 'LineString' ? <Route className="w-4 h-4 text-emerald-500" /> : <MapPin className="w-4 h-4 text-blue-500" />}
          Cấu hình {feature.geom_type === 'LineString' ? 'Tuyến' : 'Điểm'}
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-all"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-4 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
        {/* Camera UI Overlay */}
        {isCameraOpen && (
          <div className="absolute inset-0 z-[1000] bg-black flex flex-col">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!stream ? 'hidden' : ''}`} />
            <div className="absolute top-6 left-6 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-lg text-[10px] text-white font-mono flex items-center gap-2 border border-white/10"><Clock className="w-3 h-3 text-indigo-400" /> {currentTime}</div>
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-10 px-4">
              <button onClick={stopCamera} className="w-14 h-14 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md flex items-center justify-center border border-white/10"><X className="w-6 h-6" /></button>
              <button onClick={() => videoRef.current && applyWatermark(videoRef.current)} disabled={!stream || isCapturing} className="w-20 h-20 bg-white text-indigo-600 rounded-full shadow-2xl border-4 border-indigo-100 flex items-center justify-center active:scale-90 transition-transform">{isCapturing ? <Loader2 className="w-10 h-10 animate-spin" /> : <Camera className="w-10 h-10" />}</button>
              <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md flex items-center justify-center border border-white/10"><ImageIcon className="w-6 h-6" /></button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên đối tượng</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mô tả tổng quát</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full mt-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Màu sắc</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full rounded-xl cursor-pointer border-0 p-0" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{feature.geom_type === 'Point' ? 'Kích thước' : 'Độ dày'}</label>
              <div className="mt-1 flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 h-10">
                <input
                  type="number"
                  value={size}
                  onChange={e => setSize(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">px</span>
              </div>
            </div>
          </div>

          {feature.geom_type === 'Point' && (
            <IconSelector value={icon} onChange={setIcon} />
          )}

          {feature.geom_type === 'LineString' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Danh sách điểm chốt</label>
                <span className="text-[9px] font-bold text-slate-300 uppercase">{coords.length} điểm</span>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {coords.map((c, idx) => {
                  const isSelected = selectedVertexIndex === idx;
                  const meta = vertexMetadata[idx] || {};
                  const images = meta.imageUrls || (meta.imageUrl ? [meta.imageUrl] : []);

                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border-2 transition-all overflow-hidden ${isSelected ? 'border-emerald-500 bg-emerald-50/30 shadow-md' : 'border-slate-100 bg-white'}`}
                      onClick={() => onVertexSelect?.(idx)}
                    >
                      <div className="p-3 flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px] ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-700">Điểm chốt {idx + 1}</p>
                            <p className="text-[9px] font-mono text-slate-400">{c[0].toFixed(5)}, {c[1].toFixed(5)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {images.length > 0 && (
                            <div className="flex -space-x-2">
                              {images.slice(0, 3).map((img, i) => (
                                <div key={i} className="w-6 h-6 rounded-md border-2 border-white overflow-hidden">
                                  <img src={img} className="w-full h-full object-cover" />
                                </div>
                              ))}
                              {images.length > 3 && <div className="w-6 h-6 rounded-md border-2 border-white bg-slate-200 text-[8px] flex items-center justify-center font-black">+{images.length - 3}</div>}
                            </div>
                          )}
                          <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {isSelected && (
                        <div className="p-3 pt-0 space-y-3 animate-in slide-in-from-top-2">
                          <div className="h-px bg-emerald-100 mx-2" />

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Ghi chú cho điểm này</label>
                            <textarea
                              value={meta.description || ''}
                              onChange={(e) => setVertexMetadata(v => ({ ...v, [idx]: { ...(v[idx] || {}), description: e.target.value } }))}
                              placeholder="Nhập nội dung quan sát tại điểm..."
                              className="w-full p-3 bg-white border border-emerald-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-200 resize-none"
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1.5"><ImageIcon className="w-3 h-3" /> Hình ảnh hiện trường</label>
                              <button
                                onClick={(e) => { e.stopPropagation(); startCamera(idx); }}
                                className="flex items-center gap-1 text-[9px] font-black text-white bg-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-700 transition-colors"
                              >
                                <Camera className="w-3 h-3" /> Chụp ảnh
                              </button>
                            </div>

                            {images.length > 0 ? (
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {images.map((img, iIdx) => (
                                  <div key={iIdx} className="relative group shrink-0 w-24 aspect-square rounded-xl overflow-hidden border border-emerald-200">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeVertexImage(idx, iIdx); }}
                                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Trash className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-4 border-2 border-dashed border-emerald-100 rounded-xl text-center">
                                <p className="text-[9px] font-bold text-slate-300 uppercase">Chưa có ảnh cho điểm này</p>
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

          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center px-1 mb-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ảnh dự án / Hiện trường chung ({imageUrls.length})</label>
              <button onClick={() => startCamera('main')} className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> Thêm ảnh</button>
            </div>

            {imageUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {imageUrls.map((url, idx) => {
                  const isMain = url === imageUrl;
                  return (
                    <div key={idx} className={`group relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${isMain ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                      <img src={url} className="w-full h-full object-cover" />
                      {isMain && <div className="absolute top-2 left-2 bg-indigo-600 text-white p-1 rounded-md shadow-lg"><Star className="w-3 h-3 fill-current" /></div>}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <div className="flex gap-2">
                          <button onClick={() => setViewingImageIndex(idx)} className="p-2 bg-white text-indigo-600 rounded-lg hover:scale-110 transition-transform"><Maximize2 className="w-4 h-4" /></button>
                          <button onClick={() => downloadImage(url)} className="p-2 bg-white text-slate-600 rounded-lg hover:scale-110 transition-transform"><Download className="w-4 h-4" /></button>
                        </div>
                        <div className="flex gap-2">
                          {!isMain && <button onClick={() => setImageUrl(url)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-indigo-700">Làm ảnh chính</button>}
                          <button onClick={() => {
                            setDeleteModalConfig({ isOpen: true, type: 'image', targetIdx: idx });
                          }} className="p-2 bg-red-500 text-white rounded-lg hover:scale-110 transition-transform"><Trash className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button onClick={() => startCamera('main')} className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 transition-all">
                <Camera className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">Thêm ảnh tổng quát</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t bg-slate-50 flex justify-between gap-3 shrink-0">
        <button onClick={handleDelete} className="px-5 py-2 text-xs font-black text-red-500 uppercase hover:bg-red-50 rounded-xl transition-all">Xóa</button>
        <button onClick={handleSave} className="flex-1 py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"><Save className="w-4 h-4" /> Lưu cấu hình</button>
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
