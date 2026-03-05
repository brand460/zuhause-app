import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook that tracks virtual keyboard height using the visualViewport API.
 * Returns the current keyboard height in pixels (0 when keyboard is hidden).
 *
 * Uses visualViewport.height + offsetTop to precisely compute the keyboard
 * offset, ensuring no gap between the input bar and the keyboard.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialHeightRef = useRef<number>(0);

  const update = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const fullHeight = initialHeightRef.current || window.innerHeight;
    // Account for both viewport shrinkage and any scroll offset (iOS Safari)
    const kb = Math.max(0, Math.round(fullHeight - vv.height - vv.offsetTop));

    // Only treat as keyboard if > 80px (ignore small viewport changes like URL bar)
    setKeyboardHeight(kb > 80 ? kb : 0);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture the initial full height on mount (before any keyboard)
    initialHeightRef.current = window.innerHeight;

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [update]);

  return keyboardHeight;
}
