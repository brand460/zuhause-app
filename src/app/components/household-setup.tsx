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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 font-sans" style={{ background: "var(--zu-bg)" }}>
      <div className="w-full max-w-sm">
        {mode === "choice" && (
          <>
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-accent rounded-xl flex items-center justify-center mb-4" style={{ boxShadow: "var(--shadow-card)" }}>
                <Home className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-text-1">
                Hallo, {profile?.display_name || "dort"}!
              </h1>
              <p className="text-text-2 mt-1 text-center">
                Erstelle einen neuen Haushalt oder tritt einem bestehenden bei.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setMode("create")}
                className="w-full flex items-center gap-4 p-4 hover:border-accent hover:bg-accent-light transition group"
                style={{ borderRadius: "var(--radius-card)", border: "2px solid var(--zu-border)" }}
              >
                <div className="w-12 h-12 rounded-xl bg-accent-light flex items-center justify-center group-hover:bg-accent-mid transition">
                  <Plus className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-text-1">Haushalt erstellen</p>
                  <p className="text-sm text-text-2">Einen neuen Haushalt anlegen</p>
                </div>
              </button>

              <button
                onClick={() => setMode("join")}
                className="w-full flex items-center gap-4 p-4 hover:border-accent hover:bg-accent-light transition group"
                style={{ borderRadius: "var(--radius-card)", border: "2px solid var(--zu-border)" }}
              >
                <div className="w-12 h-12 rounded-xl bg-accent-light flex items-center justify-center group-hover:bg-accent-mid transition">
                  <UserPlus className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-text-1">Haushalt beitreten</p>
                  <p className="text-sm text-text-2">Mit Einladungscode beitreten</p>
                </div>
              </button>
            </div>

            <button
              onClick={signOut}
              className="w-full mt-6 text-sm text-text-3 hover:text-text-1 transition text-center"
            >
              Abmelden
            </button>
          </>
        )}

        {mode === "create" && (
          <>
            <button
              onClick={() => { setMode("choice"); setError(""); }}
              className="flex items-center gap-1 text-text-3 hover:text-text-1 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Zurück</span>
            </button>

            <h2 className="text-xl font-bold text-text-1 mb-1">Haushalt erstellen</h2>
            <p className="text-text-2 text-sm mb-6">
              Gib deinem Haushalt einen Namen.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="text-sm font-medium" style={{ background: "var(--danger-light)", color: "var(--danger)", borderRadius: "var(--radius-card)", padding: 12 }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-1 mb-1.5">
                  Haushaltsname
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="z.B. Familie Müller"
                  className="w-full px-4 py-3 bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
                  style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--zu-border)" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent text-white font-semibold hover:bg-accent-dark transition disabled:opacity-50"
                style={{ borderRadius: "var(--radius-btn)" }}
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
              className="flex items-center gap-1 text-text-3 hover:text-text-1 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Zurück</span>
            </button>

            <h2 className="text-xl font-bold text-text-1 mb-1">Haushalt beitreten</h2>
            <p className="text-text-2 text-sm mb-6">
              Gib den Einladungscode ein, den du erhalten hast.
            </p>

            <form onSubmit={handleJoin} className="space-y-4">
              {error && (
                <div className="text-sm font-medium" style={{ background: "var(--danger-light)", color: "var(--danger)", borderRadius: "var(--radius-card)", padding: 12 }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-1 mb-1.5">
                  Einladungscode
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="z.B. ABC123"
                  required
                  className="w-full px-4 py-3 bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition tracking-widest text-center font-mono text-lg"
                  style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--zu-border)" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent text-white font-semibold hover:bg-accent-dark transition disabled:opacity-50"
                style={{ borderRadius: "var(--radius-btn)" }}
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