import { useEffect } from "react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";

export function useCanvasInteraction() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const state = useDesignSync.getState();
        if (state.drawingMode !== 'none') {
          state.setDrawingMode('none');
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const state = useDesignSync.getState();
      if (state.drawingMode !== 'none') {
        e.preventDefault();
        state.setDrawingMode('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
}
