import { safeConvertFileSrc, safeInvoke } from '@IMPLEMENT/lib/tauri';

export interface MediaAsset {
  id: string;
  assetId: string;
  projectId: string;
  featureId?: string;
  sha256: string;
  relPath: string;
  path: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  dataUrl?: string;
}

export interface MediaFeaturePatch {
  id: string;
  name?: string;
  metadata: string;
  properties?: Record<string, unknown>;
}

export interface MediaAssetMutationResult extends MediaAsset {
  asset?: MediaAsset;
  featurePatch?: MediaFeaturePatch | null;
}

export const mediaApi = {
  importAsset: (projectId: string, featureId: string, dataUrl: string) =>
    safeInvoke<MediaAssetMutationResult>('import_media_asset', { projectId, featureId, dataUrl }),

  resolveAsset: (projectId: string, assetId: string, pmpPath?: string | null) =>
    safeInvoke<MediaAsset>('resolve_media_asset', {
      projectId,
      assetId,
      ...(pmpPath ? { pmpPath } : {}),
    }),

  deleteAsset: (projectId: string, assetId: string) =>
    safeInvoke<{ featurePatch?: MediaFeaturePatch | null }>('delete_media_asset', { projectId, assetId }),

  replaceAsset: (projectId: string, featureId: string, assetId: string, dataUrl: string) =>
    safeInvoke<MediaAssetMutationResult>('replace_media_asset', { projectId, featureId, assetId, dataUrl }),
};

export const mediaAssetSrc = (asset: MediaAsset): string =>
  asset.dataUrl || safeConvertFileSrc(asset.path);
