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
const imageResizeCache = new Map<string, string>();

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

const resizeDataUrl = async (dataUrl: string): Promise<string> => {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const cached = imageResizeCache.get(dataUrl);
  if (cached) return cached;

  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image load failed"));
  });

  if (!image.naturalWidth || image.naturalWidth <= MAX_EMBED_SOURCE_WIDTH) {
    imageResizeCache.set(dataUrl, dataUrl);
    return dataUrl;
  }

  const scale = MAX_EMBED_SOURCE_WIDTH / image.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EMBED_SOURCE_WIDTH;
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const resized = canvas.toDataURL("image/jpeg", 0.82);
  imageResizeCache.set(dataUrl, resized);
  return resized;
};

const dataUrlToImage = async (dataUrl: string, width: number): Promise<ImageRun | null> => {
  const normalizedDataUrl = await resizeDataUrl(dataUrl);
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(normalizedDataUrl);
  if (!match) return null;
  const type = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  if (!["png", "jpg", "gif", "bmp"].includes(type)) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new ImageRun({
    type: type as "png" | "jpg" | "gif" | "bmp",
    data: bytes,
    transformation: { width, height: Math.round(width * 0.62) },
  });
};

const imageParagraph = async (dataUrl: string | undefined, width: number, fallback: string): Promise<Paragraph> => {
  if (!dataUrl) return paragraph(fallback);
  const image = await dataUrlToImage(dataUrl, width);
  if (!image) return paragraph(dataUrl.startsWith("http") ? `Anh: ${dataUrl}` : fallback);
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
    } else if (!["media.imageUrls", "media.imageUrl", "imageUrls", "imageUrl"].includes(fullKey)) {
      rows.push([fullKey, value]);
    }
  });
  return rows;
};

const photoBlocks = async (photos: ReportPhoto[]): Promise<Paragraph[]> => {
  if (photos.length === 0) return [paragraph("Khong co anh site photo.")];

  const blocks: Paragraph[] = [];
  for (const photo of photos) {
    blocks.push(paragraph(photo.label, true));
    blocks.push(await imageParagraph(photo.dataUrl, PHOTO_WIDTH, "Khong the nhung anh nay vao file Word."));
  }
  return blocks;
};

const detailBlocks = async (detail: ReportFeatureDetail): Promise<Array<Paragraph | Table>> => {
  const metadataRows = flattenRecord(detail.metadata);
  const propertyRows = flattenRecord(detail.properties);
  const rows: Array<[string, unknown]> = [
    ["Ten", detail.feature.name],
    ["Loai", detail.displayType],
    ["Mo ta", detail.description || "-"],
    ["Diem dau", formatPoint(detail.startPoint)],
    ["Diem cuoi", formatPoint(detail.endPoint)],
  ];
  if (detail.connectedNames.length > 0) rows.push(["Ket noi/tuyen di qua", detail.connectedNames.join(", ")]);

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: detail.label, bold: true })],
      spacing: { before: 240, after: 120 },
    }),
    keyValueTable(rows),
    ...(metadataRows.length ? [paragraph("Metadata", true), keyValueTable(metadataRows)] : []),
    ...(propertyRows.length ? [paragraph("Properties", true), keyValueTable(propertyRows)] : []),
    paragraph("Site photo", true),
    ...(await photoBlocks(detail.photos)),
    paragraph("Anh goc nhin du kien", true),
    paragraph("Chua co anh goc nhin du kien kha dung."),
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
    await imageParagraph(imageMap[section.id], PAGE_IMAGE_WIDTH, "Khong capture duoc anh ban do cho doi tuong nay."),
    ...(section.summary.length ? [paragraph("Tong hop", true), ...section.summary.map((item) => paragraph(item))] : []),
    ...(section.description ? [paragraph("Mo ta", true), paragraph(section.description)] : []),
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
    paragraph(`Ngay tao: ${new Date(model.generatedAt).toLocaleString("vi-VN")}`),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Muc luc", bold: true })],
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
      children: [new TextRun({ text: "Chi tiet", bold: true })],
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
