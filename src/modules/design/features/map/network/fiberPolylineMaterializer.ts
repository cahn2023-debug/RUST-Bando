import type {
  DesignEventType,
  FeatureState,
  FiberCable,
  FiberCablePointKind,
  FiberInventory,
  LineStringCoordinates,
  PointCoordinates,
} from '@CONTRACT/types';

interface FiberPointMetadata {
  kind?: string;
  point_kind?: FiberCablePointKind;
  cable_id?: string;
  sequence_no?: number;
  coordinate_key?: string;
}

interface ParsedMetadata {
  infrastructure?: Record<string, any>;
  network?: Record<string, any>;
  fiber?: FiberPointMetadata & Record<string, any>;
  [key: string]: any;
}

export interface FiberPolylineMaterializationOptions {
  createId?: () => string;
}

export interface FiberPolylineMaterializationResult {
  events: DesignEventType[];
  cableCount: number;
  pointCount: number;
  enclosureCount: number;
}

interface LineCandidate {
  feature: FeatureState;
  coordinates: LineStringCoordinates;
}

interface CablePointInput {
  id: string;
  feature_id: string;
  point_kind: FiberCablePointKind;
  sequence_no: number;
  vertex_index: number | null;
}

const DEFAULT_POINT_COLOR = '#22d3ee';
const DEFAULT_ENCLOSURE_COLOR = '#f59e0b';

const newId = () => crypto.randomUUID();

const parseMetadata = (metadata: FeatureState['metadata'] | undefined): ParsedMetadata => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata || '{}') as ParsedMetadata;
    } catch {
      return {};
    }
  }
  return { ...(metadata as ParsedMetadata) };
};

const isPoint = (value: unknown): value is PointCoordinates =>
  Array.isArray(value)
  && value.length >= 2
  && typeof value[0] === 'number'
  && typeof value[1] === 'number';

const getLineCoordinates = (feature: FeatureState): LineStringCoordinates | null => {
  if (!Array.isArray(feature.coordinates) || feature.coordinates.length < 2) return null;
  if (!isPoint(feature.coordinates[0])) return null;
  return feature.coordinates as LineStringCoordinates;
};

const isPolylineFeature = (feature: FeatureState): boolean => {
  const geomType = `${feature.geom_type || feature.geometry_type || ''}`.toLowerCase();
  return geomType.includes('line') || geomType.includes('polyline') || geomType === 'networklink';
};

const coordinateKey = (point: PointCoordinates): string => `${point[0].toFixed(7)},${point[1].toFixed(7)}`;

const cloneMetadataWithFiberCable = (
  feature: FeatureState,
  startFeatureId: string,
  endFeatureId: string
): ParsedMetadata => {
  const metadata = parseMetadata(feature.metadata);
  const infrastructure = metadata.infrastructure && typeof metadata.infrastructure === 'object'
    ? { ...metadata.infrastructure }
    : {};
  const network = metadata.network && typeof metadata.network === 'object'
    ? { ...metadata.network }
    : {};
  const fiber = metadata.fiber && typeof metadata.fiber === 'object'
    ? { ...metadata.fiber }
    : {};

  return {
    ...metadata,
    infrastructure: {
      ...infrastructure,
      type: 'SignalLine',
    },
    network: {
      ...network,
      from_feature_id: network.from_feature_id || startFeatureId,
      to_feature_id: network.to_feature_id || endFeatureId,
      from_endpoint: network.from_endpoint || { type: 'feature', id: startFeatureId },
      to_endpoint: network.to_endpoint || { type: 'feature', id: endFeatureId },
      direction_mode: network.direction_mode || 'auto',
    },
    fiber: {
      ...fiber,
      role: 'cable',
    },
  };
};

const findExistingCablePoint = (
  features: FeatureState[],
  cableId: string,
  pointKind: FiberCablePointKind,
  coordinate?: PointCoordinates
): FeatureState | undefined => {
  const key = coordinate ? coordinateKey(coordinate) : null;
  return features.find(feature => {
    const metadata = parseMetadata(feature.metadata);
    const fiber = metadata.fiber;
    if (!fiber || fiber.cable_id !== cableId || fiber.point_kind !== pointKind) return false;
    if (!key) return true;
    return fiber.coordinate_key === key || (isPoint(feature.coordinates) && coordinateKey(feature.coordinates) === key);
  });
};

