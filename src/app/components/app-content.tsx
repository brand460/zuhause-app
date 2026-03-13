import React, { useState } from "react";
import { AuthProvider, useAuth } from "./auth-context";
import { AuthScreen } from "./auth-screen";
import { OnboardingScreen } from "./onboarding-screen";
import { MainShell } from "./main-shell";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabase-client";
import { OAuthCallbackHandler } from "./oauth-callback-handler";

// ── Extract deep-link invite token from URL on app load ─────────
function extractInviteFromUrl(): string | null {
  try {
    // Don't extract invite if we're processing OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) {
      // OAuth callback in progress, skip invite extraction
      return null;
    }

    const token = params.get("invite");
    if (token) {
      // Clean the token from the URL without a page reload
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", clean);
      return token.trim();
    }
    // Also support path format /invite/TOKEN
    const pathMatch = window.location.pathname.match(/\/invite\/([^/]+)/);
    if (pathMatch?.[1]) {
      window.history.replaceState({}, "", "/");
      return pathMatch[1].trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── Router ─────────────────────────────────────────────────────
function AppRouter() {
  const { session, household, loading, isLoadingHousehold } = useAuth();

  // Capture invite token once on mount; survives auth flow via state
  const [pendingToken] = useState<string | null>(extractInviteFromUrl);

  // ── Loading splash ─────────────────────────────────────────
  // Show spinner while:
  //  • initial auth check is still running (loading)
  //  • user just logged in and household check is in-flight (isLoadingHousehold)
  //    → prevents the OnboardingScreen from flashing during the gap between
  //      user being set and loadProfile completing.
  if (loading || isLoadingHousehold) {
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
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  // ── Not logged in → Auth screen ───────────────────────────
  if (!session) {
    return <AuthScreen pendingInvite={!!pendingToken} />;
  }

  // ── Logged in but no household → Onboarding ───────────────
  // Only reached when isLoadingHousehold is false, so household === null
  // means the user genuinely has no household (not just "not loaded yet").
  if (!household) {
    return <OnboardingScreen pendingToken={pendingToken} />;
  }

  // ── Logged in + household → App ──────────────────────────
  return <MainShell />;
}

export function AppContent() {
  return (
    <AuthProvider>
      <OAuthCallbackHandler>
        <AppRouter />
      </OAuthCallbackHandler>
    </AuthProvider>
  );
}