import { useEffect, useMemo, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { Check, ChevronDown, ChevronRight, Download, Eye, FileText, Loader2, X } from "lucide-react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { resolveMediaAsset } from "@IMPLEMENT/services/mediaAssetService";
import { Button } from "@DESIGN/components/ui/Button";
import { cn } from "@TOOL/utils/cn";
import {
  buildReportModel,
  getDefaultReportSelections,
  getOverallReportBounds,
  getSelectableReportItems,
  sanitizeReportBounds,
  type ReportBounds,
  type ReportModel,
  type ReportPhoto,
  type ReportSelection,
} from "./reportModel";
import { buildReportDocx, type ReportImageMap } from "./reportDocx";
import { saveReportDocxFile } from "./reportFileSave";

interface ReportExportDialogProps {
  projectName: string;
  onClose: () => void;
}

type CaptureResult = { captureId?: string; dataUrl: string };
type CaptureError = { captureId?: string; error: string };
type MapCaptureScope = {
  focusFeatureIds?: string[];
  hiddenFeatureIds?: string[];
};

const keyOf = (selection: ReportSelection): string => `${selection.type}:${selection.id}`;
type SelectableReportItem = ReturnType<typeof getSelectableReportItems>[number];
const REPORT_MAP_CAPTURE_MAX_ZOOM = 36;

const parseKey = (key: string): ReportSelection | null => {
  const [type, id] = key.split(":");
  if (!id) return null;
  if (type === "region" || type === "group" || type === "feature") return { type, id };
  return null;
};

const sanitizeFileName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Báo-cáo-thiết-kế";

const getDescendantKeys = (items: SelectableReportItem[], key: string): string[] => {
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return [];
  const parentLevel = items[index].level;
  const keys: string[] = [];
  for (let i = index + 1; i < items.length; i += 1) {
    if (items[i].level <= parentLevel) break;
    keys.push(items[i].key);
  }
  return keys;
};

const getVisibleSelectableItems = (
  items: SelectableReportItem[],
  expandedKeys: Set<string>,
): SelectableReportItem[] => {
  const visible: SelectableReportItem[] = [];
  const collapsedLevels: number[] = [];
  items.forEach((item) => {
    while (collapsedLevels.length > 0 && item.level <= collapsedLevels[collapsedLevels.length - 1]) {
      collapsedLevels.pop();
    }
    if (collapsedLevels.length === 0) visible.push(item);
    if (!expandedKeys.has(item.key) && getDescendantKeys(items, item.key).length > 0) {
      collapsedLevels.push(item.level);
    }
  });
  return visible;
};

const requestMapCapture = async (
  bounds: ReportBounds | null,
  captureId: string,
  scale = 2,
  fitToBounds = true,
  zoom = REPORT_MAP_CAPTURE_MAX_ZOOM,
  scope: MapCaptureScope = {},
): Promise<string | undefined> => {
  const safeBounds = sanitizeReportBounds(bounds);
  if (!safeBounds) return undefined;

  return new Promise<string | undefined>((resolve) => {
    let done = false;
    let unlistenResult: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, 45000);

    const cleanup = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      unlistenResult?.();
      unlistenError?.();
    };

    const setupAndEmit = async () => {
      unlistenResult = await listen<CaptureResult>("map-capture-result", (event) => {
        if (event.payload.captureId && event.payload.captureId !== captureId) return;
        cleanup();
        resolve(event.payload.dataUrl);
      });

      unlistenError = await listen<CaptureError>("map-capture-error", (event) => {
        if (event.payload.captureId && event.payload.captureId !== captureId) return;
        cleanup();
        resolve(undefined);
      });

      if (!done) {
        await emit("request-map-capture", {
          captureId,
          printArea: safeBounds,
          scale,
          fitToBounds,
          zoom,
          focusFeatureIds: scope.focusFeatureIds,
          hiddenFeatureIds: scope.hiddenFeatureIds,
        });
      }
    };

    void setupAndEmit().catch(() => {
      cleanup();
      resolve(undefined);
    });
  });
};

