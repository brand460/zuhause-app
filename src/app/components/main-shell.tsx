import React, { useState, useEffect, useRef } from "react";
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

/**
 * Use a stable viewport height that doesn't shrink when the virtual keyboard opens.
 * We capture window.innerHeight on mount and only update it when the keyboard is NOT visible
 * (i.e. the viewport grows back to full size).
 */
function useStableViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  const stableRef = useRef(window.innerHeight);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture the initial full height
    stableRef.current = Math.max(stableRef.current, window.innerHeight);

    const onResize = () => {
      // Only update height when keyboard is NOT visible (viewport ~= full height)
      // A keyboard is typically >100px, so if the visual viewport is close to
      // window.innerHeight, the keyboard is closed.
      const diff = Math.abs(window.innerHeight - vv.height);
      if (diff < 100) {
        const newH = window.innerHeight;
        stableRef.current = newH;
        setHeight(newH);
      }
    };

    // Also handle orientation change / real resize (not keyboard)
    const onWindowResize = () => {
      const vv2 = window.visualViewport;
      const diff = vv2 ? Math.abs(window.innerHeight - vv2.height) : 0;
      if (diff < 100) {
        stableRef.current = window.innerHeight;
        setHeight(window.innerHeight);
      }
    };

    vv.addEventListener("resize", onResize);
    window.addEventListener("resize", onWindowResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  return height;
}

export function MainShell() {
  const { signOut, user, householdId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("einkaufen");
  const [einkaufenCount, setEinkaufenCount] = useState(0);
  const stableHeight = useStableViewportHeight();

  // ── Global scroll-to-focused: stellt sicher dass das fokussierte Element
  //    immer über der Tastatur sichtbar ist, egal in welchem Drawer. ──────
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches("input, textarea, [contenteditable]")) return;
      setTimeout(() => {
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
        } else {
          console.log("[OneSignal/MainShell] ⚠️ No player ID returned — push not registered");
        }
      } catch (err) {
        console.log("[OneSignal/MainShell] ❌ Registration error:", err);
      }
    })();
  }, [user?.id, householdId]);

  // Deep-link targets from Kalender navigation
  const [deepLinkRecipeId, setDeepLinkRecipeId] = useState<string | null>(null);
  const [deepLinkPageId, setDeepLinkPageId] = useState<string | null>(null);

  // Track which tabs have been visited — only mount their component once visited
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(["einkaufen"]));

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

  const handleNavigate = (tab: string, itemId?: string | null) => {
    handleTabChange(tab as TabId);
    if (tab === "kochen" && itemId) setDeepLinkRecipeId(itemId);
    if (tab === "listen" && itemId) setDeepLinkPageId(itemId);
  };

  return (
    <ThemeColorProvider>
      <div
        className="flex flex-col overflow-hidden font-sans"
        style={{ height: stableHeight, position: "fixed", top: 0, left: 0, right: 0, background: "var(--zu-bg)" }}
      >
        <Toaster position="top-center" richColors />

        {/* Content — tabs are lazy-mounted on first visit, then kept alive via CSS hidden */}
        <div className="flex-1 min-h-0 flex flex-col relative">
          {visitedTabs.has("kalender") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "kalender" ? "" : "hidden"}`}>
              <KalenderScreen onNavigate={handleNavigate} />
            </div>
          )}
          {visitedTabs.has("einkaufen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "einkaufen" ? "" : "hidden"}`}>
              <EinkaufenScreen onItemCountChange={setEinkaufenCount} />
            </div>
          )}
          {visitedTabs.has("listen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "listen" ? "" : "hidden"}`}>
              <ListenScreen openPageId={deepLinkPageId} />
            </div>
          )}
          {visitedTabs.has("kochen") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "kochen" ? "" : "hidden"}`}>
              <KochenScreen openRecipeId={deepLinkRecipeId} />
            </div>
          )}
          {visitedTabs.has("mehr") && (
            <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === "mehr" ? "" : "hidden"}`}>
              <MehrScreen onSignOut={signOut} />
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <nav className="flex-shrink-0 bg-surface pb-[env(safe-area-inset-bottom)]" style={{ borderTop: "1px solid var(--zu-border)" }}>
          <div className="flex items-center justify-around px-2 pt-2 pb-2" style={{ maxWidth: 680, margin: "0 auto" }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const { PhosphorIcon } = tab;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
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