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
    const { household_id, name, category } = await c.req.json();
    if (!household_id || !name || !category) {
      return c.json({ error: "household_id, name und category sind erforderlich." }, 400);
    }
    const key = `global_items:${household_id}`;
    const existing: any[] = (await withRetry(() => kv.get(key))) || [];
    const idx = existing.findIndex(
      (it: any) => it.name.toLowerCase() === name.toLowerCase()
    );
    if (idx >= 0) {
      existing[idx].times_used = (existing[idx].times_used || 1) + 1;
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

// ── Recipe URL import via Claude API ───────────────────────────────

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
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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