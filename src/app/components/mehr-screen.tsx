import React, { useState, useEffect } from "react";
import {
  User,
  Home,
  Bell,
  Moon,
  Sun,
  Share2,
  Info,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface MehrScreenProps {
  onSignOut: () => void;
}

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return { isDark, toggle: () => setIsDark((p) => !p) };
}

export function MehrScreen({ onSignOut }: MehrScreenProps) {
  const { isDark, toggle } = useTheme();

  const menuItems = [
    { icon: User, label: "Profil & Konto", danger: false, action: undefined },
    { icon: Home, label: "Haushalt verwalten", danger: false, action: undefined },
    { icon: Bell, label: "Benachrichtigungen", danger: false, action: undefined },
    { icon: isDark ? Sun : Moon, label: "Dark Mode", danger: false, action: toggle, isToggle: true },
    { icon: Share2, label: "Teilen & Einladen", danger: false, action: undefined },
    { icon: Info, label: "Über die App", danger: false, action: undefined },
    { icon: LogOut, label: "Abmelden", danger: true, action: undefined },
  ];

  const handleTap = (item: typeof menuItems[number]) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.danger) {
      onSignOut();
    } else {
      toast("Kommt bald", {
        description: item.label,
        duration: 2000,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--zu-bg)" }}>
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: "var(--zu-bg)" }}>
        <h2 className="text-lg font-bold text-text-1">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="bg-surface rounded-[16px] divide-y" style={{ boxShadow: "var(--shadow-card)", borderColor: "var(--zu-border)", borderWidth: 1, borderStyle: "solid" }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => handleTap(item)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2 transition"
                style={{ borderColor: "var(--zu-border)" }}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    item.danger ? "bg-danger-light" : "bg-surface-2"
                  }`}
                >
                  <Icon
                    className={`w-[18px] h-[18px] ${
                      item.danger ? "text-danger" : "text-accent"
                    }`}
                  />
                </div>
                <span
                  className={`flex-1 text-sm font-medium ${
                    item.danger ? "text-danger" : "text-text-1"
                  }`}
                >
                  {item.label}
                </span>
                {(item as any).isToggle ? (
                  <div
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                      isDark ? "bg-accent" : ""
                    }`}
                    style={!isDark ? { background: "var(--switch-background)" } : undefined}
                  >
                    <div
                      className={`w-5 h-5 rounded-full shadow-sm transform transition-transform ${
                        isDark ? "translate-x-5" : "translate-x-0"
                      }`}
                      style={{ background: "var(--surface)" }}
                    />
                  </div>
                ) : (
                  <ChevronRight
                    className={`w-4 h-4 flex-shrink-0 ${
                      item.danger ? "text-danger" : "text-text-3"
                    }`}
                    style={item.danger ? { opacity: 0.5 } : undefined}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}