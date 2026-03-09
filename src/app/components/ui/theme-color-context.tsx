/**
 * ThemeColorProvider
 *
 * Verwaltet zwei separate System-Chrome-Farben:
 *
 *   1. <meta name="theme-color"> — Android/iOS Status Bar (oben)
 *      • Normal:       --zu-bg  (Seiten-Hintergrund, helles Grau / Schwarz)
 *      • Drawer offen: --zu-bg  (unverändert — Overlay dimmt Seite)
 *
 *   2. document.body.backgroundColor — Android Gesture Bar (unten)
 *      • Normal:       --surface (Bottom-Nav-Farbe: Weiß / Dunkelgrau)
 *      • Drawer offen: --zu-bg  (passt zur Overlay-Stimmung)
 *
 * Reagiert automatisch auf:
 *   - Dark/Light-Mode-Wechsel (MutationObserver auf data-theme)
 *   - Drawer öffnen/schließen (MutationObserver auf DOM + optionaler manueller Call)
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
  /** Manuell Drawer-Status melden (für Custom-Drawers ohne z-[1000]) */
  setDrawerOpen: (open: boolean) => void;
}

const ThemeColorContext = createContext<ThemeColorContextValue>({
  setDrawerOpen: () => {},
});

/* ── Hilfsfunktionen ─────────────────────────────────────────────── */

/** Löst eine CSS Custom Property zu einem konkreten String auf. */
function resolveCssVar(varName: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}

/** Setzt <meta name="theme-color"> (Status Bar). */
function setMetaThemeColor(color: string) {
  let meta = document.querySelector(
    'meta[name="theme-color"]'
  ) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (meta.content !== color) meta.content = color;
}

/** Setzt document.body.backgroundColor (Gesture Bar). */
function setBodyBg(color: string) {
  if (document.body.style.backgroundColor !== color) {
    document.body.style.backgroundColor = color;
  }
}

/** Erkennt ob Dark Mode aktiv ist (data-theme="dark" auf <html>). */
function isDarkMode(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
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
  /** true wenn Drawer via manualRef gemeldet ist */
  const manualDrawerOpen = useRef(false);

  /* Kern-Update-Funktion ------------------------------------------ */
  const updateColors = useCallback(() => {
    const dark = isDarkMode();
    const drawerOpen = manualDrawerOpen.current || isDrawerPresent();

    // ── Status Bar (meta theme-color) ──────────────────────────────
    // Immer --zu-bg (Seiten-Hintergrund), egal ob Drawer offen oder nicht.
    // Im Dark Mode ist --zu-bg fast schwarz (#141412).
    const statusBarColor = resolveCssVar("--zu-bg");
    if (statusBarColor) setMetaThemeColor(statusBarColor);

    // ── Gesture Bar (body background) ─────────────────────────────
    // Normal:       --surface = Bottom-Nav-Farbe (Weiß / #1E1E1B)
    // Drawer offen: --zu-bg   = Seiten-Hintergrund (passt zur Overlay-Stimmung)
    if (drawerOpen) {
      const drawerBg = resolveCssVar("--zu-bg");
      if (drawerBg) setBodyBg(drawerBg);
    } else {
      const navBg = dark
        ? resolveCssVar("--surface")   // Dark: #1E1E1B (Nav-Hintergrund)
        : "#ffffff";                   // Light: Weiß (Bottom Nav Hintergrund)
      if (navBg) setBodyBg(navBg);
    }
  }, []);

  useEffect(() => {
    // Initiales Setzen
    updateColors();

    // ── Observer 1: DOM-Änderungen (Drawer öffnet / schließt) ──────
    const domObserver = new MutationObserver(() => {
      updateColors();
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // ── Observer 2: Dark-Mode-Toggle (data-theme auf <html>) ───────
    const themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      domObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [updateColors]);

  /* Manueller Override für spezielle Fälle ----------------------- */
  const setDrawerOpen = useCallback(
    (open: boolean) => {
      manualDrawerOpen.current = open;
      updateColors();
    },
    [updateColors]
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
