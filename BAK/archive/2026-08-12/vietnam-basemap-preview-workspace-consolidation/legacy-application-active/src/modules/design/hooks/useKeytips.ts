import { useEffect, useState, useCallback } from "react";

export function useKeytips() {
  const [keytipsActive, setKeytipsActive] = useState(false);

  const toggleKeytips = useCallback(() => {
    setKeytipsActive((prev) => !prev);
  }, []);

  const dismissKeytips = useCallback(() => {
    setKeytipsActive(false);
  }, []);

  useEffect(() => {
    let altPressedTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle keytips on standalone Alt key press
      if (e.key === "Alt") {
        altPressedTime = Date.now();
      } else if (e.key === "Escape") {
        setKeytipsActive(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        // If Alt was pressed and released quickly without inputting another shortcut combo
        if (Date.now() - altPressedTime < 400) {
          setKeytipsActive((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return {
    keytipsActive,
    toggleKeytips,
    dismissKeytips,
  };
}
