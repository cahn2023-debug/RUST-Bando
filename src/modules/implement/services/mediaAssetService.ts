import { convertFileSrc, invoke } from '@tauri-apps/api/core';

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

const toMediaAssetWithSrc = (asset: MediaAsset): MediaAsset & { src: string } => ({
  ...asset,
  src: asset.dataUrl || convertFileSrc(asset.path),
});

const normalizeMutationResult = (result: MediaAssetMutationResult): MediaAssetMutationResult & { src: string } => {
  const asset = result.asset || result;
  return {
    ...result,
    ...asset,
    asset,
    src: asset.dataUrl || convertFileSrc(asset.path),
  };
};

export const importMediaAsset = async (
  projectId: string,
  featureId: string,
  dataUrl: string
): Promise<MediaAssetMutationResult & { src: string }> => {
  const asset = await invoke<MediaAssetMutationResult>('import_media_asset', {
    projectId,
    featureId,
    dataUrl,
  });
  return normalizeMutationResult(asset);
};

export const resolveMediaAsset = async (
  projectId: string,
  assetId: string
): Promise<MediaAsset & { src: string }> => {
  const asset = await invoke<MediaAsset>('resolve_media_asset', {
    projectId,
    assetId,
  });
  return toMediaAssetWithSrc(asset);
};

export const deleteMediaAsset = async (
  projectId: string,
  assetId: string
): Promise<{ featurePatch?: MediaFeaturePatch | null }> => {
  return await invoke<{ featurePatch?: MediaFeaturePatch | null }>('delete_media_asset', {
    projectId,
    assetId,
  });
};

export const replaceMediaAsset = async (
  projectId: string,
  featureId: string,
  assetId: string,
  dataUrl: string
): Promise<MediaAssetMutationResult & { src: string }> => {
  const result = await invoke<MediaAssetMutationResult>('replace_media_asset', {
    projectId,
    featureId,
    assetId,
    dataUrl,
  });
  return normalizeMutationResult(result);
};
