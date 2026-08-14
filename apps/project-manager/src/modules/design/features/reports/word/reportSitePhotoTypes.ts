export interface ProcessedSitePhoto {
  tempPath: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  byteLength: number;
}

export interface ReportSitePhotoRef {
  assetId: string;
  featureId: string;
  projectId: string;

  relativePath: string;
  absolutePath?: string;

  sha256: string;
  mimeType: string;
  byteSize: number;

  width?: number | null;
  height?: number | null;

  sortOrder: number;
  isPrimary: boolean;

  status: "pending" | "resolved" | "missing" | "invalid" | "processed";
  warning?: string | null;

  processedAsset?: ProcessedSitePhoto;
}
