import React, { useEffect } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { AppContent } from "./components/app-content";

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F97316" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Zuhause" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </Helmet>
      <AppContent />
    </HelmetProvider>
  );
}