const findExistingEnclosure = (
  features: FeatureState[],
  coordinate: PointCoordinates
): FeatureState | undefined => {
  const key = coordinateKey(coordinate);
  return features.find(feature => {
    const metadata = parseMetadata(feature.metadata);
    const fiber = metadata.fiber;
    return fiber?.kind === 'splice_enclosure'
      && (fiber.coordinate_key === key || (isPoint(feature.coordinates) && coordinateKey(feature.coordinates) === key));
  });
};

const buildPointFeatureEvent = (
  feature: FeatureState,
  pointFeatureId: string,
  name: string,
  coordinate: PointCoordinates,
  metadata: ParsedMetadata
): DesignEventType => ({
  type: 'FeatureCreated',
  payload: {
    id: pointFeatureId,
    layer_id: feature.layer_id,
    group_id: feature.group_id ?? null,
    name,
    geom_type: 'Point',
    metadata: JSON.stringify(metadata),
    coordinates: coordinate,
    properties: {},
  },
});

const buildPointMetadata = (
  cableId: string,
  pointKind: FiberCablePointKind,
  sequenceNo: number,
  coordinate: PointCoordinates
): ParsedMetadata => ({
  icon: 'default',
  color: pointKind === 'splice_enclosure' ? DEFAULT_ENCLOSURE_COLOR : DEFAULT_POINT_COLOR,
  type: pointKind,
  network: { role: 'device' },
  fiber: {
    kind: pointKind === 'splice_enclosure' ? 'splice_enclosure' : 'cable_endpoint',
    point_kind: pointKind,
    cable_id: cableId,
    sequence_no: sequenceNo,
    coordinate_key: coordinateKey(coordinate),
  },
});

const buildCablePoint = (
  createId: () => string,
  featureId: string,
  pointKind: FiberCablePointKind,
  sequenceNo: number,
  vertexIndex: number | null
): CablePointInput => ({
  id: createId(),
  feature_id: featureId,
  point_kind: pointKind,
  sequence_no: sequenceNo,
  vertex_index: vertexIndex,
});

const getFiberCount = (feature: FeatureState, existingCable?: FiberCable): number | null => {
  if (typeof existingCable?.fiber_count === 'number') return existingCable.fiber_count;
  const metadata = parseMetadata(feature.metadata);
  const coreCount = metadata.infrastructure?.core_count;
  return typeof coreCount === 'number' ? coreCount : null;
};

const getCableType = (feature: FeatureState, existingCable?: FiberCable): string | null => {
  if (existingCable?.cable_type) return existingCable.cable_type;
  const metadata = parseMetadata(feature.metadata);
  return metadata.infrastructure?.cable_type || metadata.infrastructure?.type || feature.geom_type || null;
};

const getCableStatus = (existingCable?: FiberCable): FiberCable['status'] => {
  if (existingCable?.status) return existingCable.status;
  return 'planned';
};

