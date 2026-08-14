import {
  AlignmentType,
  Bookmark,
  Document,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ReportFeatureDetail, ReportModel, ReportPhoto, ReportSection } from "./reportModel";
import { formatPoint } from "./reportModel";
import { safeInvoke as invoke } from "@IMPLEMENT/lib/tauri";
import { resolveMediaAsset } from "@IMPLEMENT/services/mediaAssetService";

export type ReportImageRef = {
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/bmp";
  bytes?: Uint8Array;
  dataUrl?: string;
  objectUrl?: string;
  width?: number;
  height?: number;
  warnings?: string[];
};
export type ReportImageMap = Record<string, ReportImageRef | string | undefined>;

const PAGE_IMAGE_WIDTH = 560;
const PHOTO_WIDTH = 360;
const MAX_EMBED_SOURCE_WIDTH = 2400;
const HIDDEN_DETAIL_FIELD_KEYS = new Set([
  "color",
  "gis.rotation",
  "icon",
  "iconKey",
  "media.imageUrl",
  "media.imageUrls",
  "imageUrl",
  "imageUrls",
  "parent_feature_id",
  "size",
  "stroke",
  "type",
  "weight",
]);
type NormalizedImageData = {
  bytes: Uint8Array;
  mimeType: ReportImageRef["mimeType"];
  width: number;
  height: number;
};
const imageResizeCache = new Map<string, NormalizedImageData>();
export const clearImageResizeCache = (): void => imageResizeCache.clear();

const text = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value as any);
};

const paragraph = (value: string, bold = false): Paragraph =>
  new Paragraph({
    children: [new TextRun({ text: value, bold })],
    spacing: { after: 120 },
  });

const loadImage = async (dataUrl: string): Promise<HTMLImageElement> => {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = dataUrl;
  });
  return image;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const dataUrlMimeType = (dataUrl: string): ReportImageRef["mimeType"] | null => {
  const match = /^data:(image\/png|image\/jpe?g|image\/gif|image\/bmp);base64,/i.exec(dataUrl);
  if (!match) return null;
  return match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase() as ReportImageRef["mimeType"];
};

const blobToUint8Array = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

const canvasToJpegBytes = (canvas: HTMLCanvasElement, quality = 0.86): Promise<Uint8Array> => (
  new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      const fallback = canvas.toDataURL("image/jpeg", quality);
      resolve(base64ToUint8Array(fallback.split(",")[1] || ""));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Image encode failed"));
        return;
      }
      blobToUint8Array(blob).then(resolve, reject);
    }, "image/jpeg", quality);
  })
);

