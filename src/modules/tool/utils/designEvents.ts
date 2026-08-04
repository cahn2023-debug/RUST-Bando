import { DesignEventType } from '@CONTRACT/designTypes';
import { designLogic } from './designLogic';

export const cloneDesignEvent = <T extends DesignEventType>(event: T): T =>
  JSON.parse(JSON.stringify(event)) as T;

export const normalizeIncomingEvent = (incomingEvent: DesignEventType): DesignEventType => {
  const event = cloneDesignEvent(incomingEvent);

  if (event.type === 'update_metadata') {
    const payload = event.payload;
    const featureId = 'feature_id' in payload ? payload.feature_id : payload.featureId;
    return {
      type: 'FeatureUpdated',
      payload: {
        id: featureId,
        metadata:
          typeof payload.metadata === 'string'
            ? payload.metadata
            : JSON.stringify(payload.metadata),
      },
    } as DesignEventType;
  }

  return event;
};

export const enrichEventBeforeDispatch = (incomingEvent: DesignEventType): any => {
  const event = normalizeIncomingEvent(incomingEvent);

  // Default mapping rules based on event type prefix
  let entityType = 'feature';
  if (event.type.startsWith('Region')) entityType = 'region';
  else if (event.type.startsWith('Layer')) entityType = 'layer';
  else if (event.type.startsWith('FeatureGroup')) entityType = 'group';
  else if (event.type.startsWith('Fiber')) entityType = 'fiber';

  const payload = { ...(event.payload as any) };

  // Extract entityId
  const entityId =
    payload.id ||
    (payload as any).feature_id ||
    (payload as any).featureId ||
    (payload as any).circuit_id ||
    (payload as any).circuitId ||
    (payload as any).layerId ||
    (payload as any).regionId ||
    '';

  // Specialized logic for metadata updates
  const metadata =
    typeof payload.metadata === 'string'
      ? JSON.parse(payload.metadata || '{}')
      : payload.metadata || {};
  const geomType = (payload.geom_type || '').toUpperCase();

  if (payload.coordinates && (geomType === 'LINESTRING' || geomType === 'POLYLINE')) {
    const coords =
      typeof payload.coordinates === 'string'
        ? JSON.parse(payload.coordinates)
        : payload.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      let totalLength = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        totalLength += designLogic.calculateDistance(coords[i], coords[i + 1]);
      }
      payload.metadata = JSON.stringify({
        ...metadata,
        lengthKm: totalLength,
      });
    }
  }

  // Return the format Rust expects: DesignEventPayload / EventEnvelope
  return {
    id:
      typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36),
    entityId: String(entityId),
    entityType,
    eventType: event.type,
    payload,
  };
};
