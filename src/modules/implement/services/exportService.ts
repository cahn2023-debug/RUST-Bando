import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { MapState, FeatureState, Project, FeatureMetadata as TypesFeatureMetadata } from '@CONTRACT/types';
import { format } from 'date-fns';

import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useExportStore } from '@IMPLEMENT/stores/useExportStore';
import { logger } from '@TOOL/utils/logger';

/**
 * Escapes special characters for XML/KML
 */
const escapeXml = (unsafe: string | number | boolean | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return '';
  const str = String(unsafe);
  return str.replace(/[<>&"']/g, (m) => {
    switch (m) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return m;
    }
  });
};

/**
 * Service to handle project data export to ZIP
 */
export const exportProjectData = async (projectState: MapState, projectName: string, projectInfo?: Project | null) => {
  const { startExport, updateProgress, finishExport, setError } = useExportStore.getState();

  const mainZip = new JSZip();
  const kmzZip = new JSZip();

  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  const defaultPath = `${projectName}_${timestamp}.zip`;

  // 1. Ask for save location using Tauri dialog
  const filePath = await save({
    filters: [
      { name: 'ZIP Archive', extensions: ['zip'] },
      { name: 'Google Earth KMZ', extensions: ['kmz'] }
    ],
    defaultPath: defaultPath
  });

  if (!filePath) return; // User cancelled

  startExport('Đang chuẩn bị dữ liệu báo cáo...');
  updateProgress(5, 'Đang chuẩn bị dữ liệu báo cáo...');

  try {
    // 2. Generate Excel (.xlsx) -> Add to MAIN ZIP
    updateProgress(10, 'Đang tạo bảng Excel metadata...');
    const excelData = prepareExcelData(projectState);
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    // Add Project Info sheet if info is available
    if (projectInfo) {
      const projectSheetData = [
        { "Trường": "Tên dự án", "Giá trị": projectInfo.name },
        { "Trường": "ID dự án", "Giá trị": projectInfo.id },
        { "Trường": "Đường dẫn", "Giá trị": projectInfo.path },
        { "Trường": "Thời gian xuất", "Giá trị": format(new Date(), 'dd/MM/yyyy HH:mm:ss') },
        { "Trường": "Tổng số đối tượng", "Giá trị": Object.keys(projectState.features).length }
      ];
      const projectSheet = XLSX.utils.json_to_sheet(projectSheetData);
      XLSX.utils.book_append_sheet(workbook, projectSheet, "Project Info");
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, "Metadata");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    mainZip.file(`Metadata_${timestamp}.xlsx`, excelBuffer);
    updateProgress(20, 'Đã tạo xong Excel.');

    // 3. Generate KML (.kml) -> Add to KMZ ZIP
    updateProgress(25, 'Đang tạo dữ liệu bản đồ KMZ...');
    const kmlContent = generateKML(projectState, projectName, projectInfo);
    kmzZip.file("doc.kml", kmlContent);
    updateProgress(30, 'Đã tạo xong KML cơ sở.');

    // 4. Process Images -> Add to BOTH
    const mainImgFolder = mainZip.folder("Image");
    const kmzImgFolder = kmzZip.folder("images");

    if (mainImgFolder && kmzImgFolder) {
      updateProgress(35, 'Đang xử lý hình ảnh hiện trường...');
      await processAndAddImages(projectState, [mainImgFolder, kmzImgFolder], (prog, text) => {
        // Map image processing (0-100) to overall progress (35-85)
        const overallProg = 35 + (prog * 0.5);
        updateProgress(overallProg, text);
      });
    }

    // 5. Finalize KMZ and Add to Main ZIP
    updateProgress(85, 'Đang đóng gói file KMZ...');
    const kmzContent = await kmzZip.generateAsync({ type: "uint8array" });
    mainZip.file(`${projectName}.kmz`, kmzContent);

    // 6. Generate and Save MAIN ZIP via Tauri
    updateProgress(90, 'Đang nén dữ liệu ZIP cuối cùng...');
    console.log("[Export] Generating MAIN ZIP content...");
    const finalContent = await mainZip.generateAsync({ type: "uint8array" });

    updateProgress(95, `Đang lưu file vào hệ thống (Size: ${(finalContent.length / (1024 * 1024)).toFixed(2)} MB)...`);
    console.log(`[Export] ZIP generated, size: ${finalContent.length} bytes. Saving to ${filePath}...`);

    await invoke('save_binary_file', {
      path: filePath,
      data: Array.from(finalContent)
    });

    updateProgress(100, 'Hoàn tất! Cấu trúc ZIP phân cấp đã được lưu.');
    console.log(`[Export] Successfully saved to ${filePath}`);
    finishExport();
  } catch (error: unknown) {
    console.error("[Export] Failed to save file:", error);
    setError(error instanceof Error ? error.message : String(error));
  }
};

