/**
 * CADFeatureRenderer.ts
 * Bộ vẽ toàn bộ các đối tượng Features (Points, Lines, Polygons, DORI, FOV, Overlays) trên Canvas 2D
 * Tách biệt hoàn toàn, không phụ thuộc vào MapLibre.
 */

import type { FeatureState } from '@CONTRACT/types';
import { getFeatureDisplayInfo, getParsedCoordinates, getPointCoordinates } from '@TOOL/utils/featureUtils';
import { projectToScreen, type ViewportState } from './CADCoordinateTransform';
import { IconAtlasManager } from './IconAtlasManager';

export interface RenderOptions {
  selectedFeatureId?: string | null;
  hoveredFeatureId?: string | null;
  featureNumberMap?: Record<string, string | number>;
  showLabels?: boolean;
  dpr?: number;
}

export class CADFeatureRenderer {
  /**
   * Render toàn bộ danh sách Features đã qua Viewport Culling
   */
  public static renderFeatures(
    ctx: CanvasRenderingContext2D,
    features: FeatureState[],
    viewport: ViewportState,
    options: RenderOptions = {}
  ): void {
    const { selectedFeatureId, hoveredFeatureId, featureNumberMap = {}, showLabels = true, dpr = 1 } = options;

    const polygons: FeatureState[] = [];
    const lines: FeatureState[] = [];
    const points: FeatureState[] = [];

    // Phân loại features theo nhóm hình học để render batching theo lớp
    for (const f of features) {
      if (!f) continue;
      const geomType = String(f.geom_type || '').toUpperCase();
      const coords = getParsedCoordinates(f);

      if (geomType.includes('POLYGON')) {
        polygons.push(f);
      } else if (geomType.includes('LINE') || geomType.includes('CABLE') || geomType.includes('POLYLINE') || geomType.includes('NETWORK')) {
        lines.push(f);
      } else if (Array.isArray(coords) && coords.length > 2 && Array.isArray(coords[0])) {
        lines.push(f);
      } else {
        points.push(f);
      }
    }

    // 1. Render Polygons (Lớp dưới cùng)
    this.renderPolygons(ctx, polygons, viewport, selectedFeatureId, hoveredFeatureId);

    // 2. Render Lines & Cables
    this.renderLines(ctx, lines, viewport, selectedFeatureId, hoveredFeatureId);

    // 3. Render Points & Device Icons (Lớp trên)
    this.renderPoints(ctx, points, viewport, selectedFeatureId, hoveredFeatureId, featureNumberMap, dpr);

    // 4. Render Text Labels (Nếu bật showLabels)
    if (showLabels) {
      this.renderLabels(ctx, features, viewport, selectedFeatureId);
    }
  }

