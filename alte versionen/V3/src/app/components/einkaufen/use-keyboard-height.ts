import { useState, useEffect, useRef } from "react";

/**
 * Hook that tracks virtual keyboard height using the visualViewport API.
 * Returns the current keyboard height in pixels (0 when keyboard is hidden).
 *
 * Works by comparing `window.innerHeight` (which stays stable when the keyboard
 * opens on most mobile browsers) with `visualViewport.height` (which shrinks).
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialHeightRef = useRef<number>(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture the initial full height on mount (before any keyboard)
    initialHeightRef.current = window.innerHeight;

    const update = () => {
      // On iOS Safari, window.innerHeight stays stable when keyboard opens,
      // but visualViewport.height shrinks.
      // On Android Chrome, both may change, but the difference still works.
      const fullHeight = initialHeightRef.current || window.innerHeight;
      const viewportHeight = vv.height;
      const kb = Math.max(0, Math.round(fullHeight - viewportHeight));

      // Only treat as keyboard if > 100px (ignore small viewport changes like URL bar)
      setKeyboardHeight(kb > 100 ? kb : 0);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return keyboardHeight;
}
