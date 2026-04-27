import { safeInvoke as invoke } from "@IMPLEMENT/lib/tauri";

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

export const importService = {
  /**
   * Analyzes an import file to infer metadata using the Tauri backend.
   * @param filePath The absolute path to the file.
   * @returns Inferred DatasetMeta.
   */
  async analyzeFile(filePath: string): Promise<DatasetMeta> {
    try {
      return await invoke<DatasetMeta>("analyze_import_file", { path: filePath });
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
      return await invoke<FeatureRecord[]>("start_import_task", {
        path: filePath,
        mapping: mapping || null
      });
    } catch (error) {
      console.error("Failed to start import task via Tauri:", error);
      throw error;
    }
  }
};

// Compatibility bridges for legacy components
export const importFromExcel = async (filePath: string, mapping?: ImportMapping) => {
  return await importService.startImport(filePath, mapping);
};

export const importFromKML = async (filePath: string) => {
  return await importService.startImport(filePath);
};

export const getExcelHeaders = async (filePath: string): Promise<string[]> => {
  const meta = await importService.analyzeFile(filePath);
  return meta.fields.map(f => f.name);
};
