import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Loader2,
  KeyRound,
  Trash2,
  Eye,
  EyeOff,
  Mail,
  LogOut,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./auth-context";
import { supabase, apiFetch } from "./supabase-client";

// ── Design helpers ────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      className="px-4 pb-1 pt-5"
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-3)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {title}
    </div>
  );
}

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

function Divider() {
  return <div style={{ height: 1, background: "var(--zu-border)", marginLeft: 16, marginRight: 16 }} />;
}

// ── Avatar Upload ─────────────────────────────────────────────────

/** Komprimiert ein File auf max 400×400px und max 200 KB als JPEG Blob. */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Qualität iterativ reduzieren bis < 200 KB
      const tryBlob = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("canvas.toBlob failed")); return; }
            if (blob.size <= 200 * 1024 || quality <= 0.3) {
              resolve(blob);
            } else {
              tryBlob(Math.max(quality - 0.1, 0.3));
            }
          },
          "image/jpeg",
          quality
        );
      };
      tryBlob(0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Bild konnte nicht geladen werden")); };
    img.src = objectUrl;
  });
}

function AvatarUpload({
  name,
  avatarUrl,
  userId,
  onUploaded,
}: {
  name: string;
  avatarUrl?: string | null;
  userId: string;
  onUploaded: () => Promise<void>;
}) {
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Lokale Preview-URL damit der neue Avatar sofort sichtbar ist
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const displayUrl = localUrl || (imgError ? null : avatarUrl);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input damit dasselbe Bild erneut gewählt werden kann
    e.target.value = "";

    setUploading(true);
    try {
      const blob = await compressImage(file);
      const fileName = `${userId}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
      // Cache-Buster damit der Browser das neue Bild lädt
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (dbError) throw new Error(`Profil-Update fehlgeschlagen: ${dbError.message}`);

      setLocalUrl(publicUrl);
      setImgError(false);
      await onUploaded();
      toast.success("Profilbild aktualisiert ✅");
    } catch (err: any) {
      console.log("[AvatarUpload] Fehler:", err);
      toast.error("Upload fehlgeschlagen — bitte nochmal versuchen");
    } finally {
      setUploading(false);
    }
  }, [userId, onUploaded]);

  return (
    <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Avatar */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        className="w-full h-full rounded-full overflow-hidden flex items-center justify-center font-bold text-white relative"
        style={{
          background: displayUrl ? "transparent" : "var(--accent)",
          fontSize: 28,
          letterSpacing: "0.02em",
          WebkitTouchCallout: "none",
        }}
        aria-label="Profilbild ändern"
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials || "?"
        )}

        {/* Dimming overlay während Upload */}
        {uploading && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </button>

      {/* Kamera-Badge */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        className="absolute bottom-0 right-0 flex items-center justify-center rounded-full shadow-md transition active:scale-90"
        style={{
          width: 26,
          height: 26,
          background: "var(--surface)",
          border: "2px solid var(--zu-bg)",
          WebkitTouchCallout: "none",
        }}
        aria-hidden="true"
        tabIndex={-1}
      >
        <Camera className="w-3.5 h-3.5" style={{ color: "var(--text-2)" }} />
      </button>
    </div>
  );
}

// ── Password field ────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
        {label}
      </span>
      <div
        className="flex items-center gap-2 px-3"
        style={{
          background: "var(--surface-2)",
          borderRadius: 10,
          border: "1.5px solid var(--zu-border)",
          caretColor: "var(--accent)",
        }}
      >
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className="flex-1 py-2.5 text-sm text-text-1 bg-transparent focus:outline-none"
          style={{ caretColor: "var(--accent)" }}
        />
        <button
          type="button"
          onClick={() => setShow((p) => !p)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center"
        >
          {show ? (
            <EyeOff className="w-4 h-4" style={{ color: "var(--text-3)" }} />
          ) : (
            <Eye className="w-4 h-4" style={{ color: "var(--text-3)" }} />
          )}
        </button>
      </div>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────

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
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-[320px] mx-4 p-6"
        style={{
          background: "var(--surface)",
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
            className="flex-1 py-2.5 text-text-1 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            style={{ background: "var(--surface-2)", borderRadius: "var(--radius-btn)" }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-white text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            style={{
              background: danger ? "var(--danger)" : "var(--accent)",
              borderRadius: "var(--radius-btn)",
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main ProfilScreen ─────────────────────────────────────────────

interface ProfilScreenProps {
  onClose: () => void;
}

export function ProfilScreen({ onClose }: ProfilScreenProps) {
  const { user, profile, refreshProfile, signOut } = useAuth();

  // Check if user signed in via OAuth (no password change possible)
  const isOAuth =
    (user?.app_metadata?.provider && user.app_metadata.provider !== "email") ||
    (user?.identities?.some((i: any) => i.provider !== "email") ?? false);

  // ── Display name editing ──────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profile?.display_name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || !user) return;
    setNameSaving(true);
    setNameError("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);

      if (error) throw new Error(`Umbenennen fehlgeschlagen: ${error.message}`);

      await refreshProfile();
      setEditingName(false);
    } catch (err: any) {
      console.log("saveName error:", err);
      setNameError(err?.message || "Umbenennen fehlgeschlagen.");
    } finally {
      setNameSaving(false);
    }
  };

  // ── Password change ───────────────────────────────────────────
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async () => {
    setPwError("");
    if (!pwNew.trim()) { setPwError("Neues Passwort darf nicht leer sein."); return; }
    if (pwNew.length < 6) { setPwError("Passwort muss mindestens 6 Zeichen lang sein."); return; }
    if (pwNew !== pwConfirm) { setPwError("Passwörter stimmen nicht überein."); return; }

    setPwSaving(true);
    try {
      // Re-authenticate first using current password
      if (pwCurrent) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: user!.email!,
          password: pwCurrent,
        });
        if (signInErr) throw new Error("Aktuelles Passwort ist falsch.");
      }

      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw new Error(`Passwort konnte nicht geändert werden: ${error.message}`);

      setPwSuccess(true);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setTimeout(() => {
        setPwSuccess(false);
        setShowPasswordForm(false);
      }, 2000);
    } catch (err: any) {
      console.log("changePassword error:", err);
      setPwError(err?.message || "Passwort konnte nicht geändert werden.");
    } finally {
      setPwSaving(false);
    }
  };

  // ── Account deletion ──────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await apiFetch("/delete-account", { method: "DELETE" });
      await signOut();
    } catch (err: any) {
      console.log("deleteAccount error:", err);
      setDeleteError(err?.message || "Konto konnte nicht gelöscht werden.");
      setDeleteLoading(false);
      setConfirmDelete(false);
    }
  };

  // ── Sign out ──────────────────────────────────────────────────
  const [confirmSignOut, setConfirmSignOut] = useState(false);

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
          Profil & Konto
        </h1>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pb-8" style={{ overscrollBehavior: "contain" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>

        {/* ── Avatar hero ── */}
        <div className="flex flex-col items-center pt-6 pb-2">
          <AvatarUpload
            name={profile?.display_name || user?.email?.split("@")[0] || "?"}
            avatarUrl={profile?.avatar_url}
            userId={user!.id}
            onUploaded={refreshProfile}
          />
          
          {isOAuth && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>
              Angemeldet mit Google
            </p>
          )}
        </div>

        {/* ── Anzeigename ── */}
        <SectionHeader title="Anzeigename" />
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            {editingName ? (
              <>
                <input
                  type="search"
                  autoComplete="off"
                  autoCapitalize="sentences"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  autoFocus
                  className="flex-1 bg-surface-2 px-3 py-2 text-text-1 focus:outline-none text-sm"
                  style={{
                    borderRadius: 10,
                    border: "1.5px solid var(--accent-mid)",
                    caretColor: "var(--accent)",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameValue(profile?.display_name ?? "");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={nameSaving}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90"
                  style={{ background: "var(--accent)" }}
                >
                  {nameSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameValue(profile?.display_name ?? "");
                    setNameError("");
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90 bg-surface-2"
                >
                  <X className="w-4 h-4 text-text-2" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-text-1" style={{ fontSize: 15 }}>
                  {profile?.display_name || "–"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(true);
                    setNameValue(profile?.display_name ?? "");
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition active:scale-90 bg-surface-2"
                >
                  <Pencil className="w-3.5 h-3.5 text-text-2" />
                </button>
              </>
            )}
          </div>
          {nameError && (
            <div className="px-4 pb-3 text-xs" style={{ color: "var(--danger)" }}>
              {nameError}
            </div>
          )}
        </Card>

        {/* ── E-Mail ── */}
        <SectionHeader title="E-Mail" />
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--surface-2)" }}
            >
              <Mail className="w-[18px] h-[18px] text-accent" />
            </div>
            <span className="flex-1 text-sm text-text-1 truncate">{user?.email || "–"}</span>
          </div>
        </Card>

        {/* ── Passwort (nur für E-Mail-Nutzer) ── */}
        {!isOAuth && (
          <>
            <SectionHeader title="Sicherheit" />
            <Card>
              {!showPasswordForm ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-surface-2"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <KeyRound className="w-[18px] h-[18px] text-accent" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-text-1">
                    Passwort ändern
                  </span>
                </button>
              ) : (
                <div className="px-4 py-4 flex flex-col gap-3">
                  {pwSuccess ? (
                    <div
                      className="flex items-center gap-2 py-3 px-4 rounded-xl"
                      style={{ background: "var(--accent-light)" }}
                    >
                      <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--accent-dark)" }}>
                        Passwort erfolgreich geändert!
                      </span>
                    </div>
                  ) : (
                    <>
                      <PasswordField
                        label="Aktuelles Passwort"
                        value={pwCurrent}
                        onChange={setPwCurrent}
                        placeholder="••••••••"
                      />
                      <PasswordField
                        label="Neues Passwort"
                        value={pwNew}
                        onChange={setPwNew}
                        placeholder="Mindestens 6 Zeichen"
                      />
                      <PasswordField
                        label="Neues Passwort wiederholen"
                        value={pwConfirm}
                        onChange={setPwConfirm}
                        placeholder="••••••••"
                      />

                      {pwError && (
                        <p className="text-xs" style={{ color: "var(--danger)" }}>
                          {pwError}
                        </p>
                      )}

                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordForm(false);
                            setPwCurrent("");
                            setPwNew("");
                            setPwConfirm("");
                            setPwError("");
                          }}
                          className="flex-1 py-2.5 text-sm font-semibold transition active:scale-95"
                          style={{
                            background: "var(--surface-2)",
                            borderRadius: "var(--radius-btn)",
                            color: "var(--text-1)",
                            minHeight: 44,
                          }}
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={pwSaving}
                          className="flex-1 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                          style={{
                            background: "var(--accent)",
                            borderRadius: "var(--radius-btn)",
                            minHeight: 44,
                          }}
                        >
                          {pwSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                          ) : (
                            "Speichern"
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ── Abmelden & Löschen ── */}
        <SectionHeader title="Konto" />
        <Card>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-surface-2"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--surface-2)" }}
            >
              <LogOut className="w-[18px] h-[18px] text-accent" />
            </div>
            <span className="flex-1 text-sm font-medium text-text-1">Abmelden</span>
          </button>

          <Divider />

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-surface-2"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--danger-light)" }}
            >
              <Trash2 className="w-[18px] h-[18px]" style={{ color: "var(--danger)" }} />
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: "var(--danger)" }}>
                Konto löschen
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                Löscht dein Konto unwiderruflich
              </p>
            </div>
          </button>

          {deleteError && (
            <div className="px-4 pb-3 text-sm" style={{ color: "var(--danger)" }}>
              {deleteError}
            </div>
          )}
        </Card>

        <div style={{ height: "env(safe-area-inset-bottom, 24px)" }} />
        </div>
      </div>

      {/* ── Confirm: Sign out ── */}
      <AnimatePresence>
        {confirmSignOut && (
          <ConfirmDialog
            title="Abmelden?"
            description="Du wirst aus deinem Konto abgemeldet."
            confirmLabel="Abmelden"
            loading={false}
            onConfirm={async () => {
              setConfirmSignOut(false);
              await signOut();
            }}
            onCancel={() => setConfirmSignOut(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Confirm: Delete account ── */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            title="Konto löschen?"
            description="Dein Konto und alle persönlichen Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
            confirmLabel="Endgültig löschen"
            danger
            loading={deleteLoading}
            onConfirm={handleDeleteAccount}
            onCancel={() => {
              setConfirmDelete(false);
              setDeleteError("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}