import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

// ── Retry helper for transient Supabase connection errors ──────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 300): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isTransient =
        msg.includes("Connection reset") ||
        msg.includes("connection error") ||
        msg.includes("error sending request") ||
        msg.includes("broken pipe") ||
        msg.includes("ECONNRESET");
      if (isTransient && attempt < retries) {
        console.log(`Transient error (attempt ${attempt}/${retries}), retrying in ${delayMs}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry: exhausted retries");
}

const app = new Hono();

app.use("*", logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const supabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

// Health check
app.get("/make-server-2a26506b/health", (c) => {
  return c.json({ status: "ok" });
});

// Sign up — uses admin API to create user with email_confirm: true
app.post("/make-server-2a26506b/signup", async (c) => {
  try {
    const { name, email, password } = await c.req.json();
    if (!email || !password || !name) {
      return c.json(
        { error: "Name, E-Mail und Passwort sind erforderlich." },
        400,
      );
    }
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error:", error.message);
      return c.json(
        { error: `Registrierungsfehler: ${error.message}` },
        400,
      );
    }

    return c.json({ user: { id: data.user.id, email: data.user.email } });
  } catch (err) {
    console.log("Signup exception:", err);
    return c.json(
      { error: `Unerwarteter Fehler bei der Registrierung: ${err}` },
      500,
    );
  }
});

// ── Shopping list endpoints ────────────────────────────────────────

// GET all shopping items for a household
app.get("/make-server-2a26506b/shopping", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `shopping:${householdId}`;
    const items = await withRetry(() => kv.get(key));
    return c.json({ items: items || [] });
  } catch (err) {
    console.log("GET /shopping error:", err);
    return c.json({ error: `Fehler beim Laden der Einkaufsliste: ${err}` }, 500);
  }
});

// PUT — save entire shopping list (replaces all items)
app.put("/make-server-2a26506b/shopping", async (c) => {
  try {
    const { household_id, items } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `shopping:${household_id}`;
    await withRetry(() => kv.set(key, items || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /shopping error:", err);
    return c.json({ error: `Fehler beim Speichern der Einkaufsliste: ${err}` }, 500);
  }
});

// ── Store settings endpoints ───────────────────────────────────────

// GET store settings for a household
app.get("/make-server-2a26506b/store-settings", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `store_settings:${householdId}`;
    const settings = await withRetry(() => kv.get(key));
    return c.json({ settings: settings || [] });
  } catch (err) {
    console.log("GET /store-settings error:", err);
    return c.json({ error: `Fehler beim Laden der Store-Einstellungen: ${err}` }, 500);
  }
});

// PUT — save store settings
app.put("/make-server-2a26506b/store-settings", async (c) => {
  try {
    const { household_id, settings } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `store_settings:${household_id}`;
    await withRetry(() => kv.set(key, settings || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /store-settings error:", err);
    return c.json({ error: `Fehler beim Speichern der Store-Einstellungen: ${err}` }, 500);
  }
});

// ── Calendar events endpoints ──────────────────────────────────────

// GET all calendar events for a household
app.get("/make-server-2a26506b/calendar-events", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `calendar_events:${householdId}`;
    const events = await withRetry(() => kv.get(key));
    return c.json({ events: events || [] });
  } catch (err) {
    console.log("GET /calendar-events error:", err);
    return c.json({ error: `Fehler beim Laden der Kalender-Events: ${err}` }, 500);
  }
});

// PUT — save entire calendar events list (replaces all events)
app.put("/make-server-2a26506b/calendar-events", async (c) => {
  try {
    const { household_id, events } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `calendar_events:${household_id}`;
    await withRetry(() => kv.set(key, events || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /calendar-events error:", err);
    return c.json({ error: `Fehler beim Speichern der Kalender-Events: ${err}` }, 500);
  }
});

// ── Calendar labels endpoints ──────────────────────────────────────

// GET calendar labels for a household
app.get("/make-server-2a26506b/calendar-labels", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `calendar_labels:${householdId}`;
    const labels = await withRetry(() => kv.get(key));
    return c.json({ labels: labels || [] });
  } catch (err) {
    console.log("GET /calendar-labels error:", err);
    return c.json({ error: `Fehler beim Laden der Kalender-Labels: ${err}` }, 500);
  }
});

// PUT — save calendar labels
app.put("/make-server-2a26506b/calendar-labels", async (c) => {
  try {
    const { household_id, labels } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `calendar_labels:${household_id}`;
    await withRetry(() => kv.set(key, labels || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /calendar-labels error:", err);
    return c.json({ error: `Fehler beim Speichern der Kalender-Labels: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);