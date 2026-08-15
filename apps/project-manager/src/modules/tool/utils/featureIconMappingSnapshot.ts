import { fileApi } from '@/contracts/tauri-api';
import type { DesignEventType, FeatureMetadata, FeatureProperties } from '@CONTRACT/types';
import { getParsedMetadata } from './featureMetadata';
import {
  buildFeatureMappingUpdateEvent,
  buildIconMappingSnapshot,
  type IconMappingMigrationPlan,
  type IconMappingSnapshot,
  validateIconMappingSnapshot,
} from './featureIconMappingMigration';

const sanitizePathPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const projectDirectory = (projectPath: string): string => {
  const normalized = projectPath.replace(/[\\/]+$/, '');
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  const fileName = normalized.slice(separator + 1);
  if (!/\.pmp$/i.test(fileName)) return normalized;
  return separator >= 0 ? normalized.slice(0, separator) : '.';
};

export const getIconMappingSnapshotPath = (
  projectPath: string,
  projectId: string,
  createdAt: string,
): string => {
  const timestamp = sanitizePathPart(createdAt.replace(/[:.]/g, '-'));
  return `${projectDirectory(projectPath)}/BAK/design-icon-type-mapping/${sanitizePathPart(projectId)}/migration-v1-${timestamp}.json`;
};

const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value, null, 2));

const decodeJson = (bytes: number[]): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
  } catch {
    throw new Error('Snapshot icon mapping không phải JSON hợp lệ.');
  }
};

export const persistIconMappingSnapshot = async (
  projectId: string,
  projectPath: string | undefined,
  plan: IconMappingMigrationPlan,
  createdAt = new Date().toISOString(),
): Promise<{ path: string; snapshot: IconMappingSnapshot } | null> => {
  if (plan.affected.length === 0) return null;
  if (!projectPath) {
    throw new Error('Không thể chuẩn hóa icon vì dự án chưa có đường dẫn để tạo snapshot BAK.');
  }

  const snapshot = buildIconMappingSnapshot(projectId, plan.affected, createdAt);
  const path = getIconMappingSnapshotPath(projectPath, projectId, createdAt);
  await fileApi.saveBinary(path, encodeJson(snapshot));
  return { path, snapshot };
};

const propertiesFromSnapshot = (feature: IconMappingSnapshot['records'][number]['feature']): FeatureProperties => {
  if (typeof feature.properties === 'string') {
    try {
      return JSON.parse(feature.properties) as FeatureProperties;
    } catch {
      return {};
    }
  }
  return (feature.properties || {}) as FeatureProperties;
};

export const readIconMappingSnapshot = async (
  projectId: string,
  snapshotPath: string,
): Promise<IconMappingSnapshot> => {
  const bytes = await fileApi.readBinary(snapshotPath);
  return validateIconMappingSnapshot(decodeJson(bytes), projectId);
};

export const restoreIconMappingSnapshot = async (
  projectId: string,
  snapshotPath: string,
  dispatchEvents: (events: DesignEventType[]) => Promise<void>,
): Promise<number> => {
  const snapshot = await readIconMappingSnapshot(projectId, snapshotPath);
  const events = snapshot.records.map(({ feature }) => buildFeatureMappingUpdateEvent({
    feature,
    metadata: getParsedMetadata(feature) as FeatureMetadata,
    properties: propertiesFromSnapshot(feature),
  }));
  if (events.length > 0) await dispatchEvents(events);
  return events.length;
};
