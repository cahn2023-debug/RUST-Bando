
import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@TOOL/utils/cn'; // Assuming a cn utility exists or using a simple one

interface ResizeHandleProps {
  direction: 'left' | 'right';
  onResize: (delta: number) => void;
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onResize, className }) => {
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      // Invert delta for right-side handles if needed, 
      // but usually the caller handles the absolute width logic.
      // We just pass the movement.
      onResize(e.movementX);
    }
  }, [isResizing, onResize]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div
      onMouseDown={startResizing}
      className={cn(
        "absolute top-0 bottom-0 w-1.5 cursor-col-resize z-50 group flex items-center justify-center transition-all",
        direction === 'left' ? "-right-0.75" : "-left-0.75",
        isResizing ? "bg-cad-accent/40" : "hover:bg-cad-accent/20",
        className
      )}
    >
      <div className={cn(
        "w-[1px] h-8 bg-cad-border group-hover:bg-cad-accent transition-colors",
        isResizing && "bg-cad-accent h-16"
      )} />
    </div>
  );
};
