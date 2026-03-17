import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./auth-context";
import {
  Calendar,
  ShoppingCart,
  Notepad,
  CookingPot,
  List,
} from "phosphor-react";
import { FileText, ChefHat } from "lucide-react";
import { Toaster } from "sonner";
import { EinkaufenScreen } from "./einkaufen/einkaufen-screen";
import { KalenderScreen } from "./kalender/kalender-screen";
import { MehrScreen } from "./mehr-screen";
import { ListenScreen } from "./listen/listen-screen";
import { KochenScreen } from "./kochen/kochen-screen";
import { ThemeColorProvider } from "./ui/theme-color-context";
import { setupPushForUser } from "./onesignal";
import { apiFetch } from "./supabase-client";
import { useSessionState } from "./ui/use-session-state";

type TabId = "kalender" | "einkaufen" | "listen" | "kochen" | "mehr";

interface Tab {
  id: TabId;
  label: string;
  PhosphorIcon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "einkaufen", label: "Einkaufen", PhosphorIcon: ShoppingCart },
  { id: "kalender", label: "Kalender", PhosphorIcon: Calendar },
  { id: "listen", label: "Notizen", PhosphorIcon: Notepad },
  { id: "kochen", label: "Kochen", PhosphorIcon: CookingPot },
  { id: "mehr", label: "Menü", PhosphorIcon: List },
];

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-xl bg-accent-light flex items-center justify-center mb-4">
        {title === "Listen" && <FileText className="w-8 h-8 text-accent" />}
        {title === "Kochen" && <ChefHat className="w-8 h-8 text-accent" />}
      </div>
      <h2 className="text-xl font-bold text-text-1">{title}</h2>
      <p className="text-text-3 text-sm mt-1">Kommt bald</p>
    </div>
  );
}

