export type AnalysisScalarValue = string | number | boolean;

type AnalysisFeatureLike = {
  properties?: Record<string, unknown> | null;
  metadata?: unknown;
};

export const ANALYSIS_CORE_COLUMN_ORDER = [
  'index_stt',
  'display_order',
  'name',
  'geom_type',
  'group',
  'layer',
  'region',
  'status',
  'note',
] as const;

const CORE_COLUMN_SET = new Set<string>(ANALYSIS_CORE_COLUMN_ORDER);

const BLOCKED_DYNAMIC_FIELDS = new Set([
  'id',
  'index_stt',
  'display_order',
  'name',
  'type',
  'group',
  'region',
  'layer',
  'geom_type',
  'technical_geom',
  'latitude',
  'longitude',
  'coordinates',
  'coordinates_summary',
  'is_visible',
  'length',
  'area',
  'icon',
  'color',
  'size',
  'media',
  'business',
  'ai',
  'vertexmetadata',
  'technical_specs',
  'properties',
  'specs',
  'gis',
  'source_properties',
  'sourceproperties',
  'imported_from',
  'imported_tile_id',
  'metadata',
  'description',
  'stt',
  'notes',
]);

const BLOCKED_DYNAMIC_PREFIXES = [
  'gis_',
  'source_',
  'imported_',
  '__',
];

export const isAnalysisScalarValue = (value: unknown): value is AnalysisScalarValue => (
  ['string', 'number', 'boolean'].includes(typeof value)
);

const parseMetadata = (metadata: unknown): Record<string, unknown> => {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata as Record<string, unknown>;
  if (typeof metadata !== 'string') return {};

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const normalizeAnalysisColumnKey = (label: string) => (
  label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
);

export const isAllowedAnalysisDynamicColumnKey = (key: string) => {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (CORE_COLUMN_SET.has(normalized)) return false;
  if (BLOCKED_DYNAMIC_FIELDS.has(normalized)) return false;
  return !BLOCKED_DYNAMIC_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const getAnalysisUserColumnKeys = (
  features: AnalysisFeatureLike[],
  manualKeys: string[] = [],
) => {
  const keys = new Set<string>();

  const addKey = (key: string, value: unknown) => {
    if (!isAllowedAnalysisDynamicColumnKey(key)) return;
    if (value == null) return;
    if (isAnalysisScalarValue(value)) keys.add(key);
  };

  features.forEach((feature) => {
    Object.entries(feature.properties || {}).forEach(([key, value]) => {
      addKey(key, value);
    });

    const metadata = parseMetadata(feature.metadata);
    Object.entries(metadata).forEach(([key, value]) => {
      addKey(key, value);
    });
  });

  manualKeys.forEach((key) => {
    if (isAllowedAnalysisDynamicColumnKey(key)) keys.add(key);
  });

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
};

export const buildAnalysisExportRows = (
  rows: Record<string, unknown>[],
  columnKeys: string[],
  getColumnLabel: (key: string) => string,
) => rows.map((row) => (
  columnKeys.reduce<Record<string, unknown>>((acc, key) => {
    acc[getColumnLabel(key)] = row[key] ?? '';
    return acc;
  }, {})
));
