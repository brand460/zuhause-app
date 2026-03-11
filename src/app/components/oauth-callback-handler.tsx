import { useEffect, useState } from "react";
import { supabase } from "./supabase-client";
import { Loader2 } from "lucide-react";

/**
 * OAuth Callback Handler
 *
 * Handles OAuth redirects from providers (Google, etc.)
 * Exchanges the authorization code for a session and hard-redirects to /
 *
 * Key rules:
 * - `processing` is initialised to `true` ONLY when we are actually on the
 *   callback path / have a `code` param – avoids spurious loading flash on
 *   every other page load.
 * - We never call setProcessing(false) while still on the callback page; we
 *   always perform a hard redirect so the app re-boots with a clean URL.
 * - If the exchange fails (e.g. the code was already consumed by
 *   detectSessionInUrl), we check whether Supabase already has a session and
 *   redirect anyway.  This prevents a blank-screen when both paths race.
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

  useEffect(() => {
    // Not a callback page — nothing to do, children are already visible.
    if (!isCallbackPath) return;

    const handleOAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      console.log(
        "[OAuth] Verarbeite Callback, code vorhanden:",
        !!code
      );

      try {
        if (code) {
          // Attempt PKCE exchange.  This may fail if detectSessionInUrl already
          // consumed the code — that is fine; we fall through to the session
          // check below.
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.warn(
              "[OAuth] exchangeCodeForSession fehlgeschlagen (möglicherweise bereits verarbeitet):",
              exchangeError.message
            );
            // Don't give up yet — Supabase's detectSessionInUrl may have
            // already established the session.
          } else {
            console.log("[OAuth] Session erfolgreich ausgetauscht.");
          }
        }

        // Whether the exchange above succeeded or not, check for a live session.
        // detectSessionInUrl:true may have set it already.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          console.log(
            "[OAuth] Session vorhanden, erstelle Profil falls nötig und leite weiter."
          );

          // Create profile for first-time Google users if missing.
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

            console.log(
              "[OAuth] Neues Profil wird angelegt für:",
              displayName
            );

            const { error: profileError } = await supabase
              .from("profiles")
              .insert({ id: session.user.id, display_name: displayName });

            if (profileError) {
              console.error(
                "[OAuth] Profil-Fehler (nicht kritisch):",
                profileError.message
              );
            }
          }

          // Hard redirect — clean URL, force full auth-state re-init.
          window.location.replace("/");
          return;
        }

        // No session at all — show error briefly, then go to login.
        console.error("[OAuth] Kein Session-Objekt nach Austausch.");
        setErrorMsg(
          "Anmeldung fehlgeschlagen. Du wirst zur Anmeldeseite weitergeleitet…"
        );
        setTimeout(() => {
          window.location.replace("/");
        }, 2500);
      } catch (err) {
        console.error("[OAuth] Unerwarteter Fehler:", err);
        setErrorMsg("Ein unerwarteter Fehler ist aufgetreten.");
        setTimeout(() => {
          window.location.replace("/");
        }, 2500);
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