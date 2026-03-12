import { useState, useEffect } from "react";

/**
 * Tracks the keyboard bottom offset and visual viewport height.
 * bottomOffset = keyboard height in px (0 when keyboard is hidden).
 * vpHeight     = visual viewport height in px (shrinks when keyboard opens).
 *
 * Use these values to lift bottom-sheet drawers above the keyboard:
 *   style={{ position: "absolute", left: 0, right: 0, bottom: bottomOffset, maxHeight: vpHeight - 72 }}
 */
export function useKeyboardOffset(): { bottomOffset: number; vpHeight: number } {
  const [bottomOffset, setBottomOffset] = useState(0);
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = Math.max(
        0,
        window.innerHeight - vv.height - (vv.offsetTop || 0),
      );
      setBottomOffset(offset);
      setVpHeight(vv.height);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { bottomOffset, vpHeight };
}
