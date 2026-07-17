import JSZip from 'jszip';
import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';
import type { DesignEventType } from '@CONTRACT/designTypes';
import { syncDisplayOrderAliases } from '@TOOL/utils/featureMapping';

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
  geom_type: 'Point' | 'LineString' | 'Polygon';
  geometry: any;
  center_lat: number;
  center_lon: number;
  tile_id: string;
  properties: Record<string, string>;
  metadata?: Record<string, unknown>;
  source_format?: 'excel' | 'kml' | 'kmz';
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
    throw new Error('Import file path is empty.');
  }
  if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(normalized)) {
    throw new Error(`Import requires an absolute file path. Received: ${filePath}`);
  }
  return normalized;
};

const getFileName = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;

const getFileExtension = (filePath: string) => getFileName(filePath).split('.').pop()?.toLowerCase() || '';

const createImportRecordId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ensureUuidLikeId = (value: string) => (UUID_PATTERN.test(value) ? value : createImportRecordId());

const decodeBytes = (bytes: number[] | Uint8Array) => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('utf-8').decode(buffer);
};

const readBinaryFile = async (filePath: string) => {
  const normalizedPath = ensureAbsolutePath(filePath);
  return await invoke<number[]>('read_binary_file', { path: normalizedPath });
};

const inferFieldType = (value: unknown): string => {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
};

const buildDatasetMetaFromRecords = (records: FeatureRecord[]): DatasetMeta => {
  const sample = records.slice(0, 5).map((record) => record.properties);
  const fieldMap = new Map<string, FieldMeta>();

  records.forEach((record) => {
    Object.entries(record.properties).forEach(([key, value]) => {
      if (!fieldMap.has(key)) {
        fieldMap.set(key, {
          name: key,
          display_name: key,
          field_type: inferFieldType(value),
          required: false,
        });
      }
    });
  });

  return {
    dataset_id: `import-${Date.now()}`,
    fields: Array.from(fieldMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    sample_data: sample,
  };
};

const parseCoordinatesText = (coordinatesText: string): Array<[number, number, number?]> => (
  coordinatesText
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map((value) => Number.parseFloat(value.trim())))
    .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
    .map((parts) => [parts[0], parts[1], Number.isFinite(parts[2]) ? parts[2] : undefined])
);

const averageCoordinate = (coords: Array<[number, number, number?]>) => {
  if (coords.length === 0) return { lon: 0, lat: 0 };
  const total = coords.reduce((acc, coord) => ({
    lon: acc.lon + coord[0],
    lat: acc.lat + coord[1],
  }), { lon: 0, lat: 0 });
  return {
    lon: total.lon / coords.length,
    lat: total.lat / coords.length,
  };
};

const readKmlText = async (filePath: string): Promise<string> => {
  const extension = getFileExtension(filePath);
  if (extension === 'kmz') {
    const bytes = await readBinaryFile(filePath);
    const zip = await JSZip.loadAsync(new Uint8Array(bytes));
    const kmlFileName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));
    if (!kmlFileName) {
      throw new Error('KMZ file does not contain a KML document.');
    }
    const file = zip.file(kmlFileName);
    if (!file) {
      throw new Error('Unable to read KML document from KMZ archive.');
    }
    return await file.async('text');
  }

  const bytes = await readBinaryFile(filePath);
  return decodeBytes(bytes);
};

const getElementText = (parent: Element | null, selector: string) => {
  const text = parent?.querySelector(selector)?.textContent?.trim();
  return text || '';
};

const parseKmlRecords = async (filePath: string): Promise<FeatureRecord[]> => {
  const xmlText = await readKmlText(filePath);
  const document = new DOMParser().parseFromString(xmlText, 'text/xml');
  const placemarks = Array.from(document.getElementsByTagName('Placemark'));
  const baseName = getFileName(filePath).replace(/\.(kml|kmz)$/i, '');

  const records: Array<FeatureRecord | null> = placemarks.map((placemark, index) => {
    const recordId = createImportRecordId();
    const name = getElementText(placemark, 'name') || `Placemark ${index + 1}`;
    const description = getElementText(placemark, 'description');
    const properties: Record<string, string> = {
      name,
      ...(description ? { description } : {}),
    };

    Array.from(placemark.querySelectorAll('ExtendedData > Data')).forEach((data) => {
      const key = data.getAttribute('name')?.trim();
      const value = data.querySelector('value')?.textContent?.trim();
      if (key && value) properties[key] = value;
    });

    Array.from(placemark.querySelectorAll('ExtendedData > SchemaData > SimpleData')).forEach((data) => {
      const key = data.getAttribute('name')?.trim();
      const value = data.textContent?.trim();
      if (key && value) properties[key] = value;
    });

    const pointText = placemark.querySelector('Point > coordinates')?.textContent?.trim();
    if (pointText) {
      const coords = parseCoordinatesText(pointText);
      const first = coords[0] || [0, 0];
      return {
        id: recordId,
        geom_type: 'Point' as const,
        geometry: [first[0], first[1]],
        center_lat: first[1],
        center_lon: first[0],
        tile_id: `${baseName}-${index + 1}`,
        properties,
        metadata: { imported_from: 'kml' },
        source_format: 'kml' as const,
      };
    }

    const lineText = placemark.querySelector('LineString > coordinates')?.textContent?.trim();
    if (lineText) {
      const coords = parseCoordinatesText(lineText).map((coord) => [coord[0], coord[1]]);
      const center = averageCoordinate(coords.map((coord) => [coord[0], coord[1]]));
      return {
        id: recordId,
        geom_type: 'LineString' as const,
        geometry: coords,
        center_lat: center.lat,
        center_lon: center.lon,
        tile_id: `${baseName}-${index + 1}`,
        properties,
        metadata: { imported_from: 'kml' },
        source_format: 'kml' as const,
      };
    }

    const polygonText = placemark.querySelector('Polygon > outerBoundaryIs > LinearRing > coordinates')?.textContent?.trim()
      || placemark.querySelector('Polygon > coordinates')?.textContent?.trim();
    if (polygonText) {
      const coords = parseCoordinatesText(polygonText).map((coord) => [coord[0], coord[1]]);
      const center = averageCoordinate(coords.map((coord) => [coord[0], coord[1]]));
      return {
        id: recordId,
        geom_type: 'Polygon' as const,
        geometry: [coords],
        center_lat: center.lat,
        center_lon: center.lon,
        tile_id: `${baseName}-${index + 1}`,
        properties,
        metadata: { imported_from: 'kml' },
        source_format: 'kml' as const,
      };
    }

    return null;
  });

  return records.filter((record): record is FeatureRecord => record !== null);
};