  /**
   * Render Polygons / Vùng
   */
  private static renderPolygons(
    ctx: CanvasRenderingContext2D,
    polygons: FeatureState[],
    viewport: ViewportState,
    selectedId?: string | null,
    hoveredId?: string | null
  ): void {
    ctx.save();
    for (const f of polygons) {
      const coords = getParsedCoordinates(f);
      if (!Array.isArray(coords) || coords.length === 0) continue;

      const isSelected = f.id === selectedId;
      const isHovered = f.id === hoveredId;
      const displayInfo = getFeatureDisplayInfo(f);
      const color = displayInfo.color || '#6366f1';

      ctx.beginPath();
      let first = true;
      const ring = Array.isArray(coords[0]) && Array.isArray(coords[0][0]) ? coords[0] : coords;

      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lng = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

        const [screenX, screenY] = projectToScreen(lng, lat, viewport);
        if (first) {
          ctx.moveTo(screenX, screenY);
          first = false;
        } else {
          ctx.lineTo(screenX, screenY);
        }
      }
      ctx.closePath();

      // Fill with transparency
      ctx.fillStyle = isSelected ? 'rgba(34, 211, 238, 0.35)' : (isHovered ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)');
      ctx.fill();

      // Stroke
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.strokeStyle = isSelected ? '#22d3ee' : color;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Render Lines / Tuyến Cáp
   */
  private static renderLines(
    ctx: CanvasRenderingContext2D,
    lines: FeatureState[],
    viewport: ViewportState,
    selectedId?: string | null,
    hoveredId?: string | null
  ): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const f of lines) {
      const coords = getParsedCoordinates(f);
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const isSelected = f.id === selectedId;
      const isHovered = f.id === hoveredId;
      const displayInfo = getFeatureDisplayInfo(f);
      const color = displayInfo.color || '#10b981';
      const meta = (f.metadata && typeof f.metadata === 'object' ? f.metadata : {}) as Record<string, any>;
      const baseWidth = Number(meta.gis?.size ?? meta.size ?? meta.gis?.weight ?? meta.weight ?? 3);
      const width = isSelected ? Math.max(baseWidth + 3, 5) : baseWidth;

      const dashArray = meta.gis?.dashArray || meta.dashArray;

      // Selection Glow
      if (isSelected || isHovered) {
        ctx.beginPath();
        let first = true;
        for (const pt of coords) {
          if (!Array.isArray(pt) || pt.length < 2) continue;
          const lng = Number(pt[0]);
          const lat = Number(pt[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

          const [screenX, screenY] = projectToScreen(lng, lat, viewport);
          if (first) {
            ctx.moveTo(screenX, screenY);
            first = false;
          } else {
            ctx.lineTo(screenX, screenY);
          }
        }
        ctx.lineWidth = width + 8;
        ctx.strokeStyle = isSelected ? 'rgba(34, 211, 238, 0.35)' : 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // Main Line
      ctx.beginPath();
      let first = true;
      for (const pt of coords) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lng = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

        const [screenX, screenY] = projectToScreen(lng, lat, viewport);
        if (first) {
          ctx.moveTo(screenX, screenY);
          first = false;
        } else {
          ctx.lineTo(screenX, screenY);
        }
      }

      ctx.lineWidth = width;
      ctx.strokeStyle = isSelected ? '#22d3ee' : color;
      if (Array.isArray(dashArray) && dashArray.length >= 2) {
        ctx.setLineDash(dashArray);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Render Points / Biểu Tượng & Camera
   */
  private static renderPoints(
    ctx: CanvasRenderingContext2D,
    points: FeatureState[],
    viewport: ViewportState,
    selectedId?: string | null,
    hoveredId?: string | null,
    featureNumberMap: Record<string, string | number> = {},
    dpr = 1
  ): void {
    ctx.save();

    for (const f of points) {
      const coords = getPointCoordinates(f);
      if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;

      const [screenX, screenY] = projectToScreen(coords[0], coords[1], viewport);
      const isSelected = f.id === selectedId;
      const isHovered = f.id === hoveredId;

      const displayInfo = getFeatureDisplayInfo(f);
      const color = displayInfo.color || '#6366f1';
      const meta = (f.metadata && typeof f.metadata === 'object' ? f.metadata : {}) as Record<string, any>;
      const rotation = Number(meta.gis?.rotation ?? meta.rotation ?? 0);
      const index = featureNumberMap[f.id] || '';
      const size = isSelected ? 36 : 28;

      // Selection Ring / Glow
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, size / 2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(34, 211, 238, 0.35)' : 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isSelected ? '#22d3ee' : '#ffffff';
        ctx.stroke();
      }

      // Fetch pre-rasterized Icon Sprite
      const sprite = IconAtlasManager.getSprite(
        displayInfo.iconKey,
        color,
        size,
        rotation,
        index,
        dpr
      );

      if (sprite) {
        ctx.drawImage(
          sprite,
          Math.round(screenX - size / 2),
          Math.round(screenY - size / 2),
          size,
          size
        );
      } else {
        // Fallback sharp circle with contrast stroke while SVG rasterization is loading
        ctx.beginPath();
        ctx.arc(screenX, screenY, size / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Fallback index badge
        if (index) {
          ctx.font = 'bold 10px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(index), screenX, screenY);
        }
      }
    }

    ctx.restore();
  }

  /**
   * Render Labels / Tên Đối Tượng
   */
  private static renderLabels(
    ctx: CanvasRenderingContext2D,
    features: FeatureState[],
    viewport: ViewportState,
    selectedId?: string | null
  ): void {
    if (viewport.zoom < 14) return; // Don't crowd labels on low zoom

    ctx.save();
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const f of features) {
      if (!f || !f.name) continue;
      const coords = getPointCoordinates(f);
      if (!coords) continue;

      const [screenX, screenY] = projectToScreen(coords[0], coords[1], viewport);
      const isSelected = f.id === selectedId;

      const text = f.name;
      const textY = screenY + 16;

      // Dark background halo for high contrast
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeText(text, screenX, textY);

      ctx.fillStyle = isSelected ? '#22d3ee' : '#f8fafc';
      ctx.fillText(text, screenX, textY);
    }

    ctx.restore();
  }

  /**
   * Render CAD Overlays (Vẽ tuyến, Snap Marker, Đo khoảng cách, Edit Handles)
   */
  public static renderCADOverlays(
    ctx: CanvasRenderingContext2D,
    viewport: ViewportState,
    drawingPoints: Array<[number, number]>,
    snappedPoint?: [number, number] | null,
    measurePoints?: Array<[number, number]> | null
  ): void {
    ctx.save();

    // 1. Drawing Polyline Preview
    if (drawingPoints && drawingPoints.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8'; // Cyan preview line
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);

      let first = true;
      for (const pt of drawingPoints) {
        const [screenX, screenY] = projectToScreen(pt[1], pt[0], viewport); // [lat, lng] -> [lng, lat]
        if (first) {
          ctx.moveTo(screenX, screenY);
          first = false;
        } else {
          ctx.lineTo(screenX, screenY);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertices circles
      for (const pt of drawingPoints) {
        const [screenX, screenY] = projectToScreen(pt[1], pt[0], viewport);
        ctx.beginPath();
        ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 2. Snap Indicator (Green Diamond / Ring)
    if (snappedPoint) {
      const [screenX, screenY] = projectToScreen(snappedPoint[0], snappedPoint[1], viewport);
      ctx.beginPath();
      ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#10b981'; // Emerald Snap Ring
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
    }

    // 3. Measurement Tool Ruler
    if (measurePoints && measurePoints.length >= 2) {
      const [p1, p2] = measurePoints;
      const [x1, y1] = projectToScreen(p1[0], p1[1], viewport);
      const [x2, y2] = projectToScreen(p2[0], p2[1], viewport);

      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b'; // Amber measure line
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(`Đoạn đo`, midX, midY - 8);
      ctx.fillText(`Đoạn đo`, midX, midY - 8);
    }

    ctx.restore();
  }
}
