import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Link2 } from "lucide-react";
import { useAuth } from "./auth-context";

type Tab = "login" | "register";

// ── Google logo ───────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.532 24.552c0-1.636-.132-3.2-.384-4.704H24.48v8.896h12.984c-.56 2.992-2.248 5.528-4.784 7.224v6h7.744c4.528-4.168 7.108-10.312 7.108-17.416z" fill="#4285F4"/>
      <path d="M24.48 48c6.48 0 11.92-2.144 15.888-5.824l-7.744-6c-2.152 1.44-4.904 2.296-8.144 2.296-6.256 0-11.552-4.224-13.448-9.896H2.976v6.192C6.928 42.96 15.152 48 24.48 48z" fill="#34A853"/>
      <path d="M11.032 28.576A14.47 14.47 0 0 1 10.24 24c0-1.592.272-3.136.792-4.576v-6.192H2.976A24.008 24.008 0 0 0 .48 24c0 3.864.928 7.52 2.496 10.768l8.056-6.192z" fill="#FBBC05"/>
      <path d="M24.48 9.528c3.52 0 6.68 1.208 9.168 3.584l6.872-6.872C36.392 2.36 30.96 0 24.48 0 15.152 0 6.928 5.04 2.976 13.232l8.056 6.192c1.896-5.672 7.192-9.896 13.448-9.896z" fill="#EA4335"/>
    </svg>
  );
}

// ── Tuli Logo ─────────────────────────────────────────────────────
function TuliLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="72" rx="20" fill="var(--accent)"/>
      <path d="M36 16L56 33H50V56H40V44H32V56H22V33H16L36 16Z" fill="white" fillOpacity="0.95"/>
    </svg>
  );
}

// ── Password input ────────────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "search" : "password"}
        name={name}
        autoComplete="new-password"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Passwort eingeben"}
        className="w-full px-4 py-3.5 pr-12 text-sm bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
        style={{
          borderRadius: "var(--radius-input)",
          border: "1.5px solid var(--zu-border)",
          caretColor: "var(--accent)",
          fontSize: 15,
        }}
      />
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-text-3 hover:text-text-1 transition"
        style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────────
