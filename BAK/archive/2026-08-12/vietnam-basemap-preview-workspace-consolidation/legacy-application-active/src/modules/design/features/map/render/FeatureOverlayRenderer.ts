import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import type { CameraSnapshot } from './overlayTypes';
import { PointRenderer } from './PointRenderer';

export class FeatureOverlayRenderer {
    private readonly pointRenderer = new PointRenderer();
    private camera: CameraSnapshot | null = null;

    setCamera(camera: CameraSnapshot | null): void {
        this.camera = camera;
    }

    setDesignFeatures(collection: MapLibreRenderFeatureCollection, selectedIds = new Set<string>()): void {
        this.pointRenderer.setFeatures(collection.features, selectedIds);
    }

    draw(canvas: HTMLCanvasElement): void {
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        this.pointRenderer.draw2d(context, canvas, this.camera);
    }

    getPointCount(): number {
        return this.pointRenderer.getInstances().length;
    }
}
