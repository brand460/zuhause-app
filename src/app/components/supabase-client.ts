import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const supabaseUrl = `https://${projectId}.supabase.co`;

// Singleton: prevent duplicate GoTrueClient instances during HMR.
const GLOBAL_KEY = "__supabase_client_v2__" as const;
export const supabase: ReturnType<typeof createClient> =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
    },
  }));

export const API_BASE = `${supabaseUrl}/functions/v1/make-server-2a26506b`;

// ── Single in-flight refresh guard ─────────────────────────────────
// Prevents concurrent apiFetch calls from calling refreshSession() multiple
// times simultaneously (would invalidate the refresh token on the 2nd call).
let _refreshPromise: Promise<string | null> | null = null;

async function getFreshToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return publicAnonKey;
    }

    // Check if token is still valid for more than 60 seconds (increased buffer)
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;
    if (expiresAt - nowSec > 60) {
      return session.access_token;
    }

    // Token expiring soon or already expired — refresh exactly once
    if (!_refreshPromise) {
      _refreshPromise = supabase.auth
        .refreshSession()
        .then(({ data }) => data.session?.access_token ?? null)
        .catch(() => null)
        .finally(() => { _refreshPromise = null; });
    }

    const newToken = await _refreshPromise;
    return newToken ?? publicAnonKey;
  } catch (err) {
    console.log("[getFreshToken] Error:", err);
    return publicAnonKey;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 1500;

  let token = await getFreshToken();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
    } catch (networkErr) {
      if (attempt < MAX_RETRIES) {
        console.log(`[apiFetch] Netzwerkfehler bei ${path} (Versuch ${attempt}/${MAX_RETRIES}), retry in ${RETRY_DELAY}ms...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      throw new Error(`Netzwerkfehler bei ${options.method || "GET"} ${path}: ${networkErr}`);
    }

    // On 401: force a session refresh, then fall back to publicAnonKey
    if (res.status === 401 && attempt <= 2) {
      if (attempt === 1) {
        console.log(`[apiFetch] 401 bei ${path} — erzwinge Token-Refresh und retry...`);
        try {
          const { data } = await supabase.auth.refreshSession();
          token = data.session?.access_token ?? publicAnonKey;
        } catch {
          console.log(`[apiFetch] Token-Refresh fehlgeschlagen, nutze publicAnonKey`);
          token = publicAnonKey;
        }
      } else {
        // Attempt 2 still 401 — session token is broken, use anon key
        console.log(`[apiFetch] 401 bei ${path} auch nach Refresh — Fallback auf publicAnonKey`);
        token = publicAnonKey;
      }
      continue;
    }

    // Retry on 5xx or 0 status (server error / edge function cold start)
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      console.log(`[apiFetch] Server-Fehler ${res.status} bei ${path} (Versuch ${attempt}/${MAX_RETRIES}), retry...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
      continue;
    }

    let body: any;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await res.json();
      } catch (parseErr) {
        throw new Error(`JSON-Parse-Fehler (Status ${res.status}) bei ${path}: ${parseErr}`);
      }
    } else {
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Server-Fehler ${res.status} bei ${path}: ${text}`);
      }
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Unerwartete Antwort (Status ${res.status}) bei ${path}: ${text.substring(0, 200)}`);
      }
    }

    if (!res.ok) {
      const msg = body?.error || body?.message || body?.msg || JSON.stringify(body);
      throw new Error(`Fehler ${res.status} bei ${path}: ${msg}`);
    }
    return body;
  }

  throw new Error(`apiFetch: max retries exhausted for ${path}`);
}