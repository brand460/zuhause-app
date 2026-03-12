import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Link2,
  Copy,
  Share2,
  Check,
  Loader2,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase-client";

// ── Token extraction from a URL or raw token string ──────────────
function extractToken(input: string): string {
  try {
    const url = new URL(input);
    const fromSearch = url.searchParams.get("invite");
    if (fromSearch) return fromSearch.trim();
    // Try last path segment
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1].trim();
  } catch {
    // Not a URL — treat as raw token
  }
  return input.trim();
}

// ── Tuli logo (small) ────────────────────────────────────────────
function TuliLogoSmall() {
  return (
    <svg width="48" height="48" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="72" rx="20" fill="var(--accent)" />
      <path d="M36 16L56 33H50V56H40V44H32V56H22V33H16L36 16Z" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

// ── Avatar initials circle ────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm"
      style={{ background: "var(--accent)" }}
    >
      {initials}
    </div>
  );
}

// ── Shared input component ────────────────────────────────────────
function OInput({
  value,
  onChange,
  placeholder,
  name,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="search"
      name={name}
      autoComplete="off"
      autoCapitalize="sentences"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      inputMode="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full px-4 py-3.5 text-sm bg-surface-2 text-text-1 placeholder:text-text-3 focus:outline-none transition"
      style={{
        borderRadius: "var(--radius-input)",
        border: "1.5px solid var(--zu-border)",
        caretColor: "var(--accent)",
        fontSize: 15,
      }}
    />
  );
}

// ── Error banner ──────────────────────────────────────────────────
function ErrBanner({ message }: { message: string }) {
  return (
    <div
      className="text-sm px-4 py-3 font-medium"
      style={{ background: "var(--danger-light)", color: "var(--danger)", borderRadius: 12 }}
    >
      {message}
    </div>
  );
}

// ── Invite link display ───────────────────────────────────────────
function InviteLinkBox({
  link,
  onDone,
}: {
  link: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tuli Einladung",
          text: "Ich lade dich zu meinem Tuli-Zuhause ein!",
          url: link,
        });
      } catch {
        await handleCopy();
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          background: "var(--accent-light)",
          borderRadius: 14,
          border: "1.5px solid var(--accent-mid)",
        }}
      >
        <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
        <span
          className="flex-1 text-xs font-medium truncate"
          style={{ color: "var(--accent-dark)", fontFamily: "monospace" }}
        >
          {link}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-2 py-3 font-semibold text-sm transition active:scale-95"
          style={{
            background: copied ? "var(--accent-light)" : "var(--surface)",
            border: "1.5px solid var(--zu-border)",
            borderRadius: "var(--radius-btn)",
            color: copied ? "var(--accent)" : "var(--text-1)",
            minHeight: 48,
          }}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Kopiert!" : "Link kopieren"}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-3 font-semibold text-sm transition active:scale-95"
          style={{
            background: "var(--accent)",
            borderRadius: "var(--radius-btn)",
            color: "white",
            minHeight: 48,
          }}
        >
          <Share2 className="w-4 h-4" />
          Teilen
        </button>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full py-3 font-semibold text-sm transition active:scale-95"
        style={{
          background: "var(--surface-2)",
          borderRadius: "var(--radius-btn)",
          color: "var(--text-2)",
          minHeight: 48,
        }}
      >
        Fertig — zur App
      </button>
    </motion.div>
  );
}

// ── Main Onboarding Screen ────────────────────────────────────────
type Mode = "choice" | "create" | "create-done" | "join";

interface OnboardingScreenProps {
  /** If coming from a deep link, pre-fill the join tab with this token */
  pendingToken?: string | null;
}