export const buildFeatureCreatedEvents = (
  records: FeatureRecord[],
  groupId: string,
  layerId: string
): DesignEventType[] => {
  return records.map((record, index) => {
    const featureId = ensureUuidLikeId(record.id);
    const name = record.properties.name || record.properties.label || `Point ${index + 1}`;
    const metadata = syncDisplayOrderAliases(
      {
        ...(record.metadata || {}),
        ...(record.properties.description ? { description: record.properties.description } : {}),
        ...(record.properties.display_order ? { display_order: record.properties.display_order } : {}),
        imported_from: record.source_format || 'excel',
        imported_tile_id: record.tile_id,
        source_properties: record.properties,
      },
      record.properties.display_order,
      record.properties
    );

    return {
      type: 'FeatureCreated',
      payload: {
        id: featureId,
        layer_id: layerId,
        group_id: groupId,
        name,
        geom_type: record.geom_type,
        metadata: JSON.stringify(metadata),
        coordinates: record.geometry,
        properties: record.properties,
      },
    };
  });
};

export const importService = {
  async analyzeFile(filePath: string): Promise<DatasetMeta> {
    const normalizedPath = ensureAbsolutePath(filePath);
    const extension = getFileExtension(normalizedPath);

    if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(extension)) {
      try {
        const result = await invoke<DatasetMeta>('analyze_import_file', { path: normalizedPath });
        if (!result?.fields?.length) {
          throw new Error('Import analysis returned no usable field metadata.');
        }
        return result;
      } catch (error) {
        console.error('Failed to analyze file via Tauri:', error);
        throw error;
      }
    }

    if (['kml', 'kmz'].includes(extension)) {
      const records = await parseKmlRecords(normalizedPath);
      return buildDatasetMetaFromRecords(records);
    }

    throw new Error(`Unsupported import format: ${extension}`);
  },

  async startImport(filePath: string, mapping?: ImportMapping): Promise<FeatureRecord[]> {
    const normalizedPath = ensureAbsolutePath(filePath);
    const extension = getFileExtension(normalizedPath);

    if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(extension)) {
      try {
        const result = await invoke<FeatureRecord[]>('start_import_task', {
          path: normalizedPath,
          mapping: mapping || null
        });
        if (!Array.isArray(result) || result.length === 0) {
          throw new Error('Import did not return any valid feature records.');
        }
        return result;
      } catch (error) {
        console.error('Failed to start import task via Tauri:', error);
        throw error;
      }
    }

    if (['kml', 'kmz'].includes(extension)) {
      return await parseKmlRecords(normalizedPath);
    }

    throw new Error(`Unsupported import format: ${extension}`);
  }
};

export const applyImportedRecords = async (records: FeatureRecord[], preferredGroupId?: string): Promise<number> => {
  if (!records.length) {
    throw new Error('There are no imported records to apply.');
  }

  const { useDesignSync } = await import('@IMPLEMENT/stores/useDesignSync');
  const store = useDesignSync.getState();
  const targetGroupId = preferredGroupId || store.selectedGroupId;
  if (!targetGroupId) {
    throw new Error('Vui long chon mot nhom dich truoc khi import du lieu.');
  }

  const targetGroup = store.state?.feature_groups?.[targetGroupId];
  if (!targetGroup?.layer_id) {
    throw new Error('Nhom dich khong hop le hoac chua co layer de chua du lieu import.');
  }

  const events = buildFeatureCreatedEvents(records, targetGroupId, targetGroup.layer_id);
  if (records.some((record) => record.source_format === 'kml' || record.source_format === 'kmz')) {
    console.info('[Import] Applying KML/KMZ records', {
      count: records.length,
      groupId: targetGroupId,
      layerId: targetGroup.layer_id,
      firstId: records[0]?.id,
    });
  }
  await store.dispatchEvents(events);
  store.setSelectedGroup(targetGroupId);
  if (records[0]) {
    store.zoomTo(records[0].id, 'location', [records[0].center_lat, records[0].center_lon]);
  }
  return events.length;
};

export const importFromExcel = async (filePath: string, mapping?: ImportMapping) => {
  return await importService.startImport(filePath, mapping);
};

export const importFromKML = async (filePath: string) => {
  return await importService.startImport(filePath);
};

export const getExcelHeaders = async (filePath: string): Promise<string[]> => {
  const meta = await importService.analyzeFile(filePath);
  return meta.fields.map((f) => f.name);
};
