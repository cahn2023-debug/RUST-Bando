import * as XLSX from 'xlsx';
import { DesignEventType } from '@IMPLEMENT/stores/useDesignSync';
import { MapState } from '@CONTRACT/types';
import { save, open } from '@tauri-apps/plugin-dialog';
import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';
import { format } from 'date-fns';

/**
 * Service to handle data analysis Excel operations
 */
export const analysisService = {
  /**
   * Exports current analysis data to Excel
   */
  exportToExcel: async (data: any[], projectId: string) => {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const defaultPath = `Analysis_${projectId}_${timestamp}.xlsx`;

      const filePath = await save({
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        defaultPath: defaultPath
      });

      if (!filePath) return;

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Analysis Data");

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

      await invoke('save_binary_file', {
        path: filePath,
        data: Array.from(new Uint8Array(excelBuffer))
      });

      return true;
    } catch (error) {
      console.error("Export analysis error:", error);
      throw error;
    }
  },

  /**
   * Imports Excel data and generates update events
   */
  importFromExcel: async (state: MapState): Promise<DesignEventType[]> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
      });

      if (!selected || Array.isArray(selected)) return [];

      // Read file content via Tauri since it's a local path
      const fileContent = await invoke<number[]>('read_binary_file', { path: selected });
      const data = new Uint8Array(fileContent);

      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const events: DesignEventType[] = [];
      const features = state.features;

      for (const row of jsonData) {
        const id = row.id || row.ID;
        if (!id || !features[id]) continue;

        const feature = features[id];
        const currentMeta = typeof feature.metadata === 'string'
          ? JSON.parse(feature.metadata || '{}')
          : (feature.metadata || {});
        const currentProps = { ...feature.properties };

        let hasChanges = false;
        let newName = feature.name;

        // Map common fields back
        Object.entries(row).forEach(([key, val]) => {
          const lowerKey = key.toLowerCase();
          const stringVal = String(val);

          if (lowerKey === 'tên' || lowerKey === 'name') {
            if (feature.name !== stringVal) {
              newName = stringVal;
              hasChanges = true;
            }
          } else if (lowerKey === 'mô tả' || lowerKey === 'description') {
            if (currentMeta.description !== stringVal) {
              currentMeta.description = stringVal;
              hasChanges = true;
            }
          } else if (lowerKey === 'mã hiệu (stt)' || lowerKey === 'display_order' || lowerKey === 'stt') {
            if (currentMeta.display_order !== stringVal) {
              currentMeta.display_order = stringVal;
              hasChanges = true;
            }
          } else if (key.startsWith('SPEC_')) {
            const propKey = key.replace('SPEC_', '');
            // Update root properties
            if (currentProps[propKey] !== stringVal) {
              currentProps[propKey] = stringVal;
              hasChanges = true;
            }
            // Also update in metadata.technical_specs for consistency if it exists
            if (currentMeta.technical_specs && typeof currentMeta.technical_specs === 'object') {
              if (currentMeta.technical_specs[propKey] !== stringVal) {
                currentMeta.technical_specs[propKey] = stringVal;
                hasChanges = true;
              }
            }
          } else if (key.startsWith('Biz_')) {
            const bizKey = key.replace('Biz_', '');
            if (!currentMeta.business) currentMeta.business = {};
            if (currentMeta.business[bizKey] !== val) {
              currentMeta.business[bizKey] = val;
              hasChanges = true;
            }
          } else if (key.startsWith('GIS_')) {
            const gisKey = key.replace('GIS_', '');
            if (!currentMeta.gis) currentMeta.gis = {};
            if (currentMeta.gis[gisKey] !== val) {
              currentMeta.gis[gisKey] = val;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          events.push({
            type: 'FeatureUpdated',
            payload: {
              id,
              name: newName,
              metadata: JSON.stringify(currentMeta),
              properties: currentProps
            }
          });
        }
      }

      return events;
    } catch (error) {
      console.error("Import analysis error:", error);
      throw error;
    }
  }
};
