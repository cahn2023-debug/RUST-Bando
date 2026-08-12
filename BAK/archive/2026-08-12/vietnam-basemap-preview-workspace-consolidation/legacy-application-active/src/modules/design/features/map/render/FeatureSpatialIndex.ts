export type SpatialBBox = [number, number, number, number];

export interface SpatialEntry<T = string> {
    id: T;
    bbox: SpatialBBox;
}

const intersects = (a: SpatialBBox, b: SpatialBBox): boolean => (
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
);

export class FeatureSpatialIndex<T = string> {
    private entries = new Map<T, SpatialBBox>();

    upsert(entry: SpatialEntry<T>): void {
        this.entries.set(entry.id, entry.bbox);
    }

    remove(id: T): void {
        this.entries.delete(id);
    }

    clear(): void {
        this.entries.clear();
    }

    query(bbox: SpatialBBox): Array<SpatialEntry<T>> {
        const matches: Array<SpatialEntry<T>> = [];
        this.entries.forEach((entryBbox, id) => {
            if (intersects(entryBbox, bbox)) matches.push({ id, bbox: entryBbox });
        });
        return matches;
    }

    queryPoint(x: number, y: number, tolerance = 0): Array<SpatialEntry<T>> {
        return this.query([x - tolerance, y - tolerance, x + tolerance, y + tolerance]);
    }
}

