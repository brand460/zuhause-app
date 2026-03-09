/**
 * ThemeColorProvider
 *
 * Verwaltet zwei separate System-Chrome-Farben:
 *
 *   1. <meta name="theme-color"> — Android/iOS Status Bar (oben)
 *      • Normal:       --zu-bg  (Seiten-Hintergrund, helles Grau / Schwarz)
 *      • Drawer offen: --zu-bg gedimmt mit bg-black/40 (simuliert Overlay)
 *
 *   2. document.body.backgroundColor — Android Gesture Bar (unten)
 *      • Immer --surface (Bottom-Nav bzw. Drawer-Boden)
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

/* ── Hilfsfunktionen ──────────────────────────────────────���─────── */

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
  /**
   * Gesture-Bar-Fix: Chrome Android liest die Gesture-Bar-Farbe aus dem
   * untersten sichtbaren Pixel bzw. dem body-Hintergrund.
   *
   * Wir setzen `background` (Shorthand!) mit `!important` auf allen
   * drei Layern, damit wir den CSS-Shorthand `background: var(--zu-bg)`
   * aus index.css definitiv überschreiben.
   */
  document.documentElement.style.setProperty("background", color, "important");
  document.body.style.setProperty("background", color, "important");
  const root = document.getElementById("root");
  if (root) root.style.setProperty("background", color, "important");
}

/** Erkennt ob Dark Mode aktiv ist (data-theme="dark" auf <html>). */
function isDarkMode(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * Blendet eine Hex-Farbe mit schwarzem Overlay (rgba(0,0,0,alpha)).
 * Ergebnis: rgb = bg_rgb * (1 - alpha)
 */
function blendWithBlack(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - alpha;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${Math.round(g * f).toString(16).padStart(2, "0")}${Math.round(b * f).toString(16).padStart(2, "0")}`;
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
    // Normal:       --zu-bg (Seiten-Hintergrund)
    // Drawer offen: --zu-bg gedimmt mit bg-black/40 Overlay
    const bgHex = resolveCssVar("--zu-bg");
    if (bgHex) {
      const statusBarColor = drawerOpen ? blendWithBlack(bgHex, 0.4) : bgHex;
      setMetaThemeColor(statusBarColor);
    }

    // ── Gesture Bar (body background) ─────────────────────────────
    // Immer --surface: die Bottom-Nav oder der Drawer-Boden ist immer
    // das unterste sichtbare Element. Drawers haben bg-surface und
    // ihre Rundung (rounded-t-[20px]) ist oben, nicht unten.
    const surfaceHex = resolveCssVar("--surface");
    if (surfaceHex) setBodyBg(surfaceHex);
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