function TextInput({
  value,
  onChange,
  placeholder,
  name,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
        {label}
      </label>
      <input
        type="search"
        name={name}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3.5 text-sm bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
        style={{
          borderRadius: "var(--radius-input)",
          border: "1.5px solid var(--zu-border)",
          caretColor: "var(--accent)",
          fontSize: 15,
        }}
      />
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="err"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          style={{ overflow: "hidden" }}
        >
          <div
            className="text-sm px-4 py-3 font-medium"
            style={{
              background: "var(--danger-light)",
              color: "var(--danger)",
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Slide-in field (Name / Passwort bestätigen) ───────────────────
// Animates height + opacity when entering / leaving
function SlideField({
  visible,
  children,
  position,
}: {
  visible: boolean;
  children: React.ReactNode;
  /** "before" = gap goes below (Name, before Email), "after" = gap goes above */
  position: "before" | "after";
}) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          style={{ overflow: "hidden" }}
        >
          {/* Gap is baked into padding so it collapses with the field */}
          <div style={position === "before" ? { paddingBottom: 16 } : { paddingTop: 16 }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Unified auth form ─────────────────────────────────────────────
function AuthForm({ tab }: { tab: Tab }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const isRegister = tab === "register";

  // Shared state — persists across tab switches
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register-only state — reset when switching to login
  const [name, setName] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Clear register-only fields and error when switching tabs
  useEffect(() => {
    setError("");
    if (!isRegister) {
      setName("");
      setPasswordConfirm("");
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegister) {
      if (!name.trim()) { setError("Bitte gib deinen Namen ein."); return; }
      if (password !== passwordConfirm) { setError("Die Passwörter stimmen nicht überein."); return; }
      if (password.length < 6) { setError("Das Passwort muss mindestens 6 Zeichen haben."); return; }
      setLoading(true);
      try {
        await signUp(name.trim(), email, password);
      } catch (err: any) {
        console.log("Register error:", err);
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
          setError("Diese E-Mail-Adresse ist bereits registriert.");
        } else {
          setError(msg || "Registrierung fehlgeschlagen.");
        }
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await signIn(email, password);
      } catch (err: any) {
        console.log("Login error:", err);
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("invalid login credentials") || msg.toLowerCase().includes("email not confirmed")) {
          setError("E-Mail oder Passwort ist falsch.");
        } else {
          setError(msg || "Anmeldung fehlgeschlagen.");
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.log("Google error:", err);
      setError(err?.message || "Google-Anmeldung fehlgeschlagen.");
      setGoogleLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col" style={{ gap: 0 }}>
      <ErrorBanner message={error} />

      {/* ── Name (register only) — slides in above Email ── */}
      <SlideField visible={isRegister} position="before">
        <TextInput
          label="Name"
          name="tuli-name-reg"
          value={name}
          onChange={setName}
          placeholder="Wie heißt du?"
        />
      </SlideField>

      {/* ── Email (always) ── */}
      <div style={{ marginBottom: 16 }}>
        <TextInput
          label="E-Mail"
          name={isRegister ? "tuli-email-reg" : "tuli-email-login"}
          value={email}
          onChange={setEmail}
          placeholder="name@mail.com"
        />
      </div>

      {/* ── Password (always) ── */}
      <div style={{ marginBottom: 0 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            Passwort
          </label>
          <PasswordInput
            name={isRegister ? "tuli-pw-reg" : "tuli-pw-login"}
            value={password}
            onChange={setPassword}
            placeholder={isRegister ? "Mind. 6 Zeichen" : "Passwort eingeben"}
          />
        </div>
      </div>

      {/* ── Passwort bestätigen (register only) — slides in below Password ── */}
      <SlideField visible={isRegister} position="after">
        <div className="flex flex-col" style={{ gap: 6 }}>
          <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            Passwort bestätigen
          </label>
          <PasswordInput
            name="tuli-pw-confirm"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            placeholder="Passwort wiederholen"
          />
        </div>
      </SlideField>

      {/* ── Submit button (always, label changes) ── */}
      <button
        type="submit"
        disabled={loading}
        className="w-full font-semibold text-white transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        style={{
          background: "var(--accent)",
          borderRadius: "var(--radius-btn)",
          fontSize: 15,
          minHeight: 52,
          marginTop: 20,
        }}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {isRegister ? "Konto wird erstellt…" : "Wird angemeldet…"}
          </>
        ) : (
          isRegister ? "Registrieren" : "Anmelden"
        )}
      </button>

      {/* ── Google button (always, label changes) ── */}
      <button
        type="button"
        disabled={googleLoading}
        onClick={handleGoogle}
        className="w-full font-semibold transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2.5"
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--zu-border)",
          borderRadius: "var(--radius-btn)",
          color: "var(--text-1)",
          minHeight: 52,
          fontSize: 15,
          marginTop: 12,
        }}
      >
        {googleLoading
          ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
          : <GoogleIcon />}
        {isRegister ? "Mit Google registrieren" : "Mit Google anmelden"}
      </button>
    </form>
  );
}

// ── Main AuthScreen ───────────────────────────────────────────────
export function AuthScreen({ pendingInvite }: { pendingInvite?: boolean }) {
  const [tab, setTab] = useState<Tab>("login");

  return (
    <div
      className="flex flex-col font-sans"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        background: "var(--zu-bg)",
      }}
    >
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* ── Form container mit max-width für Desktop ── */}
      <div className="w-full mx-auto px-6 pt-12 pb-10" style={{ maxWidth: 440 }}>

        {/* ── Logo ── */}
        <div className="flex flex-col items-center" style={{ marginBottom: 36 }}>
          <TuliLogo size={72} />
          <h1
            className="font-bold mt-4"
            style={{
              fontSize: 32,
              color: "var(--text-1)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontFamily: "var(--font)",
            }}
          >
            Tuli
          </h1>
          <p
            className="mt-1.5 text-center"
            style={{ fontSize: 15, color: "var(--text-3)", fontFamily: "var(--font)" }}
          >
            Die App für Haushalt und Alltag
          </p>
        </div>

        {/* ── Pending invite notice ── */}
        {pendingInvite && (
          <div
            className="flex items-start gap-2.5 px-4 py-3"
            style={{
              background: "var(--accent-light)",
              borderRadius: 14,
              border: "1.5px solid var(--accent-mid)",
              marginBottom: 20,
            }}
          >
            <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--accent-dark)" }}>
              Du wurdest eingeladen! Melde dich an oder registriere dich, um dem Zuhause beizutreten.
            </p>
          </div>
        )}

        {/* ── Tab Switcher ── */}
        <div
          className="flex p-1"
          style={{ background: "var(--surface-2)", borderRadius: 999, marginBottom: 24 }}
        >
          {(["login", "register"] as Tab[]).map((t) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="relative flex-1 font-semibold transition-colors"
                style={{
                  borderRadius: 999,
                  fontSize: 14,
                  color: isActive ? "var(--text-1)" : "var(--text-3)",
                  zIndex: 1,
                  minHeight: 44,
                  padding: "10px 0",
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="auth-tab-pill"
                    className="absolute inset-0"
                    style={{
                      background: "var(--surface)",
                      borderRadius: 999,
                      boxShadow: "var(--shadow-card)",
                    }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
                <span className="relative z-10">
                  {t === "login" ? "Anmelden" : "Registrieren"}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Unified form — fields slide in/out, shared fields stay ── */}
        <AuthForm tab={tab} />
      </div>

      <div style={{ height: "env(safe-area-inset-bottom, 16px)" }} />
    </div>
  );
}