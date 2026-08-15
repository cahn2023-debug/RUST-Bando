import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import {
  buildIconMappingMigrationPlan,
  buildIconMappingSnapshot,
  validateIconMappingSnapshot,
} from './featureIconMappingMigration';
import { getFeatureDisplayInfo } from './featureDisplay';

const feature = (id: string, geom_type: string, metadata: Record<string, unknown>, properties: Record<string, unknown> = {}): FeatureState => ({
  id,
  layer_id: 'layer-1',
  group_id: null,
  name: id,
  geom_type,
  metadata,
  properties: properties as FeatureState['properties'],
  coordinates: geom_type === 'Point' ? [105, 21] : [[105, 21], [105.1, 21.1]],
});

describe('feature icon mapping migration', () => {
  it('normalizes aliases and keeps one canonical type/objectType', () => {
    const plan = buildIconMappingMigrationPlan([
      feature('camera-1', 'Point', { icon: 'camera', type: 'point', objectType: 'point' }, { icon: 'camera', iconKey: 'camera', type: 'point' }),
    ]);

    expect(plan.affected).toHaveLength(1);
    expect(plan.affected[0].metadata.icon).toBe('cctv');
    expect(plan.affected[0].metadata.type).toBe('cctv');
    expect(plan.affected[0].metadata.objectType).toBe('cctv');
    expect(plan.affected[0].properties.iconKey).toBe('cctv');
  });

  it('does not snapshot an already canonical feature', () => {
    const plan = buildIconMappingMigrationPlan([
      feature('camera-1', 'Point', { icon: 'cctv', type: 'cctv', objectType: 'cctv' }, { icon: 'cctv', iconKey: 'cctv', type: 'cctv', objectType: 'cctv' }),
    ]);

    expect(plan.affected).toHaveLength(0);
    expect(plan.events).toHaveLength(0);
  });

  it('keeps geometry precedence for line and polygon', () => {
    const plan = buildIconMappingMigrationPlan([
      feature('line-1', 'LineString', { icon: 'cctv', type: 'cctv' }),
      feature('polygon-1', 'Polygon', { icon: 'ptz', type: 'ptz' }),
    ]);

    expect(plan.affected.map((record) => record.metadata.type)).toEqual(['line', 'polygon']);
    expect(plan.warnings).toHaveLength(0);
  });

  it('falls back unknown mappings without losing the original type label', () => {
    const plan = buildIconMappingMigrationPlan([
      feature('unknown-1', 'Point', { icon: 'future_sensor', type: 'legacy_sensor', objectType: 'legacy_sensor' }),
    ]);

    expect(plan.affected[0].metadata.icon).toBe('default');
    expect(plan.affected[0].metadata.type).toBe('legacy_sensor');
    expect(plan.affected[0].metadata.objectType).toBe('legacy_sensor');
    expect(plan.affected[0].metadata.mappingWarning).toContain('future_sensor');
    expect(plan.warnings).toHaveLength(1);
  });

  it('exposes the fallback icon, preserved type label and warning to display surfaces', () => {
    const source = feature('unknown-1', 'Point', { icon: 'future_sensor', type: 'legacy_sensor' });
    const plan = buildIconMappingMigrationPlan([source]);
    const migrated = plan.affected[0];
    const info = getFeatureDisplayInfo({ ...source, metadata: migrated.metadata, properties: migrated.properties });

    expect(info.iconKey).toBe('default');
    expect(info.label).toBe('legacy_sensor');
    expect(info.isUnmapped).toBe(true);
    expect(info.mappingWarning).toContain('future_sensor');
  });

  it('creates and validates an affected-only versioned snapshot', () => {
    const plan = buildIconMappingMigrationPlan([
      feature('affected', 'Point', { icon: 'camera' }),
      feature('stable', 'Point', { icon: 'cctv', type: 'cctv', objectType: 'cctv' }, { icon: 'cctv', iconKey: 'cctv', type: 'cctv', objectType: 'cctv' }),
    ]);
    const snapshot = buildIconMappingSnapshot('project-1', plan.affected, '2026-08-15T10:00:00.000Z');

    expect(snapshot.schema).toBe('design-icon-type-mapping');
    expect(snapshot.version).toBe(1);
    expect(snapshot.records.map((record) => record.id)).toEqual(['affected']);
    expect(validateIconMappingSnapshot(snapshot, 'project-1')).toEqual(snapshot);
    expect(() => validateIconMappingSnapshot(snapshot, 'other-project')).toThrow();
  });
});
