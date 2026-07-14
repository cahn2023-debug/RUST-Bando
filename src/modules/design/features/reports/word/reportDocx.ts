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

export type ReportImageMap = Record<string, string | undefined>;

const PAGE_IMAGE_WIDTH = 560;
const PHOTO_WIDTH = 360;
const MAX_EMBED_SOURCE_WIDTH = 1200;
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
  dataUrl: string;
  width: number;
  height: number;
};
const imageResizeCache = new Map<string, NormalizedImageData>();

const text = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
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

const resizeDataUrl = async (dataUrl: string): Promise<NormalizedImageData> => {
  if (!dataUrl.startsWith("data:image")) return { dataUrl, width: MAX_EMBED_SOURCE_WIDTH, height: Math.round(MAX_EMBED_SOURCE_WIDTH * 0.62) };
  const cached = imageResizeCache.get(dataUrl);
  if (cached) return cached;

  const image = await loadImage(dataUrl);

  if (!image.naturalWidth || image.naturalWidth <= MAX_EMBED_SOURCE_WIDTH) {
    const result = { dataUrl, width: image.naturalWidth || MAX_EMBED_SOURCE_WIDTH, height: image.naturalHeight || Math.round(MAX_EMBED_SOURCE_WIDTH * 0.62) };
    imageResizeCache.set(dataUrl, result);
    return result;
  }

  const scale = MAX_EMBED_SOURCE_WIDTH / image.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EMBED_SOURCE_WIDTH;
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const resized = canvas.toDataURL("image/jpeg", 0.82);
  const result = { dataUrl: resized, width: canvas.width, height: canvas.height };
  imageResizeCache.set(dataUrl, result);
  return result;
};

const dataUrlToImage = async (dataUrl: string, width: number): Promise<ImageRun | null> => {
  const normalizedImage = await resizeDataUrl(dataUrl);
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(normalizedImage.dataUrl);
  if (!match) return null;
  const type = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  if (!["png", "jpg", "gif", "bmp"].includes(type)) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const aspectHeight = Math.max(1, Math.round(width * (normalizedImage.height / Math.max(1, normalizedImage.width))));
  return new ImageRun({
    type: type as "png" | "jpg" | "gif" | "bmp",
    data: bytes,
    transformation: { width, height: aspectHeight },
  });
};

const imageParagraph = async (dataUrl: string | undefined, width: number, fallback: string): Promise<Paragraph> => {
  if (!dataUrl) return paragraph(fallback);
  const image = await dataUrlToImage(dataUrl, width);
  if (!image) {
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

const photoBlocks = async (photos: ReportPhoto[]): Promise<Paragraph[]> => {
  const availablePhotos = photos.filter((photo) => !!photo.dataUrl);
  if (availablePhotos.length === 0) return [paragraph("No site photos.")];

  const blocks: Paragraph[] = [];
  for (const photo of availablePhotos) {
    blocks.push(paragraph(photo.label, true));
    blocks.push(await imageParagraph(photo.dataUrl, PHOTO_WIDTH, "Không thể nhúng ảnh này vào file Word."));
  }
  return blocks;
};

const detailBlocks = async (detail: ReportFeatureDetail): Promise<Array<Paragraph | Table>> => {
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
    ...(await photoBlocks(detail.photos)),
  ];
};

const sectionBlocks = async (section: ReportSection, imageMap: ReportImageMap): Promise<Array<Paragraph | Table>> => {
  const detailChildren: Array<Paragraph | Table> = [];
  for (const detail of section.details) {
    detailChildren.push(...await detailBlocks(detail));
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
    await imageParagraph(imageMap[section.id], PAGE_IMAGE_WIDTH, "Không capture được ảnh bản đồ cho đối tượng này."),
    ...(section.summary.length ? [paragraph("Tổng hợp", true), ...section.summary.map((item) => paragraph(item))] : []),
    ...(section.description ? [paragraph("Mô tả", true), paragraph(section.description)] : []),
    ...detailChildren,
  ];
};

export const buildReportDocx = async (model: ReportModel, imageMap: ReportImageMap = {}): Promise<ArrayBuffer> => {
  const detailSections: Array<Paragraph | Table> = [];
  for (const section of model.sections) {
    detailSections.push(...await sectionBlocks(section, imageMap));
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
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    }],
  });

  return Packer.toArrayBuffer(doc);
};
