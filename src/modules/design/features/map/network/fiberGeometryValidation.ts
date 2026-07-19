import type { FeatureState, FiberValidationDiagnostic, FiberInventory, PointCoordinates, LineStringCoordinates } from '@CONTRACT/types';

const coordinateKey = (point: PointCoordinates): string => `${point[0].toFixed(7)},${point[1].toFixed(7)}`;

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

const parseMetadata = (metadata: FeatureState['metadata'] | undefined): Record<string, any> => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata || '{}');
    } catch {
      return {};
    }
  }
  return { ...metadata };
};

export const validateFiberGeometry = (
  _projectId: string,
  inventory: FiberInventory | null,
  featuresById: Record<string, FeatureState>
): FiberValidationDiagnostic[] => {
  const diagnostics: FiberValidationDiagnostic[] = [];
  const features = Object.values(featuresById);
  const cables = inventory?.cables || [];
  const cablePoints = inventory?.cable_points || [];

  const coordinateUsage = new Map<string, { point: PointCoordinates; featureIds: Set<string>; isEnclosure: boolean }>();

  // Collect all enclosures
  features.forEach(feature => {
    const metadata = parseMetadata(feature.metadata);
    if (metadata.fiber?.kind === 'splice_enclosure' && isPoint(feature.coordinates)) {
      const key = metadata.fiber.coordinate_key || coordinateKey(feature.coordinates);
      const usage = coordinateUsage.get(key) || { point: feature.coordinates, featureIds: new Set<string>(), isEnclosure: false };
      usage.isEnclosure = true;
      coordinateUsage.set(key, usage);
    }
  });

  features.forEach(feature => {
    if (!isPolylineFeature(feature)) return;
    
    const metadata = parseMetadata(feature.metadata);
    const isSignalLine = metadata.infrastructure?.type === 'SignalLine';
    
    if (isSignalLine) {
      const hasFromEndpoint = !!metadata.network?.from_endpoint;
      const hasToEndpoint = !!metadata.network?.to_endpoint;
      
      if (!hasFromEndpoint || !hasToEndpoint) {
        diagnostics.push({
          type: 'missing-polyline-endpoint',
          message: 'Tuyến truyền dẫn chưa snap endpoint đầu hoặc cuối',
          feature_id: feature.id,
        } as any); // cast as any in case designTypes.ts is not perfectly matched
      }
    }

    const coords = getLineCoordinates(feature);
    if (coords) {
      coords.forEach(point => {
        const key = coordinateKey(point);
        const usage = coordinateUsage.get(key) || { point, featureIds: new Set<string>(), isEnclosure: false };
        usage.featureIds.add(feature.id);
        coordinateUsage.set(key, usage);
      });
    }
  });

  // Check branch intersections without enclosures
  for (const [key, usage] of coordinateUsage.entries()) {
    if (usage.featureIds.size > 1 && !usage.isEnclosure) {
      diagnostics.push({
        type: 'missing-branch-enclosure',
        message: `Phát hiện ${usage.featureIds.size} tuyến giao nhau nhưng chưa có măng xông tại tọa độ ${key}`,
      } as any);
    }
  }

  // Check enclosure location matching
  cablePoints.forEach(cp => {
    if (cp.point_kind === 'splice_enclosure') {
      const enclosureFeature = featuresById[cp.feature_id];
      const cableFeature = featuresById[cables.find(c => c.id === cp.cable_id)?.feature_id || ''];
      
      if (enclosureFeature && cableFeature && isPoint(enclosureFeature.coordinates) && getLineCoordinates(cableFeature)) {
        const enclosureKey = coordinateKey(enclosureFeature.coordinates);
        const cableCoords = getLineCoordinates(cableFeature)!;
        const isOnLine = cableCoords.some(pt => coordinateKey(pt) === enclosureKey);
        
        if (!isOnLine) {
          diagnostics.push({
            type: 'invalid-enclosure-location',
            message: `Măng xông không nằm trên tọa độ tuyến cáp`,
            feature_id: enclosureFeature.id,
            cable_id: cp.cable_id,
          } as any);
        }
      }
    }
  });

  return diagnostics;
};