const resizeDataUrl = async (dataUrl: string): Promise<NormalizedImageData | null> => {
  const mimeType = dataUrlMimeType(dataUrl);
  if (!mimeType) return null;
  const cached = imageResizeCache.get(dataUrl);
  if (cached) return cached;

  const image = await loadImage(dataUrl);
  const originalBytes = base64ToUint8Array(dataUrl.split(",")[1] || "");

  if (!image.naturalWidth || image.naturalWidth <= MAX_EMBED_SOURCE_WIDTH) {
    const result = {
      bytes: originalBytes,
      mimeType,
      width: image.naturalWidth || MAX_EMBED_SOURCE_WIDTH,
      height: image.naturalHeight || Math.round(MAX_EMBED_SOURCE_WIDTH * 0.62),
    };
    imageResizeCache.set(dataUrl, result);
    return result;
  }

  const scale = MAX_EMBED_SOURCE_WIDTH / image.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EMBED_SOURCE_WIDTH;
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return { bytes: originalBytes, mimeType, width: image.naturalWidth, height: image.naturalHeight };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const bytes = await canvasToJpegBytes(canvas, 0.86);
  const result = { bytes, mimeType: "image/jpeg" as const, width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  imageResizeCache.set(dataUrl, result);
  return result;
};

const imageRefToImage = async (source: ReportImageRef | string, width: number): Promise<ImageRun | null> => {
  if (typeof source !== "string" && source.bytes) {
    const type = source.mimeType === "image/jpeg" ? "jpg" : source.mimeType.replace("image/", "");
    if (!["png", "jpg", "gif", "bmp"].includes(type)) return null;
    const aspectHeight = Math.max(1, Math.round(width * ((source.height || Math.round(width * 0.62)) / Math.max(1, source.width || width))));
    return new ImageRun({
      type: type as "png" | "jpg" | "gif" | "bmp",
      data: source.bytes,
      transformation: { width, height: aspectHeight },
    });
  }

  const dataUrl = typeof source === "string" ? source : source.dataUrl;
  if (!dataUrl) return null;
  const normalizedImage = await resizeDataUrl(dataUrl);
  if (!normalizedImage) return null;
  const type = normalizedImage.mimeType === "image/jpeg" ? "jpg" : normalizedImage.mimeType.replace("image/", "");
  if (!["png", "jpg", "gif", "bmp"].includes(type)) return null;
  const aspectHeight = Math.max(1, Math.round(width * (normalizedImage.height / Math.max(1, normalizedImage.width))));
  return new ImageRun({
    type: type as "png" | "jpg" | "gif" | "bmp",
    data: normalizedImage.bytes,
    transformation: { width, height: aspectHeight },
  });
};

const imageParagraph = async (source: ReportImageRef | string | undefined, width: number, fallback: string): Promise<Paragraph> => {
  if (!source) return paragraph(fallback);
  const image = await imageRefToImage(source, width);
  if (!image) {
    const dataUrl = typeof source === "string" ? source : source.dataUrl || source.objectUrl || "";
    if (dataUrl.startsWith("http")) return paragraph(`Anh: ${dataUrl}`);
    throw new Error("Không thể nhúng ảnh bản đồ vào file Word.");
  }
  return new Paragraph({
    children: [image],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  });
};

const keyValueTable = (entries: Array<[string, unknown]>): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: entries.map(([key, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          children: [paragraph(key, true)],
        }),
        new TableCell({
          width: { size: 72, type: WidthType.PERCENTAGE },
          children: [paragraph(text(value))],
        }),
      ],
    })),
  });

const flattenRecord = (record: Record<string, unknown>, prefix = ""): Array<[string, unknown]> => {
  const rows: Array<[string, unknown]> = [];
  Object.entries(record).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      rows.push(...flattenRecord(value as Record<string, unknown>, fullKey));
    } else if (!HIDDEN_DETAIL_FIELD_KEYS.has(fullKey) && !HIDDEN_DETAIL_FIELD_KEYS.has(key)) {
      rows.push([fullKey, value]);
    }
  });
  return rows;
};

const imageRunTypeFromMime = (mimeType?: string): "png" | "jpg" | "gif" | "bmp" => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/bmp") return "bmp";
  return "jpg";
};

const loadPhotoBytes = async (photo: ReportPhoto, projectId?: string | null): Promise<Uint8Array | null> => {
  const targetPath = photo.absolutePath || photo.processedAsset?.tempPath;
  if (targetPath) {
    try {
      const bytes = await invoke<number[] | Uint8Array>("read_binary_file", {
        path: targetPath,
      });
      if (bytes && (bytes instanceof Uint8Array ? bytes.length > 0 : bytes.length > 0)) {
        return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      }
    } catch (e) {
      console.warn("[reportDocx] Failed to read photo file directly:", targetPath, e);
    }
  }
  if (photo.dataUrl && photo.dataUrl.startsWith("data:")) {
    const parts = photo.dataUrl.split(",");
    if (parts[1]) {
      return base64ToUint8Array(parts[1]);
    }
  }
  const effectiveProjectId = projectId || photo.projectId;
  if (effectiveProjectId && photo.assetId) {
    try {
      const asset = await resolveMediaAsset(effectiveProjectId, photo.assetId);
      if (asset.path) {
        try {
          const bytes = await invoke<number[] | Uint8Array>("read_binary_file", {
            path: asset.path,
          });
          if (bytes && (bytes instanceof Uint8Array ? bytes.length > 0 : bytes.length > 0)) {
            return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          }
        } catch (readErr) {
          console.warn("[reportDocx] Failed to read resolved asset path:", asset.path, readErr);
        }
      }
      if (asset.dataUrl && asset.dataUrl.startsWith("data:")) {
        const parts = asset.dataUrl.split(",");
        if (parts[1]) {
          return base64ToUint8Array(parts[1]);
        }
      }
    } catch (e) {
      console.warn("[reportDocx] Failed to resolve media asset fallback:", photo.assetId, e);
    }
  }
  return null;
};

