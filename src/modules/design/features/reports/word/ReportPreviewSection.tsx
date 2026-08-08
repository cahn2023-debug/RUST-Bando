import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { safeInvoke as invoke } from "@IMPLEMENT/lib/tauri";
import { resolveMediaAsset } from "@IMPLEMENT/services/mediaAssetService";
import { cn } from "@SHARED/utils/cn";
import type { ReportPhoto, ReportModel } from "./reportModel";
import type { ReportImageMap, ReportImageRef } from "./reportDocx";

const imageRefSrc = (image?: ReportImageRef | string): string | undefined => (
  typeof image === "string" ? image : image?.objectUrl || image?.dataUrl
);

export function SitePhotoPreviewItem({ photo, projectId }: { photo: ReportPhoto; projectId?: string | null }) {
  const [src, setSrc] = useState<string | null>(photo.dataUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!photo.dataUrl);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);

    if (photo.dataUrl) {
      setSrc(photo.dataUrl);
      setLoading(false);
      return;
    }

    const tryLoad = async () => {
      if (photo.absolutePath) {
        try {
          const bytes = await invoke<number[] | Uint8Array>("read_binary_file", { path: photo.absolutePath });
          if (cancelled) return;
          const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          const mime = photo.mimeType || (photo.relativePath?.endsWith(".png") ? "image/png" : "image/jpeg");
          const blob = new Blob([uint8], { type: mime });
          createdUrl = URL.createObjectURL(blob);
          setSrc(createdUrl);
          setLoading(false);
          return;
        } catch (e) {
          console.warn("[SitePhotoPreviewItem] Binary read error, trying fallback:", photo.absolutePath, e);
        }
      }

      const effectiveProjectId = projectId || photo.projectId;
      if (effectiveProjectId && photo.assetId) {
        try {
          const asset = await resolveMediaAsset(effectiveProjectId, photo.assetId);
          if (cancelled) return;
          if (asset.src) {
            setSrc(asset.src);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("[SitePhotoPreviewItem] Failed to resolve media asset:", photo.assetId, e);
        }
      }

      if (!cancelled) {
        setSrc(null);
        setError(photo.warning || "Không thể nạp file ảnh");
        setLoading(false);
      }
    };

    void tryLoad();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [photo, projectId]);

  if (error || (!loading && !src && photo.status === "missing")) {
    return (
      <div className="border border-dashed border-amber-300 bg-amber-50/60 p-3 rounded text-xs text-amber-800">
        <p className="font-bold flex items-center gap-1">⚠️ Cảnh báo thiếu ảnh hiện trường</p>
        <p className="mt-1">Mã Asset ID: <code className="font-mono bg-amber-100/80 px-1 rounded">{photo.assetId || "-"}</code></p>
        <p className="mt-0.5 truncate">Đường dẫn: {photo.relativePath || "-"}</p>
      </div>
    );
  }

  return (
    <figure className="border bg-white rounded p-2 shadow-sm relative">
      {loading ? (
        <div className="w-full h-40 flex items-center justify-center bg-slate-100 rounded text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : src ? (
        <img src={src} alt={photo.label} loading="lazy" className="w-full h-40 object-contain rounded" />
      ) : (
        <div className="w-full h-40 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-400">
          Không tìm thấy ảnh
        </div>
      )}
      <figcaption className="text-xs text-slate-600 mt-1.5 font-medium flex items-center justify-between">
        <span>{photo.label} {photo.isPrimary ? "(Ảnh đại diện)" : ""}</span>
        <span className="text-[10px] text-slate-400 font-mono">ID: {photo.assetId || photo.id}</span>
      </figcaption>
    </figure>
  );
}

