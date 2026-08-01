import type { MapLibreRenderFeature } from '../mapLibreFastTypes';
import type { CameraSnapshot } from './overlayTypes';

export interface PointInstance {
    id: string;
    x: number;
    y: number;
    size: number;
    color: string;
    selected: boolean;
}

const isPointFeature = (feature: MapLibreRenderFeature): boolean => (
    feature.geometry.type === 'Point' || feature.geometry.type === 'MultiPoint'
);

const pointCoordinates = (feature: MapLibreRenderFeature): Array<[number, number]> => {
    if (feature.geometry.type === 'Point') return [feature.geometry.coordinates];
    if (feature.geometry.type === 'MultiPoint') return feature.geometry.coordinates;
    return [];
};

export class PointRenderer {
    private instances: PointInstance[] = [];

    setFeatures(features: MapLibreRenderFeature[], selectedIds = new Set<string>()): void {
        this.instances = [];
        for (const feature of features) {
            if (!isPointFeature(feature)) continue;
            const props = feature.properties;
            for (const [x, y] of pointCoordinates(feature)) {
                this.instances.push({
                    id: props.parentFeatureId || props.id,
                    x,
                    y,
                    size: Number(props.displaySize || props.size || 10),
                    color: String(props.color || '#6366f1'),
                    selected: selectedIds.has(props.id) || selectedIds.has(props.parentFeatureId || props.id),
                });
            }
        }
    }

    getInstances(): PointInstance[] {
        return this.instances;
    }

    draw2d(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: CameraSnapshot | null): void {
        const width = camera?.width || canvas.width || 1;
        const height = camera?.height || canvas.height || 1;

        for (const instance of this.instances) {
            const x = ((instance.x + 180) / 360) * width;
            const y = ((90 - instance.y) / 180) * height;
            const radius = Math.max(2, instance.size / 2);
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fillStyle = instance.color;
            context.globalAlpha = instance.selected ? 1 : 0.82;
            context.fill();
            context.globalAlpha = 1;
            context.lineWidth = instance.selected ? 3 : 1.5;
            context.strokeStyle = instance.selected ? '#ecfeff' : '#ffffff';
            context.stroke();
        }
    }
}