export function MainShell() {
  const { signOut, user, householdId } = useAuth();
  const [activeTab, setActiveTab] = useSessionState<TabId>("app_active_tab", "einkaufen");
  const [einkaufenCount, setEinkaufenCount] = useState(0);

  // ── Tab-Reset: jeder Screen registriert seine Reset-Funktion hier ──
  const resetTabRef = useRef<(() => void) | null>(null);
  const handleRegisterReset = useCallback((fn: () => void) => {
    resetTabRef.current = fn;
  }, []);

  // ── Global scroll-to-focused: stellt sicher dass das fokussierte Element
  //    immer über der Tastatur sichtbar ist, egal in welchem Drawer. ──────
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches("input, textarea, [contenteditable]")) return;
      setTimeout(() => {
        // On iOS, skip scrollIntoView when the element is already within
        // the visual viewport — iOS performs its own scroll-to-focus, and
        // running scrollIntoView simultaneously causes a visible up-down jank.
        const vv = window.visualViewport;
        if (vv) {
          const rect = el.getBoundingClientRect();
          // getBoundingClientRect() coords are relative to the visual viewport
          if (rect.top >= 0 && rect.bottom <= vv.height) return;
        }
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 300);
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  // ── OneSignal Push Setup (once after login) ─────────────────────
  const oneSignalInitRef = useRef(false);
  useEffect(() => {
    if (!user?.id || !householdId) {
      console.log("[OneSignal/MainShell] Skipping — user:", !!user?.id, "household:", !!householdId);
      return;
    }
    if (oneSignalInitRef.current) {
      console.log("[OneSignal/MainShell] Already initialized, skipping");
      return;
    }
    oneSignalInitRef.current = true;

    console.log("[OneSignal/MainShell] Starting push setup for user:", user.id, "household:", householdId);

    (async () => {
      try {
        const playerId = await setupPushForUser(user.id);
        console.log("[OneSignal/MainShell] setupPushForUser returned:", playerId);

        if (playerId) {
          console.log("[OneSignal/MainShell] Registering player ID via /onesignal/register…");
          const res = await apiFetch("/onesignal/register", {
            method: "POST",
            body: JSON.stringify({
              user_id: user.id,
              player_id: playerId,
              household_id: householdId,
            }),
          });
          console.log("[OneSignal/MainShell] ✅ Registration response:", res);
          localStorage.setItem("onesignal_last_setup", Date.now().toString());
        } else {
          console.log("[OneSignal/MainShell] ⚠️ No player ID returned — push not registered");
        }
      } catch (err) {
        console.log("[OneSignal/MainShell] ❌ Registration error:", err);
      }
    })();
  }, [user?.id, householdId]);

  // ── OneSignal Re-Setup bei Visibility-Wechsel nach langer Inaktivität ──
  useEffect(() => {
    if (!user?.id || !householdId) return;

    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      const lastSetup = parseInt(localStorage.getItem("onesignal_last_setup") ?? "0", 10);
      const elapsed = Date.now() - lastSetup;

      if (elapsed < THREE_DAYS_MS) {
        console.log("[OneSignal/Visibility] Setup noch aktuell — letzte Registrierung vor", Math.round(elapsed / 3600000), "h");
        return;
      }

      console.log("[OneSignal/Visibility] Mehr als 3 Tage seit letztem Setup — erneuere Push-Subscription…");
      try {
        const playerId = await setupPushForUser(user.id);
        console.log("[OneSignal/Visibility] setupPushForUser returned:", playerId);

        if (playerId) {
          const res = await apiFetch("/onesignal/register", {
            method: "POST",
            body: JSON.stringify({
              user_id: user.id,
              player_id: playerId,
              household_id: householdId,
            }),
          });
          console.log("[OneSignal/Visibility] ✅ Re-Registration response:", res);
          localStorage.setItem("onesignal_last_setup", Date.now().toString());
        } else {
          console.log("[OneSignal/Visibility] ⚠️ Kein player ID zurückgegeben");
        }
      } catch (err) {
        console.log("[OneSignal/Visibility] ❌ Re-Registration Fehler:", err);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user?.id, householdId]);

  // ── Web Share Target — geteilten Text empfangen ─────────────────────
  const [sharedText, setSharedText] = useState<string | null>(null);
  const [showTextImport, setShowTextImport] = useState(false);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [showUrlImport, setShowUrlImport] = useState(false);

  // Ref auf handleTabChange damit der SW-Listener nie eine stale Closure sieht
  const handleTabChangeRef = useRef<(tab: TabId) => void>(() => {});

  // URL-Erkennung: TikTok/Instagram/etc. → URL-Import, WhatsApp-Text → Text-Import
  const handleSharedContent = useCallback((text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);
    if (urls && urls.length > 0) {
      setSharedUrl(urls[0]);
      setShowUrlImport(true);
    } else {
      setSharedText(text);
      setShowTextImport(true);
    }
    handleTabChangeRef.current('kochen');
  }, []);

  // SW-Message-Listener: App war offen, SW sendet SHARE_RECEIVED direkt
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SHARE_RECEIVED' && event.data.text) {
        handleSharedContent(event.data.text);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pending Share aus Cache prüfen — läuft nach dem ersten Render mit 500ms Puffer
  // damit alle Komponenten vollständig gemountet sind bevor der Drawer geöffnet wird
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const cache = await caches.open('share-cache');
        const pending = await cache.match('/pending-share');
        if (pending) {
          const text = await pending.text();
          if (text) {
            await cache.delete('/pending-share');
            handleSharedContent(text);
          }
        }
      } catch (err) {
        console.error('[Share] Cache-Prüfung fehlgeschlagen:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link targets from Kalender navigation
  const [deepLinkRecipeId, setDeepLinkRecipeId] = useState<string | null>(null);
  const [deepLinkPageId, setDeepLinkPageId] = useState<string | null>(null);
  const [deepLinkEventId, setDeepLinkEventId] = useState<string | null>(null);

  // ── URL Deep-Link beim ersten Mount auflösen ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabId | null;
    const eventId = params.get("event");
    if (tab && tabs.some((t) => t.id === tab)) {
      handleTabChange(tab);
      if (eventId && tab === "kalender") {
        setDeepLinkEventId(eventId);
      }
    }
    // URL-Parameter entfernen ohne Page Reload
    if (tab) {
      window.history.replaceState({}, "", "/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which tabs have been visited — only mount their component once visited
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(["einkaufen", activeTab]));

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

  // Ref aktuell halten damit der SW-MessageHandler immer die aktuelle Version nutzt
  handleTabChangeRef.current = handleTabChange;

  const handleNavigate = (tab: string, itemId?: string | null) => {
    handleTabChange(tab as TabId);
    if (tab === "kochen" && itemId) setDeepLinkRecipeId(itemId);
    if (tab === "listen" && itemId) setDeepLinkPageId(itemId);
  };

  return (
    <ThemeColorProvider>
      {/*
       * Outer wrapper: pure CSS fixed inset-0, NO JS-driven height.
       * Using CSS keeps this container stable even when iOS shrinks
       * window.innerHeight / visualViewport.height on keyboard open.
       */}
      <div
        className="overflow-hidden font-sans"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--zu-bg)",
        }}
      >
        <Toaster position="top-center" richColors />

        {/*
         * Content area: absolute, leaves room at the bottom for the nav bar.
         * NAV_HEIGHT (64px) + safe-area-inset-bottom ensures content is never
         * hidden behind the nav or the iOS home indicator.
         */}
        <div
          className="absolute flex flex-col"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {visitedTabs.has("kalender") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "kalender" ? "" : "hidden"}`}>
              <KalenderScreen
                onNavigate={handleNavigate}
                openEventId={deepLinkEventId}
                onDeepLinkHandled={() => setDeepLinkEventId(null)}
                onRegisterReset={handleRegisterReset}
              />
            </div>
          )}
          {visitedTabs.has("einkaufen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "einkaufen" ? "" : "hidden"}`}>
              <EinkaufenScreen onItemCountChange={setEinkaufenCount} onRegisterReset={handleRegisterReset} />
            </div>
          )}
          {visitedTabs.has("listen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "listen" ? "" : "hidden"}`}>
              <ListenScreen openPageId={deepLinkPageId} onRegisterReset={handleRegisterReset} />
            </div>
          )}
          {visitedTabs.has("kochen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "kochen" ? "" : "hidden"}`}>
              <KochenScreen
                openRecipeId={deepLinkRecipeId}
                sharedText={sharedText}
                onSharedTextConsumed={() => setSharedText(null)}
                showTextImport={showTextImport}
                onShowTextImportChange={setShowTextImport}
                sharedUrl={sharedUrl}
                onSharedUrlConsumed={() => setSharedUrl(null)}
                showUrlImport={showUrlImport}
                onShowUrlImportChange={setShowUrlImport}
                onRegisterReset={handleRegisterReset}
              />
            </div>
          )}
          {visitedTabs.has("mehr") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "mehr" ? "" : "hidden"}`}>
              <MehrScreen onSignOut={signOut} user={user} householdId={householdId} onRegisterReset={handleRegisterReset} />
            </div>
          )}
        </div>

        {/*
         * Bottom Navigation:
         * - position: fixed; bottom: 0  →  anchored to the CSS layout viewport,
         *   completely independent of any parent flex/height changes.
         * - NO bottomOffset from useKeyboardOffset — the keyboard must never
         *   push this bar upward.
         * - padding-bottom: env(safe-area-inset-bottom) handles the iOS home
         *   indicator so tap targets stay above it.
         * - The 64px height (pt-2 + pb-2 + h-12 buttons) matches the reserved
         *   bottom space in the content area above.
         */}
        <nav
          className="bg-surface"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            borderTop: "1px solid var(--zu-border)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="flex items-center justify-around px-2 pt-2 pb-2" style={{ maxWidth: 680, margin: "0 auto" }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const { PhosphorIcon } = tab;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === activeTab) {
                      resetTabRef.current?.();
                    } else {
                      handleTabChange(tab.id);
                    }
                  }}
                  className="relative flex items-center justify-center w-12 h-12 transition"
                >
                  {isActive && (
                    <div
                      className="absolute rounded-full"
                      style={{
                        background: "var(--color-accent)",
                        opacity: 0.15,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        padding: "4px 14px",
                        minWidth: 44,
                        minHeight: 32,
                      }}
                    />
                  )}
                  <PhosphorIcon
                    size={24}
                    weight={isActive ? "fill" : "regular"}
                    color="var(--nav-icon)"
                    className="relative z-10"
                  />
                  {tab.id === "einkaufen" && einkaufenCount > 0 && (
                    <span
                      className="absolute z-10"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--color-accent)",
                        top: 8,
                        right: 8,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </ThemeColorProvider>
  );
}