const captureMissingReportImages = async (
  model: ReportModel,
  existing: ReportImageMap,
  onProgress?: (current: number, total: number) => void,
): Promise<ReportImageMap> => {
  const imageMap: ReportImageMap = { ...existing };
  const missingSections = model.sections.filter((section) => !imageMap[section.id]);
  const overallBounds = getOverallReportBounds(model);

  for (let index = 0; index < missingSections.length; index += 1) {
    const section = missingSections[index];
    onProgress?.(index + 1, missingSections.length);
    if (imageMap[section.id]) continue;

    const targetBounds = sanitizeReportBounds(section.bounds) || overallBounds;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
      const activeBounds = attempt === 3 && overallBounds ? overallBounds : targetBounds;
      const dataUrl = await requestMapCapture(
        activeBounds,
        `report-${section.id}-${Date.now()}-${attempt}`,
        1.5,
        true,
        REPORT_MAP_CAPTURE_MAX_ZOOM,
        {
          focusFeatureIds: section.focusFeatureIds,
          hiddenFeatureIds: section.hiddenFeatureIds,
        },
      );
      if (dataUrl) {
        imageMap[section.id] = dataUrl;
        break;
      }
    }
    // Short pause to allow V8 Garbage Collector to reclaim temporary canvas & network RAM
    await new Promise((r) => setTimeout(r, 20));
  }
  return imageMap;
};

const capturePreviewImage = async (model: ReportModel, sectionId: string): Promise<string | undefined> => {
  const section = model.sections.find((item) => item.id === sectionId) || model.sections[0];
  if (!section) return undefined;
  const targetBounds = sanitizeReportBounds(section.bounds) || getOverallReportBounds(model);
  return requestMapCapture(
    targetBounds,
    `report-preview-${section.id}-${Date.now()}`,
    1.25,
    true,
    REPORT_MAP_CAPTURE_MAX_ZOOM,
    {
      focusFeatureIds: section.focusFeatureIds,
      hiddenFeatureIds: section.hiddenFeatureIds,
    },
  );
};

const hydrateReportPhotoAssets = async (model: ReportModel, projectId?: string | null): Promise<ReportModel> => {
  if (!projectId) return model;
  const cache = new Map<string, string>();
  const resolvePhotos = async (photos: ReportPhoto[], ownerLabel: string): Promise<ReportPhoto[]> => {
    const resolved = await Promise.all(photos.map(async (photo) => {
      if (photo.dataUrl) return photo;
      if (!photo.assetId) return null;
      try {
        if (!cache.has(photo.assetId)) {
          const asset = await resolveMediaAsset(projectId, photo.assetId);
          cache.set(photo.assetId, asset.src);
        }
        const dataUrl = cache.get(photo.assetId) || "";
        return dataUrl
          ? { ...photo, dataUrl }
          : { ...photo, warning: `${ownerLabel}: Không resolve được ảnh ${photo.label}.` };
      } catch (error) {
        console.warn("[ReportExportDialog] Failed to resolve report photo asset:", photo.assetId, error);
        return { ...photo, warning: `${ownerLabel}: Không resolve được ảnh ${photo.label}.` };
      }
    }));
    return resolved.filter((photo): photo is ReportPhoto => !!photo);
  };

  const sections = await Promise.all(model.sections.map(async (section) => ({
    ...section,
    photos: await resolvePhotos(section.photos, section.title),
    details: await Promise.all(section.details.map(async (detail) => {
      const photos = await resolvePhotos(detail.photos, detail.feature.name || detail.feature.id);
      return {
        ...detail,
        photos,
        photoWarnings: [
          ...detail.photoWarnings,
          ...photos
            .filter((photo) => !!photo.warning && !photo.dataUrl)
            .map((photo) => photo.warning as string),
        ],
      };
    })),
  })));
  return {
    ...model,
    sections: sections.map((section) => ({
      ...section,
      photoWarnings: section.details.flatMap((detail) => detail.photoWarnings),
    })),
  };
};

