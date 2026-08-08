import { useEffect, useMemo, useRef, useState } from "react";
import { emit, listen, save } from "@/contracts/tauri-api/runtime";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { resolveMediaAsset } from "@IMPLEMENT/services/mediaAssetService";
import {
  buildReportModel,
  getDefaultReportSelections,
  getOverallReportBounds,
  getSelectableReportItems,
  hydrateReportSitePhotos,
  sanitizeReportBounds,
  type ReportBounds,
  type ReportModel,
  type ReportPhoto,
  type ReportSelection,
} from "./reportModel";
import { buildReportDocx, type ReportImageMap, type ReportImageRef } from "./reportDocx";
import { saveReportDocxFile } from "./reportFileSave";

type CaptureResult = {
  captureId?: string;
  dataUrl?: string;
  image?: ReportImageRef;
  width?: number;
  height?: number;
  mimeType?: ReportImageRef["mimeType"];
  warnings?: string[];
};
type CaptureError = { captureId?: string; error: string; recoverable?: boolean };
type MapCaptureScope = {
  focusFeatureIds?: string[];
  hiddenFeatureIds?: string[];
  requiredFeatureIds?: string[];
  requiredPoints?: Array<[number, number]>;
  captureKind?: "preview" | "export";
  pixelBudget?: number;
};

const keyOf = (selection: ReportSelection): string => `${selection.type}:${selection.id}`;
export type SelectableReportItem = ReturnType<typeof getSelectableReportItems>[number];
const REPORT_MAP_CAPTURE_MAX_ZOOM = 36;

const parseKey = (key: string): ReportSelection | null => {
  const [type, id] = key.split(":");
  if (!id) return null;
  if (type === "region" || type === "group" || type === "feature") return { type, id };
  return null;
};

const sanitizeFileName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Báo-cáo-thiết-kế";

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const dataUrlToImageRef = (dataUrl: string): ReportImageRef | undefined => {
  const match = /^data:(image\/png|image\/jpe?g|image\/gif|image\/bmp);base64,(.+)$/i.exec(dataUrl);
  if (!match) return undefined;
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase() as ReportImageRef["mimeType"];
  return { mimeType, bytes: base64ToUint8Array(match[2]), dataUrl };
};

const withObjectUrl = (image: ReportImageRef): ReportImageRef => {
  if (image.objectUrl || !image.bytes) return image;
  const blob = new Blob([image.bytes], { type: image.mimeType });
  return { ...image, objectUrl: URL.createObjectURL(blob) };
};

const releaseImageMap = (imageMap: ReportImageMap): void => {
  Object.values(imageMap).forEach((image) => {
    if (typeof image !== "string" && image?.objectUrl) {
      URL.revokeObjectURL(image.objectUrl);
    }
  });
};

