import React, { useState } from "react";
import { useAuth } from "./auth-context";
import { Home } from "lucide-react";

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(name, email, password);
    } catch (err: any) {
      console.log("Register error:", err);
      setError(err.message || "Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 font-sans" style={{ background: "var(--zu-bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-xl flex items-center justify-center mb-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-1">Zuhause</h1>
          <p className="text-text-2 mt-1">Konto erstellen</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm font-medium" style={{ background: "var(--danger-light)", color: "var(--danger)", borderRadius: "var(--radius-card)", padding: 12 }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-1 mb-1.5">
              Name
            </label>
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dein Name"
              required
              className="w-full px-4 py-3 bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
              style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--zu-border)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-1 mb-1.5">
              E-Mail
            </label>
            <input
              type="email"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              required
              className="w-full px-4 py-3 bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
              style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--zu-border)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-1 mb-1.5">
              Passwort
            </label>
            <input
              type="password"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mind. 6 Zeichen"
              required
              minLength={6}
              className="w-full px-4 py-3 bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
              style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--zu-border)" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent text-white font-semibold hover:bg-accent-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderRadius: "var(--radius-btn)" }}
          >
            {loading ? "Wird registriert..." : "Registrieren"}
          </button>
        </form>

        <p className="text-center text-sm text-text-2 mt-6">
          Bereits ein Konto?{" "}
          <button
            onClick={onSwitchToLogin}
            className="text-accent font-semibold hover:underline"
          >
            Anmelden
          </button>
        </p>
      </div>
    </div>
  );
}