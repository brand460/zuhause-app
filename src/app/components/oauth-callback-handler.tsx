import { useEffect, useState } from "react";
import { supabase } from "./supabase-client";
import { Loader2 } from "lucide-react";

/**
 * OAuth Callback Handler
 * 
 * Handles OAuth redirects from providers (Google, etc.)
 * Exchanges the authorization code for a session
 */
export function OAuthCallbackHandler({ children }: { children: React.ReactNode }) {
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Check if we're on the callback path or have OAuth params
        const isCallbackPath = window.location.pathname === "/auth/callback";
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        
        // Only process if we're on callback path or have a code
        if (!isCallbackPath && !code) {
          setProcessing(false);
          return;
        }

        console.log("[OAuth] Processing callback with code:", code?.substring(0, 10) + "...");

        // Exchange the code for a session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code || "");

        if (exchangeError) {
          console.error("[OAuth] Exchange error:", exchangeError);
          setError(exchangeError.message);
          setProcessing(false);
          
          // Redirect to root after error
          setTimeout(() => {
            window.location.href = "/";
          }, 2000);
          return;
        }

        if (data?.session) {
          console.log("[OAuth] Session established successfully for user:", data.user?.email);
          
          // Check if this is a new user (no profile yet)
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", data.user.id)
            .maybeSingle();

          // Create profile if it doesn't exist (for Google OAuth first-time users)
          if (!existingProfile && data.user) {
            const displayName = data.user.user_metadata?.full_name || 
                               data.user.user_metadata?.name || 
                               data.user.email?.split("@")[0] || 
                               "Nutzer";

            console.log("[OAuth] Creating profile for new user:", displayName);

            const { error: profileError } = await supabase
              .from("profiles")
              .insert({ 
                id: data.user.id, 
                display_name: displayName 
              });

            if (profileError) {
              console.error("[OAuth] Profile creation error:", profileError);
              // Don't fail the whole flow, profile can be created later
            }
          }

          // Clean URL and redirect to root
          window.history.replaceState({}, "", "/");
          
          // Force reload to trigger auth state change
          window.location.href = "/";
        } else {
          console.warn("[OAuth] No session returned from exchange");
          setProcessing(false);
        }
      } catch (err) {
        console.error("[OAuth] Unexpected error:", err);
        setError("Ein unerwarteter Fehler ist aufgetreten.");
        setProcessing(false);
        
        // Redirect to root after error
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      }
    };

    handleOAuthCallback();
  }, []);

  // Show loading state while processing OAuth callback
  if (processing) {
    return (
      <div
        className="flex flex-col items-center justify-center font-sans"
        style={{ height: "100dvh", background: "var(--zu-bg)" }}
      >
        <svg
          width="56" height="56" viewBox="0 0 72 72"
          fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ marginBottom: 16 }}
        >
          <rect width="72" height="72" rx="20" fill="var(--accent)" />
          <path d="M36 16L56 33H50V56H40V44H32V56H22V33H16L36 16Z" fill="white" fillOpacity="0.95" />
        </svg>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-3)", marginBottom: 8 }} />
        <p className="text-sm" style={{ color: "var(--text-3)" }}>
          {error || "Anmeldung wird abgeschlossen..."}
        </p>
      </div>
    );
  }

  // Render children once OAuth processing is complete
  return <>{children}</>;
}
