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
  gis?: Record<string, any>;
  infrastructure?: Record<string, any>;
  network?: Record<string, any>;
  fiber?: FiberPointMetadata & Record<string, any>;
  [key: string]: any;
}

export interface FiberPolylineMaterializationOptions {
  createId?: () => string;
  targetFeatureIds?: string[];
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

const toFiniteNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const getLineStyleMetadata = (metadata: ParsedMetadata): Record<string, any> => {
  const gis = metadata.gis && typeof metadata.gis === 'object' ? { ...metadata.gis } : {};
  const width = toFiniteNumber(gis.size ?? gis.weight ?? gis.stroke ?? metadata.size ?? metadata.weight ?? metadata.stroke) ?? 6;
  return {
    ...gis,
    color: gis.color || metadata.color || '#0088ff',
    size: width,
    weight: width,
    stroke: width,
  };
};

const isReusableFiberPoint = (
  feature: FeatureState,
  reusableFeatureIds: Set<string>,
  pointKind?: FiberCablePointKind
): boolean => {
  if (!isPoint(feature.coordinates)) return false;
  if (reusableFeatureIds.has(feature.id)) return true;

  const metadata = parseMetadata(feature.metadata);
  const fiber = metadata.fiber;
  if (!fiber) return false;
  if (pointKind && fiber.point_kind !== pointKind) return false;

  return fiber.kind === 'cable_endpoint'
    || fiber.kind === 'splice_enclosure'
    || fiber.point_kind === 'cable_start'
    || fiber.point_kind === 'cable_end'
    || fiber.point_kind === 'splice_enclosure';
};

const cloneMetadataWithFiberCable = (
  feature: FeatureState,
  startFeatureId: string | null,
  endFeatureId: string | null,
  existingCable?: FiberCable
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
  const cableType = existingCable?.cable_type ?? infrastructure.cable_type;
  const fiberCount = existingCable?.fiber_count ?? infrastructure.core_count;
  const owner = existingCable?.owner ?? infrastructure.owner;
  const status = existingCable?.status ?? infrastructure.status;
  const gis = getLineStyleMetadata(metadata);

  return {
    ...metadata,
    color: gis.color,
    size: gis.size,
    weight: gis.weight,
    stroke: gis.stroke,
    gis,
    infrastructure: {
      ...infrastructure,
      type: 'SignalLine',
      ...(cableType ? { cable_type: cableType } : {}),
      ...(typeof fiberCount === 'number' ? { core_count: fiberCount } : {}),
      ...(owner ? { owner } : {}),
      ...(status ? { status } : {}),
    },
    network: {
      ...network,
      ...(startFeatureId && !network.from_feature_id ? { from_feature_id: startFeatureId } : {}),
      ...(endFeatureId && !network.to_feature_id ? { to_feature_id: endFeatureId } : {}),
      ...(startFeatureId && !network.from_endpoint ? { from_endpoint: { type: 'feature', id: startFeatureId } } : {}),
      ...(endFeatureId && !network.to_endpoint ? { to_endpoint: { type: 'feature', id: endFeatureId } } : {}),
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
  reusableFeatureIds: Set<string>,
  coordinate?: PointCoordinates
): FeatureState | undefined => {
  const key = coordinate ? coordinateKey(coordinate) : null;
  return features.find(feature => {
    const metadata = parseMetadata(feature.metadata);
    const fiber = metadata.fiber;
    if (fiber && fiber.cable_id === cableId && fiber.point_kind === pointKind) return true;
    return Boolean(
      key
      && isReusableFiberPoint(feature, reusableFeatureIds, pointKind)
      && isPoint(feature.coordinates)
      && coordinateKey(feature.coordinates) === key
    );
  });
};

const findExistingEnclosure = (
  features: FeatureState[],
  reusableFeatureIds: Set<string>,
  coordinate: PointCoordinates
): FeatureState | undefined => {
  const key = coordinateKey(coordinate);
  return features.find(feature => {
    return isReusableFiberPoint(feature, reusableFeatureIds, 'splice_enclosure')
      && isPoint(feature.coordinates)
      && coordinateKey(feature.coordinates) === key;
  });
};

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
  const cableType = metadata.infrastructure?.cable_type;
  return typeof cableType === 'string' && cableType.trim() ? cableType.trim() : null;
};

const getCableOwner = (feature: FeatureState, existingCable?: FiberCable): string | null => {
  if (existingCable?.owner) return existingCable.owner;
  const metadata = parseMetadata(feature.metadata);
  const owner = metadata.infrastructure?.owner;
  return typeof owner === 'string' && owner.trim() ? owner.trim() : null;
};

const getCableStatus = (feature: FeatureState, existingCable?: FiberCable): FiberCable['status'] => {
  if (existingCable?.status) return existingCable.status;
  const metadata = parseMetadata(feature.metadata);
  const status = metadata.infrastructure?.status;
  if (status === 'planned' || status === 'active' || status === 'retired' || status === 'damaged') return status;
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
  const reusableFeatureIds = new Set<string>([
    ...(inventory?.cable_points || []).map(point => point.feature_id),
    ...(inventory?.equipment || []).map(equipment => equipment.feature_id),
  ]);
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

  features.forEach(feature => {
    if (!isPolylineFeature(feature) && isReusableFiberPoint(feature, reusableFeatureIds) && isPoint(feature.coordinates)) {
      branchKeys.add(coordinateKey(feature.coordinates));
    }
  });

  const events: DesignEventType[] = [];
  const emittedEquipmentIds = new Set<string>();
  const countedEnclosureIds = new Set<string>();
  let pointCount = 0;
  let enclosureCount = 0;

  const pushEquipmentEvent = (featureId: string, equipmentType: FiberCablePointKind) => {
    const eventKey = `${featureId}:${equipmentType}`;
    if (emittedEquipmentIds.has(eventKey)) return;
    emittedEquipmentIds.add(eventKey);
    events.push({
      type: 'EquipmentUpserted',
      payload: {
        id: featureId,
        project_id: projectId,
        feature_id: featureId,
        equipment_type: equipmentType,
        status: 'active',
      },
    });
  };

  const targetCandidates = options.targetFeatureIds
    ? candidates.filter(c => options.targetFeatureIds!.includes(c.feature.id))
    : candidates;

  let cablesToMaterialize = new Set(options.targetFeatureIds);
  if (options.targetFeatureIds) {
    targetCandidates.forEach(candidate => {
      candidate.coordinates.forEach(point => {
        const key = coordinateKey(point);
        if (branchKeys.has(key)) {
          const usage = coordinateUsage.get(key);
          if (usage) {
            usage.cableIds.forEach(id => cablesToMaterialize.add(id));
          }
        }
      });
    });
  }

  const finalCandidates = options.targetFeatureIds
    ? candidates.filter(c => cablesToMaterialize.has(c.feature.id))
    : candidates;

  finalCandidates.forEach(candidate => {
    const { feature, coordinates } = candidate;
    const cableId = existingCablesByFeature.get(feature.id)?.id || feature.id;
    const existingCable = existingCablesByFeature.get(feature.id);
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const startPoint = findExistingCablePoint(features, cableId, 'cable_start', reusableFeatureIds, first);
    const endPoint = findExistingCablePoint(features, cableId, 'cable_end', reusableFeatureIds, last);
    const startFeatureId = startPoint?.id || null;
    const endFeatureId = endPoint?.id || null;
    const cablePoints: CablePointInput[] = [];

    if (startFeatureId) {
      cablePoints.push(buildCablePoint(createId, startFeatureId, 'cable_start', 0, 0));
      pushEquipmentEvent(startFeatureId, 'cable_start');
    }

    if (endFeatureId) {
      cablePoints.push(buildCablePoint(createId, endFeatureId, 'cable_end', coordinates.length - 1, coordinates.length - 1));
      pushEquipmentEvent(endFeatureId, 'cable_end');
    }

    coordinates.forEach((point, vertexIndex) => {
      const key = coordinateKey(point);
      if (!branchKeys.has(key)) return;
      const existingEnclosure = findExistingEnclosure(features, reusableFeatureIds, point);
      if (!existingEnclosure) return;
      cablePoints.push(buildCablePoint(createId, existingEnclosure.id, 'splice_enclosure', vertexIndex, vertexIndex));
      pushEquipmentEvent(existingEnclosure.id, 'splice_enclosure');
      if (!countedEnclosureIds.has(existingEnclosure.id)) {
        countedEnclosureIds.add(existingEnclosure.id);
        enclosureCount += 1;
        pointCount += 1;
      }
    });

    events.push({
      type: 'FeatureUpdated',
      payload: {
        id: feature.id,
        metadata: JSON.stringify(cloneMetadataWithFiberCable(feature, startFeatureId, endFeatureId, existingCable)),
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
        owner: getCableOwner(feature, existingCable),
        status: getCableStatus(feature, existingCable),
        source: existingCable?.source || 'legacy',
      },
    });

    if (cablePoints.length > 0) {
      events.push({
        type: 'FiberCablePointsMaterialized',
        payload: {
          id: createId(),
          project_id: projectId,
          cable_id: cableId,
          points: cablePoints,
        },
      });
    }
  });

  return {
    events,
    cableCount: finalCandidates.length,
    pointCount,
    enclosureCount,
  };
};