import { flattenFeature } from '@TOOL/utils/dataFlattening';

/**
 * Flattens features and metadata for Excel
 */
const prepareExcelData = (state: MapState) => {
  return Object.values(state.features).map(f => flattenFeature(f as FeatureState, state));
};


/**
 * Generates basic KML string
 */
const generateKML = (state: MapState, projectName: string, projectInfo?: Project | null) => {
  const safeProjectName = escapeXml(projectName);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeProjectName}</name>
    <description>
      <![CDATA[
        Dự án: ${projectName}
        ID: ${projectInfo?.id || 'N/A'}
        Đường dẫn: ${projectInfo?.path || 'N/A'}
        Ngày xuất: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}
      ]]>
    </description>`;

  (Object.values(state.features) as FeatureState[]).forEach(f => {
    let coords = '';
    const safeName = escapeXml(f.name);
    const safeId = escapeXml(f.id);
    try {
      const c = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
      if (f.geom_type === 'Point' && Array.isArray(c)) {
        coords = `<Point><coordinates>${c[0]},${c[1]},0</coordinates></Point>`;
      } else if (f.geom_type === 'Polyline' && Array.isArray(c)) {
        const path = (c as [number, number][]).map((p) => `${p[0]},${p[1]},0`).join(' ');
        coords = `<LineString><coordinates>${path}</coordinates></LineString>`;
      }
    } catch (e) {
      logger.warn('[exportService] Failed to parse coordinates for feature:', f.id, e);
      // Continue with empty coords - don't break entire export
    }

    if (coords) {
      xml += `
    <Placemark>
      <name>${safeName}</name>
      <description>ID: ${safeId}</description>
      ${coords}
    </Placemark>`;
    }
  });

  xml += `
  </Document>
</kml>`;
  return xml;
};

/**
 * Extracts base64 images and adds to ZIP folder
 */
const processAndAddImages = async (
  state: MapState,
  folders: JSZip[],
  onProgress?: (prog: number, status: string) => void
) => {
  const features = Object.values(state.features) as FeatureState[];
  const totalFeatures = features.length;

  if (totalFeatures === 0) {
    onProgress?.(100, "Không có hình ảnh để xử lý.");
    return;
  }

  for (let idx = 0; idx < totalFeatures; idx++) {
    const f = features[idx];
    const progressPercent = (idx / totalFeatures) * 100;
    onProgress?.(progressPercent, `Đang xử lý ảnh: ${f.name || 'Feature'} (${idx + 1}/${totalFeatures})...`);

    let metadata: TypesFeatureMetadata & { media?: { imageUrls?: string[] }; imageUrls?: string[] } = {};
    try {
      metadata = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata;
    } catch (e) {
      continue;
    }

    const imageUrls = metadata.media?.imageUrls || (metadata.imageUrls) || [];

    for (let i = 0; i < imageUrls.length; i++) {
      const dataUrl = imageUrls[i];
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) continue;

      // Extract base64
      const parts = dataUrl.split(';base64,');
      if (parts.length !== 2) continue;

      const contentType = parts[0].split(':')[1];
      const extension = contentType.split('/')[1] || 'jpg';
      const base64Data = parts[1];

      const fileName = `${(f.name || f.id).replace(/[/\\?%*:|"<>]/g, '-')}_${f.id.slice(0, 4)}_${i}.${extension}`;

      // Add to ALL provided folders
      folders.forEach(folder => {
        folder.file(fileName, base64Data, { base64: true });
      });
    }
  }
  onProgress?.(100, "Đã xử lý xong tất cả hình ảnh.");
};

