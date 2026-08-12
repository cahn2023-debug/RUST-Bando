import { useState, useCallback } from "react";

interface ResizablePanelsOptions {
  initialLeftWidth?: number;
  initialRightWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKeyPrefix?: string;
}

export function useResizablePanels({
  initialLeftWidth = 300,
  initialRightWidth = 300,
  minWidth = 200,
  maxWidth = 600,
  storageKeyPrefix = "sidebar",
}: ResizablePanelsOptions = {}) {
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem(`${storageKeyPrefix}_left_width`);
    return saved ? parseInt(saved) : initialLeftWidth;
  });

  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem(`${storageKeyPrefix}_right_width`);
    return saved ? parseInt(saved) : initialRightWidth;
  });

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((prev) => {
      const newVal = Math.max(minWidth, Math.min(maxWidth, prev + delta));
      localStorage.setItem(`${storageKeyPrefix}_left_width`, newVal.toString());
      return newVal;
    });
  }, [minWidth, maxWidth, storageKeyPrefix]);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((prev) => {
      const newVal = Math.max(minWidth, Math.min(maxWidth, prev - delta));
      localStorage.setItem(`${storageKeyPrefix}_right_width`, newVal.toString());
      return newVal;
    });
  }, [minWidth, maxWidth, storageKeyPrefix]);

  return {
    leftWidth,
    rightWidth,
    handleLeftResize,
    handleRightResize,
  };
}
