import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const supabaseUrl = `https://${projectId}.supabase.co`;

// Singleton: prevent duplicate GoTrueClient instances during HMR.
// detectSessionInUrl: false + persistSession: false eliminate the localStorage
// storage-key that GoTrueClient uses for its internal multi-instance warning.
// DEV BYPASS: re-enable persistSession when auth is turned on.
const GLOBAL_KEY = "__supabase_client__" as const;
export const supabase: ReturnType<typeof createClient> =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  }));

export const API_BASE = `${supabaseUrl}/functions/v1/make-server-2a26506b`;

export async function apiFetch(path: string, options: RequestInit = {}) {
  // DEV BYPASS: always use publicAnonKey since auth is disabled.
  // When auth is re-enabled, restore session-token logic here.
  const token = publicAnonKey;

  const url = `${API_BASE}${path}`;
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
    throw new Error(`Netzwerkfehler bei ${options.method || "GET"} ${path}: ${networkErr}`);
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