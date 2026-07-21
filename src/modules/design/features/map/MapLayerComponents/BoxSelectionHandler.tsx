import { useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getFeatureBounds, intersectsBounds, normalizeFeatureForSummary } from '@TOOL/utils/selectionUtils';

export function BoxSelectionHandler() {
  const map = useMap();
  const { state, setBoxSelection, selectFeature } = useDesignSync();
  const lastSelectionTime = useRef(0);

  useEffect(() => {
    if (!map) return;

    let startPoint: L.Point | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let isDragging = false;

    // Lắng nghe trực tiếp trên container của bản đồ để tránh bị Layer chặn sự kiện
    const container = map.getContainer();

    const onMouseDown = (e: MouseEvent) => {
      // Shield: Don't interfere if Move tool is active
      if (useDesignSync.getState().drawingMode === 'move') return;
      if (!e.shiftKey) return;

      isDragging = true;
      // Chuyển tọa độ chuột sang tọa độ container bản đồ
      const rect = container.getBoundingClientRect();
      startPoint = L.point(e.clientX - rect.left, e.clientY - rect.top);

      map.dragging.disable();
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

      // Ngăn chặn sự kiện mặc định của trình duyệt
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !startPoint || !selectionBox) return;

      const rect = container.getBoundingClientRect();
      const currentPoint = L.point(e.clientX - rect.left, e.clientY - rect.top);

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
      const currentPoint = L.point(e.clientX - rect.left, e.clientY - rect.top);

      // Chuyển tọa độ box sang LatLngBounds
      const p1 = map.containerPointToLatLng(startPoint);
      const p2 = map.containerPointToLatLng(currentPoint);
      const bounds = L.latLngBounds(p1, p2);

      // Dọn dẹp UI
      if (selectionBox.parentNode) {
        selectionBox.parentNode.removeChild(selectionBox);
      }

      isDragging = false;
      startPoint = null;
      selectionBox = null;
      map.dragging.enable();
      container.style.cursor = '';
      lastSelectionTime.current = Date.now();

      if (bounds.getNorthEast().equals(bounds.getSouthWest())) return;

      // Fit view
      map.fitBounds(bounds, { padding: [20, 20] });

      if (!state) return;

      // Cho phép UI xóa box và cập nhật fitBounds trước khi tính toán nặng
      setTimeout(() => {
        try {
          const selectionBounds: [number, number, number, number] = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth()
          ];

          const allFeatures = Object.values(state.features || {});
          const featureGroups = state.feature_groups || {};
          const layers = state.layers || {};

          const intersectedFeatures = [];
          const stats: Record<string, number> = {};

          // Phase 1: Fast Filter (No normalization yet)
          for (let i = 0; i < allFeatures.length; i++) {
            const feature = allFeatures[i];
            const group = feature.group_id ? featureGroups[feature.group_id] : null;
            if (!group || !group.is_visible) continue;
            const layer = layers[group.layer_id];
            if (!layer || !layer.is_visible) continue;

            const featureBounds = getFeatureBounds(feature);
            if (!featureBounds) continue;

            if (intersectsBounds(featureBounds, selectionBounds)) {
              intersectedFeatures.push({ feature, group });
              const dType = group.type || 'KHÁC';
              stats[dType] = (stats[dType] || 0) + 1;
            }
          }

          if (intersectedFeatures.length === 0) {
            setBoxSelection(null);
            return;
          }

          // Phase 2: Normalization (Chỉ normalize tối đa 1000 mục để hiện list chi tiết nhanh)
          const itemsToProcess = intersectedFeatures.slice(0, 1000).map(f =>
            normalizeFeatureForSummary(f.feature, f.group.type, f.group.name)
          );

          // Update Store
          selectFeature(null);
          setBoxSelection({
            count: intersectedFeatures.length,
            byType: stats,
            items: itemsToProcess as any,
            bounds: [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
          });

        } catch (err) {
          console.error("[BoxSelection] Error in async processing:", err);
        }
      }, 50);
    };

    const onMapClick = (e: L.LeafletMouseEvent) => {
      const currentState = useDesignSync.getState();
      const originalTarget = (e.originalEvent as MouseEvent)?.target as HTMLElement;

      const isFeatureClick = originalTarget && (
        originalTarget.tagName === 'path' ||
        originalTarget.tagName === 'IMG' ||
        originalTarget.closest('.leaflet-marker-icon') ||
        originalTarget.closest('.leaflet-interactive') ||
        originalTarget.closest('.custom-map-marker') ||
        originalTarget.closest('.selected-marker') ||
        originalTarget.classList.contains('leaflet-marker-icon') ||
        originalTarget.classList.contains('leaflet-interactive') ||
        originalTarget.classList.contains('custom-map-marker') ||
        originalTarget.classList.contains('selected-marker')
      );

      if (isFeatureClick) return;

      const lastMarkerClick = (currentState as any)._lastMarkerClickTime || 0;
      const timeSinceMarkerClick = Date.now() - lastMarkerClick;
      if (timeSinceMarkerClick < 100) return;

      if (currentState.drawingMode !== 'none' && currentState.drawingMode !== 'move') return;

      if (!isDragging && (Date.now() - lastSelectionTime.current > 500)) {
        selectFeature(null);
        setBoxSelection(null);
      }
    };

    // Đăng ký sự kiện trực tiếp trên DOM Container
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    map.on('click', onMapClick);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      map.off('click', onMapClick);
      map.dragging.enable();
    };
  }, [map, state, setBoxSelection, selectFeature]);

  return null;
}