export function ReportExportDialog({ projectName, onClose }: ReportExportDialogProps) {
  const state = useDesignSync((store) => store.state);
  const projectId = useDesignSync((store) => store.projectId);
  const selectedFeatureId = useDesignSync((store) => store.selectedFeatureId);
  const selectedGroupId = useDesignSync((store) => store.selectedGroupId);
  const selectionSet = useDesignSync((store) => store.selectionSet);

  const selectableItems = useMemo(() => state ? getSelectableReportItems(state) : [], [state]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedSelectionKeys, setExpandedSelectionKeys] = useState<Set<string>>(new Set());
  const [imageMap, setImageMap] = useState<ReportImageMap>({});
  const [activeView, setActiveView] = useState<"select" | "preview">("preview");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [includeMapImages, setIncludeMapImages] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const defaultReportTitle = useMemo(() => `Báo cáo thiết kế - ${projectName}`, [projectName]);
  const [reportTitle, setReportTitle] = useState(defaultReportTitle);
  const effectiveReportTitle = reportTitle.trim() || defaultReportTitle;

  useEffect(() => {
    setReportTitle(defaultReportTitle);
  }, [defaultReportTitle]);

  useEffect(() => {
    if (!state) return;
    const defaults = getDefaultReportSelections(state, { selectionSet, selectedFeatureId, selectedGroupId });
    const keys = defaults.map(keyOf);
    keys.forEach((key) => getDescendantKeys(selectableItems, key).forEach((childKey) => keys.push(childKey)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys(new Set(keys));
  }, [selectableItems, state, selectedFeatureId, selectedGroupId, selectionSet]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSelectionKeys((prev) => {
      const expandableKeys = new Set(selectableItems
        .filter((item) => getDescendantKeys(selectableItems, item.key).length > 0)
        .map((item) => item.key));
      if (prev.size === 0) return expandableKeys;
      return new Set(Array.from(prev).filter((key) => expandableKeys.has(key)));
    });
  }, [selectableItems]);

  const selections = useMemo(() => Array.from(selectedKeys)
    .map(parseKey)
    .filter((selection): selection is ReportSelection => selection !== null), [selectedKeys]);
  const visibleSelectableItems = useMemo(
    () => getVisibleSelectableItems(selectableItems, expandedSelectionKeys),
    [expandedSelectionKeys, selectableItems],
  );

  const baseReportModel = useMemo(() => {
    if (!state) return null;
    return buildReportModel(state, selections, effectiveReportTitle);
  }, [effectiveReportTitle, selections, state]);
  const [reportModel, setReportModel] = useState<ReportModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!baseReportModel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReportModel(null);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReportModel(baseReportModel);
    hydrateReportPhotoAssets(baseReportModel, projectId)
      .then((hydrated) => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!cancelled) setReportModel(hydrated);
      });
    return () => {
      cancelled = true;
    };
  }, [baseReportModel, projectId]);

  const currentSectionId = activeSectionId || reportModel?.sections[0]?.id || null;

  useEffect(() => {
    if (!reportModel || reportModel.sections.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSectionId(null);
      return;
    }
    if (!currentSectionId || !reportModel.sections.some((section) => section.id === currentSectionId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSectionId(reportModel.sections[0].id);
    }
  }, [currentSectionId, reportModel]);

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const cascadeKeys = [key, ...getDescendantKeys(selectableItems, key)];
      const shouldRemove = cascadeKeys.every((itemKey) => next.has(itemKey));
      cascadeKeys.forEach((itemKey) => {
        if (shouldRemove) next.delete(itemKey);
        else next.add(itemKey);
      });
      return next;
    });
    setImageMap({});
  };

  const toggleSelectionExpanded = (key: string) => {
    setExpandedSelectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePreview = async () => {
    if (!reportModel || !currentSectionId) return;
    setError(null);
    setExportStatus(null);
    setIsCapturing(true);
    try {
      const dataUrl = await capturePreviewImage(reportModel, currentSectionId);
      if (dataUrl) {
        setImageMap((prev) => ({ ...prev, [currentSectionId]: dataUrl }));
      }
      setActiveView("preview");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSelectPreviewSection = async (sectionId: string) => {
    setActiveSectionId(sectionId);
    setActiveView("preview");
    if (imageMap[sectionId] || !reportModel) return;
    setIsCapturing(true);
    try {
      const dataUrl = await capturePreviewImage(reportModel, sectionId);
      if (dataUrl) {
        setImageMap((prev) => ({ ...prev, [sectionId]: dataUrl }));
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleExport = async () => {
    if (!reportModel || reportModel.sections.length === 0) return;
    setError(null);
    setExportStatus("Đang chuẩn bị file Word...");
    setIsExporting(true);
    try {
      if (includeMapImages) {
        setExportStatus("Đang chụp ảnh bản đồ...");
      }
      const nextImageMap = includeMapImages
        ? await captureMissingReportImages(reportModel, imageMap, (current, total) => {
          setExportStatus(`Đang chụp ảnh bản đồ ${current}/${total}...`);
        })
        : imageMap;
      if (includeMapImages) {
        const missingMapImages = reportModel.sections.filter((section) => !nextImageMap[section.id]);
        if (missingMapImages.length > 0) {
          console.warn(`[ReportExportDialog] ${missingMapImages.length} mục không chụp được ảnh bản đồ. Tiếp tục tạo file Word.`);
          setExportStatus(`Đang tạo file Word (${missingMapImages.length} mục không chụp được bản đồ)...`);
        }
      }
      const photoWarningCount = reportModel.sections.reduce((count, section) => count + section.photoWarnings.length, 0);
      if (photoWarningCount > 0) {
        console.warn(`[ReportExportDialog] ${photoWarningCount} cảnh báo ảnh site photo. Tiếp tục tạo file Word.`);
        setExportStatus(`Đang tạo file Word (${photoWarningCount} cảnh báo ảnh site photo)...`);
      }
      setImageMap(nextImageMap);
      const filePath = await save({
        filters: [{ name: "Word Document", extensions: ["docx"] }],
        defaultPath: `${sanitizeFileName(effectiveReportTitle)}.docx`,
      });
      if (!filePath) {
        setExportStatus(null);
        return;
      }

      setExportStatus("Đang tạo nội dung Word...");
      const buffer = await buildReportDocx(reportModel, nextImageMap, (_percent, statusText) => {
        setExportStatus(statusText);
      });
      setExportStatus("Đang lưu file vào hệ thống...");
      await saveReportDocxFile(filePath, buffer);
      setExportStatus("Đã xuất file Word.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  if (!state || !reportModel) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-cad-modal bg-black/65 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-[min(1180px,96vw)] h-[min(760px,92vh)] bg-cad-surface border border-cad-border shadow-2xl flex flex-col overflow-hidden rounded">
        <div className="h-14 px-5 border-b border-cad-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cad-accent/10 text-cad-accent rounded">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-cad-text-primary uppercase tracking-wide">Báo cáo thiết kế</h2>
              <p className="text-[10px] text-cad-text-muted">{reportModel.sections.length} mục chi tiết</p>
            </div>
          </div>
          <Button variant="ghost" size="md" icon={X} ariaLabel="Đóng hộp thoại báo cáo" onClick={onClose} />
        </div>

        <div className="h-12 border-b border-cad-border flex items-center justify-between px-5 shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <label className="flex min-w-[260px] max-w-[430px] items-center gap-2 text-[10px] font-black uppercase tracking-wide text-cad-text-muted">
              Tiêu đề
              <input
                type="text"
                value={reportTitle}
                onChange={(event) => {
                  setReportTitle(event.target.value);
                  setImageMap({});
                }}
                className="min-w-0 flex-1 rounded border border-cad-border bg-cad-elevated px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-cad-text-primary outline-none focus:border-cad-accent"
                placeholder={defaultReportTitle}
              />
            </label>
            <button
              onClick={() => setActiveView("select")}
              className={cn("px-3 py-1.5 text-[10px] font-bold uppercase rounded border", activeView === "select" ? "border-cad-accent text-cad-accent bg-cad-accent/10" : "border-cad-border text-cad-text-muted")}
            >
              Chọn dữ liệu
            </button>
            <button
              onClick={handlePreview}
              disabled={isCapturing}
              className="px-3 py-1.5 text-[10px] font-bold uppercase rounded border border-cad-border text-cad-text-secondary hover:text-cad-text-primary flex items-center gap-2 disabled:opacity-50"
            >
              {isCapturing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              Preview
            </button>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={Download}
            loading={isExporting}
            disabled={reportModel.sections.length === 0}
            onClick={handleExport}
            className="uppercase tracking-wide"
          >
            Xuất Word
          </Button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-cad-danger/10 text-cad-danger text-xs border-b border-cad-danger/20">
            {error}
          </div>
        )}

        {exportStatus && (
          <div className="px-5 py-2 bg-cad-accent/10 text-cad-accent text-xs border-b border-cad-accent/20">
            {exportStatus}
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr]">
          <aside className="border-r border-cad-border overflow-y-auto p-3">
            <label className="mb-3 flex items-start gap-2 rounded border border-cad-border bg-cad-elevated p-2 text-[10px] text-cad-text-secondary">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includeMapImages}
                onChange={(event) => setIncludeMapImages(event.target.checked)}
              />
              <span>
                <span className="block font-black uppercase text-cad-text-primary">Kèm ảnh bản đồ khi xuất</span>
                <span className="block text-cad-text-muted">Bật mặc định. Có thể tắt nếu báo cáo quá nhiều đối tượng.</span>
              </span>
            </label>
            <div className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted mb-2">Thư mục / đối tượng</div>
            <div className="space-y-1">
              {visibleSelectableItems.map((item) => {
                const checked = selectedKeys.has(item.key);
                const hasChildren = getDescendantKeys(selectableItems, item.key).length > 0;
                const isExpanded = expandedSelectionKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-1 rounded px-1 py-1 hover:bg-cad-text-primary/5 text-xs"
                    style={{ paddingLeft: 8 + item.level * 16 }}
                  >
                    <button
                      type="button"
                      onClick={() => hasChildren && toggleSelectionExpanded(item.key)}
                      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-cad-text-muted", hasChildren && "hover:bg-cad-text-primary/10 hover:text-cad-text-primary")}
                      aria-label={hasChildren ? (isExpanded ? "Thu gọn mục" : "Mở rộng mục") : undefined}
                      disabled={!hasChildren}
                    >
                      {hasChildren && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                    </button>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <span className={cn("w-4 h-4 border rounded flex items-center justify-center shrink-0", checked ? "bg-cad-accent border-cad-accent text-black" : "border-cad-border")}>
                        {checked && <Check size={12} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleSelection(item.key)}
                      />
                      <span className="truncate text-cad-text-secondary">{item.name}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="overflow-hidden bg-white text-slate-900">
            {activeView === "select" ? (
              <div className="p-8 text-sm text-slate-600">
                Đã chọn {selectedKeys.size} mục. Bấm Preview để xem trước nội dung báo cáo.
              </div>
            ) : (
              <ReportPreview
                model={reportModel}
                imageMap={imageMap}
                activeSectionId={currentSectionId}
                onSelectSection={handleSelectPreviewSection}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ReportPreview({
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
  const activeSection = model.sections.find((section) => section.id === activeSectionId) || model.sections[0];
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
          {imageMap[activeSection.id] ? (
            <img src={imageMap[activeSection.id]} alt={activeSection.title} loading="lazy" className="w-full max-h-[360px] object-contain border mb-3" />
          ) : (
            <div className="h-40 border bg-slate-100 text-slate-500 flex items-center justify-center mb-3">Chưa capture ảnh bản đồ</div>
          )}
          {activeSection.summary.length > 0 && (
            <div className="mb-3">
              <h3 className="font-bold">Tổng hợp</h3>
              <ul className="list-disc pl-5">
                {activeSection.summary.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {activeSection.description && <p className="mb-3"><strong>Mô tả:</strong> {activeSection.description}</p>}
          {activeSection.details.map((detail) => (
            <div key={detail.feature.id} className="mt-5 border-t pt-4">
              <h3 className="font-bold">{detail.label}: {detail.feature.name}</h3>
              <p><strong>Loại:</strong> {detail.displayType}</p>
              <p><strong>Mô tả:</strong> {detail.description || "-"}</p>
              {detail.startPoint && <p><strong>Điểm đầu:</strong> {detail.startPoint[1].toFixed(6)}, {detail.startPoint[0].toFixed(6)}</p>}
              {detail.endPoint && <p><strong>Điểm cuối:</strong> {detail.endPoint[1].toFixed(6)}, {detail.endPoint[0].toFixed(6)}</p>}
              {detail.connectedNames.length > 0 && <p><strong>Kết nối/tuyến đi qua:</strong> {detail.connectedNames.join(", ")}</p>}
              <div className="grid grid-cols-2 gap-3 mt-3">
                {detail.photos.filter((photo) => !!photo.dataUrl).map((photo) => (
                  <figure key={photo.id} className="border p-2">
                    <img src={photo.dataUrl} alt={photo.label} loading="lazy" className="w-full h-40 object-contain" />
                    <figcaption className="text-xs text-slate-500 mt-1">{photo.label}</figcaption>
                  </figure>
                ))}
              </div>
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
