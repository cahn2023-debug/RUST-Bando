import type { FeatureState } from '@CONTRACT/types';
import type { FeatureChangeSet, FeatureStateChange, RenderFeatureRecord } from './overlayTypes';
import { emptyFeatureChangeSet } from './overlayTypes';

const geometrySignature = (feature: FeatureState): string => {
    try {
        return JSON.stringify({
            type: feature.geometry_type || feature.geom_type,
            coordinates: feature.coordinates,
            bbox: feature.bbox || null,
        });
    } catch {
        return `${feature.geom_type}:${feature.id}`;
    }
};

const styleSignature = (feature: FeatureState): string => {
    try {
        return JSON.stringify({
            metadata: feature.metadata,
            properties: feature.properties,
            visible: feature.is_visible,
            groupId: feature.group_id,
            layerId: feature.layer_id,
        });
    } catch {
        return `${feature.id}:${feature.is_visible ?? ''}`;
    }
};

const geometryTypeOf = (feature: FeatureState): RenderFeatureRecord['geometryType'] => {
    const type = String(feature.geometry_type || feature.geom_type || '').toLowerCase();
    if (type.includes('line')) return 'line';
    if (type.includes('polygon')) return 'polygon';
    return 'point';
};

export class FeatureRenderStore {
    private records = new Map<string, RenderFeatureRecord>();
    private geometryVersions = new Map<string, number>();
    private geometrySignatures = new Map<string, string>();
    private styleSignatures = new Map<string, string>();
    private numericIds = new Map<string, number>();
    private stateFlags = new Map<string, FeatureStateChange>();
    private nextId = 1;

    applySnapshot(features: FeatureState[]): FeatureChangeSet {
        const changes = emptyFeatureChangeSet();
        const nextIds = new Set(features.map(feature => feature.id));

        for (const sourceId of this.records.keys()) {
            if (nextIds.has(sourceId)) continue;
            this.records.delete(sourceId);
            this.geometryVersions.delete(sourceId);
            this.geometrySignatures.delete(sourceId);
            this.styleSignatures.delete(sourceId);
            this.stateFlags.delete(sourceId);
            changes.deletedIds.push(sourceId);
        }

        for (const feature of features) {
            const geometryKey = geometrySignature(feature);
            const styleKey = styleSignature(feature);
            const existing = this.records.get(feature.id);

            if (!existing) {
                const numericId = this.numericIds.get(feature.id) ?? this.nextId++;
                this.numericIds.set(feature.id, numericId);
                this.geometryVersions.set(feature.id, 1);
                this.records.set(feature.id, {
                    id: numericId,
                    sourceId: feature.id,
                    geometryVersion: 1,
                    styleBucketId: 0,
                    geometryType: geometryTypeOf(feature),
                    domain: 'design',
                    bbox: this.bboxFor(feature),
                    gpuAllocation: null,
                });
                this.geometrySignatures.set(feature.id, geometryKey);
                this.styleSignatures.set(feature.id, styleKey);
                changes.added.push(feature);
                continue;
            }

            if (this.geometrySignatures.get(feature.id) !== geometryKey) {
                const nextVersion = (this.geometryVersions.get(feature.id) || existing.geometryVersion) + 1;
                this.geometryVersions.set(feature.id, nextVersion);
                existing.geometryVersion = nextVersion;
                existing.geometryType = geometryTypeOf(feature);
                existing.bbox = this.bboxFor(feature);
                this.geometrySignatures.set(feature.id, geometryKey);
                changes.updatedGeometry.push(feature);
            }

            if (this.styleSignatures.get(feature.id) !== styleKey) {
                existing.styleBucketId += 1;
                this.styleSignatures.set(feature.id, styleKey);
                changes.updatedStyle.push({ id: feature.id, styleBucketId: existing.styleBucketId });
            }
        }

        return changes;
    }

    updateState(nextState: FeatureStateChange[]): FeatureChangeSet {
        const changes = emptyFeatureChangeSet();
        for (const state of nextState) {
            const previous = this.stateFlags.get(state.id);
            const same = previous && JSON.stringify(previous) === JSON.stringify(state);
            if (same) continue;
            this.stateFlags.set(state.id, state);
            changes.updatedState.push(state);
        }
        return changes;
    }

    getRecord(sourceId: string): RenderFeatureRecord | undefined {
        return this.records.get(sourceId);
    }

    getRecords(): RenderFeatureRecord[] {
        return Array.from(this.records.values());
    }

    restoreAfterContextLoss(): RenderFeatureRecord[] {
        this.records.forEach(record => {
            record.gpuAllocation = null;
        });
        return this.getRecords();
    }

    private bboxFor(feature: FeatureState): [number, number, number, number] {
        if (feature.bbox) return [feature.bbox.min_x, feature.bbox.min_y, feature.bbox.max_x, feature.bbox.max_y];
        return [0, 0, 0, 0];
    }
}

