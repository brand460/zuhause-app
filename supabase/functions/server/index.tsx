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
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const supabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

// ── Auth helper ───────────────────────────────────────────────────
async function getAuthUser(c: any) {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return null;
  try {
    const { data: { user }, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// Health check
app.get("/make-server-2a26506b/health", (c) => {
  return c.json({ status: "ok", ts: Date.now(), v: 2 });
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

// ── Custom categories (global pool per household) ──────────────────

// GET custom categories for a household
app.get("/make-server-2a26506b/custom-categories", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_categories:${householdId}`;
    const categories = await withRetry(() => kv.get(key));
    return c.json({ categories: categories || [] });
  } catch (err) {
    console.log("GET /custom-categories error:", err);
    return c.json({ error: `Fehler beim Laden der Custom-Kategorien: ${err}` }, 500);
  }
});

// PUT — save custom categories
app.put("/make-server-2a26506b/custom-categories", async (c) => {
  try {
    const { household_id, categories } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_categories:${household_id}`;
    await withRetry(() => kv.set(key, categories || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /custom-categories error:", err);
    return c.json({ error: `Fehler beim Speichern der Custom-Kategorien: ${err}` }, 500);
  }
});

// ── Global custom items (user-created articles) ────────────────────

// GET global items for a household
app.get("/make-server-2a26506b/global-items", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `global_items:${householdId}`;
    const items = await withRetry(() => kv.get(key));
    return c.json({ items: items || [] });
  } catch (err) {
    console.log("GET /global-items error:", err);
    return c.json({ error: `Fehler beim Laden der globalen Artikel: ${err}` }, 500);
  }
});

// PUT — upsert a global item (create or increment times_used)
app.put("/make-server-2a26506b/global-items", async (c) => {
  try {
    const { household_id, name, category, category_only } = await c.req.json();
    if (!household_id || !name || !category) {
      return c.json({ error: "household_id, name und category sind erforderlich." }, 400);
    }
    const key = `global_items:${household_id}`;
    const existing: any[] = (await withRetry(() => kv.get(key))) || [];
    const idx = existing.findIndex(
      (it: any) => it.name.toLowerCase() === name.toLowerCase()
    );
    if (idx >= 0) {
      if (!category_only) {
        existing[idx].times_used = (existing[idx].times_used || 1) + 1;
      }
      existing[idx].category = category; // update category if changed
    } else {
      existing.push({
        name,
        category,
        created_by_household_id: household_id,
        times_used: 1,
      });
    }
    await withRetry(() => kv.set(key, existing));
    return c.json({ ok: true, items: existing });
  } catch (err) {
    console.log("PUT /global-items error:", err);
    return c.json({ error: `Fehler beim Speichern des globalen Artikels: ${err}` }, 500);
  }
});

// DELETE — remove a global item by name
app.delete("/make-server-2a26506b/global-items", async (c) => {
  try {
    const { household_id, name } = await c.req.json();
    if (!household_id || !name) {
      return c.json({ error: "household_id und name sind erforderlich." }, 400);
    }
    const key = `global_items:${household_id}`;
    const existing: any[] = (await withRetry(() => kv.get(key))) || [];
    const filtered = existing.filter(
      (it: any) => it.name.toLowerCase() !== name.toLowerCase()
    );
    await withRetry(() => kv.set(key, filtered));
    return c.json({ ok: true, items: filtered });
  } catch (err) {
    console.log("DELETE /global-items error:", err);
    return c.json({ error: `Fehler beim Löschen des globalen Artikels: ${err}` }, 500);
  }
});

// PATCH — rename a global item
app.patch("/make-server-2a26506b/global-items", async (c) => {
  try {
    const { household_id, old_name, new_name, category } = await c.req.json();
    if (!household_id || !old_name || !new_name) {
      return c.json({ error: "household_id, old_name und new_name sind erforderlich." }, 400);
    }
    const key = `global_items:${household_id}`;
    const existing: any[] = (await withRetry(() => kv.get(key))) || [];

    // 1. Suche zuerst nach original_name = oldName (falls Artikel bereits früher umbenannt wurde)
    let idx = existing.findIndex(
      (it: any) => it.original_name && it.original_name.toLowerCase() === old_name.toLowerCase()
    );

    // 2. Falls nicht gefunden: Suche nach name = oldName
    if (idx < 0) {
      idx = existing.findIndex(
        (it: any) => it.name.toLowerCase() === old_name.toLowerCase()
      );
    }

    if (idx >= 0) {
      // Gefunden: umbenennen, original_name nur setzen falls noch nicht vorhanden
      if (!existing[idx].original_name) {
        existing[idx].original_name = old_name.trim();
      }
      existing[idx].name = new_name.trim();
    } else if (category) {
      // Nicht in global_items → kommt aus GROCERY_DATABASE, neu anlegen
      existing.push({
        name: new_name.trim(),
        category,
        created_by_household_id: household_id,
        times_used: 1,
        original_name: old_name.trim(),
      });
    } else {
      return c.json({ error: "Artikel nicht gefunden." }, 404);
    }

    await withRetry(() => kv.set(key, existing));
    return c.json({ ok: true, items: existing });
  } catch (err) {
    console.log("PATCH /global-items error:", err);
    return c.json({ error: `Fehler beim Umbenennen des globalen Artikels: ${err}` }, 500);
  }
});

// ── Custom pages (Notion-like editor) ──────────────────────────────

// GET all pages for a household
app.get("/make-server-2a26506b/custom-pages", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_pages:${householdId}`;
    const pages = await withRetry(() => kv.get(key));
    return c.json({ pages: pages || [] });
  } catch (err) {
    console.log("GET /custom-pages error:", err);
    return c.json({ error: `Fehler beim Laden der Seiten: ${err}` }, 500);
  }
});

// PUT — save all pages
app.put("/make-server-2a26506b/custom-pages", async (c) => {
  try {
    const { household_id, pages } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_pages:${household_id}`;
    await withRetry(() => kv.set(key, pages || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /custom-pages error:", err);
    return c.json({ error: `Fehler beim Speichern der Seiten: ${err}` }, 500);
  }
});

// ── Custom blocks (Notion-like editor) ─────────────────────────────

// GET all blocks for a household
app.get("/make-server-2a26506b/custom-blocks", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_blocks:${householdId}`;
    const blocks = await withRetry(() => kv.get(key));
    return c.json({ blocks: blocks || [] });
  } catch (err) {
    console.log("GET /custom-blocks error:", err);
    return c.json({ error: `Fehler beim Laden der Blöcke: ${err}` }, 500);
  }
});

// PUT — save all blocks
app.put("/make-server-2a26506b/custom-blocks", async (c) => {
  try {
    const { household_id, blocks } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `custom_blocks:${household_id}`;
    await withRetry(() => kv.set(key, blocks || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /custom-blocks error:", err);
    return c.json({ error: `Fehler beim Speichern der Blöcke: ${err}` }, 500);
  }
});

// ── Recipes endpoints ──────────────────────────────────────────────

// GET all recipes for a household
app.get("/make-server-2a26506b/recipes", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `recipes:${householdId}`;
    const recipes = await withRetry(() => kv.get(key));
    return c.json({ recipes: recipes || [] });
  } catch (err) {
    console.log("GET /recipes error:", err);
    return c.json({ error: `Fehler beim Laden der Rezepte: ${err}` }, 500);
  }
});

// PUT — save all recipes
app.put("/make-server-2a26506b/recipes", async (c) => {
  try {
    const { household_id, recipes } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `recipes:${household_id}`;
    await withRetry(() => kv.set(key, recipes || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /recipes error:", err);
    return c.json({ error: `Fehler beim Speichern der Rezepte: ${err}` }, 500);
  }
});

// ── Meal plan endpoints ────────────────────────────────────────────

// GET all meal plan entries for a household
app.get("/make-server-2a26506b/meal-plan", async (c) => {
  try {
    const householdId = c.req.query("household_id");
    if (!householdId) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `meal_plan:${householdId}`;
    const entries = await withRetry(() => kv.get(key));
    return c.json({ entries: entries || [] });
  } catch (err) {
    console.log("GET /meal-plan error:", err);
    return c.json({ error: `Fehler beim Laden des Wochenplans: ${err}` }, 500);
  }
});

// PUT — save all meal plan entries
app.put("/make-server-2a26506b/meal-plan", async (c) => {
  try {
    const { household_id, entries } = await c.req.json();
    if (!household_id) {
      return c.json({ error: "household_id ist erforderlich." }, 400);
    }
    const key = `meal_plan:${household_id}`;
    await withRetry(() => kv.set(key, entries || []));
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /meal-plan error:", err);
    return c.json({ error: `Fehler beim Speichern des Wochenplans: ${err}` }, 500);
  }
});

// ── Invite endpoints ───────────────────────────────────────────────

// Generate invite token (valid 7 days)
app.post("/make-server-2a26506b/invite/generate", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const { household_id } = await c.req.json();
    if (!household_id) return c.json({ error: "household_id erforderlich." }, 400);

    // Verify user is a member
    const { data: member } = await supabaseAdmin()
      .from("household_members")
      .select("role")
      .eq("household_id", household_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) return c.json({ error: "Kein Mitglied dieses Haushalts." }, 403);

    // Get household name
    const { data: hh } = await supabaseAdmin()
      .from("households")
      .select("name")
      .eq("id", household_id)
      .maybeSingle();

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await kv.set(`invite:${token}`, {
      household_id,
      household_name: hh?.name || "Unbekannt",
      created_by: user.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      used_by: null,
    });

    return c.json({ token, expires_at: expiresAt });
  } catch (err) {
    console.log("POST /invite/generate error:", err);
    return c.json({ error: `Fehler beim Erstellen des Einladungslinks: ${err}` }, 500);
  }
});

// Validate invite token
app.get("/make-server-2a26506b/invite/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const data = await kv.get(`invite:${token}`);

    if (!data) return c.json({ valid: false, error: "Ungültiger Einladungslink." }, 404);
    if (data.used_by) return c.json({ valid: false, error: "Dieser Link wurde bereits verwendet." }, 410);
    if (new Date(data.expires_at) < new Date()) return c.json({ valid: false, error: "Dieser Einladungslink ist abgelaufen." }, 410);

    return c.json({
      valid: true,
      household_id: data.household_id,
      household_name: data.household_name,
      expires_at: data.expires_at,
    });
  } catch (err) {
    console.log("GET /invite/:token error:", err);
    return c.json({ error: `Fehler beim Prüfen des Links: ${err}` }, 500);
  }
});

// Accept invite — adds user to household
app.post("/make-server-2a26506b/invite/accept", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const { token } = await c.req.json();
    if (!token) return c.json({ error: "Token erforderlich." }, 400);

    const data = await kv.get(`invite:${token}`);
    if (!data) return c.json({ error: "Ungültiger Einladungslink." }, 404);
    if (data.used_by) return c.json({ error: "Dieser Link wurde bereits verwendet." }, 410);
    if (new Date(data.expires_at) < new Date()) return c.json({ error: "Einladungslink abgelaufen." }, 410);

    // Already a member?
    const { data: existing } = await supabaseAdmin()
      .from("household_members")
      .select("id")
      .eq("household_id", data.household_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) return c.json({ ok: true, household_id: data.household_id, message: "Bereits Mitglied." });

    // Add to household
    const { error: insertErr } = await supabaseAdmin()
      .from("household_members")
      .insert({ household_id: data.household_id, user_id: user.id, role: "member" });

    if (insertErr) return c.json({ error: `Beitreten fehlgeschlagen: ${insertErr.message}` }, 500);

    // Mark token as used
    await kv.set(`invite:${token}`, { ...data, used_by: user.id });

    return c.json({ ok: true, household_id: data.household_id });
  } catch (err) {
    console.log("POST /invite/accept error:", err);
    return c.json({ error: `Fehler beim Beitreten: ${err}` }, 500);
  }
});

// ── Household management endpoints ────────────────────────────────

// Create household + add creator as admin (uses service role → bypasses RLS)
app.post("/make-server-2a26506b/household/create", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const { name } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name darf nicht leer sein." }, 400);

    const admin = supabaseAdmin();

    // 1. Insert household
    const { data: hh, error: hhErr } = await admin
      .from("households")
      .insert({ name: name.trim(), created_by: user.id })
      .select()
      .single();

    if (hhErr || !hh) {
      console.log("household/create: households insert error:", hhErr);
      return c.json({ error: `Haushalt konnte nicht erstellt werden: ${hhErr?.message}` }, 500);
    }

    // 2. Insert creator as admin member
    const { error: memberErr } = await admin
      .from("household_members")
      .insert({ household_id: hh.id, user_id: user.id, role: "admin" });

    if (memberErr) {
      console.log("household/create: household_members insert error:", memberErr);
      // Rollback: delete the household we just created
      await admin.from("households").delete().eq("id", hh.id);
      return c.json({ error: `Mitglied konnte nicht hinzugefügt werden: ${memberErr.message}` }, 500);
    }

    console.log("household/create: success, id:", hh.id, "user:", user.id);
    return c.json({ ok: true, household: hh });
  } catch (err) {
    console.log("POST /household/create error:", err);
    return c.json({ error: `Unerwarteter Fehler beim Erstellen: ${err}` }, 500);
  }
});

// Get members of a household
app.get("/make-server-2a26506b/household/:id/members", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const householdId = c.req.param("id");

    // Verify user is a member
    const { data: membership } = await supabaseAdmin()
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return c.json({ error: "Kein Zugriff." }, 403);

    // Get all members
    const { data: memberRows, error: memberErr } = await supabaseAdmin()
      .from("household_members")
      .select("user_id, role")
      .eq("household_id", householdId);

    if (memberErr) return c.json({ error: `Fehler: ${memberErr.message}` }, 500);

    // Get profiles for each member
    const userIds = (memberRows || []).map((m: any) => m.user_id);
    const { data: profileRows } = await supabaseAdmin()
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    const members = (memberRows || []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      display_name: (profileRows || []).find((p: any) => p.id === m.user_id)?.display_name || "Unbekannt",
      is_me: m.user_id === user.id,
    }));

    return c.json({ members, my_role: membership.role });
  } catch (err) {
    console.log("GET /household/:id/members error:", err);
    return c.json({ error: `Fehler beim Laden der Mitglieder: ${err}` }, 500);
  }
});

// Rename household (admin/owner only)
app.put("/make-server-2a26506b/household/:id/name", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const householdId = c.req.param("id");
    const { name } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name darf nicht leer sein." }, 400);

    const { data: member } = await supabaseAdmin()
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || member.role !== "admin") return c.json({ error: "Nur der Inhaber kann den Namen ändern." }, 403);

    const { error } = await supabaseAdmin()
      .from("households")
      .update({ name: name.trim() })
      .eq("id", householdId);

    if (error) return c.json({ error: `Fehler: ${error.message}` }, 500);
    return c.json({ ok: true });
  } catch (err) {
    console.log("PUT /household/:id/name error:", err);
    return c.json({ error: `Fehler beim Umbenennen: ${err}` }, 500);
  }
});

// Leave household (non-admin members only)
app.post("/make-server-2a26506b/household/:id/leave", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const householdId = c.req.param("id");

    const { data: member } = await supabaseAdmin()
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) return c.json({ error: "Kein Mitglied dieses Haushalts." }, 404);
    if (member.role === "admin") return c.json({ error: "Inhaber kann den Haushalt nicht verlassen. Bitte erst löschen." }, 400);

    const { error } = await supabaseAdmin()
      .from("household_members")
      .delete()
      .eq("household_id", householdId)
      .eq("user_id", user.id);

    if (error) return c.json({ error: `Fehler: ${error.message}` }, 500);
    return c.json({ ok: true });
  } catch (err) {
    console.log("POST /household/:id/leave error:", err);
    return c.json({ error: `Fehler beim Verlassen: ${err}` }, 500);
  }
});

// Delete household (admin/owner only — cascades members)
app.delete("/make-server-2a26506b/household/:id", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const householdId = c.req.param("id");

    const { data: member } = await supabaseAdmin()
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || member.role !== "admin") return c.json({ error: "Nur der Inhaber kann den Haushalt löschen." }, 403);

    // Remove all members first
    await supabaseAdmin().from("household_members").delete().eq("household_id", householdId);

    // Delete household
    const { error } = await supabaseAdmin().from("households").delete().eq("id", householdId);
    if (error) return c.json({ error: `Fehler: ${error.message}` }, 500);

    return c.json({ ok: true });
  } catch (err) {
    console.log("DELETE /household/:id error:", err);
    return c.json({ error: `Fehler beim Löschen: ${err}` }, 500);
  }
});

// ── Backfill profiles from auth.users metadata (admin only) ───────
app.post("/make-server-2a26506b/backfill-profiles", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const admin = supabaseAdmin();

    // List all users via admin API (paginated, up to 1000)
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) {
      console.log("backfill-profiles: listUsers error:", listErr);
      return c.json({ error: `Fehler beim Laden der Benutzer: ${listErr.message}` }, 500);
    }

    let updated = 0;
    let skipped = 0;

    for (const authUser of users) {
      const displayName =
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        authUser.user_metadata?.display_name ||
        authUser.email?.split("@")[0] ||
        "Nutzer";
      const avatarUrl = authUser.user_metadata?.avatar_url || null;

      const { error: upsertErr } = await admin
        .from("profiles")
        .upsert(
          {
            id: authUser.id,
            display_name: displayName,
            avatar_url: avatarUrl,
          },
          { onConflict: "id" }
        );

      if (upsertErr) {
        console.log(`backfill-profiles: upsert error for ${authUser.id}:`, upsertErr.message);
        skipped++;
      } else {
        updated++;
      }
    }

    console.log(`backfill-profiles: ${updated} updated, ${skipped} skipped, ${users.length} total`);
    return c.json({ ok: true, updated, skipped, total: users.length });
  } catch (err) {
    console.log("POST /backfill-profiles error:", err);
    return c.json({ error: `Fehler beim Backfill: ${err}` }, 500);
  }
});

// ── Recipe URL import via Claude API ──────────────────────────────

app.post("/make-server-2a26506b/import-recipe", async (c) => {
  try {
    const { url, anthropic_api_key } = await c.req.json();
    if (!url) {
      return c.json({ error: "URL ist erforderlich." }, 400);
    }

    const apiKey = anthropic_api_key;
    if (!apiKey) {
      return c.json({ error: "ANTHROPIC_API_KEY wurde nicht übergeben. Bitte in Vercel unter Environment Variables als VITE_ANTHROPIC_API_KEY hinterlegen." }, 400);
    }

    // Fetch the webpage content
    let pageContent: string;
    try {
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
      });
      pageContent = await pageRes.text();
      // Strip HTML tags and limit length to ~15000 chars for Claude
      pageContent = pageContent
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 15000);
    } catch (fetchErr) {
      return c.json({ error: `Fehler beim Laden der URL: ${fetchErr}` }, 400);
    }

    // Call Claude API
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: `Du bist ein Rezept-Extraktor. Extrahiere aus dem folgenden Web-Inhalt ein Rezept als JSON:
{
  "title": "",
  "description": "",
  "prep_time_minutes": null,
  "cook_time_minutes": null,
  "servings": null,
  "ingredients": [{"name": "", "quantity": "", "unit": ""}],
  "steps": [{"position": 1, "description": ""}],
  "image_url": null,
  "categories": [],
  "source_url": ""
}
Felder die du nicht finden kannst setzt du auf null. Antworte NUR mit dem JSON.`,
        messages: [
          { role: "user", content: `URL: ${url}\n\nInhalt:\n${pageContent}` },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.log("Claude API error:", errText);
      return c.json({ error: `Claude API Fehler: ${claudeRes.status} ${errText.substring(0, 200)}` }, 500);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData?.content?.[0]?.text || "";

    // Extract JSON from response
    let recipe: any;
    try {
      // Try to find JSON block in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      recipe = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    } catch (parseErr) {
      console.log("Claude response parse error:", parseErr, "Text:", text.substring(0, 500));
      return c.json({ error: `Fehler beim Parsen der Claude-Antwort: ${parseErr}` }, 500);
    }

    // Ensure source_url is set
    recipe.source_url = recipe.source_url || url;

    return c.json({ recipe });
  } catch (err) {
    console.log("POST /import-recipe error:", err);
    return c.json({ error: `Fehler beim Importieren des Rezepts: ${err}` }, 500);
  }
});

// ── Delete account (removes auth user, profile, household memberships) ──
app.delete("/make-server-2a26506b/delete-account", async (c) => {
  try {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Nicht autorisiert." }, 401);

    const admin = supabaseAdmin();

    // Remove from all households
    await admin.from("household_members").delete().eq("user_id", user.id);

    // Remove profile row
    await admin.from("profiles").delete().eq("id", user.id);

    // Delete the auth user (irreversible — must be last)
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.log("delete-account: deleteUser error:", delErr.message);
      return c.json({ error: `Konto konnte nicht gelöscht werden: ${delErr.message}` }, 500);
    }

    console.log("delete-account: user deleted, id:", user.id);
    return c.json({ ok: true });
  } catch (err) {
    console.log("DELETE /delete-account error:", err);
    return c.json({ error: `Fehler beim Löschen des Kontos: ${err}` }, 500);
  }
});

// ── OneSignal Push Notification endpoints ─────────────────────────

const ONESIGNAL_APP_ID = "a72cfa96-92c3-472b-8fa2-6b61bec1d724";

// Register OneSignal player ID for a user
app.post("/make-server-2a26506b/onesignal/register", async (c) => {
  try {
    const { user_id, player_id, household_id } = await c.req.json();
    if (!user_id || !player_id) {
      return c.json({ error: "user_id und player_id sind erforderlich." }, 400);
    }

    const key = `onesignal_player:${user_id}`;
    await withRetry(() =>
      kv.set(key, {
        user_id,
        player_id,
        household_id: household_id || null,
        updated_at: new Date().toISOString(),
      })
    );

    console.log(`onesignal/register: user=${user_id} player=${player_id}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("POST /onesignal/register error:", err);
    return c.json({ error: `Fehler beim Registrieren der Player-ID: ${err}` }, 500);
  }
});

// Send push notifications for upcoming calendar events
// This endpoint is designed to be called by a cron job every minute.
app.post("/make-server-2a26506b/send-notifications", async (c) => {
  try {
    const apiKey = Deno.env.get("ONESIGNAL_API_KEY");
    if (!apiKey) {
      console.log("send-notifications: ONESIGNAL_API_KEY not set");
      return c.json({ error: "ONESIGNAL_API_KEY nicht konfiguriert." }, 500);
    }

    const now = Date.now();
    const windowMs = 60_000; // 60 seconds

    // 1. Load ALL calendar events from all households via KV prefix
    const admin = supabaseAdmin();
    const { data: kvRows, error: kvErr } = await admin
      .from("kv_store_2a26506b")
      .select("key, value")
      .like("key", "calendar_events:%");

    if (kvErr) {
      console.log("send-notifications: KV query error:", kvErr.message);
      return c.json({ error: `KV-Fehler: ${kvErr.message}` }, 500);
    }

    if (!kvRows || kvRows.length === 0) {
      return c.json({ ok: true, sent: 0, message: "Keine Kalender-Events gefunden." });
    }

    // 2. Find events where a notification trigger falls within [now, now+60s]
    interface NotificationTarget {
      eventId: string;
      householdId: string;
      title: string;
      startTime: string;
      description: string;
      minutesBefore: number;
    }

    const targets: NotificationTarget[] = [];

    for (const row of kvRows) {
      const events: any[] = row.value || [];
      const householdId = (row.key as string).replace("calendar_events:", "");

      for (const ev of events) {
        // Skip events without notifications enabled
        const notifications: number[] = ev.notifications || [];
        if (notifications.length === 0 && !ev.notification_enabled) continue;

        const startMs = new Date(ev.start_time).getTime();
        if (isNaN(startMs)) continue;

        for (const minutesBefore of notifications) {
          const triggerMs = startMs - minutesBefore * 60_000;
          // Check if trigger falls within [now, now + windowMs)
          if (triggerMs >= now && triggerMs < now + windowMs) {
            // Check deduplication: has this notification already been sent?
            const dedupeKey = `notification_sent:${ev.id}:${minutesBefore}:${new Date(startMs).toISOString().slice(0, 10)}`;
            const alreadySent = await kv.get(dedupeKey);
            if (alreadySent) continue;

            targets.push({
              eventId: ev.id,
              householdId,
              title: ev.title || "Termin",
              startTime: ev.start_time,
              description: ev.description || "",
              minutesBefore,
            });
          }
        }
      }
    }

    if (targets.length === 0) {
      return c.json({ ok: true, sent: 0, message: "Keine fälligen Benachrichtigungen." });
    }

    console.log(`send-notifications: ${targets.length} notifications to send`);

    let sent = 0;

    // 3. Group targets by household to batch member lookups
    const byHousehold = new Map<string, NotificationTarget[]>();
    for (const t of targets) {
      const list = byHousehold.get(t.householdId) || [];
      list.push(t);
      byHousehold.set(t.householdId, list);
    }

    for (const [householdId, hTargets] of byHousehold) {
      // Get household member user IDs
      const { data: members, error: memberErr } = await admin
        .from("household_members")
        .select("user_id")
        .eq("household_id", householdId);

      if (memberErr || !members || members.length === 0) {
        console.log(`send-notifications: no members for household ${householdId}`);
        continue;
      }

      const userIds = members.map((m: any) => m.user_id);

      // Get OneSignal player IDs for these users from KV
      const playerKeys = userIds.map((uid: string) => `onesignal_player:${uid}`);
      let playerData: any[];
      try {
        playerData = await kv.mget(playerKeys);
      } catch {
        playerData = [];
      }

      const playerIds = playerData
        .filter((d: any) => d && d.player_id)
        .map((d: any) => d.player_id);

      if (playerIds.length === 0) {
        console.log(`send-notifications: no player IDs for household ${householdId}`);
        continue;
      }

      // 4. Send a push notification for each target event
      for (const target of hTargets) {
        const startDate = new Date(target.startTime);
        const timeStr = `${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")} Uhr`;

        let body = timeStr;
        if (target.description) {
          body += ` — ${target.description.substring(0, 100)}`;
        }

        try {
          const osRes = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${apiKey}`,
            },
            body: JSON.stringify({
              app_id: ONESIGNAL_APP_ID,
              include_player_ids: playerIds,
              headings: { de: target.title, en: target.title },
              contents: { de: body, en: body },
              // Optional: deep link back to app
              url: `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".vercel.app") || "https://zuhause.app"}`,
            }),
          });

          if (!osRes.ok) {
            const errText = await osRes.text();
            console.log(`send-notifications: OneSignal API error for event ${target.eventId}:`, errText);
          } else {
            sent++;
            // Mark as sent (dedupe — expires implicitly since we only check today's date)
            const dedupeKey = `notification_sent:${target.eventId}:${target.minutesBefore}:${new Date(startDate).toISOString().slice(0, 10)}`;
            await kv.set(dedupeKey, { sent_at: new Date().toISOString() });
            console.log(`send-notifications: sent notification for event "${target.title}" to ${playerIds.length} users`);
          }
        } catch (fetchErr) {
          console.log(`send-notifications: fetch error for event ${target.eventId}:`, fetchErr);
        }
      }
    }

    return c.json({ ok: true, sent });
  } catch (err) {
    console.log("POST /send-notifications error:", err);
    return c.json({ error: `Fehler beim Senden der Benachrichtigungen: ${err}` }, 500);
  }
});

// Global error handler — ensures CORS headers are always returned even on crashes
app.onError((err, c) => {
  console.log("Unhandled server error:", err);
  return c.json(
    { error: `Interner Serverfehler: ${err?.message || err}` },
    500,
  );
});

// Wrap Deno.serve to guarantee CORS headers on every response (including edge-function-level errors)
Deno.serve(async (req) => {
  // Fast-path: handle bare OPTIONS preflight before Hono, in case middleware fails
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  try {
    const res = await app.fetch(req);
    // Ensure CORS origin header is present on every response
    if (!res.headers.get("Access-Control-Allow-Origin")) {
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  } catch (e) {
    console.log("Fatal Deno.serve error:", e);
    return new Response(JSON.stringify({ error: `Fatal: ${e}` }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});