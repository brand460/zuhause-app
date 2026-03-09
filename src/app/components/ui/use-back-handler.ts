/**
 * Centralized back-gesture handler.
 *
 * When a drawer/modal/detail-view opens, it pushes a history entry.
 * The browser back gesture (swipe-back on iOS/Android) fires `popstate`,
 * which pops the stack and calls the close function — instead of leaving the app.
 *
 * Usage:
 *   useBackHandler(isOpen, () => closeFn());
 */

import { useEffect, useRef } from "react";

// ── Global stack ────────────────────────────────────────────────────
const backStack: Array<() => void> = [];
let skipNextPop = false;
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener("popstate", () => {
    if (skipNextPop) {
      skipNextPop = false;
      return;
    }
    if (backStack.length > 0) {
      const handler = backStack.pop()!;
      handler();
    }
  });
}

/** Push a close-handler onto the stack + push a history entry. */
export function pushBack(closeFn: () => void) {
  ensureListener();
  backStack.push(closeFn);
  history.pushState({ bh: backStack.length }, "");
}

/** Remove a close-handler (normal close, not via back gesture). */
export function popBack() {
  if (backStack.length > 0) {
    backStack.pop();
    skipNextPop = true;
    history.back();
  }
}

// ── React hook ──────────────────────────────────────────────────────

/**
 * Automatically manages pushBack / popBack based on an `isOpen` boolean.
 *
 * @param isOpen  Whether the drawer/modal is currently visible.
 * @param closeFn Called when the user swipe-backs (popstate).
 *                Must close the drawer (set state to false / "main" / null).
 */
export function useBackHandler(isOpen: boolean, closeFn: () => void) {
  const closeFnRef = useRef(closeFn);
  closeFnRef.current = closeFn;

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Drawer just opened → push history
      pushBack(() => {
        // Mark as closed-by-back so the effect below won't double-pop
        wasOpenRef.current = false;
        closeFnRef.current();
      });
    } else if (!isOpen && wasOpenRef.current) {
      // Drawer closed normally (not via back gesture) → clean up history entry
      popBack();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Cleanup on unmount: if still open, pop
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        popBack();
      }
    };
  }, []);
}
