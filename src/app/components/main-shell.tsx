import React, { useState, useEffect, useRef } from "react";
// DEV MODE: auth import removed temporarily
import { Calendar, ShoppingCart, List, ChefHat, Settings } from "lucide-react";
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
  { id: "listen", label: "Listen", icon: List },
  { id: "kochen", label: "Kochen", icon: ChefHat },
  { id: "mehr", label: "Menü", icon: Settings },
];

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
        {title === "Listen" && <List className="w-8 h-8 text-orange-500" />}
        {title === "Kochen" && <ChefHat className="w-8 h-8 text-orange-500" />}
      </div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <p className="text-gray-500 text-sm mt-1">Kommt bald</p>
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

  return (
    <div
      className="flex flex-col bg-white overflow-hidden font-sans"
      style={{ height: stableHeight, position: "fixed", top: 0, left: 0, right: 0 }}
    >
      <Toaster position="top-center" richColors />

      {/* Content — all tabs stay mounted, hidden via CSS to preserve state */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <div className={`absolute inset-0 flex flex-col ${activeTab === "kalender" ? "" : "hidden"}`}>
          <KalenderScreen />
        </div>
        <div className={`absolute inset-0 flex flex-col ${activeTab === "einkaufen" ? "" : "hidden"}`}>
          <EinkaufenScreen onItemCountChange={setEinkaufenCount} />
        </div>
        <div className={`absolute inset-0 flex flex-col ${activeTab === "listen" ? "" : "hidden"}`}>
          <ListenScreen />
        </div>
        <div className={`absolute inset-0 flex flex-col ${activeTab === "kochen" ? "" : "hidden"}`}>
          <KochenScreen />
        </div>
        <div className={`absolute inset-0 flex flex-col ${activeTab === "mehr" ? "" : "hidden"}`}>
          <MehrScreen onSignOut={signOut} />
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center justify-center w-12 h-12 rounded-xl transition ${
                  isActive
                    ? "text-orange-500 bg-orange-50"
                    : "text-gray-400 hover:text-gray-900"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                {tab.id === "einkaufen" && einkaufenCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {einkaufenCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}