export const buildFiberPolylineMaterializationEvents = (
  projectId: string,
  featuresById: Record<string, FeatureState>,
  inventory: FiberInventory | null = null,
  options: FiberPolylineMaterializationOptions = {}
): FiberPolylineMaterializationResult => {
  const createId = options.createId || newId;
  const features = Object.values(featuresById);
  const candidates: LineCandidate[] = features
    .filter(isPolylineFeature)
    .map(feature => ({ feature, coordinates: getLineCoordinates(feature) }))
    .filter((item): item is LineCandidate => Boolean(item.coordinates));
  const existingCablesByFeature = new Map((inventory?.cables || []).map(cable => [cable.feature_id, cable]));
  const coordinateUsage = new Map<string, { point: PointCoordinates; cableIds: Set<string>; vertexRefs: Array<{ cableId: string; vertexIndex: number }> }>();

  candidates.forEach(candidate => {
    candidate.coordinates.forEach((point, vertexIndex) => {
      const key = coordinateKey(point);
      const usage = coordinateUsage.get(key) || { point, cableIds: new Set<string>(), vertexRefs: [] };
      usage.cableIds.add(candidate.feature.id);
      usage.vertexRefs.push({ cableId: candidate.feature.id, vertexIndex });
      coordinateUsage.set(key, usage);
    });
  });

  const branchKeys = new Set(
    [...coordinateUsage.entries()]
      .filter(([, usage]) => usage.cableIds.size > 1)
      .map(([key]) => key)
  );

  const events: DesignEventType[] = [];
  const createdFeatureIds = new Set<string>();
  let pointCount = 0;
  let enclosureCount = 0;

  candidates.forEach(candidate => {
    const { feature, coordinates } = candidate;
    const cableId = existingCablesByFeature.get(feature.id)?.id || feature.id;
    const existingCable = existingCablesByFeature.get(feature.id);
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const startPoint = findExistingCablePoint(features, cableId, 'cable_start', first);
    const endPoint = findExistingCablePoint(features, cableId, 'cable_end', last);
    const startFeatureId = startPoint?.id || createId();
    const endFeatureId = endPoint?.id || createId();
    const cablePoints: CablePointInput[] = [];

    if (!startPoint && !createdFeatureIds.has(startFeatureId)) {
      events.push(buildPointFeatureEvent(
        feature,
        startFeatureId,
        `Đầu cáp ${feature.name || feature.id}`,
        first,
        buildPointMetadata(cableId, 'cable_start', 0, first)
      ));
      createdFeatureIds.add(startFeatureId);
      pointCount += 1;
    }
    cablePoints.push(buildCablePoint(createId, startFeatureId, 'cable_start', 0, 0));

    if (!endPoint && !createdFeatureIds.has(endFeatureId)) {
      events.push(buildPointFeatureEvent(
        feature,
        endFeatureId,
        `Cuối cáp ${feature.name || feature.id}`,
        last,
        buildPointMetadata(cableId, 'cable_end', coordinates.length - 1, last)
      ));
      createdFeatureIds.add(endFeatureId);
      pointCount += 1;
    }
    cablePoints.push(buildCablePoint(createId, endFeatureId, 'cable_end', coordinates.length - 1, coordinates.length - 1));

    coordinates.forEach((point, vertexIndex) => {
      const key = coordinateKey(point);
      if (!branchKeys.has(key)) return;
      const existingEnclosure = findExistingEnclosure(features, point);
      const enclosureFeatureId = existingEnclosure?.id || createId();
      if (!existingEnclosure && !createdFeatureIds.has(enclosureFeatureId)) {
        events.push(buildPointFeatureEvent(
          feature,
          enclosureFeatureId,
          `Măng xông ${key}`,
          point,
          buildPointMetadata(cableId, 'splice_enclosure', vertexIndex, point)
        ));
        createdFeatureIds.add(enclosureFeatureId);
        enclosureCount += 1;
        pointCount += 1;
      }
      cablePoints.push(buildCablePoint(createId, enclosureFeatureId, 'splice_enclosure', vertexIndex, vertexIndex));
    });

    events.push({
      type: 'FeatureUpdated',
      payload: {
        id: feature.id,
        metadata: JSON.stringify(cloneMetadataWithFiberCable(feature, startFeatureId, endFeatureId)),
      },
    });

    events.push({
      type: 'FiberCableUpserted',
      payload: {
        id: cableId,
        project_id: projectId,
        feature_id: feature.id,
        cable_type: getCableType(feature, existingCable),
        fiber_count: getFiberCount(feature, existingCable),
        owner: null,
        status: getCableStatus(existingCable),
        source: existingCable?.source || 'legacy',
      },
    });

    events.push({
      type: 'FiberCablePointsMaterialized',
      payload: {
        id: createId(),
        project_id: projectId,
        cable_id: cableId,
        points: cablePoints,
      },
    });
  });

  return {
    events,
    cableCount: candidates.length,
    pointCount,
    enclosureCount,
  };
};
