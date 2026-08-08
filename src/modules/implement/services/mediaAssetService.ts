import { mediaApi, mediaAssetSrc } from '@/contracts/tauri-api';
import type { MediaAsset, MediaAssetMutationResult, MediaFeaturePatch } from '@/contracts/tauri-api';

export type { MediaAsset, MediaAssetMutationResult, MediaFeaturePatch } from '@/contracts/tauri-api';

type MediaAssetWithSrc = MediaAsset & { src: string };
type MediaMutationWithSrc = MediaAssetMutationResult & { src: string };

const toMediaAssetWithSrc = (asset: MediaAsset): MediaAssetWithSrc => ({
  ...asset,
  src: mediaAssetSrc(asset),
});

const normalizeMutationResult = (result: MediaAssetMutationResult): MediaMutationWithSrc => {
  const asset = result.asset || result;
  return {
    ...result,
    ...asset,
    asset,
    src: mediaAssetSrc(asset),
  };
};

export const importMediaAsset = async (
  projectId: string,
  featureId: string,
  dataUrl: string
): Promise<MediaMutationWithSrc> => normalizeMutationResult(
  await mediaApi.importAsset(projectId, featureId, dataUrl)
);

export const resolveMediaAsset = async (
  projectId: string,
  assetId: string
): Promise<MediaAssetWithSrc> => toMediaAssetWithSrc(
  await mediaApi.resolveAsset(projectId, assetId)
);

export const deleteMediaAsset = (
  projectId: string,
  assetId: string
): Promise<{ featurePatch?: MediaFeaturePatch | null }> => mediaApi.deleteAsset(projectId, assetId);

export const replaceMediaAsset = async (
  projectId: string,
  featureId: string,
  assetId: string,
  dataUrl: string
): Promise<MediaMutationWithSrc> => normalizeMutationResult(
  await mediaApi.replaceAsset(projectId, featureId, assetId, dataUrl)
);
