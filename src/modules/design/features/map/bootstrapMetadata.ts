export interface MapBootstrapMetadata {
  projectId: string | null;
  basemapPresetId: string;
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  updatedAt: number;
}

const STORAGE_KEY = "map_bootstrap_metadata_v1";

const DEFAULT_METADATA: MapBootstrapMetadata = {
  projectId: null,
  basemapPresetId: "google-roadmap",
  center: [105.8542, 21.0285], // Hanoi default [lng, lat]
  zoom: 13,
  bearing: 0,
  pitch: 0,
  updatedAt: 0,
};

export function getBootstrapMetadata(): MapBootstrapMetadata {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_METADATA;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_METADATA,
      ...parsed,
      center: Array.isArray(parsed.center) && parsed.center.length === 2 ? parsed.center : DEFAULT_METADATA.center,
    };
  } catch (e) {
    console.warn("[MapBootstrapMetadata] Failed to read metadata from storage, using defaults:", e);
    return DEFAULT_METADATA;
  }
}

export function saveBootstrapMetadata(meta: Partial<MapBootstrapMetadata>): void {
  try {
    const current = getBootstrapMetadata();
    const updated: MapBootstrapMetadata = {
      ...current,
      ...meta,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("[MapBootstrapMetadata] Failed to save metadata to storage:", e);
  }
}
