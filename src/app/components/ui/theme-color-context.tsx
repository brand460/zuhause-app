/**
 * ThemeColorProvider
 *
 * Hält <meta name="theme-color"> immer synchron mit der Farbe des Elements,
 * das direkt über der Android-Gestenleiste liegt:
 *
 *   • Standard (Bottom-Nav sichtbar) → --surface (Hintergrund der Nav)
 *   • Drawer / Modal offen (z-[1000]) → --surface (Hintergrund des Drawers)
 *   • Dark-Mode-Toggle             → sofortige Aktualisierung
 *
 * Erkennung läuft vollautomatisch via MutationObserver auf className-Attribute;
 * kein manuelles Wiring in den Screen-Komponenten nötig.
 */
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
} from "react";

/* ── Typen ────────────────────────────────────────────────────────── */
interface ThemeColorContextValue {
  /** Manuell Farbe überschreiben (z. B. für Custom-Drawers) */
  setDrawerOpen: (open: boolean, cssVar?: string) => void;
}

const ThemeColorContext = createContext<ThemeColorContextValue>({
  setDrawerOpen: () => {},
});

/* ── Hilfsfunktionen ─────────────────────────────────────────────── */

/** Löst einen CSS-Custom-Property-Namen zu einem echten Hex-Wert auf. */
function resolveCssVar(varName: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}

/** Setzt <meta name="theme-color"> auf einen konkreten Farbwert. */
function setMetaColor(color: string) {
  let meta = document.querySelector(
    'meta[name="theme-color"]'
  ) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (meta.content !== color) {
    meta.content = color;
  }
}

/**
 * Liefert true, wenn gerade mindestens ein Drawer-Overlay im DOM ist.
 * Alle Drawer/Bottom-Sheets tragen die Klasse "z-[1000]".
 */
function isDrawerPresent(): boolean {
  return document.querySelector('[class*="z-[1000]"]') !== null;
}

/* ── Provider ─────────────────────────────────────────────────────── */
export function ThemeColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * manualOverride: { open: true, cssVar: '--surface' }
   * Wenn gesetzt, hat dieser Wert Vorrang vor der DOM-Erkennung.
   */
  const manualRef = useRef<{ open: boolean; cssVar: string } | null>(null);

  /* Kern-Update-Funktion ------------------------------------------ */
  const updateThemeColor = useCallback(() => {
    let cssVar = "--surface";

    if (manualRef.current) {
      cssVar = manualRef.current.open
        ? manualRef.current.cssVar
        : "--surface";
    } else if (isDrawerPresent()) {
      // Drawers haben ebenfalls --surface als Hintergrund
      cssVar = "--surface";
    }

    const color = resolveCssVar(cssVar);
    if (color) setMetaColor(color);
  }, []);

  useEffect(() => {
    // Initiales Setzen
    updateThemeColor();

    // ── Observer 1: DOM-Änderungen (Drawer öffnet / schließt) ──────
    const domObserver = new MutationObserver(() => {
      // Nur neu berechnen, wenn kein manueller Override aktiv ist
      if (!manualRef.current) updateThemeColor();
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      // Auch Attribut-Änderungen auf className fangen
      // (z. B. wenn Klassen per Toggle wechseln statt via Add/Remove)
      attributes: true,
      attributeFilter: ["class"],
    });

    // ── Observer 2: Dark-Mode-Toggle (data-theme auf <html>) ───────
    const themeObserver = new MutationObserver(updateThemeColor);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      domObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [updateThemeColor]);

  /* Manueller Override für spezielle Fälle ----------------------- */
  const setDrawerOpen = useCallback(
    (open: boolean, cssVar = "--surface") => {
      manualRef.current = open ? { open, cssVar } : null;
      updateThemeColor();
    },
    [updateThemeColor]
  );

  return (
    <ThemeColorContext.Provider value={{ setDrawerOpen }}>
      {children}
    </ThemeColorContext.Provider>
  );
}

/* ── Hook für Screen-Komponenten ─────────────────────────────────── */
export function useThemeColor() {
  return useContext(ThemeColorContext);
}
