import { DesignEventType } from '@CONTRACT/designTypes';
import { designLogic } from "./designLogic";

export const cloneDesignEvent = <T extends DesignEventType>(event: T): T =>
    JSON.parse(JSON.stringify(event)) as T;

export const normalizeIncomingEvent = (incomingEvent: DesignEventType): DesignEventType => {
    const event = cloneDesignEvent(incomingEvent);

    if (event.type === 'update_metadata') {
        const payload = event.payload;
        return {
            type: 'FeatureUpdated',
            payload: {
                id: payload.featureId,
                metadata:
                    typeof payload.metadata === 'string'
                        ? payload.metadata
                        : JSON.stringify(payload.metadata)
            }
        } as DesignEventType;
    }

    return event;
};

export const enrichEventBeforeDispatch = (incomingEvent: DesignEventType): DesignEventType => {
    const event = normalizeIncomingEvent(incomingEvent);

    if (event.type !== 'FeatureUpdated' && event.type !== 'FeatureCreated') {
        return event;
    }

    const payload = { ...(event.payload as any) };
    const metadata =
        typeof payload.metadata === 'string'
            ? JSON.parse(payload.metadata || '{}')
            : (payload.metadata || {});
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
                lengthKm: totalLength
            });
        }
    }

    return {
        ...event,
        payload
    } as DesignEventType;
};
