import React, { useEffect } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { AppContent } from "./components/app-content";

// Theme initialization — runs synchronously before React renders
// to prevent flash of wrong theme on startup.
(() => {
  try {
    const saved = localStorage.getItem("theme");
    const isDark = saved === "dark";

    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    // Status Bar (meta theme-color):
    //   Light → --zu-bg = #F7F7F5  |  Dark → --zu-bg = #141412
    const statusColor = isDark ? "#141412" : "#F7F7F5";
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = statusColor;

    // Gesture Bar — alle drei Layer gleichzeitig setzen:
    //   html, body, #root müssen identisch sein, da #root / MainShell
    //   den body normalerweise vollständig überlagern.
    //   Light → #ffffff (Bottom Nav)  |  Dark → #1E1E1B (Bottom Nav dark)
    const gestureColor = isDark ? "#1E1E1B" : "#ffffff";
    const targets = [document.documentElement, document.body, document.getElementById("root")].filter(Boolean) as HTMLElement[];
    for (const el of targets) {
      el.style.setProperty("background", gestureColor, "important");
      el.style.setProperty("background-color", gestureColor, "important");
    }
  } catch (_) {
    // localStorage not available — stay with defaults
  }
})();

export default function App() {
  // Service Worker registrieren
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .then((reg) => console.log("[SW] Registriert:", reg.scope))
          .catch((err) =>
            console.warn("[SW] Registrierung fehlgeschlagen:", err)
          );
      });
    }
  }, []);

  // Auth is handled inside AppContent → AuthProvider
  return (
    <HelmetProvider>
      <Helmet>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-visual" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F7F7F5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Zuhause" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </Helmet>
      <AppContent />
    </HelmetProvider>
  );
}