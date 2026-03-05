import React, { useState } from "react";
// DEV MODE: auth import removed temporarily
import { Calendar, ShoppingCart, List, ChefHat, LogOut, Home } from "lucide-react";
import { EinkaufenScreen } from "./einkaufen/einkaufen-screen";
import { KalenderScreen } from "./kalender/kalender-screen";

type TabId = "kalender" | "einkaufen" | "listen" | "kochen";

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
];

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
        {title === "Kalender" && <Calendar className="w-8 h-8 text-orange-500" />}
        {title === "Listen" && <List className="w-8 h-8 text-orange-500" />}
        {title === "Kochen" && <ChefHat className="w-8 h-8 text-orange-500" />}
      </div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <p className="text-gray-500 text-sm mt-1">Kommt bald</p>
    </div>
  );
}

export function MainShell() {
  // DEV MODE: using mock data instead of useAuth()
  const profile = { display_name: "Entwickler" };
  const household = { name: "Zuhause" };
  const signOut = () => { console.log("signOut (dev mode - no-op)"); };
  const [activeTab, setActiveTab] = useState<TabId>("einkaufen");

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">
              {household?.name || "Zuhause"}
            </h1>
            <p className="text-xs text-gray-500 leading-tight">
              {profile?.display_name}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
          title="Abmelden"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "einkaufen" ? (
          <EinkaufenScreen />
        ) : activeTab === "kalender" ? (
          <KalenderScreen />
        ) : (
          <PlaceholderScreen title={tabs.find(t => t.id === activeTab)!.label} />
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 min-w-[64px] py-1 rounded-xl transition ${
                  isActive
                    ? "text-orange-500"
                    : "text-gray-400 hover:text-gray-900"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                    isActive ? "bg-orange-50" : ""
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span
                  className={`text-[11px] leading-tight ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
