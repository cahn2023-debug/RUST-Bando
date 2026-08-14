
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@SHARED/utils/cn';

interface VerticalResizeHandleProps {
  onResize: (delta: number) => void;
  className?: string;
}

export const VerticalResizeHandle: React.FC<VerticalResizeHandleProps> = ({ onResize, className }) => {
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const rafRef = useRef<number | null>(null);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onResize(e.movementY);
      });
    }
  }, [isResizing, onResize]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'row-resize';
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
      onMouseDown={startResizing}
      className={cn(
        "h-1.5 w-full cursor-row-resize z-cad-panel group flex items-center justify-center transition-all relative",
        isResizing ? "bg-cad-accent/40" : "hover:bg-cad-accent/20",
        className
      )}
    >
      <div className={cn(
        "h-[1px] w-12 bg-cad-border group-hover:bg-cad-accent transition-colors",
        isResizing && "bg-cad-accent w-24"
      )} />
    </div>
  );
};