/**
 * Gets all features belonging to a specific group (including nested subgroups)
 */
const getGroupFeatures = (state: MapState, groupId: string): FeatureState[] => {
  const features: FeatureState[] = [];
  const allFeatures = Object.values(state.features) as FeatureState[];
  const allGroups = state.feature_groups || {};

  // Find all subgroup IDs (nested groups)
  const subgroupIds = new Set<string>();
  const findSubgroups = (parentId: string) => {
    Object.values(allGroups).forEach((g) => {
      if (g.parent_id === parentId) {
        subgroupIds.add(g.id);
        findSubgroups(g.id); // Recursively find nested subgroups
      }
    });
  };
  findSubgroups(groupId);
  subgroupIds.add(groupId); // Include the parent group itself

  // Collect all features in this group and its subgroups
  allFeatures.forEach(f => {
    if (f.group_id && subgroupIds.has(f.group_id)) {
      features.push(f);
    }
  });

  return features;
};

/**
 * Generates KML string for a specific group
 */
export const generateGroupKML = (state: MapState, groupId: string, groupName: string): string => {
  const groupFeatures = getGroupFeatures(state, groupId);
  const safeGroupName = escapeXml(groupName);
  const timestamp = format(new Date(), 'dd/MM/yyyy HH:mm:ss');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeGroupName}</name>
    <description>
      <![CDATA[
        Nhóm: ${safeGroupName}
        Số lượng đối tượng: ${groupFeatures.length}
        Ngày xuất: ${timestamp}
      ]]>
    </description>`;

  groupFeatures.forEach(f => {
    let coords = '';
    const safeName = escapeXml(f.name);
    const safeId = escapeXml(f.id);
    try {
      const c = typeof f.coordinates === 'string' ? JSON.parse(f.coordinates) : f.coordinates;
      if (f.geom_type === 'Point' && Array.isArray(c)) {
        coords = `<Point><coordinates>${c[0]},${c[1]},0</coordinates></Point>`;
      } else if ((f.geom_type === 'Polyline' || f.geom_type === 'LineString') && Array.isArray(c)) {
        const path = (c as [number, number][]).map((p) => `${p[0]},${p[1]},0`).join(' ');
        coords = `<LineString><coordinates>${path}</coordinates></LineString>`;
      } else if (f.geom_type === 'Polygon' && Array.isArray(c)) {
        const rings = Array.isArray(c[0]) ? c : [c];
        const allCoords = rings.flat().map((p: [number, number]) => `${p[0]},${p[1]},0`).join(' ');
        coords = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${allCoords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
    } catch (e) {
      console.warn(`[KML] Failed to parse coordinates for ${f.name}:`, e);
    }

    if (coords) {
      // Parse metadata for extended data
      let extendedData = '';
      try {
        const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata;
        const metaEntries = Object.entries(meta).filter(([_k, v]) => v !== undefined && v !== null && v !== '');
        if (metaEntries.length > 0) {
          extendedData = `<ExtendedData>\n` +
            metaEntries.map(([k, v]) => `      <Data name="${escapeXml(k)}"><value>${escapeXml(String(v))}</value></Data>`).join('\n') +
            `\n    </ExtendedData>`;
        }
      } catch (e) {
        logger.warn('[exportService] Failed to parse metadata for KML export:', f.id, e);
        // Continue without extended data
      }

      xml += `
    <Placemark>
      <name>${safeName}</name>
      <description>ID: ${safeId} | Loại: ${escapeXml(f.geom_type)}</description>
      ${extendedData}
      ${coords}
    </Placemark>`;
    }
  });

  xml += `
  </Document>
