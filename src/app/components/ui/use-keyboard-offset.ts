import { useState, useEffect, useRef } from "react";

/**
 * Tracks the keyboard bottom offset and visual viewport height.
 *
 * bottomOffset = keyboard height in px (0 when keyboard is hidden).
 * vpHeight     = visual viewport height in px (shrinks when keyboard opens).
 *
 * WHY stableHeightRef:
 * On Android, window.innerHeight stays constant when the keyboard opens, so
 * "offset = window.innerHeight - vv.height" works perfectly.
 * On iOS, BOTH window.innerHeight AND vv.height shrink together when the
 * keyboard opens — their difference is always ~0 and the keyboard is never
 * detected. The fix: capture a stable reference height at mount time that
 * only ever GROWS (orientation change, browser toolbar hiding) but never
 * shrinks with the keyboard. Then: offset = stableHeight - vv.height.
 *
 * Usage (drawers):
 *   const { bottomOffset, vpHeight } = useKeyboardOffset();
 *   style={{ position: "absolute", left: 0, right: 0, bottom: bottomOffset, maxHeight: vpHeight - 72 }}
 */
export function useKeyboardOffset(): { bottomOffset: number; vpHeight: number } {
  const [bottomOffset, setBottomOffset] = useState(0);
  const [vpHeight, setVpHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );

  // Stable viewport height: starts at the current innerHeight (keyboard is
  // almost certainly closed on mount) and only grows — never shrinks with keyboard.
  const stableHeightRef = useRef(
    Math.max(
      window.innerHeight,
      window.visualViewport?.height ?? window.innerHeight,
    ),
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Expand stable height when viewport grows (orientation change, toolbar hide,
      // keyboard close). Never let it shrink — that's always the keyboard opening.
      const currentInnerH = window.innerHeight;
      if (currentInnerH > stableHeightRef.current) {
        stableHeightRef.current = currentInnerH;
      }

      // keyboard height  =  stableHeight  -  visible area height  -  any scroll offset
      // On Android: stableHeight ≈ window.innerHeight (never changes) → same as before
      // On iOS:     stableHeight stays at original full height, vv.height shrinks → correct!
      const offset = Math.max(
        0,
        stableHeightRef.current - vv.height - (vv.offsetTop || 0),
      );

      setBottomOffset(offset);
      setVpHeight(vv.height);
    };

    // Run once immediately so the initial state is accurate
    update();

    // visualViewport resize fires on both keyboard open/close and orientation change
    vv.addEventListener("resize", update);
    // scroll fires when iOS scrolls the vp to reveal the focused element
    vv.addEventListener("scroll", update);
    // window resize fires on orientation change (belt + suspenders)
    window.addEventListener("resize", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { bottomOffset, vpHeight };
}