import React, { useState } from "react";
import { useAuth } from "./auth-context";
import { Home, Plus, UserPlus, ArrowLeft } from "lucide-react";

type SetupMode = "choice" | "create" | "join";

export function HouseholdSetup() {
  const { createHousehold, joinHousehold, signOut, profile } = useAuth();
  const [mode, setMode] = useState<SetupMode>("choice");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createHousehold(householdName || "Mein Haushalt");
    } catch (err: any) {
      const fullError = err?.message || err?.toString() || JSON.stringify(err) || "Unbekannter Fehler";
      console.log("Create household error (full):", err);
      console.log("Create household error (message):", fullError);
      setError(`Fehler: ${fullError}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await joinHousehold(inviteCode);
    } catch (err: any) {
      console.log("Join household error:", err);
      setError(err.message || "Fehler beim Beitreten.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white font-sans">
      <div className="w-full max-w-sm">
        {mode === "choice" && (
          <>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-orange-500 rounded-xl flex items-center justify-center mb-4 shadow-sm">
                <Home className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Hallo, {profile?.display_name || "dort"}!
              </h1>
              <p className="text-gray-500 mt-1 text-center">
                Erstelle einen neuen Haushalt oder tritt einem bestehenden bei.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setMode("create")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-orange-500 hover:bg-orange-50 transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition">
                  <Plus className="w-6 h-6 text-orange-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Haushalt erstellen</p>
                  <p className="text-sm text-gray-500">Einen neuen Haushalt anlegen</p>
                </div>
              </button>

              <button
                onClick={() => setMode("join")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-orange-500 hover:bg-orange-50 transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition">
                  <UserPlus className="w-6 h-6 text-orange-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Haushalt beitreten</p>
                  <p className="text-sm text-gray-500">Mit Einladungscode beitreten</p>
                </div>
              </button>
            </div>

            <button
              onClick={signOut}
              className="w-full mt-6 text-sm text-gray-500 hover:text-gray-900 transition text-center"
            >
              Abmelden
            </button>
          </>
        )}

        {mode === "create" && (
          <>
            <button
              onClick={() => { setMode("choice"); setError(""); }}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-900 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Zurück</span>
            </button>

            <h2 className="text-xl font-bold text-gray-900 mb-1">Haushalt erstellen</h2>
            <p className="text-gray-500 text-sm mb-6">
              Gib deinem Haushalt einen Namen.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 font-medium">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Haushaltsname
                </label>
                <input
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="z.B. Familie Müller"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition disabled:opacity-50"
              >
                {loading ? "Wird erstellt..." : "Haushalt erstellen"}
              </button>
            </form>
          </>
        )}

        {mode === "join" && (
          <>
            <button
              onClick={() => { setMode("choice"); setError(""); }}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-900 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Zurück</span>
            </button>

            <h2 className="text-xl font-bold text-gray-900 mb-1">Haushalt beitreten</h2>
            <p className="text-gray-500 text-sm mb-6">
              Gib den Einladungscode ein, den du erhalten hast.
            </p>

            <form onSubmit={handleJoin} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 font-medium">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Einladungscode
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="z.B. ABC123"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition tracking-widest text-center font-mono text-lg"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition disabled:opacity-50"
              >
                {loading ? "Wird beigetreten..." : "Beitreten"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
