import { safeInvoke as invoke } from "@IMPLEMENT/lib/tauri";
import type { ReportSitePhotoRef } from "./reportSitePhotoTypes";

export async function fetchSectionSitePhotos(
  pmpPath: string,
  projectId: string,
  featureIds: string[]
): Promise<ReportSitePhotoRef[]> {
  if (!pmpPath || !projectId || featureIds.length === 0) {
    return [];
  }

  try {
    const photos = await invoke<ReportSitePhotoRef[]>("get_report_section_site_photos", {
      pmpPath,
      projectId,
      featureIds,
    });
    return photos || [];
  } catch (error) {
    console.warn("[reportSitePhotoRepository] Failed to fetch section site photos:", error);
    return [];
  }
}
