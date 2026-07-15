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

const toMediaAssetWithSrc = (asset: MediaAsset): MediaAsset & { src: string } => ({
  ...asset,
  src: asset.dataUrl || convertFileSrc(asset.path),
});

export const importMediaAsset = async (
  projectId: string,
  featureId: string,
  dataUrl: string
): Promise<MediaAsset & { src: string }> => {
  const asset = await invoke<MediaAsset>('import_media_asset', {
    projectId,
    featureId,
    dataUrl,
  });
  return toMediaAssetWithSrc(asset);
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
): Promise<void> => {
  await invoke('delete_media_asset', {
    projectId,
    assetId,
  });
};
