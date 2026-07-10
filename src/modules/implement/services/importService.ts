import { safeInvoke as invoke } from "@IMPLEMENT/lib/tauri";
import type { DesignEventType } from "@CONTRACT/designTypes";

export interface FieldMeta {
  name: string;
  field_type: string;
  display_name: string;
  required: boolean;
}

export interface DatasetMeta {
  dataset_id: string;
  fields: FieldMeta[];
  sample_data?: Record<string, string>[];
}

export interface FeatureRecord {
  id: string;
  geom_type: "Point" | "LineString" | "Polygon";
  geometry: any; // GeoJSON geometry
  center_lat: number;
  center_lon: number;
  tile_id: string;
  properties: Record<string, string>;
}

export interface ImportMapping {
  name_column: string;
  lat_column: string;
  lng_column: string;
  description_column?: string;
  order_column?: string;
}

const ensureAbsolutePath = (filePath: string): string => {
  const normalized = filePath?.trim();
  if (!normalized) {
    throw new Error("Import file path is empty.");
  }
  if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(normalized)) {
    throw new Error(`Import requires an absolute file path. Received: ${filePath}`);
  }
  return normalized;
};

export const buildFeatureCreatedEvents = (
  records: FeatureRecord[],
  groupId: string,
  layerId: string
): DesignEventType[] => {
  return records.map((record, index) => {
    const name = record.properties.name || record.properties.label || `Point ${index + 1}`;
    const metadata = {
      ...(record.properties.description ? { description: record.properties.description } : {}),
      ...(record.properties.display_order ? { display_order: record.properties.display_order } : {}),
      imported_from: "excel",
      imported_tile_id: record.tile_id,
      source_properties: record.properties,
    };

    return {
      type: "FeatureCreated",
      payload: {
        id: record.id,
        layer_id: layerId,
        group_id: groupId,
        name,
        geom_type: "Point",
        metadata: JSON.stringify(metadata),
        coordinates: record.geometry,
        properties: record.properties,
      },
    };
  });
};

export const importService = {
  /**
   * Analyzes an import file to infer metadata using the Tauri backend.
   * @param filePath The absolute path to the file.
   * @returns Inferred DatasetMeta.
   */
  async analyzeFile(filePath: string): Promise<DatasetMeta> {
    try {
      const normalizedPath = ensureAbsolutePath(filePath);
      const result = await invoke<DatasetMeta>("analyze_import_file", { path: normalizedPath });
      if (!result?.fields?.length) {
        throw new Error("Import analysis returned no usable field metadata.");
      }
      return result;
    } catch (error) {
      console.error("Failed to analyze file via Tauri:", error);
      throw error;
    }
  },

  /**
   * Starts the high-performance import task for a given file via the Tauri backend.
   * @param filePath The absolute path to the file.
   * @returns The list of parsed features.
   */
  async startImport(filePath: string, mapping?: ImportMapping): Promise<FeatureRecord[]> {
    try {
      const normalizedPath = ensureAbsolutePath(filePath);
      const result = await invoke<FeatureRecord[]>("start_import_task", {
        path: normalizedPath,
        mapping: mapping || null
      });
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error("Import did not return any valid feature records.");
      }
      return result;
    } catch (error) {
      console.error("Failed to start import task via Tauri:", error);
      throw error;
    }
  }
};

export const applyImportedRecords = async (records: FeatureRecord[], preferredGroupId?: string): Promise<number> => {
  if (!records.length) {
    throw new Error("There are no imported records to apply.");
  }

  const { useDesignSync } = await import("@IMPLEMENT/stores/useDesignSync");
  const store = useDesignSync.getState();
  const targetGroupId = preferredGroupId || store.selectedGroupId;
  if (!targetGroupId) {
    throw new Error("Vui lòng chọn một nhóm đích trước khi import dữ liệu Excel.");
  }

  const targetGroup = store.state?.feature_groups?.[targetGroupId];
  if (!targetGroup?.layer_id) {
    throw new Error("Nhóm đích không hợp lệ hoặc chưa có layer để chứa dữ liệu import.");
  }

  const events = buildFeatureCreatedEvents(records, targetGroupId, targetGroup.layer_id);
  await store.dispatchEvents(events);
  store.setSelectedGroup(targetGroupId);
  if (records[0]) {
    store.zoomTo(records[0].id, "location", [records[0].center_lat, records[0].center_lon]);
  }
  return events.length;
};

// Compatibility bridges for legacy components
export const importFromExcel = async (filePath: string, mapping?: ImportMapping) => {
  return await importService.startImport(filePath, mapping);
};

export const importFromKML = async (filePath: string) => {
  ensureAbsolutePath(filePath);
  throw new Error("KML/KMZ import is not implemented in this Excel-focused import flow yet.");
};

export const getExcelHeaders = async (filePath: string): Promise<string[]> => {
  const meta = await importService.analyzeFile(filePath);
  return meta.fields.map(f => f.name);
};
