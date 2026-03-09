/**
 * Globale Drawer/Bottom-Sheet Animations-Konstanten
 * Referenz: EventEditorSheet in kalender-screen.tsx
 * spring { damping: 25, stiffness: 300 } — exakt diese Werte überall verwenden
 */

export const DRAWER_SPRING = {
  type: "spring" as const,
  damping: 25,
  stiffness: 300,
} as const;

/** Backdrop: opacity 0 → 1, gleiche Spring-Dauer */
export const BACKDROP_ANIM = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: DRAWER_SPRING,
} as const;

/** Panel: translateY(100%) → 0 → translateY(100%) */
export const PANEL_ANIM = {
  initial:    { y: "100%" },
  animate:    { y: 0 },
  exit:       { y: "100%" },
  transition: DRAWER_SPRING,
} as const;
