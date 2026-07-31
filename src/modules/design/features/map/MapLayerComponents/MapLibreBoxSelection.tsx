import { useRef, useEffect } from 'react';
import { useMapContext } from '../MapContext';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureBounds, intersectsBounds, normalizeFeatureForSummary } from '@TOOL/utils/selectionUtils';

const QUERY_LAYERS = [
  'design-fast-points',
  'design-fast-point-icons',
  'design-fast-point-labels',
  'design-fast-lines',
  'design-fast-line-hit-area',
  'design-fast-polygons',
  'design-fast-polygon-strokes',
];

export function MapLibreBoxSelection() {
  const { map } = useMapContext();
  const { state, setBoxSelection, selectFeature } = useDesignSync();
  const lastSelectionTime = useRef(0);

  useEffect(() => {
    if (!map) return;

    let startPoint: { x: number; y: number } | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let isDragging = false;

    const container = map.getContainer();

    const onMouseDown = (e: MouseEvent) => {
      if (useDesignSync.getState().drawingMode === 'move') return;
      if (!e.shiftKey) return;

      isDragging = true;
      const rect = container.getBoundingClientRect();
      startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      map.dragPan.disable();
      container.style.cursor = 'crosshair';

      selectionBox = document.createElement('div');
      selectionBox.style.position = 'absolute';
      selectionBox.style.border = '2px solid #06b6d4';
      selectionBox.style.backgroundColor = 'rgba(6, 182, 212, 0.15)';
      selectionBox.style.pointerEvents = 'none';
      selectionBox.style.zIndex = '2000';
      selectionBox.style.left = `${startPoint.x}px`;
      selectionBox.style.top = `${startPoint.y}px`;
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';

      container.appendChild(selectionBox);

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !startPoint || !selectionBox) return;

      const rect = container.getBoundingClientRect();
      const currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const minX = Math.min(startPoint.x, currentPoint.x);
      const minY = Math.min(startPoint.y, currentPoint.y);
      const maxX = Math.max(startPoint.x, currentPoint.x);
      const maxY = Math.max(startPoint.y, currentPoint.y);

      selectionBox.style.left = `${minX}px`;
      selectionBox.style.top = `${minY}px`;
      selectionBox.style.width = `${maxX - minX}px`;
      selectionBox.style.height = `${maxY - minY}px`;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging || !startPoint || !selectionBox) return;

      const rect = container.getBoundingClientRect();
      const currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const minX = Math.min(startPoint.x, currentPoint.x);
      const minY = Math.min(startPoint.y, currentPoint.y);
      const maxX = Math.max(startPoint.x, currentPoint.x);
      const maxY = Math.max(startPoint.y, currentPoint.y);

      // Convert container pixels to LngLat coordinates in MapLibre
      const p1 = map.unproject([minX, minY]);
      const p2 = map.unproject([maxX, maxY]);

      const west = Math.min(p1.lng, p2.lng);
      const east = Math.max(p1.lng, p2.lng);
      const south = Math.min(p1.lat, p2.lat);
      const north = Math.max(p1.lat, p2.lat);

      // Cleanup UI
      if (selectionBox.parentNode) {
        selectionBox.parentNode.removeChild(selectionBox);
      }

      isDragging = false;
      startPoint = null;
      selectionBox = null;
      map.dragPan.enable();
      container.style.cursor = '';
      lastSelectionTime.current = Date.now();

      if (west === east && south === north) return;

      // Fit view
      map.fitBounds([[west, south], [east, north]], { padding: 40 });

      if (!state) return;

      setTimeout(() => {
        try {
          const selectionBounds: [number, number, number, number] = [west, south, east, north];
          const queryLayers = QUERY_LAYERS.filter(layerId => Boolean(map.getLayer(layerId)));
          const renderedFeatureIds = new Set(
            queryLayers.length > 0
              ? map.queryRenderedFeatures(
                [
                  [minX, minY],
                  [maxX, maxY],
                ],
                { layers: queryLayers }
              )
                .map(feature => feature.properties?.id)
                .filter((id): id is string => typeof id === 'string')
              : []
          );

          const allFeatures = Object.values(state.features || {});
          const featureGroups = state.feature_groups || {};
          const layers = state.layers || {};

          const intersectedFeatures = [];
          const stats: Record<string, number> = {};

          for (let i = 0; i < allFeatures.length; i++) {
            const feature = allFeatures[i];
            const group = feature.group_id ? featureGroups[feature.group_id] : null;
            if (!group || !group.is_visible) continue;
            const layer = layers[group.layer_id];
            if (!layer || !layer.is_visible) continue;

            const isRenderedHit = renderedFeatureIds.has(feature.id);
            const featureBounds = isRenderedHit ? null : getFeatureBounds(feature);

            if (isRenderedHit || (featureBounds && intersectsBounds(featureBounds, selectionBounds))) {
              intersectedFeatures.push({ feature, group });
              const dType = group.type || 'KHÁC';
              stats[dType] = (stats[dType] || 0) + 1;
            }
          }

          if (intersectedFeatures.length === 0) {
            setBoxSelection(null);
            return;
          }

          const itemsToProcess = intersectedFeatures.slice(0, 1000).map(f =>
            normalizeFeatureForSummary(f.feature, f.group.type, f.group.name)
          );

          selectFeature(null);
          setBoxSelection({
            count: intersectedFeatures.length,
            byType: stats,
            items: itemsToProcess as any,
            bounds: [south, west, north, east]
          });

        } catch (err) {
          console.error('[MapLibreBoxSelection] Error in async processing:', err);
        }
      }, 50);
    };

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const currentState = useDesignSync.getState();
      if (currentState.drawingMode !== 'none' && currentState.drawingMode !== 'move') return;

      if (!isDragging && (Date.now() - lastSelectionTime.current > 500)) {
        // If clicked empty map area, clear box selection
        if (!e.defaultPrevented) {
          selectFeature(null);
          setBoxSelection(null);
        }
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    map.on('click', onMapClick);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      map.off('click', onMapClick);
      map.dragPan.enable();
    };
  }, [map, selectFeature, setBoxSelection, state]);

  return null;
}
