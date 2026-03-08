import React, { useState, useEffect, useRef } from "react";
// DEV MODE: auth import removed temporarily
import { Calendar, ShoppingCart, FileText, ChefHat, Menu } from "lucide-react";
import { Toaster } from "sonner";
import { EinkaufenScreen } from "./einkaufen/einkaufen-screen";
import { KalenderScreen } from "./kalender/kalender-screen";
import { MehrScreen } from "./mehr-screen";
import { ListenScreen } from "./listen/listen-screen";
import { KochenScreen } from "./kochen/kochen-screen";

type TabId = "kalender" | "einkaufen" | "listen" | "kochen" | "mehr";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "kalender", label: "Kalender", icon: Calendar },
  { id: "einkaufen", label: "Einkaufen", icon: ShoppingCart },
  { id: "listen", label: "Notizen", icon: FileText },
  { id: "kochen", label: "Kochen", icon: ChefHat },
  { id: "mehr", label: "Menü", icon: Menu },
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
  // DEV MODE: using mock data instead of useAuth()
  const signOut = () => { console.log("signOut (dev mode - no-op)"); };
  const [activeTab, setActiveTab] = useState<TabId>("einkaufen");
  const [einkaufenCount, setEinkaufenCount] = useState(0);
  const stableHeight = useStableViewportHeight();

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

  return (
    <div
      className="flex flex-col overflow-hidden font-sans"
      style={{ height: stableHeight, position: "fixed", top: 0, left: 0, right: 0, background: "var(--zu-bg)" }}
    >
      <Toaster position="top-center" richColors />

      {/* Content — tabs are lazy-mounted on first visit, then kept alive via CSS hidden */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {visitedTabs.has("kalender") && (
          <div className={`absolute inset-0 flex flex-col ${activeTab === "kalender" ? "" : "hidden"}`}>
            <KalenderScreen />
          </div>
        )}
        {visitedTabs.has("einkaufen") && (
          <div className={`absolute inset-0 flex flex-col ${activeTab === "einkaufen" ? "" : "hidden"}`}>
            <EinkaufenScreen onItemCountChange={setEinkaufenCount} />
          </div>
        )}
        {visitedTabs.has("listen") && (
          <div className={`absolute inset-0 flex flex-col ${activeTab === "listen" ? "" : "hidden"}`}>
            <ListenScreen />
          </div>
        )}
        {visitedTabs.has("kochen") && (
          <div className={`absolute inset-0 flex flex-col ${activeTab === "kochen" ? "" : "hidden"}`}>
            <KochenScreen />
          </div>
        )}
        {visitedTabs.has("mehr") && (
          <div className={`absolute inset-0 flex flex-col ${activeTab === "mehr" ? "" : "hidden"}`}>
            <MehrScreen onSignOut={signOut} />
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 bg-surface pb-[env(safe-area-inset-bottom)]" style={{ borderTop: "1px solid var(--zu-border)" }}>
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className="relative flex items-center justify-center w-12 h-12 transition"
                style={{
                  color: isActive ? "var(--color-accent)" : "var(--color-text-2)",
                }}
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
                <Icon className="w-5 h-5 relative z-10" strokeWidth={isActive ? 2.5 : 1.5} />
                {tab.id === "einkaufen" && einkaufenCount > 0 && (
                  <span
                    className="absolute z-10 rounded-full"
                    style={{
                      width: 8,
                      height: 8,
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
  );
}