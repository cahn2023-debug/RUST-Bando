import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

export function PrintAreaHandler() {
  const map = useMap();
  const { drawingMode, setPrintArea, setDrawingMode } = useDesignSync();

  useEffect(() => {
    if (!map || drawingMode !== 'print_area') return;

    let startPoint: L.Point | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let isDragging = false;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      isDragging = true;
      startPoint = map.latLngToContainerPoint(e.latlng);

      // Disable map dragging while selecting
      map.dragging.disable();
      (map as any)._container.style.cursor = 'crosshair';

      // Create visual box
      selectionBox = document.createElement('div');
      selectionBox.style.position = 'absolute';
      selectionBox.style.border = '2px dashed #ef4444'; // Red dashed for print area
      selectionBox.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      selectionBox.style.pointerEvents = 'none';
      selectionBox.style.zIndex = '1000';
      selectionBox.style.left = `${startPoint.x}px`;
      selectionBox.style.top = `${startPoint.y}px`;
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';

      const mapContainer = map.getContainer();
      mapContainer.appendChild(selectionBox);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDragging || !startPoint || !selectionBox) return;

      const currentPoint = map.latLngToContainerPoint(e.latlng);
      const minX = Math.min(startPoint.x, currentPoint.x);
      const minY = Math.min(startPoint.y, currentPoint.y);
      const maxX = Math.max(startPoint.x, currentPoint.x);
      const maxY = Math.max(startPoint.y, currentPoint.y);

      selectionBox.style.left = `${minX}px`;
      selectionBox.style.top = `${minY}px`;
      selectionBox.style.width = `${maxX - minX}px`;
      selectionBox.style.height = `${maxY - minY}px`;
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!isDragging || !startPoint || !selectionBox) return;

      const currentPoint = map.latLngToContainerPoint(e.latlng);
      
      const p1 = map.containerPointToLatLng(startPoint);
      const p2 = map.containerPointToLatLng(currentPoint);
      const bounds = L.latLngBounds(p1, p2);

      // Cleanup
      if (selectionBox.parentNode) {
        selectionBox.parentNode.removeChild(selectionBox);
      }

      isDragging = false;
      startPoint = null;
      selectionBox = null;
      map.dragging.enable();
      (map as any)._container.style.cursor = '';

      // Avoid tiny selections
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) return;

      setPrintArea([
        bounds.getSouth(),
        bounds.getWest(),
        bounds.getNorth(),
        bounds.getEast()
      ]);
      
      // Exit drawing mode after selection
      setDrawingMode('none');
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragging.enable();
    };
  }, [map, drawingMode, setPrintArea, setDrawingMode]);

  return null;
}
