import React, { useState, useEffect } from "react";
import {
  User,
  Home,
  Bell,
  Moon,
  Sun,
  Info,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { HouseholdSettings } from "./household-settings";
import { ProfilScreen } from "./profil-screen";
import { MeineArtikelScreen } from "./meine-artikel-screen";

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
  const [showHouseholdSettings, setShowHouseholdSettings] = useState(false);
  const [showProfilScreen, setShowProfilScreen] = useState(false);
  const [showAboutScreen, setShowAboutScreen] = useState(false);
  const [showMeineArtikel, setShowMeineArtikel] = useState(false);

  const menuItems = [
    { id: "profile", icon: User, label: "Profil & Konto", danger: false, action: () => setShowProfilScreen(true) },
    { id: "household", icon: Home, label: "Haushalt verwalten", danger: false, action: () => setShowHouseholdSettings(true) },
    { id: "meine-artikel", icon: Package, label: "Alle Artikel", danger: false, action: () => setShowMeineArtikel(true) },
    { id: "notifications", icon: Bell, label: "Benachrichtigungen", danger: false, action: undefined },
    { id: "darkmode", icon: isDark ? Sun : Moon, label: "Dark Mode", danger: false, action: toggle, isToggle: true },
    { id: "info", icon: Info, label: "Über die App", danger: false, action: () => setShowAboutScreen(true) },
    { id: "logout", icon: LogOut, label: "Abmelden", danger: true, action: undefined },
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
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--zu-bg)" }}>
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: "var(--zu-bg)" }}>
        <h2 className="text-lg font-bold text-text-1">Einstellungen</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div
          className="mx-4 bg-surface rounded-[16px] divide-y"
          style={{
            boxShadow: "var(--shadow-card)",
            borderColor: "var(--zu-border)",
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
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

      {/* ── Household Settings overlay ── */}
      <AnimatePresence>
        {showHouseholdSettings && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-0"
            style={{ zIndex: 1000, background: "var(--zu-bg)" }}
          >
            <HouseholdSettings onClose={() => setShowHouseholdSettings(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Profil Screen overlay ── */}
      <AnimatePresence>
        {showProfilScreen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-0"
            style={{ zIndex: 1000, background: "var(--zu-bg)" }}
          >
            <ProfilScreen onClose={() => setShowProfilScreen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── About Screen overlay ── */}
      <AnimatePresence>
        {showAboutScreen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-0"
            style={{ zIndex: 1000, background: "var(--zu-bg)" }}
          >
            <AboutScreen onClose={() => setShowAboutScreen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Meine Artikel overlay ── */}
      <AnimatePresence>
        {showMeineArtikel && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-0"
            style={{ zIndex: 1000, background: "var(--zu-bg)" }}
          >
            <MeineArtikelScreen onClose={() => setShowMeineArtikel(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── About Screen ──────────────────────────────────────────────────────────────
function AboutScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "var(--zu-bg)" }}>
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--zu-border)" }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-surface-2 transition"
        >
          <ChevronLeft className="w-5 h-5 text-text-1" />
        </button>
        <h2 className="text-base font-semibold text-text-1">Über die App</h2>
      </div>

      {/* Content – zentriert, etwas Luft nach unten für den Home-Indikator */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-16">
        {/* App-Icon */}
        <div
          className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-5"
          style={{
            background: "var(--accent)",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent)",
          }}
        >
          <span className="text-4xl" style={{ userSelect: "none" }}>🏠</span>
        </div>

        {/* Name + Tagline */}
        <p className="text-2xl font-bold mb-1" style={{ color: "var(--text-1)" }}>
          Tuli
        </p>
        <p
          className="text-xs font-medium mb-10 tracking-widest uppercase"
          style={{ color: "var(--text-3)" }}
        >
          Dein Zuhause, digital
        </p>

        {/* Haupttext */}
        <p
          className="text-sm leading-[1.75] text-center mb-4"
          style={{ color: "var(--text-2)", maxWidth: 300 }}
        >
          Handgemacht von einem Mann mit einer Vision, seinen drei digitalen
          Freunden Figma, Opus &amp; Sonnet und seiner Frau, die tapfer alle
          Bugs ertragen hat.
        </p>

        {/* Danke-Zeile */}
        <p
          className="text-base font-semibold text-center mb-10"
          style={{ color: "var(--text-1)", maxWidth: 300 }}
        >
          Danke für alles, Sandy.{" "}
          <span style={{ userSelect: "none" }}>❤️</span>
        </p>

        {/* Trennlinie */}
        <div
          className="mb-8"
          style={{ width: 40, height: 1, background: "var(--zu-border)" }}
        />

        {/* PS */}
        <p
          className="text-xs italic text-center"
          style={{ color: "var(--text-3)", maxWidth: 260 }}
        >
          PS: alle verbleibenden Bugs sind Features…
        </p>
      </div>
    </div>
  );
}