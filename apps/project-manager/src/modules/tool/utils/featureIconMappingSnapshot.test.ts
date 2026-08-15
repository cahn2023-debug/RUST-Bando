import { describe, expect, it, vi } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { fileApi } from '@/contracts/tauri-api';
import { buildIconMappingMigrationPlan, buildIconMappingSnapshot } from './featureIconMappingMigration';
import {
  getIconMappingSnapshotPath,
  persistIconMappingSnapshot,
  restoreIconMappingSnapshot,
} from './featureIconMappingSnapshot';

vi.mock('@/contracts/tauri-api', () => ({
  fileApi: {
    saveBinary: vi.fn(),
    readBinary: vi.fn(),
  },
}));

const makeFeature = (id: string): FeatureState => ({
  id,
  layer_id: 'layer-1',
  group_id: null,
  name: id,
  geom_type: 'Point',
  metadata: { icon: 'camera' },
  properties: {},
  coordinates: [105, 21],
});

describe('feature icon mapping snapshots', () => {
  it('does not write a BAK file for a no-op migration', async () => {
    const plan = buildIconMappingMigrationPlan([
      {
        ...makeFeature('stable'),
        metadata: { icon: 'cctv', type: 'cctv', objectType: 'cctv' },
        properties: { icon: 'cctv', iconKey: 'cctv', type: 'cctv', objectType: 'cctv' },
      },
    ]);

    await expect(persistIconMappingSnapshot('project-1', 'D:/projects/design.pmp', plan, '2026-08-15T10:00:00.000Z')).resolves.toBeNull();
    expect(fileApi.saveBinary).not.toHaveBeenCalled();
  });

  it('writes only affected records to a versioned BAK path', async () => {
    const plan = buildIconMappingMigrationPlan([makeFeature('affected')]);
    const result = await persistIconMappingSnapshot('project-1', 'D:/projects/design.pmp', plan, '2026-08-15T10:00:00.000Z');

    expect(result?.path).toBe('D:/projects/BAK/design-icon-type-mapping/project-1/migration-v1-2026-08-15T10-00-00-000Z.json');
    expect(fileApi.saveBinary).toHaveBeenCalledTimes(1);
    const [, data] = vi.mocked(fileApi.saveBinary).mock.calls[0];
    const snapshot = JSON.parse(new TextDecoder().decode(new Uint8Array(data as Uint8Array)));
    expect(snapshot.records.map((record: { id: string }) => record.id)).toEqual(['affected']);
  });

  it('restores the pre-migration mapping through FeatureUpdated events', async () => {
    const feature = makeFeature('affected');
    const snapshot = buildIconMappingSnapshot('project-1', [{
      feature,
      metadata: { icon: 'cctv', type: 'cctv', objectType: 'cctv' },
      properties: { icon: 'cctv', iconKey: 'cctv', type: 'cctv', objectType: 'cctv' },
    }], '2026-08-15T10:00:00.000Z');
    vi.mocked(fileApi.readBinary).mockResolvedValueOnce(Array.from(new TextEncoder().encode(JSON.stringify(snapshot))));
    const dispatchEvents = vi.fn().mockResolvedValue(undefined);

    await expect(restoreIconMappingSnapshot('project-1', 'D:/projects/BAK/migration.json', dispatchEvents)).resolves.toBe(1);
    expect(dispatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'FeatureUpdated',
        payload: expect.objectContaining({ id: 'affected', metadata: JSON.stringify(feature.metadata) }),
      }),
    ]);
  });

  it('rejects a snapshot from another project before dispatching events', async () => {
    const feature = makeFeature('affected');
    const snapshot = buildIconMappingSnapshot('project-1', [{
      feature,
      metadata: { icon: 'cctv', type: 'cctv', objectType: 'cctv' },
      properties: { icon: 'cctv', iconKey: 'cctv', type: 'cctv', objectType: 'cctv' },
    }], '2026-08-15T10:00:00.000Z');
    vi.mocked(fileApi.readBinary).mockResolvedValueOnce(Array.from(new TextEncoder().encode(JSON.stringify(snapshot))));
    const dispatchEvents = vi.fn().mockResolvedValue(undefined);

    await expect(restoreIconMappingSnapshot('other-project', 'D:/projects/BAK/migration.json', dispatchEvents)).rejects.toThrow();
    expect(dispatchEvents).not.toHaveBeenCalled();
  });

  it('derives a stable project-local BAK path', () => {
    expect(getIconMappingSnapshotPath('D:\\projects\\design.pmp', 'project/1', '2026-08-15T10:00:00.000Z'))
      .toBe('D:\\projects/BAK/design-icon-type-mapping/project_1/migration-v1-2026-08-15T10-00-00-000Z.json');
  });
});