export const getDescendantKeys = (items: SelectableReportItem[], key: string): string[] => {
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
): Promise<ReportImageRef | undefined> => {
  const safeBounds = sanitizeReportBounds(bounds);
  if (!safeBounds) return undefined;

  return new Promise<ReportImageRef | undefined>((resolve) => {
    let done = false;
    let unlistenResult: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let removeWindowResult: (() => void) | undefined;
    let removeWindowError: (() => void) | undefined;
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
      removeWindowResult?.();
      removeWindowError?.();
    };

    const resolveResult = (payload: CaptureResult) => {
      if (payload.captureId && payload.captureId !== captureId) return;
      cleanup();
      if (payload.image) {
        resolve({
          ...payload.image,
          width: payload.image.width ?? payload.width,
          height: payload.image.height ?? payload.height,
          warnings: [...(payload.image.warnings || []), ...(payload.warnings || [])],
        });
        return;
      }
      resolve(payload.dataUrl ? dataUrlToImageRef(payload.dataUrl) : undefined);
    };

    const setupAndEmit = async () => {
      const onWindowResult = (event: Event) => resolveResult((event as CustomEvent<CaptureResult>).detail);
      const onWindowError = (event: Event) => {
        const payload = (event as CustomEvent<CaptureError>).detail;
        if (payload.captureId && payload.captureId !== captureId) return;
        cleanup();
        resolve(undefined);
      };
      window.addEventListener("map-capture-result", onWindowResult as EventListener);
      window.addEventListener("map-capture-error", onWindowError as EventListener);
      removeWindowResult = () => window.removeEventListener("map-capture-result", onWindowResult as EventListener);
      removeWindowError = () => window.removeEventListener("map-capture-error", onWindowError as EventListener);

      unlistenResult = await listen<CaptureResult>("map-capture-result", (event) => {
        if (!event.payload.dataUrl) return;
        resolveResult(event.payload);
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
          requiredFeatureIds: scope.requiredFeatureIds,
          requiredPoints: scope.requiredPoints,
          captureKind: scope.captureKind,
          pixelBudget: scope.pixelBudget,
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
        2.2,
        true,
        REPORT_MAP_CAPTURE_MAX_ZOOM,
          {
            focusFeatureIds: section.focusFeatureIds,
            hiddenFeatureIds: section.hiddenFeatureIds,
            requiredFeatureIds: section.requiredFeatureIds,
            requiredPoints: section.requiredPoints,
            captureKind: "export",
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

const capturePreviewImage = async (model: ReportModel, sectionId: string): Promise<ReportImageRef | undefined> => {
  const section = model.sections.find((item) => item.id === sectionId) || model.sections[0];
  if (!section) return undefined;
  const targetBounds = sanitizeReportBounds(section.bounds) || getOverallReportBounds(model);
  return requestMapCapture(
    targetBounds,
    `report-preview-${section.id}-${Date.now()}`,
    1.8,
    true,
    REPORT_MAP_CAPTURE_MAX_ZOOM,
    {
      focusFeatureIds: section.focusFeatureIds,
      hiddenFeatureIds: section.hiddenFeatureIds,
      requiredFeatureIds: section.requiredFeatureIds,
      requiredPoints: section.requiredPoints,
      captureKind: "preview",
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

export const useReportDialogState = (projectName: string) => {
  const state = useDesignSync((store) => store.state);
  const projectId = useDesignSync((store) => store.projectId);
  const projectPath = useDesignSync((store) => store.projectPath);
  const selectedFeatureId = useDesignSync((store) => store.selectedFeatureId);
  const selectedGroupId = useDesignSync((store) => store.selectedGroupId);
  const selectionSet = useDesignSync((store) => store.selectionSet);
  const featureDetailsCache = useDesignSync((store) => store.featureDetailsCache);

  const selectableItems = useMemo(() => state ? getSelectableReportItems(state) : [], [state]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedSelectionKeys, setExpandedSelectionKeys] = useState<Set<string>>(new Set());
  const [imageMap, setImageMap] = useState<ReportImageMap>({});
  const imageMapRef = useRef<ReportImageMap>({});
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    return buildReportModel(state, selections, effectiveReportTitle, featureDetailsCache);
  }, [effectiveReportTitle, selections, state, featureDetailsCache]);
  const [reportModel, setReportModel] = useState<ReportModel | null>(null);

  useEffect(() => {
    imageMapRef.current = imageMap;
  }, [imageMap]);

  useEffect(() => () => {
    releaseImageMap(imageMapRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!baseReportModel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReportModel(null);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReportModel(baseReportModel);
    if (projectPath && projectId) {
      hydrateReportSitePhotos(baseReportModel, projectPath, projectId)
        .then((hydrated) => {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          if (!cancelled) setReportModel(hydrated);
        });
    } else {
      hydrateReportPhotoAssets(baseReportModel, projectId)
        .then((hydrated) => {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          if (!cancelled) setReportModel(hydrated);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [baseReportModel, projectId, projectPath]);

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
    setImageMap((prev) => {
      releaseImageMap(prev);
      return {};
    });
  };

  const toggleSelectionExpanded = (key: string) => {
    setExpandedSelectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleReportTitleChange = (value: string) => {
    setReportTitle(value);
    setImageMap((prev) => {
      releaseImageMap(prev);
      return {};
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
        setImageMap((prev) => {
          const previous = prev[currentSectionId];
          if (typeof previous !== "string" && previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
          return { ...prev, [currentSectionId]: withObjectUrl(dataUrl) };
        });
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
        setImageMap((prev) => {
          const previous = prev[sectionId];
          if (typeof previous !== "string" && previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
          return { ...prev, [sectionId]: withObjectUrl(dataUrl) };
        });
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
      }, projectId);
      setExportStatus("Đang lưu file vào hệ thống...");
      await saveReportDocxFile(filePath, buffer);
      setExportStatus("Đã xuất file Word.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };


  return {
    state,
    reportModel,
    reportTitle,
    defaultReportTitle,
    activeView,
    includeMapImages,
    isCapturing,
    isExporting,
    error,
    exportStatus,
    visibleSelectableItems,
    selectedKeys,
    selectableItems,
    expandedSelectionKeys,
    imageMap,
    currentSectionId,
    handleReportTitleChange,
    setActiveView,
    setIncludeMapImages,
    toggleSelection,
    toggleSelectionExpanded,
    handlePreview,
    handleSelectPreviewSection,
    handleExport,
  };
};