export function OnboardingScreen({ pendingToken }: OnboardingScreenProps) {
  const { createHousehold, joinByToken, signOut, profile, refreshProfile } = useAuth();

  const [mode, setMode] = useState<Mode>(() => pendingToken ? "join" : "choice");
  const [householdName, setHouseholdName] = useState("");
  const [inviteInput, setInviteInput] = useState(pendingToken ?? "");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [joinPreview, setJoinPreview] = useState<{ household_name: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-validate invite link as user types
  useEffect(() => {
    if (mode !== "join") return;
    const token = extractToken(inviteInput);
    if (token.length < 8) {
      setJoinPreview(null);
      setError("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setValidating(true);
      try {
        // Read invite directly from KV — no server call, no JWT issues
        const { data: kvRow } = await supabase
          .from("kv_store_2a26506b")
          .select("value")
          .eq("key", `invite:${token}`)
          .maybeSingle();

        if (kvRow?.value) {
          const inv = kvRow.value as any;
          const expired = new Date(inv.expires_at) < new Date();
          const used = !!inv.used_by;
          if (!expired && !used) {
            setJoinPreview({ household_name: inv.household_name });
            setError("");
          } else {
            setJoinPreview(null);
            setError(used ? "Dieser Link wurde bereits verwendet." : "Dieser Einladungslink ist abgelaufen.");
          }
        } else {
          setJoinPreview(null);
          setError("Ungültiger Link.");
        }
      } catch {
        setJoinPreview(null);
      } finally {
        setValidating(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inviteInput, mode]);

  // ── Create Household ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!householdName.trim()) {
      setError("Bitte gib einen Namen ein.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { id: hhId } = await createHousehold(householdName.trim());

      // Generate invite link directly via KV — no server call, no JWT issues
      const invToken = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      await supabase
        .from("kv_store_2a26506b")
        .upsert({
          key: `invite:${invToken}`,
          value: {
            household_id: hhId,
            household_name: householdName.trim(),
            created_by: authUser?.id,
            created_at: new Date().toISOString(),
            expires_at: expiresAt,
            used_by: null,
          },
        });

      setInviteLink(`${window.location.origin}?invite=${invToken}`);
      setMode("create-done");
    } catch (err: any) {
      console.log("Create household error:", err);
      setError(err?.message || "Erstellen fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  // ── Join by invite ────────────────────────────────────────────
  const handleJoin = async () => {
    const token = extractToken(inviteInput);
    if (!token) {
      setError("Bitte füge einen Einladungslink ein.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await joinByToken(token);
      // refreshProfile already called inside joinByToken
    } catch (err: any) {
      console.log("Join error:", err);
      setError(err?.message || "Beitreten fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col font-sans"
      style={{
        minHeight: "100dvh",
        background: "var(--zu-bg)",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      <div className="w-full mx-auto flex flex-col px-6 pt-10 pb-10 gap-0" style={{ maxWidth: 440 }}>

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <TuliLogoSmall />
          <h1
            className="font-bold mt-3 text-text-1"
            style={{ fontSize: 24, letterSpacing: "-0.02em", fontFamily: "var(--font)" }}
          >
            Willkommen{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}!
          </h1>
          <p
            className="text-center mt-1"
            style={{ fontSize: 14, color: "var(--text-3)", fontFamily: "var(--font)" }}
          >
            Erstelle dein Zuhause oder tritt einem bei.
          </p>
        </div>

        {/* ── Choice mode ── */}
        <AnimatePresence mode="wait">
          {mode === "choice" && (
            <motion.div
              key="choice"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-3"
            >
              {/* Create option */}
              <button
                type="button"
                onClick={() => { setMode("create"); setError(""); }}
                className="w-full flex items-center gap-4 p-4 text-left transition active:scale-[0.98]"
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius-card)",
                  border: "1.5px solid var(--zu-border)",
                  boxShadow: "var(--shadow-card)",
                  minHeight: 76,
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--accent-light)" }}
                >
                  <Plus className="w-6 h-6" style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <p className="font-semibold text-text-1" style={{ fontSize: 15 }}>Zuhause erstellen</p>
                  <p className="text-text-3 text-sm mt-0.5">Neues Zuhause anlegen &amp; einladen</p>
                </div>
              </button>

              {/* Join option */}
              <button
                type="button"
                onClick={() => { setMode("join"); setError(""); }}
                className="w-full flex items-center gap-4 p-4 text-left transition active:scale-[0.98]"
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius-card)",
                  border: "1.5px solid var(--zu-border)",
                  boxShadow: "var(--shadow-card)",
                  minHeight: 76,
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--accent-light)" }}
                >
                  <Link2 className="w-6 h-6" style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <p className="font-semibold text-text-1" style={{ fontSize: 15 }}>Beitreten</p>
                  <p className="text-text-3 text-sm mt-0.5">Mit Einladungslink beitreten</p>
                </div>
              </button>

              <button
                type="button"
                onClick={signOut}
                className="w-full mt-2 flex items-center justify-center gap-1.5 text-sm transition py-2"
                style={{ color: "var(--text-3)" }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Abmelden
              </button>
            </motion.div>
          )}

          {/* ── Create mode ── */}
          {mode === "create" && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={() => { setMode("choice"); setError(""); }}
                className="flex items-center gap-1.5 text-sm mb-1 transition"
                style={{ color: "var(--text-3)" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Zurück
              </button>

              <div>
                <h2 className="font-bold text-text-1 mb-0.5" style={{ fontSize: 20 }}>
                  Zuhause erstellen
                </h2>
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  Wie heißt euer Zuhause?
                </p>
              </div>

              {error && <ErrBanner message={error} />}

              <OInput
                name="tuli-hh-name"
                value={householdName}
                onChange={setHouseholdName}
                placeholder="z.B. Familie Brand"
                autoFocus
              />

              <button
                type="button"
                disabled={loading || !householdName.trim()}
                onClick={handleCreate}
                className="w-full py-3.5 font-semibold text-white transition active:scale-95 disabled:opacity-40"
                style={{
                  background: "var(--accent)",
                  borderRadius: "var(--radius-btn)",
                  fontSize: 15,
                  minHeight: 52,
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Wird erstellt…
                  </span>
                ) : (
                  "Erstellen"
                )}
              </button>
            </motion.div>
          )}

          {/* ── Create done — show invite link ── */}
          {mode === "create-done" && (
            <motion.div
              key="create-done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              <div
                className="flex flex-col items-center py-4"
                style={{ textAlign: "center" }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: "var(--accent-light)" }}
                >
                  <Check className="w-7 h-7" style={{ color: "var(--accent)" }} />
                </div>
                <h2 className="font-bold text-text-1" style={{ fontSize: 20 }}>
                  Zuhause erstellt! 🎉
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
                  Lade jetzt andere Mitglieder ein.
                </p>
              </div>

              <InviteLinkBox
                link={inviteLink}
                onDone={() => refreshProfile()}
              />
            </motion.div>
          )}

          {/* ── Join mode ── */}
          {mode === "join" && (
            <motion.div
              key="join"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={() => { setMode("choice"); setError(""); setInviteInput(""); setJoinPreview(null); }}
                className="flex items-center gap-1.5 text-sm mb-1 transition"
                style={{ color: "var(--text-3)" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Zurück
              </button>

              <div>
                <h2 className="font-bold text-text-1 mb-0.5" style={{ fontSize: 20 }}>
                  Beitreten
                </h2>
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  Füge den Einladungslink ein.
                </p>
              </div>

              {error && <ErrBanner message={error} />}

              <div className="relative">
                <OInput
                  name="tuli-invite-link"
                  value={inviteInput}
                  onChange={(v) => { setInviteInput(v); setError(""); }}
                  placeholder="Einladungslink einfügen…"
                  autoFocus
                />
                {validating && (
                  <Loader2
                    className="w-4 h-4 animate-spin absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-3)" }}
                  />
                )}
              </div>

              {/* Preview if valid */}
              <AnimatePresence>
                {joinPreview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      background: "var(--accent-light)",
                      borderRadius: 14,
                      border: "1.5px solid var(--accent-mid)",
                    }}
                  >
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--accent-dark)" }}>
                      Einladung für „{joinPreview.household_name}" gefunden
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                disabled={loading || !inviteInput.trim()}
                onClick={handleJoin}
                className="w-full py-3.5 font-semibold text-white transition active:scale-95 disabled:opacity-40"
                style={{
                  background: "var(--accent)",
                  borderRadius: "var(--radius-btn)",
                  fontSize: 15,
                  minHeight: 52,
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Beitreten…
                  </span>
                ) : (
                  "Beitreten"
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ height: "env(safe-area-inset-bottom, 16px)" }} />
    </div>
  );
}