const missingPhotoCallout = (photo: ReportPhoto): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            children: [
              paragraph("⚠️ [Không thể nạp ảnh hiện trường]", true),
              paragraph(`Mã Asset ID: ${photo.assetId || "-"}`),
              paragraph(`Đường dẫn tương đối: ${photo.relativePath || "-"}`),
              paragraph(`Lý do: ${photo.warning || "Không tìm thấy file trong thư mục dự án."}`),
            ],
          }),
        ],
      }),
    ],
  });

const photoBlocks = async (photos: ReportPhoto[], projectId?: string | null): Promise<Array<Paragraph | Table>> => {
  if (photos.length === 0) return [paragraph("Không có ảnh hiện trường.")];

  const sortedPhotos = [...photos].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  const blocks: Array<Paragraph | Table> = [];
  for (let index = 0; index < sortedPhotos.length; index += 1) {
    const photo = sortedPhotos[index];
    const captionText = `Hình: ${photo.label} ${photo.isPrimary ? "(Ảnh đại diện)" : ""} - Asset ID: ${photo.assetId || photo.id}`;
    blocks.push(paragraph(captionText, true));

    const bytes = await loadPhotoBytes(photo, projectId);
    if (bytes && bytes.length > 0) {
      const mime = imageRunTypeFromMime(photo.processedAsset?.mimeType || photo.mimeType);

      const imageRun = new ImageRun({
        type: mime,
        data: bytes,
        transformation: { width: PHOTO_WIDTH, height: Math.round(PHOTO_WIDTH * 0.65) },
      });

      blocks.push(
        new Paragraph({
          children: [imageRun],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        })
      );
    } else if (photo.dataUrl) {
      blocks.push(await imageParagraph(photo.dataUrl, PHOTO_WIDTH, "Không thể nhúng ảnh này vào file Word."));
    } else {
      blocks.push(missingPhotoCallout(photo));
    }
  }
  return blocks;
};

const detailBlocks = async (detail: ReportFeatureDetail, projectId?: string | null): Promise<Array<Paragraph | Table>> => {
  const propertyRows = flattenRecord(detail.properties);
  const rows: Array<[string, unknown]> = [
    ["Tên", detail.feature.name],
    ["Loại", detail.displayType],
    ["Mô tả", detail.description || "-"],
    ["Điểm đầu", formatPoint(detail.startPoint)],
    ["Điểm cuối", formatPoint(detail.endPoint)],
  ];
  if (detail.connectedNames.length > 0) rows.push(["Kết nối/tuyến đi qua", detail.connectedNames.join(", ")]);

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: detail.label, bold: true })],
      spacing: { before: 240, after: 120 },
    }),
    keyValueTable(rows),
    ...(propertyRows.length ? [paragraph("Properties", true), keyValueTable(propertyRows)] : []),
    paragraph("Site photo", true),
    ...detail.photoWarnings.map((warning) => paragraph(warning)),
    ...(await photoBlocks(detail.photos, projectId)),
  ];
};

const sectionBlocks = async (section: ReportSection, imageMap: ReportImageMap, projectId?: string | null): Promise<Array<Paragraph | Table>> => {
  const detailChildren: Array<Paragraph | Table> = [];
  const sectionImage = imageMap[section.id];
  const imageWarnings = typeof sectionImage === "string" ? [] : sectionImage?.warnings || [];
  for (const detail of section.details) {
    detailChildren.push(...await detailBlocks(detail, projectId));
  }

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new Bookmark({
          id: section.anchor,
          children: [new TextRun({ text: `${section.title} (${section.displayType})`, bold: true })],
        }),
      ],
      spacing: { before: 320, after: 160 },
    }),
    await imageParagraph(sectionImage, PAGE_IMAGE_WIDTH, "Không capture được ảnh bản đồ cho đối tượng này."),
    ...section.captureWarnings.map((warning) => paragraph(warning)),
    ...imageWarnings.map((warning) => paragraph(warning)),
    ...(section.summary.length ? [paragraph("Tổng hợp", true), ...section.summary.map((item) => paragraph(item))] : []),
    ...(section.description ? [paragraph("Mô tả", true), paragraph(section.description)] : []),
    ...(section.photos.length > 0 ? [paragraph("Site photo nút giao / đối tượng gốc", true), ...(await photoBlocks(section.photos, projectId))] : []),
    ...detailChildren,
  ];
};