</kml>`;
  return xml;
};

/**
 * Exports a specific group to KML file
 */
export const exportGroupToKML = async (state: MapState, groupId: string, groupName: string): Promise<void> => {
  const groupFeatures = getGroupFeatures(state, groupId);

  if (groupFeatures.length === 0) {
    alert('Nhóm này không có đối tượng nào để xuất.');
    return;
  }

  const filePath = await save({
    filters: [{ name: 'KML File', extensions: ['kml'] }],
    defaultPath: `${groupName.replace(/[/\\?%*:|"<>]/g, '-')}.kml`
  });

  if (!filePath) return;

  try {
    const kmlContent = generateGroupKML(state, groupId, groupName);
    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await invoke('save_binary_file', {
      path: filePath,
      data: Array.from(uint8Array)
    });

    console.log(`[Export] Successfully exported ${groupFeatures.length} features to ${filePath}`);
  } catch (error: unknown) {
    console.error('[Export] Failed to export KML:', error);
    alert(`Lỗi khi xuất file KML: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Exports a specific group to KMZ file (KML + images)
 */
export const exportGroupToKMZ = async (state: MapState, groupId: string, groupName: string): Promise<void> => {
  const groupFeatures = getGroupFeatures(state, groupId);

  if (groupFeatures.length === 0) {
    alert('Nhóm này không có đối tượng nào để xuất.');
    return;
  }

  const filePath = await save({
    filters: [{ name: 'KMZ File', extensions: ['kmz'] }],
    defaultPath: `${groupName.replace(/[/\\?%*:|"<>]/g, '-')}.kmz`
  });

  if (!filePath) return;

  try {
    const kmzZip = new JSZip();

    // Generate KML content
    const kmlContent = generateGroupKML(state, groupId, groupName);
    kmzZip.file('doc.kml', kmlContent);

    // Add images
    const imagesFolder = kmzZip.folder('images');
    if (imagesFolder) {
      for (const f of groupFeatures) {
        let metadata: TypesFeatureMetadata & { media?: { imageUrls?: string[] }; imageUrls?: string[] } = {};
        try {
          metadata = typeof f.metadata === 'string' ? JSON.parse(f.metadata) : f.metadata;
        } catch (e) {
          continue;
        }

        const imageUrls = metadata.media?.imageUrls || metadata.imageUrls || [];
        for (let i = 0; i < imageUrls.length; i++) {
          const dataUrl = imageUrls[i];
          if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) continue;

          const parts = dataUrl.split(';base64,');
          if (parts.length !== 2) continue;

          const contentType = parts[0].split(':')[1];
          const extension = contentType.split('/')[1] || 'jpg';
          const base64Data = parts[1];

          const fileName = `${(f.name || f.id).replace(/[/\\?%*:|"<>]/g, '-')}_${f.id.slice(0, 4)}_${i}.${extension}`;
          imagesFolder.file(fileName, base64Data, { base64: true });
        }
      }
    }

    // Generate and save KMZ
    const kmzContent = await kmzZip.generateAsync({ type: 'uint8array' });

    await invoke('save_binary_file', {
      path: filePath,
      data: Array.from(kmzContent)
    });

    console.log(`[Export] Successfully exported ${groupFeatures.length} features to KMZ: ${filePath}`);
  } catch (error: unknown) {
    console.error('[Export] Failed to export KMZ:', error);
    alert(`Lỗi khi xuất file KMZ: ${error instanceof Error ? error.message : String(error)}`);
  }
};
