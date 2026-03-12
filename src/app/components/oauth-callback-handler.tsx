import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabase-client";
import { Loader2 } from "lucide-react";

/**
 * OAuth Callback Handler
 *
 * Handles OAuth redirects from providers (Google, etc.)
 * Exchanges the authorization code for a session and hard-redirects to /
 *
 * Key fixes:
 * - useRef guard prevents double execution (React StrictMode / HMR)
 * - exchangeCodeForSession is called exactly once
 * - Falls back to getSession() if exchange fails (detectSessionInUrl race)
 * - Detailed console logging for every step
 * - Env var presence check logged on startup
 */

// Detect once at module load so the initial useState value is synchronous.
const isCallbackPath =
  window.location.pathname === "/auth/callback" ||
  new URLSearchParams(window.location.search).has("code");

export function OAuthCallbackHandler({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start in "processing" state only when we are actually on the callback URL.
  const [processing, setProcessing] = useState(isCallbackPath);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    // Not a callback page — nothing to do, children are already visible.
    if (!isCallbackPath) return;

    // Guard: prevent double execution from StrictMode / HMR
    if (hasRun.current) {
      console.log("[OAuth] Callback bereits in Bearbeitung, überspringe doppelten Aufruf.");
      return;
    }
    hasRun.current = true;

    const handleOAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      console.log("[OAuth] === Callback-Verarbeitung gestartet ===");
      console.log("[OAuth] Pfad:", window.location.pathname);
      console.log("[OAuth] Code vorhanden:", !!code);
      console.log("[OAuth] Volle URL:", window.location.href);

      // Log env var presence (not values!) for debugging
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      console.log("[OAuth] VITE_SUPABASE_URL gesetzt:", !!supabaseUrl, supabaseUrl ? `(${supabaseUrl.substring(0, 30)}...)` : "(leer)");
      console.log("[OAuth] VITE_SUPABASE_ANON_KEY gesetzt:", !!supabaseAnonKey, supabaseAnonKey ? `(${supabaseAnonKey.substring(0, 10)}...)` : "(leer)");

      try {
        let exchangeSucceeded = false;

        if (code) {
          console.log("[OAuth] Starte exchangeCodeForSession...");
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.warn(
              "[OAuth] exchangeCodeForSession fehlgeschlagen:",
              exchangeError.message,
              "| Status:", (exchangeError as any).status,
              "| Code:", (exchangeError as any).code
            );
            // Don't give up — detectSessionInUrl may have already handled it.
          } else {
            exchangeSucceeded = true;
            console.log("[OAuth] exchangeCodeForSession erfolgreich.");
            console.log("[OAuth] User ID:", data?.session?.user?.id);
            console.log("[OAuth] Provider:", data?.session?.user?.app_metadata?.provider);
          }
        } else {
          console.log("[OAuth] Kein Code-Parameter vorhanden, prüfe bestehende Session...");
        }

        // Whether the exchange succeeded or not, always verify session state.
        console.log("[OAuth] Prüfe aktive Session via getSession()...");
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[OAuth] getSession() Fehler:", sessionError.message);
        }

        if (session) {
          console.log("[OAuth] ✓ Aktive Session gefunden!");
          console.log("[OAuth] User ID:", session.user.id);
          console.log("[OAuth] Email:", session.user.email);
          console.log("[OAuth] Provider:", session.user.app_metadata?.provider);
          console.log("[OAuth] Session gültig bis:", session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "unbekannt");

          // Create profile for first-time Google users if missing.
          try {
            const { data: existing } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", session.user.id)
              .maybeSingle();

            if (!existing) {
              const displayName =
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.name ||
                session.user.email?.split("@")[0] ||
                "Nutzer";
              const avatarUrl = session.user.user_metadata?.avatar_url || null;

              console.log("[OAuth] Neues Profil wird angelegt für:", displayName);

              const { error: profileError } = await supabase
                .from("profiles")
                .upsert(
                  {
                    id: session.user.id,
                    display_name: displayName,
                    avatar_url: avatarUrl,
                  },
                  { onConflict: "id" }
                );

              if (profileError) {
                console.error(
                  "[OAuth] Profil-Fehler (nicht kritisch):",
                  profileError.message
                );
              }
            } else {
              console.log("[OAuth] Profil existiert bereits.");
            }
          } catch (profileErr) {
            console.error("[OAuth] Profil-Check fehlgeschlagen (nicht kritisch):", profileErr);
          }

          // Wait briefly so Supabase can persist the session to localStorage
          // before the hard redirect re-initialises the app.
          console.log("[OAuth] Warte 500ms damit Session persistiert wird...");
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Hard redirect — use replace() so the callback URL is removed from history.
          console.log("[OAuth] Leite weiter zu / ...");
          window.location.replace("/");
          return;
        }

        // Exchange failed AND no session found — but let's try one more thing:
        // Wait briefly for detectSessionInUrl to finish (it runs async on init).
        if (!exchangeSucceeded) {
          console.log("[OAuth] Keine Session gefunden, warte 1.5s auf detectSessionInUrl...");
          await new Promise((r) => setTimeout(r, 1500));

          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            console.log("[OAuth] ✓ Session nach Wartezeit gefunden! Leite weiter...");
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.location.replace("/");
            return;
          }
          console.error("[OAuth] Auch nach Wartezeit keine Session vorhanden.");
        }

        // No session at all — show error briefly, then go to login.
        console.error("[OAuth] ✗ Kein Session-Objekt nach allen Versuchen.");
        console.error("[OAuth] Mögliche Ursachen:");
        console.error("[OAuth] - VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt in Vercel");
        console.error("[OAuth] - Redirect URL in Supabase Dashboard nicht auf /auth/callback gesetzt");
        console.error("[OAuth] - Google OAuth Provider nicht aktiviert im Supabase Dashboard");
        console.error("[OAuth] - Der Authorization Code ist abgelaufen");
        
        setErrorMsg(
          "Anmeldung fehlgeschlagen. Du wirst zur Anmeldeseite weitergeleitet…"
        );
        setTimeout(() => {
          window.location.replace("/");
        }, 3000);
      } catch (err: any) {
        console.error("[OAuth] ✗ Unerwarteter Fehler:", err);
        console.error("[OAuth] Fehler-Details:", err?.message, err?.stack);
        
        // Last resort: check if there's somehow a session despite the error
        try {
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          if (fallbackSession) {
            console.log("[OAuth] Session trotz Fehler vorhanden — leite weiter.");
            window.location.replace("/");
            return;
          }
        } catch (innerErr) {
          console.error("[OAuth] Auch Fallback-Session-Check fehlgeschlagen:", innerErr);
        }
        
        setErrorMsg("Ein unerwarteter Fehler ist aufgetreten.");
        setTimeout(() => {
          window.location.replace("/");
        }, 3000);
      }
    };

    handleOAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show loading / error screen while processing the callback.
  // We intentionally keep `processing = true` until the hard redirect so
  // children (AuthProvider / AppRouter) are NEVER rendered on the callback URL.
  if (processing) {
    return (
      <div
        className="flex flex-col items-center justify-center font-sans gap-3"
        style={{ height: "100dvh", background: "var(--zu-bg, #F7F7F5)" }}
      >
        {/* App icon */}
        <svg
          width="56"
          height="56"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="72" height="72" rx="20" fill="var(--accent, #6FBD85)" />
          <path
            d="M36 16L56 33H50V56H40V44H32V56H22V33H16L36 16Z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>

        {errorMsg ? (
          <p
            className="text-sm text-center px-6"
            style={{ color: "var(--text-2, #6b7280)" }}
          >
            {errorMsg}
          </p>
        ) : (
          <>
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--text-3, #9ca3af)" }}
            />
            <p
              className="text-sm"
              style={{ color: "var(--text-3, #9ca3af)" }}
            >
              Anmeldung wird abgeschlossen…
            </p>
          </>
        )}
      </div>
    );
  }

  // Non-callback path: render the app normally.
  return <>{children}</>;
}