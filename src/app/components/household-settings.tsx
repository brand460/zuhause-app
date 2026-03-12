import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Link2,
  Copy,
  Share2,
  LogOut,
  Trash2,
  Loader2,
  Crown,
  User,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase-client";

// ── Types ─────────────────────────────────────────────────────────
interface Member {
  user_id: string;
  role: string;
  display_name: string;
  avatar_url?: string | null;
  is_me: boolean;
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="rounded-full flex-shrink-0 object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }

  const initials = name
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: "var(--accent)",
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div
      className="px-4 pb-1 pt-5"
      style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}
    >
      {title}
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-4 overflow-hidden"
      style={{
        background: "var(--surface)",
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--zu-border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: "var(--zu-border)", marginLeft: 56 }} />;
}

// ── Main HouseholdSettings ────────────────────────────────────────
interface HouseholdSettingsProps {
  onClose: () => void;
}

export function HouseholdSettings({ onClose }: HouseholdSettingsProps) {
  const { household, user, refreshProfile, signOut } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string>("member");
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(household?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Invite link
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [copied, setCopied] = useState(false);

  // Confirm dialogs
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const isOwner = myRole === "admin";

  // ── Load members — direct Supabase calls, JWT auto-managed ────
  const loadMembers = useCallback(async () => {
    if (!household || !user) return;
    setMembersLoading(true);
    setMembersError("");
    try {
      // 1. Load members (no join — Supabase schema cache has no direct relationship)
      const { data: memberRows, error: memberErr } = await supabase
        .from("household_members")
        .select("user_id, role, joined_at")
        .eq("household_id", household.id);

      if (memberErr) {
        console.log("loadMembers: household_members error:", memberErr.message);
        throw new Error(`Mitglieder konnten nicht geladen werden: ${memberErr.message}`);
      }

      // 2. Load profiles for those user IDs
      const userIds = (memberRows || []).map((m: any) => m.user_id);
      const { data: profileRows, error: profileErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      if (profileErr) {
        console.log("loadMembers: profiles error:", profileErr.message);
        // Non-fatal — continue with partial data
      }

      // 3. Merge
      const profileMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

      const mapped: Member[] = (memberRows || []).map((r: any) => {
        const profile = profileMap.get(r.user_id);
        return {
          user_id: r.user_id,
          role: r.role,
          display_name: profile?.display_name || "Unbekannt",
          avatar_url: profile?.avatar_url || null,
          is_me: r.user_id === user.id,
        };
      });

      setMembers(mapped);

      const me = mapped.find(m => m.is_me);
      setMyRole(me?.role || "member");
    } catch (err: any) {
      console.log("loadMembers error:", err);
      setMembersError(err?.message || "Fehler beim Laden der Mitglieder.");
    } finally {
      setMembersLoading(false);
    }
  }, [household, user]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // ── Save household name — direct Supabase call ────────────────
  const saveName = async () => {
    if (!nameValue.trim() || !household) return;
    setNameSaving(true);
    setNameError("");
    try {
      const { error } = await supabase
        .from("households")
        .update({ name: nameValue.trim() })
        .eq("id", household.id);

      if (error) {
        console.log("saveName error:", error.message);
        throw new Error(`Umbenennen fehlgeschlagen: ${error.message}`);
      }

      await refreshProfile();
      setEditingName(false);
    } catch (err: any) {
      console.log("Rename error:", err);
      setNameError(err?.message || "Umbenennen fehlgeschlagen.");
    } finally {
      setNameSaving(false);
    }
  };

  // ── Generate invite link — direct KV write, no server needed ──────
  const generateInvite = async () => {
    if (!household || !user) return;
    setInviteLoading(true);
    setInviteError("");
    setCopied(false);
    try {
      const token = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("kv_store_2a26506b")
        .upsert({
          key: `invite:${token}`,
          value: {
            household_id: household.id,
            household_name: household.name,
            created_by: user.id,
            created_at: new Date().toISOString(),
            expires_at: expiresAt,
            used_by: null,
          },
        });

      if (error) throw new Error(`Einladungslink konnte nicht erstellt werden: ${error.message}`);

      setInviteLink(`${window.location.origin}?invite=${token}`);
    } catch (err: any) {
      console.log("Generate invite error:", err);
      setInviteError(err?.message || "Link-Generierung fehlgeschlagen.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleShare = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tuli Einladung",
          text: "Ich lade dich zu meinem Tuli-Zuhause ein!",
          url: inviteLink,
        });
      } catch {
        await handleCopy();
      }
    } else {
      await handleCopy();
    }
  };

  // ── Leave household — direct Supabase call ────────────────────
  const handleLeave = async () => {
    if (!household || !user) return;
    setActionLoading(true);
    setActionError("");
    try {
      const { error } = await supabase
        .from("household_members")
        .delete()
        .eq("household_id", household.id)
        .eq("user_id", user.id);

      if (error) {
        console.log("handleLeave error:", error.message);
        throw new Error(`Verlassen fehlgeschlagen: ${error.message}`);
      }

      await refreshProfile();
    } catch (err: any) {
      console.log("Leave error:", err);
      setActionError(err?.message || "Verlassen fehlgeschlagen.");
      setActionLoading(false);
      setConfirmLeave(false);
    }
  };

  // ── Delete household — direct Supabase calls ──────────────────
  const handleDelete = async () => {
    if (!household) return;
    setActionLoading(true);
    setActionError("");
    try {
      // 1. Remove all members first
      const { error: membersErr } = await supabase
        .from("household_members")
        .delete()
        .eq("household_id", household.id);

      if (membersErr) {
        console.log("handleDelete: members delete error:", membersErr.message);
        throw new Error(`Mitglieder konnten nicht entfernt werden: ${membersErr.message}`);
      }

      // 2. Delete the household itself
      const { error: hhErr } = await supabase
        .from("households")
        .delete()
        .eq("id", household.id);

      if (hhErr) {
        console.log("handleDelete: household delete error:", hhErr.message);
        throw new Error(`Haushalt konnte nicht gelöscht werden: ${hhErr.message}`);
      }

      await refreshProfile();
    } catch (err: any) {
      console.log("Delete error:", err);
      setActionError(err?.message || "Löschen fehlgeschlagen.");
      setActionLoading(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="flex flex-col font-sans"
      style={{ height: "100dvh", background: "var(--zu-bg)", position: "relative" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: 12,
          background: "var(--zu-bg)",
          borderBottom: "1px solid var(--zu-border)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition active:bg-surface-2"
        >
          <ArrowLeft className="w-5 h-5 text-text-1" />
        </button>
        <h1 className="flex-1 font-bold text-text-1" style={{ fontSize: 17 }}>
          Zuhause verwalten
        </h1>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pb-8" style={{ overscrollBehavior: "contain" }}>

        {/* ── Household name ── */}
        <SectionHeader title="Name" />
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            {editingName ? (
              <>
                <input
                  type="search"
                  name="tuli-hh-rename"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  inputMode="text"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  autoFocus
                  className="flex-1 bg-surface-2 px-3 py-2 text-text-1 focus:outline-none text-sm"
                  style={{
                    borderRadius: 10,
                    border: "1.5px solid var(--accent-mid)",
                    caretColor: "var(--accent)",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") { setEditingName(false); setNameValue(household?.name ?? ""); }
                  }}
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={nameSaving}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90"
                  style={{ background: "var(--accent)" }}
                >
                  {nameSaving
                    ? <Loader2 className="w-4 h-4 animate-spin text-white" />
                    : <Check className="w-4 h-4 text-white" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingName(false); setNameValue(household?.name ?? ""); setNameError(""); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90 bg-surface-2"
                >
                  <X className="w-4 h-4 text-text-2" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-text-1" style={{ fontSize: 15 }}>
                  {household?.name || "–"}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => { setEditingName(true); setNameValue(household?.name ?? ""); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90 bg-surface-2"
                  >
                    <Pencil className="w-3.5 h-3.5 text-text-2" />
                  </button>
                )}
              </>
            )}
          </div>
          {nameError && (
            <div className="px-4 pb-3 text-xs" style={{ color: "var(--danger)" }}>{nameError}</div>
          )}
        </Card>

        {/* ── Members ── */}
        <SectionHeader title="Mitglieder" />
        <Card>
          {membersLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-3)" }} />
            </div>
          ) : membersError ? (
            <div className="px-4 py-4 flex items-center gap-3">
              <span className="text-sm flex-1" style={{ color: "var(--danger)" }}>{membersError}</span>
              <button
                type="button"
                onClick={loadMembers}
                className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center"
              >
                <RefreshCw className="w-3.5 h-3.5 text-text-2" />
              </button>
            </div>
          ) : members.length === 0 ? (
            <div className="px-4 py-4 text-sm" style={{ color: "var(--text-3)" }}>
              Keine Mitglieder gefunden.
            </div>
          ) : (
            members.map((m, idx) => (
              <div key={m.user_id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={38} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-1 text-sm truncate">
                      {m.display_name}{m.is_me ? " (du)" : ""}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                      {m.role === "admin" ? "Inhaber" : "Mitglied"}
                    </p>
                  </div>
                  {m.role === "admin" ? (
                    <Crown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                  ) : (
                    <User className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-3)" }} />
                  )}
                </div>
                {idx < members.length - 1 && <Divider />}
              </div>
            ))
          )}
        </Card>

        {/* ── Invite link ── */}
        <SectionHeader title="Einladen" />
        <Card>
          <div className="px-4 py-3.5 flex flex-col gap-3">
            {inviteError && (
              <div className="text-xs" style={{ color: "var(--danger)" }}>{inviteError}</div>
            )}

            {inviteLink ? (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-2.5"
                  style={{
                    background: "var(--accent-light)",
                    borderRadius: 10,
                    border: "1.5px solid var(--accent-mid)",
                  }}
                >
                  <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--accent)" }} />
                  <span
                    className="flex-1 text-xs truncate font-medium"
                    style={{ color: "var(--accent-dark)", fontFamily: "monospace" }}
                  >
                    {inviteLink}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition active:scale-95"
                    style={{
                      background: copied ? "var(--accent-light)" : "var(--surface-2)",
                      borderRadius: 10,
                      color: copied ? "var(--accent)" : "var(--text-1)",
                      minHeight: 44,
                    }}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Kopiert!" : "Kopieren"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                    style={{ background: "var(--accent)", borderRadius: 10, minHeight: 44 }}
                  >
                    <Share2 className="w-4 h-4" />
                    Teilen
                  </button>
                </div>
                <button
                  type="button"
                  onClick={generateInvite}
                  className="text-xs text-center transition"
                  style={{ color: "var(--text-3)" }}
                >
                  Neuen Link generieren
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={generateInvite}
                disabled={inviteLoading}
                className="flex items-center justify-center gap-2 py-3 font-semibold text-sm transition active:scale-95"
                style={{
                  background: "var(--accent-light)",
                  borderRadius: 10,
                  color: "var(--accent)",
                  minHeight: 48,
                }}
              >
                {inviteLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Link2 className="w-4 h-4" />}
                Einladungslink generieren
              </button>
            )}
            <p className="text-xs text-center" style={{ color: "var(--text-3)" }}>
              Links sind 7 Tage gültig und können einmal verwendet werden.
            </p>
          </div>
        </Card>

        {/* ── Danger zone ── */}
        <SectionHeader title="Gefahr" />
        <Card>
          {actionError && (
            <div className="px-4 pt-3 text-sm" style={{ color: "var(--danger)" }}>{actionError}</div>
          )}
          {isOwner ? (
            /* Owner: delete */
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-surface-2"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--danger-light)" }}>
                <Trash2 className="w-[18px] h-[18px]" style={{ color: "var(--danger)" }} />
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: "var(--danger)" }}>Zuhause löschen</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>Löscht den Haushalt für alle Mitglieder</p>
              </div>
            </button>
          ) : (
            /* Member: leave */
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-surface-2"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--danger-light)" }}>
                <LogOut className="w-[18px] h-[18px]" style={{ color: "var(--danger)" }} />
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: "var(--danger)" }}>Zuhause verlassen</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>Du verlässt diesen Haushalt</p>
              </div>
            </button>
          )}
        </Card>

        <div style={{ height: "env(safe-area-inset-bottom, 24px)" }} />
      </div>

      {/* ── Confirm: Leave ── */}
      <AnimatePresence>
        {confirmLeave && (
          <ConfirmDialog
            title="Zuhause verlassen?"
            description="Du verlässt diesen Haushalt und musst erneut eingeladen werden."
            confirmLabel="Verlassen"
            danger
            loading={actionLoading}
            onConfirm={handleLeave}
            onCancel={() => setConfirmLeave(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Confirm: Delete ── */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            title="Zuhause löschen?"
            description="Alle Mitglieder verlieren den Zugang. Diese Aktion kann nicht rückgängig gemacht werden."
            confirmLabel="Endgültig löschen"
            danger
            loading={actionLoading}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-surface w-[320px] mx-4 p-6"
        style={{
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-elevated)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text-1 text-center">{title}</h3>
        <p className="text-sm text-center mt-2" style={{ color: "var(--text-3)" }}>
          {description}
        </p>
        <div className="flex justify-center gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-1 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-full text-white text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${danger ? "bg-danger" : "bg-accent"}`}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}