export function ReportPreviewSection({
  model,
  imageMap,
  activeSectionId,
  onSelectSection,
}: {
  model: ReportModel;
  imageMap: ReportImageMap;
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
}) {
  const projectId = useDesignSync((store) => store.projectId);
  const activeSection = model.sections.find((section) => section.id === activeSectionId) || model.sections[0];
  const activeMapImage = activeSection ? imageMap[activeSection.id] : undefined;
  const activeMapImageSrc = imageRefSrc(activeMapImage);
  const [isTocOpen, setIsTocOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(activeSection ? [activeSection.id] : []),
  );

  useEffect(() => {
    if (!activeSection) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSections((prev) => {
      if (prev.has(activeSection.id)) return prev;
      const next = new Set(prev);
      next.add(activeSection.id);
      return next;
    });
  }, [activeSection]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_1fr] bg-slate-50 text-sm">
      <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-100/90">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 p-3">
          <h1 className="truncate text-sm font-black uppercase text-slate-900">{model.title}</h1>
          <p className="text-[11px] text-slate-500">{model.sections.length} mục chi tiết</p>
        </div>
        <div className="p-2">
          <button
            type="button"
            onClick={() => setIsTocOpen((value) => !value)}
            className="mb-1 flex w-full items-center gap-1 rounded px-2 py-2 text-left text-[11px] font-black uppercase tracking-wide text-slate-700 hover:bg-white"
          >
            {isTocOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Mục lục
          </button>
          {isTocOpen && (
            <div className="space-y-1">
              {model.sections.map((section, index) => {
                const isActive = activeSection?.id === section.id;
                const isExpanded = expandedSections.has(section.id);
                return (
                  <div key={section.id}>
                    <div className={cn("flex items-center rounded", isActive ? "bg-white shadow-sm" : "hover:bg-white/70")}>
                      <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        className="flex h-8 w-7 shrink-0 items-center justify-center text-slate-500"
                        aria-label={isExpanded ? "Thu gọn mục" : "Mở rộng mục"}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSection(section.id)}
                        className={cn("min-w-0 flex-1 truncate py-2 pr-2 text-left text-xs", isActive ? "font-bold text-blue-800" : "text-slate-700")}
                        title={section.title}
                      >
                        {index + 1}. {section.title}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-7 mt-1 space-y-1 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => onSelectSection(section.id)}
                          className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-white"
                        >
                          Ảnh bản đồ và tổng hợp
                        </button>
                        {section.details.map((detail) => (
                          <button
                            key={detail.feature.id}
                            type="button"
                            onClick={() => onSelectSection(section.id)}
                            className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-white"
                            title={`${detail.label}: ${detail.feature.name}`}
                          >
                            {detail.label}: {detail.feature.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <article className="min-h-0 overflow-y-auto bg-white p-8 leading-relaxed text-slate-900">
        <div className="mx-auto max-w-[820px]">
          <h1 className="mb-2 text-center text-2xl font-bold">{model.title}</h1>
          <p className="mb-8 text-center text-slate-500">Ngày tạo: {new Date(model.generatedAt).toLocaleString("vi-VN")}</p>

      {activeSection ? (
        <section key={activeSection.id} id={activeSection.anchor} className="mb-10 break-inside-avoid">
          <h2 className="text-xl font-bold mb-3">{activeSection.title} <span className="text-slate-500">({activeSection.displayType})</span></h2>
          {activeMapImageSrc ? (
            <img src={activeMapImageSrc} alt={activeSection.title} loading="lazy" className="w-full max-h-[360px] object-contain border mb-3" />
          ) : (
            <div className="h-40 border bg-slate-100 text-slate-500 flex items-center justify-center mb-3">Chưa capture ảnh bản đồ</div>
          )}
          {typeof activeMapImage !== "string" && activeMapImage?.warnings?.map((warning) => (
            <p key={warning} className="mb-2 text-xs text-amber-700">{warning}</p>
          ))}
          {activeSection.summary.length > 0 && (
            <div className="mb-3">
              <h3 className="font-bold">Tổng hợp</h3>
              <ul className="list-disc pl-5">
                {activeSection.summary.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {activeSection.description && <p className="mb-3"><strong>Mô tả:</strong> {activeSection.description}</p>}

          {activeSection.photos.length > 0 && (
            <div className="mt-4 mb-5 border rounded-lg p-3 bg-slate-50/50">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600 mb-2">Site photo đối tượng gốc / nút giao</h3>
              <div className="grid grid-cols-2 gap-3">
                {activeSection.photos.map((photo) => (
                  <SitePhotoPreviewItem key={photo.id} photo={photo} projectId={projectId} />
                ))}
              </div>
            </div>
          )}

          {activeSection.details.map((detail) => (
            <div key={detail.feature.id} className="mt-5 border-t pt-4">
              <h3 className="font-bold text-base text-slate-900">{detail.label}: {detail.feature.name}</h3>
              <p><strong>Loại:</strong> {detail.displayType}</p>
              <p><strong>Mô tả:</strong> {detail.description || "-"}</p>
              {detail.startPoint && <p><strong>Điểm đầu:</strong> {detail.startPoint[1].toFixed(6)}, {detail.startPoint[0].toFixed(6)}</p>}
              {detail.endPoint && <p><strong>Điểm cuối:</strong> {detail.endPoint[1].toFixed(6)}, {detail.endPoint[0].toFixed(6)}</p>}
              {detail.connectedNames.length > 0 && <p><strong>Kết nối/tuyến đi qua:</strong> {detail.connectedNames.join(", ")}</p>}
              
              {detail.photos.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Site photo đối tượng</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {detail.photos.map((photo) => (
                      <SitePhotoPreviewItem key={photo.id} photo={photo} projectId={projectId} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      ) : (
        <div className="h-40 border bg-slate-100 text-slate-500 flex items-center justify-center">Không có nội dung preview</div>
      )}
        </div>
      </article>
    </div>
  );
}
