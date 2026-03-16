import { useState, useCallback } from "react";

/**
 * Drop-in replacement for useState that automatically persists to sessionStorage.
 * State survives page reloads within the same browser tab (e.g. after app goes
 * to background), but is cleared when the tab is closed.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, (val: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved !== null ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (val: T) => {
      setState(val);
      try {
        if (val === null || val === undefined) {
          sessionStorage.removeItem(key);
        } else {
          sessionStorage.setItem(key, JSON.stringify(val));
        }
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  return [state, set];
}
