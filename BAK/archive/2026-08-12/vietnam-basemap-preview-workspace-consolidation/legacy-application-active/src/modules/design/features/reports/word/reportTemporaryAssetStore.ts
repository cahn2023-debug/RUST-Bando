export interface TemporaryAssetReference {
  assetId: string;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  warnings?: string[];
}

export class TemporaryAssetStore {
  private assets = new Map<string, TemporaryAssetReference>();

  public saveAsset(assetId: string, asset: Omit<TemporaryAssetReference, "assetId">): TemporaryAssetReference {
    const ref: TemporaryAssetReference = { assetId, ...asset };
    this.assets.set(assetId, ref);
    return ref;
  }

  public getAsset(assetId: string): TemporaryAssetReference | undefined {
    return this.assets.get(assetId);
  }

  public removeAsset(assetId: string): void {
    this.assets.delete(assetId);
  }

  public clear(): void {
    this.assets.clear();
  }
}

export const globalTempAssetStore = new TemporaryAssetStore();
