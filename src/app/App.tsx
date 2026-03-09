import React, { useEffect } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { AppContent } from "./components/app-content";

// Theme initialization — runs synchronously before React renders
// to prevent flash of wrong theme
(() => {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      // Sofort korrekte theme-color setzen — verhindert weißen Flash
      // der Gestenleiste beim App-Start im Dark-Mode
      const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (meta) meta.content = "#1E1E1B";
    }
  } catch (_) {
    // localStorage not available
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

  // DEV MODE: AuthProvider removed temporarily. Re-wrap with <AuthProvider> when re-enabling auth.
  return (
    <HelmetProvider>
      <Helmet>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-visual" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Zuhause" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </Helmet>
      <AppContent />
    </HelmetProvider>
  );
}