export const buildReportDocx = async (
  model: ReportModel,
  imageMap: ReportImageMap = {},
  onProgress?: (percent: number, statusText: string) => void,
  projectId?: string | null,
): Promise<ArrayBuffer> => {
  clearImageResizeCache();
  try {
    const detailSections: Array<Paragraph | Table> = [];
    const total = model.sections.length;
    for (let index = 0; index < total; index += 1) {
      const section = model.sections[index];
      if (onProgress && total > 0) {
        const percent = Math.round(((index + 1) / total) * 100);
        onProgress(percent, `Đang tạo văn bản mục ${index + 1}/${total}: ${section.title}...`);
      }
      if (index % 2 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
      detailSections.push(...(await sectionBlocks(section, imageMap, projectId)));
      clearImageResizeCache();
    }

    if (onProgress) {
      onProgress(100, "Đang đóng gói file Word...");
      await new Promise((r) => setTimeout(r, 0));
    }

    const allWarnings: Array<{ section: string; featureId: string; assetId: string; warning: string }> = [];
    model.sections.forEach((section) => {
      const checkPhotos = (photos: ReportPhoto[]) => {
        photos.forEach((photo) => {
          if (photo.status === "missing" || photo.warning || (!photo.processedAsset && !photo.dataUrl)) {
            allWarnings.push({
              section: section.title,
              featureId: photo.featureId || section.id,
              assetId: photo.assetId || photo.id,
              warning: photo.warning || "Thiếu file ảnh vật lý",
            });
          }
        });
      };
      checkPhotos(section.photos);
      section.details.forEach((detail) => checkPhotos(detail.photos));
    });

    const summaryWarningBlocks: Array<Paragraph | Table> = [];
    if (allWarnings.length > 0) {
      summaryWarningBlocks.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "Bảng tổng hợp cảnh báo ảnh hiện trường", bold: true })],
          spacing: { before: 400, after: 160 },
        })
      );

      summaryWarningBlocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [paragraph("Mục báo cáo", true)] }),
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [paragraph("Mã đối tượng", true)] }),
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [paragraph("Asset ID", true)] }),
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [paragraph("Chi tiết cảnh báo", true)] }),
              ],
            }),
            ...allWarnings.map(
              (w) =>
                new TableRow({
                  children: [
                    new TableCell({ children: [paragraph(w.section)] }),
                    new TableCell({ children: [paragraph(w.featureId)] }),
                    new TableCell({ children: [paragraph(w.assetId)] }),
                    new TableCell({ children: [paragraph(w.warning)] }),
                  ],
                })
            ),
          ],
        })
      );
    }

    const children: Array<Paragraph | Table> = [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: model.title, bold: true })],
        spacing: { after: 200 },
      }),
      paragraph(`Ngày tạo: ${new Date(model.generatedAt).toLocaleString("vi-VN")}`),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Mục lục", bold: true })],
        spacing: { before: 200, after: 120 },
      }),
      ...model.sections.map((section) => new Paragraph({
        children: [
          new InternalHyperlink({
            anchor: section.anchor,
            children: [new TextRun({ text: section.title, style: "Hyperlink" })],
          }),
        ],
        spacing: { after: 80 },
      })),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Chi tiết", bold: true })],
        spacing: { before: 320, after: 120 },
      }),
      ...detailSections,
      ...summaryWarningBlocks,
    ];

    const doc = new Document({
      documentDefaults: {
        run: {
          font: "Times New Roman",
          size: 24, // 12pt
        },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      }],
    } as any);

    return await Packer.toArrayBuffer(doc);
  } finally {
    clearImageResizeCache();
  }
};
