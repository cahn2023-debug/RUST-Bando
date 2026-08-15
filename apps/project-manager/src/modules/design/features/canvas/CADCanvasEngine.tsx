/**
 * CADCanvasEngine.tsx
 * Trình render và tương tác CAD Canvas 2D độc lập (Non-Map Pure Canvas Engine)
 * Thay thế hoàn toàn MapLibre GL — Khởi động < 100ms, mượt mà 60 FPS, hỗ trợ toàn bộ features.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useFeatureNumbering } from '@IMPLEMENT/hooks/useDesignFeatures';
import {
  projectToScreen,
  unprojectFromScreen,
  getViewportBoundingBox,
  computeFitBounds,
  type ViewportState,
} from './CADCoordinateTransform';
import { drawCADGrid } from './CADGridRenderer';
import { CADSpatialIndex } from './CADSpatialIndex';
import { CADFeatureRenderer } from './CADFeatureRenderer';
import { IconAtlasManager } from './IconAtlasManager';
import { getPointCoordinates } from '@TOOL/utils/featureUtils';

interface CADCanvasEngineProps {
  initialCenter?: [number, number]; // [lat, lng]
  initialZoom?: number;
  onLocationChange?: (lat: number, lng: number, x: number, snapId?: string | null) => void;
  onFinishDrawing?: () => void;
  onFinishDrawingSession?: () => void;
  isMeasureActive?: boolean;
}

export function CADCanvasEngine({
  initialCenter = [21.0285, 105.8542],
  initialZoom = 15,
  onLocationChange,
  onFinishDrawing,
}: CADCanvasEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync with global store
  const state = useDesignSync((s) => s.state);
  const selectedFeatureId = useDesignSync((s) => s.selectedFeatureId);
  const selectFeature = useDesignSync((s) => s.selectFeature);
  const drawingMode = useDesignSync((s) => s.drawingMode);
  const currentDrawingPoints = useDesignSync((s) => s.currentDrawingPoints);
  const snappedPoint = useDesignSync((s) => s.snappedPoint);
  const zoomExtendTrigger = useDesignSync((s) => s.zoomExtendTrigger);
  const zoomToTrigger = useDesignSync((s) => s.zoomToTrigger);
  const featureNumberMap = useFeatureNumbering(state?.features || {});

  // Local Viewport State
  const [center, setCenter] = useState<[number, number]>(initialCenter);
  const [zoom, setZoom] = useState<number>(initialZoom);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);

  // Drag & Interaction State
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spatialIndexRef = useRef(new CADSpatialIndex());
  const rafIdRef = useRef<number | null>(null);

  // Update dimensions with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build Spatial Index when state features change
  useEffect(() => {
    spatialIndexRef.current.buildIndex(state?.features || {});
  }, [state?.features]);

  // Viewport Object
  const viewport: ViewportState = useMemo(() => ({
    center,
    zoom,
    width: dimensions.width,
    height: dimensions.height,
    pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
  }), [center, zoom, dimensions]);

  // Request Repaint (Render Loop)
  const requestRepaint = useCallback(() => {
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = viewport.pixelRatio;
      const canvasW = Math.round(viewport.width * dpr);
      const canvasH = Math.round(viewport.height * dpr);

      if (canvas.width !== canvasW || canvas.height !== canvasH) {
        canvas.width = canvasW;
        canvas.height = canvasH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Draw CAD Background & Adaptive Grid
      drawCADGrid(ctx, viewport);

      // 2. Viewport Culling via Spatial Index
      const bbox = getViewportBoundingBox(viewport, 0.25);
      const visibleIndexed = spatialIndexRef.current.query(bbox);
      const visibleFeatures = visibleIndexed.map((item) => item.feature);

      // 3. Render Visible Features
      CADFeatureRenderer.renderFeatures(ctx, visibleFeatures, viewport, {
        selectedFeatureId,
        hoveredFeatureId,
        featureNumberMap,
        showLabels: zoom >= 14,
        dpr,
      });

      // 4. Render Drawing & CAD Overlays
      const snapCoords: [number, number] | null = snappedPoint ? [snappedPoint.x, snappedPoint.y] : null;
      CADFeatureRenderer.renderCADOverlays(
        ctx,
        viewport,
        currentDrawingPoints,
        snapCoords,
        null
      );

      ctx.restore();
    });
  }, [viewport, selectedFeatureId, hoveredFeatureId, featureNumberMap, zoom, currentDrawingPoints, snappedPoint]);

  // Trigger repaint on state changes
  useEffect(() => {
    requestRepaint();
  }, [requestRepaint]);

  // Subscribe to IconAtlasManager sprite ready callback
  useEffect(() => {
    IconAtlasManager.setOnSpriteReady(() => {
      requestRepaint();
    });
  }, [requestRepaint]);

  // Handle Zoom Extend / Fit Bounds
  useEffect(() => {
    if (!state?.features) return;
    const points: Array<[number, number]> = [];
    Object.values(state.features).forEach((f) => {
      const pt = getPointCoordinates(f);
      if (pt) points.push(pt);
    });

    if (points.length > 0) {
      const fit = computeFitBounds(points, dimensions.width, dimensions.height);
      if (fit) {
        setCenter(fit.center);
        setZoom(fit.zoom);
      }
    }
  }, [zoomExtendTrigger]); // Triggered on zoom extend

  // Handle Zoom To Feature
  useEffect(() => {
    if (!zoomToTrigger || !state?.features) return;
    const target = state.features[zoomToTrigger.id];
    if (!target) return;

    const pt = getPointCoordinates(target);
    if (pt) {
      setCenter([pt[1], pt[0]]);
      setZoom((z) => Math.max(z, 18));
    }
  }, [zoomToTrigger, state?.features]);

  // Hit Test: Find feature at screen coordinates [x, y]
  const hitTest = useCallback((screenX: number, screenY: number, tolerancePx = 14): string | null => {
    const bbox = getViewportBoundingBox(viewport, 0.1);
    const visible = spatialIndexRef.current.query(bbox);

    let closestId: string | null = null;
    let minDistancePx = tolerancePx;

    for (const item of visible) {
      const pt = getPointCoordinates(item.feature);
      if (pt) {
        const [px, py] = projectToScreen(pt[0], pt[1], viewport);
        const dist = Math.hypot(screenX - px, screenY - py);
        if (dist <= minDistancePx) {
          minDistancePx = dist;
          closestId = item.feature.id;
        }
      }
    }

    return closestId;
  }, [viewport]);

  // Mouse & Pointer Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Pan with Left Click (if not drawing) or Middle Click or Space
    if (e.button === 1 || e.button === 2 || drawingMode === 'none' || drawingMode === 'move') {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }

    // Single Click Action for Drawing
    if (e.button === 0 && drawingMode !== 'none' && drawingMode !== 'move') {
      const [lng, lat] = unprojectFromScreen(x, y, viewport);
      const hitId = hitTest(x, y);
      onLocationChange?.(lat, lng, 0, hitId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle Pan Dragging
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const [newCenterLng, newCenterLat] = unprojectFromScreen(
        viewport.width / 2 - dx,
        viewport.height / 2 - dy,
        viewport
      );
      setCenter([newCenterLat, newCenterLng]);
      return;
    }

    // Hover Test
    const hovered = hitTest(x, y);
    if (hovered !== hoveredFeatureId) {
      setHoveredFeatureId(hovered);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    } else if (e.button === 0 && (drawingMode === 'none' || drawingMode === 'move')) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hitId = hitTest(x, y);
      selectFeature(hitId);
    }
  };

  // Wheel Zoom towards Mouse Cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Target geo position under cursor before zoom
    const [mouseLng, mouseLat] = unprojectFromScreen(mouseX, mouseY, viewport);

    const zoomDelta = -e.deltaY * 0.002;
    const newZoom = Math.max(2, Math.min(23, zoom + zoomDelta));

    // Compute new center so that the point under cursor stays fixed
    const nextViewport: ViewportState = { ...viewport, zoom: newZoom };
    const [newMouseLng, newMouseLat] = unprojectFromScreen(mouseX, mouseY, nextViewport);

    const dLng = mouseLng - newMouseLng;
    const dLat = mouseLat - newMouseLat;

    setCenter(([lat, lng]) => [lat + dLat, lng + dLng]);
    setZoom(newZoom);
  };

  // Double Click: Zoom in or Finish Polyline
  const handleDoubleClick = () => {
    if (drawingMode === 'polyline') {
      onFinishDrawing?.();
    } else {
      setZoom((z) => Math.min(23, z + 1));
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none bg-[#0b0f19] cursor-crosshair"
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
