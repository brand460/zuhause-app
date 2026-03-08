import React from "react";
import {
  User,
  Home,
  Bell,
  Moon,
  Share2,
  Info,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface MehrScreenProps {
  onSignOut: () => void;
}

const menuItems = [
  { icon: User, label: "Profil & Konto", danger: false },
  { icon: Home, label: "Haushalt verwalten", danger: false },
  { icon: Bell, label: "Benachrichtigungen", danger: false },
  { icon: Moon, label: "Dark Mode", danger: false },
  { icon: Share2, label: "Teilen & Einladen", danger: false },
  { icon: Info, label: "Über die App", danger: false },
  { icon: LogOut, label: "Abmelden", danger: true },
];

export function MehrScreen({ onSignOut }: MehrScreenProps) {
  const handleTap = (label: string, danger: boolean) => {
    if (danger) {
      onSignOut();
    } else {
      toast("Kommt bald", {
        description: label,
        duration: 2000,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Menü</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => handleTap(item.label, item.danger)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    item.danger ? "bg-red-50" : "bg-gray-50"
                  }`}
                >
                  <Icon
                    className={`w-[18px] h-[18px] ${
                      item.danger ? "text-red-500" : "text-gray-500"
                    }`}
                  />
                </div>
                <span
                  className={`flex-1 text-sm font-medium ${
                    item.danger ? "text-red-500" : "text-gray-900"
                  }`}
                >
                  {item.label}
                </span>
                <ChevronRight
                  className={`w-4 h-4 flex-shrink-0 ${
                    item.danger ? "text-red-300" : "text-gray-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}