import { getPreviewExtent, type PreviewExtent } from './extent';

export interface PreviewExtentPayload {
    objectId: string;
    geometry: unknown;
    format?: string;
    source?: 'http' | 'ipc' | 'file' | string;
}

export interface NormalizedExtentPayload extends PreviewExtentPayload {
    extent: PreviewExtent;
    receivedAt: number;
}

export function normalizeExtentPayload(value: unknown, source?: string): NormalizedExtentPayload {
    if (!isRecord(value)) throw new Error('Payload extent phải là object');
    const objectId = typeof value.objectId === 'string' && value.objectId.trim()
        ? value.objectId.trim()
        : typeof value.id === 'string' && value.id.trim()
            ? value.id.trim()
            : '';
    const geometry = value.geometry ?? value.data ?? value.feature ?? value;
    const extent = getPreviewExtent(geometry);
    if (!objectId) throw new Error('Payload extent thiếu objectId');
    if (!extent) throw new Error(`Đối tượng ${objectId} không có geometry/extent hợp lệ`);
    return {
        objectId,
        geometry,
        format: typeof value.format === 'string' ? value.format : undefined,
        source: source ?? (typeof value.source === 'string' ? value.source : undefined),
        extent,
        receivedAt: Date.now(),
    };
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}
