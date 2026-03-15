import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Search, Plus, X, Pencil, Trash2, Type } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "./auth-context";
import { API_BASE } from "./supabase-client";
import { publicAnonKey } from "/utils/supabase/info";
import {
  GROCERY_DATABASE,
  getAllCategories,
} from "./einkaufen/shopping-data";
import { useKeyboardOffset } from "./ui/use-keyboard-offset";

// ── Types ──────────────────────────────────────────────────────────
interface GlobalItem {
  name: string;
  category: string;
  created_by_household_id: string;
  times_used: number;
  original_name?: string;
  deleted?: boolean;
}

interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  household_id: string;
}

interface MergedArticle {
  name: string;
  category: string;
  timesUsed: number;
  source: "grocery" | "global" | "shopping"; // track origin for delete logic
}

// ── API helpers ────────────────────────────────────────────────────
async function fetchGlobalItems(hhId: string): Promise<GlobalItem[]> {
  try {
    const res = await fetch(
      `${API_BASE}/global-items?household_id=${hhId}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    const json = await res.json();
    return json.items || [];
  } catch (err) {
    console.log("fetchGlobalItems error:", err);
    return [];
  }
}

async function fetchShoppingItems(hhId: string): Promise<ShoppingItem[]> {
  try {
    const res = await fetch(
      `${API_BASE}/shopping?household_id=${hhId}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    const json = await res.json();
    return json.items || [];
  } catch (err) {
    console.log("fetchShoppingItems error:", err);
    return [];
  }
}

async function upsertGlobalItem(hhId: string, name: string, category: string, categoryOnly = false, extra?: { deleted?: boolean; original_name?: string }): Promise<void> {
  try {
    await fetch(`${API_BASE}/global-items`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: hhId, name, category, category_only: categoryOnly, ...extra }),
    });
  } catch (err) {
    console.log("upsertGlobalItem error:", err);
  }
}

async function deleteGlobalItem(hhId: string, name: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/global-items`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: hhId, name }),
    });
  } catch (err) {
    console.log("deleteGlobalItem error:", err);
  }
}

async function renameGlobalItem(hhId: string, oldName: string, newName: string, category?: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/global-items`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: hhId, old_name: oldName, new_name: newName, category }),
    });
  } catch (err) {
    console.log("renameGlobalItem error:", err);
  }
}

async function fetchCustomCategories(hhId: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/custom-categories?household_id=${hhId}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    const json = await res.json();
    return json.categories || [];
  } catch (err) {
    console.log("fetchCustomCategories error:", err);
    return [];
  }
}

async function saveCustomCategories(hhId: string, categories: string[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/custom-categories`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: hhId, categories }),
    });
  } catch (err) {
    console.log("saveCustomCategories error:", err);
  }
}

// ── Category chip colors (same as EinkaufenScreen) ─────────────────
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "Obst & Gemüse": { bg: "#DCFCE7", text: "#22C55E" },
  Backwaren: { bg: "#FEF3C7", text: "#F59E0B" },
  "Fleisch & Wurst": { bg: "#FCE7F3", text: "#EC4899" },
  "Milch & Käse": { bg: "#DBEAFE", text: "#3B82F6" },
  Eier: { bg: "#FEF9C3", text: "#EAB308" },
  "Nudeln & Reis": { bg: "#FFF7ED", text: "#F97316" },
  Konserven: { bg: "#FEE2E2", text: "#EF4444" },
  "Saucen & Gewürze": { bg: "#FED7AA", text: "#FB923C" },
  "Kaffee & Tee": { bg: "#F3E8FF", text: "#A855F7" },
  "Müsli & Frühstück": { bg: "#FFEDD5", text: "#F97316" },
  Tiefkühl: { bg: "#E0F2FE", text: "#0EA5E9" },
  "Süßwaren & Snacks": { bg: "#FDF2F8", text: "#EC4899" },
  Getränke: { bg: "#ECFDF5", text: "#10B981" },
  "Haushalt & Reinigung": { bg: "#F3F4F6", text: "#9CA3AF" },
  Tiernahrung: { bg: "#FEF3C7", text: "#D97706" },
  Körperpflege: { bg: "#FCE7F3", text: "#EC4899" },
  Haarpflege: { bg: "#F3E8FF", text: "#A855F7" },
  Gesichtspflege: { bg: "#FDF2F8", text: "#F472B6" },
  "Makeup & Kosmetik": { bg: "#FECDD3", text: "#FB7185" },
  Mundhygiene: { bg: "#DBEAFE", text: "#3B82F6" },
  Damenhygiene: { bg: "#FCE7F3", text: "#EC4899" },
  Babypflege: { bg: "#FEF9C3", text: "#EAB308" },
  Reinigungsmittel: { bg: "#E0F2FE", text: "#0EA5E9" },
  Waschmittel: { bg: "#ECFDF5", text: "#10B981" },
  Papierprodukte: { bg: "#F3F4F6", text: "#9CA3AF" },
  "Gesundheit & Medizin": { bg: "#DCFCE7", text: "#22C55E" },
  "Vitamine & Nahrungsergänzung": { bg: "#FFF7ED", text: "#F97316" },
  "Foto & Technik": { bg: "#E0E7FF", text: "#6366F1" },
  "Lebensmittel & Snacks": { bg: "#FEF3C7", text: "#F59E0B" },
  Elektronik: { bg: "#E0E7FF", text: "#6366F1" },
  Haushalt: { bg: "#F3F4F6", text: "#9CA3AF" },
  Lebensmittel: { bg: "#DCFCE7", text: "#22C55E" },
  "Bücher & Medien": { bg: "#F3E8FF", text: "#A855F7" },
  "Sport & Freizeit": { bg: "#ECFDF5", text: "#10B981" },
  Kleidung: { bg: "#FCE7F3", text: "#EC4899" },
  Bürobedarf: { bg: "#FEF9C3", text: "#EAB308" },
  Spielzeug: { bg: "#FEF3C7", text: "#F59E0B" },
  Garten: { bg: "#DCFCE7", text: "#22C55E" },
  Sonstiges: { bg: "#F1F5F9", text: "#94A3B8" },
};

function getCatColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Sonstiges;
}

type SortMode = "az" | "kategorie" | "haeufigkeit";

// ── Component ──────────────────────────────────────────────────────
export function MeineArtikelScreen({ onClose }: { onClose: () => void }) {
  const { householdId } = useAuth();
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [articles, setArticles] = useState<MergedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  // ── Custom categories ────────────────────────────────────────
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showNewCategoryDrawer, setShowNewCategoryDrawer] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);

  // ── Add article state ────────────────────────────────────────
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [addName, setAddName] = useState("");
  const [addStep, setAddStep] = useState<"name" | "category">("name");

  // ── Long press / popover state ────────────────────────────────
  const [popoverArticle, setPopoverArticle] = useState<MergedArticle | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // ── Category change drawer ────────────────────────────────────
  const [catChangeArticle, setCatChangeArticle] = useState<MergedArticle | null>(null);

  // ── Delete confirm ────────────────────────────────────────────
  const [deleteArticle, setDeleteArticle] = useState<MergedArticle | null>(null);

  // ── Rename article ────────────────────────────────────────────
  const [renameArticle, setRenameArticle] = useState<MergedArticle | null>(null);

  // ── Load & merge data ──────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [globalItems, shoppingItems, customCats] = await Promise.all([
        fetchGlobalItems(householdId),
        fetchShoppingItems(householdId),
        fetchCustomCategories(householdId),
      ]);

      if (!cancelled) {
        setCustomCategories(customCats);
      }

      const shoppingCounts = new Map<string, number>();
      for (const si of shoppingItems) {
        const key = si.name.toLowerCase();
        shoppingCounts.set(key, (shoppingCounts.get(key) || 0) + 1);
      }

      const map = new Map<string, MergedArticle>();

      // ── Fix 2: global_items zuerst deduplizieren ───────────────────────
      // Wenn mehrere Einträge denselben Namen haben, gewinnt der letzte
      // (= neueste Schreiboperation). Verhindert Ghost-Duplikate nach
      // Umbenennungs-/Lösch-Zyklen.
      const deduplicatedGlobalItems: GlobalItem[] = [];
      {
        const seenNames = new Set<string>();
        for (let i = globalItems.length - 1; i >= 0; i--) {
          const key = globalItems[i].name.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            deduplicatedGlobalItems.unshift(globalItems[i]);
          }
        }
      }

      // ── Schritt 1, 2 & 3: Dedup-Sets aus global_items aufbauen ─────────
      // Fix 3: globalNames und renamedOriginals nur für NICHT-gelöschte Einträge befüllen.
      // Andernfalls würde ein {name:"Eier", deleted:true} den GROCERY-Eintrag "Eier"
      // per globalNames blockieren UND den global_items-Loop überspringen → komplett unsichtbar.
      //
      // deletedOriginals bleibt für alle gelöschten Einträge erhalten: verhindert, dass
      // ein umbenannter GROCERY-Originalname nach dem Löschen wieder auftaucht.
      const globalNames = new Set<string>();
      const renamedOriginals = new Set<string>();
      const deletedOriginals = new Set<string>();
      for (const gi of deduplicatedGlobalItems) {
        if (!gi.deleted) {
          // Nur aktive Einträge blockieren GROCERY-Artikel
          globalNames.add(gi.name.toLowerCase());
          if (gi.original_name) {
            renamedOriginals.add(gi.original_name.toLowerCase());
          }
        }
        // Gelöschte Einträge: original_name merken, damit ihr GROCERY-Original weiterhin
        // unterdrückt bleibt (der User hat es explizit gelöscht)
        if (gi.deleted && gi.original_name) {
          deletedOriginals.add(gi.original_name.toLowerCase());
        }
      }

      // GROCERY_DATABASE — nur hinzufügen wenn weder name (Step 1) noch original_name
      // (Step 2/3) eines global_items-Eintrags übereinstimmt
      for (const g of GROCERY_DATABASE) {
        const key = g.name.toLowerCase();
        if (globalNames.has(key)) continue;       // Step 1: gleicher Name → global_items gewinnt
        if (renamedOriginals.has(key)) continue;  // Step 2: umbenannt → neuer Name gewinnt
        if (deletedOriginals.has(key)) continue;  // Step 3: soft-deleted → überspringen
        map.set(key, {
          name: g.name,
          category: g.category,
          timesUsed: shoppingCounts.get(key) || 0,
          source: "grocery",
        });
      }

      // global_items — nur eintragen wenn nicht gelöscht
      for (const gi of deduplicatedGlobalItems) {
        if (gi.deleted) continue; // deleted-Einträge nie anzeigen
        const key = gi.name.toLowerCase();
        map.set(key, {
          name: gi.name,
          category: gi.category,
          timesUsed: gi.times_used,
          source: "global",
        });
      }

      for (const si of shoppingItems) {
        const key = si.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: si.name,
            category: si.category || "Sonstiges",
            timesUsed: shoppingCounts.get(key) || 0,
            source: "shopping",
          });
        }
      }

      if (!cancelled) {
        setArticles(Array.from(map.values()));
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [householdId, reloadTick]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // ── Merged categories (built-in + custom) ──────────────────────
  const mergedCategories = useMemo(() => {
    const set = new Set(getAllCategories());
    for (const c of customCategories) set.add(c);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [customCategories]);

  // ── Create new category ────────────────────────────────────────
  const handleCreateCategory = useCallback(
    async (name: string) => {
      if (!householdId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const builtIn = getAllCategories();
      const allExisting = [...builtIn, ...customCategories];
      if (allExisting.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
      const updated = [...customCategories, trimmed];
      setCustomCategories(updated);
      await saveCustomCategories(householdId, updated);
      setShowNewCategoryDrawer(false);
    },
    [householdId, customCategories],
  );

  // ── Rename category ────────────────────────────────────────────
  const handleRenameCategory = useCallback(
    async (oldName: string, newName: string) => {
      if (!householdId) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed.toLowerCase() === oldName.toLowerCase()) {
        setRenamingCategory(null);
        return;
      }
      // Update all articles that had the old category
      const articlesInCat = articles.filter(
        (a) => a.category.toLowerCase() === oldName.toLowerCase(),
      );
      for (const a of articlesInCat) {
        await upsertGlobalItem(householdId, a.name, trimmed, true);
      }
      // Update custom categories list
      const isCustom = customCategories.some(
        (c) => c.toLowerCase() === oldName.toLowerCase(),
      );
      if (isCustom) {
        const updated = customCategories.map((c) =>
          c.toLowerCase() === oldName.toLowerCase() ? trimmed : c,
        );
        setCustomCategories(updated);
        await saveCustomCategories(householdId, updated);
      } else {
        // It was a built-in category, add the new name as custom
        const updated = [...customCategories, trimmed];
        setCustomCategories(updated);
        await saveCustomCategories(householdId, updated);
      }
      setRenamingCategory(null);
      reload();
    },
    [householdId, articles, customCategories, reload],
  );

  // ── Delete empty category ──────────────────────────────────────
  const handleDeleteCategory = useCallback(
    async (catName: string) => {
      if (!householdId) return;
      const isCustom = customCategories.some(
        (c) => c.toLowerCase() === catName.toLowerCase(),
      );
      if (!isCustom) return; // can only delete custom categories
      const updated = customCategories.filter(
        (c) => c.toLowerCase() !== catName.toLowerCase(),
      );
      setCustomCategories(updated);
      await saveCustomCategories(householdId, updated);
      reload();
    },
    [householdId, customCategories, reload],
  );

  // ── Filter by search ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return articles;
    const q = query.toLowerCase();
    return articles.filter((a) => a.name.toLowerCase().includes(q));
  }, [articles, query]);

  // ── Sort ────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === "az") {
      arr.sort((a, b) => a.name.localeCompare(b.name, "de"));
    } else if (sortMode === "haeufigkeit") {
      arr.sort((a, b) => {
        const aZero = a.timesUsed === 0 ? 1 : 0;
        const bZero = b.timesUsed === 0 ? 1 : 0;
        if (aZero !== bZero) return aZero - bZero;
        if (a.timesUsed !== b.timesUsed) return b.timesUsed - a.timesUsed;
        return a.name.localeCompare(b.name, "de");
      });
    } else {
      arr.sort((a, b) => {
        const catCmp = a.category.localeCompare(b.category, "de");
        if (catCmp !== 0) return catCmp;
        return a.name.localeCompare(b.name, "de");
      });
    }
    return arr;
  }, [filtered, sortMode]);

  // ── Group by category (for "kategorie" mode) ───────────────────
  const grouped = useMemo(() => {
    if (sortMode !== "kategorie") return null;
    const groups: { category: string; items: MergedArticle[] }[] = [];
    let current: string | null = null;
    for (const a of sorted) {
      if (a.category !== current) {
        current = a.category;
        groups.push({ category: current, items: [] });
      }
      groups[groups.length - 1].items.push(a);
    }
    // Add empty custom categories that have no articles
    const existingCats = new Set(groups.map((g) => g.category.toLowerCase()));
    for (const cc of customCategories) {
      if (!existingCats.has(cc.toLowerCase())) {
        groups.push({ category: cc, items: [] });
      }
    }
    // Re-sort groups alphabetically
    groups.sort((a, b) => a.category.localeCompare(b.category, "de"));
    return groups;
  }, [sorted, sortMode, customCategories]);

  // ── Long press handler ─────────────────────────────────────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (article: MergedArticle, e: React.PointerEvent) => {
      longPressTriggered.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;

        // Position popover near the press point
        const x = e.clientX;
        const y = e.clientY;
        setPopoverArticle(article);
        setPopoverPos({ x, y });
      }, 500);
    },
    [],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressTimer.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 5 || dy > 5) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ── Add article flow ──────────────────────────────────────────
  const handleAddCategorySelect = useCallback(
    async (category: string) => {
      if (!householdId) return;
      await upsertGlobalItem(householdId, addName.trim(), category);
      setShowAddDrawer(false);
      setAddName("");
      setAddStep("name");
      reload();
    },
    [householdId, addName, reload],
  );

  const handleNameSubmit = useCallback(() => {
    if (!addName.trim()) return;
    setAddStep("category");
  }, [addName]);

  // ── Category change ────────────────────────────────────────────
  const handleCategoryChange = useCallback(
    async (category: string) => {
      if (!householdId || !catChangeArticle) return;
      // category_only = true → don't increment times_used
      await upsertGlobalItem(householdId, catChangeArticle.name, category, true);
      setCatChangeArticle(null);
      reload();
    },
    [householdId, catChangeArticle, reload],
  );

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!householdId || !deleteArticle) return;
    if (deleteArticle.source === "grocery") {
      // Soft-delete: create a global_items entry with deleted: true
      // so the GROCERY_DATABASE item gets filtered out in the merge
      await upsertGlobalItem(householdId, deleteArticle.name, deleteArticle.category, true, {
        deleted: true,
        original_name: deleteArticle.name,
      });
    } else {
      // Hard-delete existing global_items entry (source === "global" or "shopping")
      await deleteGlobalItem(householdId, deleteArticle.name);
    }
    setDeleteArticle(null);
    reload();
  }, [householdId, deleteArticle, reload]);

  // ── Rename ─────────────────────────────────────────────────────
  const handleRenameArticle = useCallback(
    async (newName: string) => {
      if (!householdId || !renameArticle) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === renameArticle.name) {
        setRenameArticle(null);
        return;
      }
      const oldName = renameArticle.name;
      const cat = renameArticle.category;

      // Optimistic local update: replace old article with renamed one
      setArticles((prev) => {
        const updated = prev.filter(
          (a) => a.name.toLowerCase() !== oldName.toLowerCase(),
        );
        updated.push({
          name: trimmed,
          category: cat,
          timesUsed: renameArticle.timesUsed,
          source: "global",
        });
        return updated;
      });

      setRenameArticle(null);
      await renameGlobalItem(householdId, oldName, trimmed, cat);
      // Full reload to sync with server
      reload();
    },
    [householdId, renameArticle, reload],
  );

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: "az", label: "A–Z" },
    { key: "kategorie", label: "Kategorie" },
    { key: "haeufigkeit", label: "Häufigkeit" },
  ];

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "var(--zu-bg)" }}
    >
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--zu-border)" }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-surface-2 transition"
        >
          <ChevronLeft className="w-5 h-5 text-text-1" />
        </button>
        <h2 className="text-base font-semibold text-text-1">Alle Artikel</h2>
      </div>

      {/* ── Search + Segmented Control ── */}
      <div className="flex-shrink-0 pt-3 pb-0">
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem" }} className="flex flex-col gap-3">
        <div
          className="flex items-center gap-2 rounded-full px-3 py-2"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--zu-border)",
          }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-3)" }} />
          <input
            type="search"
            placeholder="Artikel suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-1)", caretColor: "var(--accent)" }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="w-5 h-5 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
            </button>
          )}
        </div>

        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: "var(--surface-2)" }}
        >
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortMode(opt.key)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: sortMode === opt.key ? "var(--surface)" : "transparent",
                color: sortMode === opt.key ? "var(--text-1)" : "var(--text-3)",
                boxShadow: sortMode === opt.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Article count + New Category button ── */}
        <div className="flex items-center justify-between pt-1 pb-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
            {sorted.length} Artikel
          </span>
          {sortMode === "kategorie" && (
            <button
              onClick={() => setShowNewCategoryDrawer(true)}
              className="text-xs font-semibold active:opacity-70 transition"
              style={{ color: "var(--accent)" }}
            >
              + Neue Kategorie
            </button>
          )}
        </div>
      </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem" }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{
                  borderColor: "var(--zu-border)",
                  borderTopColor: "var(--accent)",
                }}
              />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm" style={{ color: "var(--text-3)" }}>
                Keine Artikel gefunden
              </p>
            </div>
          ) : sortMode === "kategorie" && grouped ? (
            grouped.map((group) => {
              const catColor = getCatColor(group.category);
              const isEmpty = group.items.length === 0;
              const isCustom = customCategories.some(
                (c) => c.toLowerCase() === group.category.toLowerCase(),
              );
              return (
              <div key={group.category} className="mb-4">
                <div
                  className="sticky top-0 py-2 px-1 flex items-center gap-2"
                  style={{
                    background: "var(--zu-bg)",
                    zIndex: 5,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: catColor.text }}
                  />
                  <span
                    className="flex-1 text-xs font-bold uppercase tracking-wider"
                    style={{ color: "var(--text-1)" }}
                  >
                    {group.category}
                  </span>
                  <button
                    onClick={() => setRenamingCategory(group.category)}
                    className="w-6 h-6 flex items-center justify-center rounded-md active:bg-surface-2 transition"
                  >
                    <Pencil className="w-3 h-3" style={{ color: "var(--text-3)" }} />
                  </button>
                  {isEmpty && isCustom && (
                    <button
                      onClick={() => handleDeleteCategory(group.category)}
                      className="w-6 h-6 flex items-center justify-center rounded-md active:bg-surface-2 transition"
                    >
                      <Trash2 className="w-3 h-3" style={{ color: "var(--danger)" }} />
                    </button>
                  )}
                </div>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--zu-border)",
                  }}
                >
                  {group.items.map((article, idx) => (
                    <ArticleRow
                      key={`${article.name.toLowerCase()}-${idx}`}
                      article={article}
                      showBorder={idx < group.items.length - 1}
                      showCategory={false}
                      onPointerDown={(e) => handlePointerDown(article, e)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  ))}
                </div>
              </div>
              );
            })
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--zu-border)",
              }}
            >
              {sorted.map((article, idx) => (
                <ArticleRow
                  key={`${article.name.toLowerCase()}-${idx}`}
                  article={article}
                  showBorder={idx < sorted.length - 1}
                  showCategory
                  onPointerDown={(e) => handlePointerDown(article, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => {
          setAddName("");
          setAddStep("name");
          setShowAddDrawer(true);
        }}
        className="absolute flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
        style={{
          width: 56,
          height: 56,
          bottom: 24,
          right: 20,
          background: "var(--accent)",
          boxShadow: "0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent)",
          zIndex: 20,
        }}
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {/* ── Add Article Drawer ── */}
      <AnimatePresence>
        {showAddDrawer && (
          <AddArticleDrawer
            step={addStep}
            name={addName}
            categories={mergedCategories}
            onNameChange={setAddName}
            onNameSubmit={handleNameSubmit}
            onCategorySelect={handleAddCategorySelect}
            onClose={() => {
              setShowAddDrawer(false);
              setAddName("");
              setAddStep("name");
            }}
            onBack={() => setAddStep("name")}
          />
        )}
      </AnimatePresence>

      {/* ── Long Press Popover ── */}
      <AnimatePresence>
        {popoverArticle && popoverPos && (
          <Popover
            position={popoverPos}
            onClose={() => { setPopoverArticle(null); setPopoverPos(null); }}
            items={[
              {
                icon: <Type className="w-4 h-4" />,
                label: "Umbenennen",
                action: () => {
                  const a = popoverArticle;
                  setPopoverArticle(null);
                  setPopoverPos(null);
                  setRenameArticle(a);
                },
              },
              {
                icon: <Pencil className="w-4 h-4" />,
                label: "Kategorie wechseln",
                action: () => {
                  const a = popoverArticle;
                  setPopoverArticle(null);
                  setPopoverPos(null);
                  setCatChangeArticle(a);
                },
              },
              {
                icon: <Trash2 className="w-4 h-4 text-danger" />,
                label: "Löschen",
                danger: true,
                action: () => {
                  const a = popoverArticle;
                  setPopoverArticle(null);
                  setPopoverPos(null);
                  setDeleteArticle(a);
                },
              },
            ]}
          />
        )}
      </AnimatePresence>

      {/* ── Category Change Drawer ── */}
      <AnimatePresence>
        {catChangeArticle && (
          <CategoryPickerDrawer
            itemName={catChangeArticle.name}
            categories={mergedCategories}
            onSelect={handleCategoryChange}
            onClose={() => setCatChangeArticle(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ── */}
      <AnimatePresence>
        {deleteArticle && (
          <DeleteConfirmModal
            articleName={deleteArticle.name}
            onConfirm={handleDelete}
            onCancel={() => setDeleteArticle(null)}
          />
        )}
      </AnimatePresence>

      {/* ── New Category Drawer ── */}
      <AnimatePresence>
        {showNewCategoryDrawer && (
          <NewCategoryDrawer
            onSubmit={handleCreateCategory}
            onClose={() => setShowNewCategoryDrawer(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Rename Category Drawer ── */}
      <AnimatePresence>
        {renamingCategory && (
          <RenameCategoryDrawer
            currentName={renamingCategory}
            onSubmit={(newName) => handleRenameCategory(renamingCategory, newName)}
            onClose={() => setRenamingCategory(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Rename Article Drawer ── */}
      <AnimatePresence>
        {renameArticle && (
          <RenameArticleDrawer
            currentName={renameArticle.name}
            onSubmit={handleRenameArticle}
            onClose={() => setRenameArticle(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Article Row ────────────────────────────────────────────────────
function ArticleRow({
  article,
  showBorder,
  showCategory,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  article: MergedArticle;
  showBorder: boolean;
  showCategory: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  const catColor = getCatColor(article.category);

  return (
    <div
      className="flex items-center px-4 py-3 gap-3 active:bg-surface-2 transition select-none"
      style={{
        borderBottom: showBorder ? "1px solid var(--zu-border)" : "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className="flex-1 text-sm font-medium truncate"
        style={{ color: "var(--text-1)" }}
      >
        {article.name}
      </span>

      {showCategory && (
        <span className="flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: catColor.text }}
          />
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--text-2)" }}
          >
            {article.category}
          </span>
        </span>
      )}

      {article.timesUsed > 0 && (
        <span
          className="flex-shrink-0 text-xs tabular-nums font-medium"
          style={{ color: "var(--text-3)", minWidth: 16, textAlign: "right" }}
        >
          {article.timesUsed}×
        </span>
      )}
    </div>
  );
}

// ── Popover ────────────────────────────────────────────────────────
function Popover({
  position,
  onClose,
  items,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  items: { icon: React.ReactNode; label: string; danger?: boolean; action: () => void }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState(position);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;

    if (x + rect.width > vw - 16) x = vw - rect.width - 16;
    if (x < 16) x = 16;
    if (y + rect.height > vh - 16) y = y - rect.height - 8;
    if (y < 16) y = 16;

    setAdjusted({ x, y });
  }, [position]);

  return createPortal(
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 9999 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <div className="absolute inset-0" />
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        className="absolute rounded-xl p-1"
        style={{
          left: adjusted.x,
          top: adjusted.y,
          background: "var(--surface)",
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--zu-border)",
          minWidth: 192,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={item.action}
            className="w-full flex items-center gap-3 py-3 px-4 text-sm rounded-lg hover:bg-surface-2 active:bg-surface-2 transition"
            style={{ color: item.danger ? "var(--danger)" : "var(--text-1)" }}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── Add Article Drawer ─────────────────────────────────────────────
function AddArticleDrawer({
  step,
  name,
  categories,
  onNameChange,
  onNameSubmit,
  onCategorySelect,
  onClose,
  onBack,
}: {
  step: "name" | "category";
  name: string;
  categories: string[];
  onNameChange: (v: string) => void;
  onNameSubmit: () => void;
  onCategorySelect: (cat: string) => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const catFilterRef = useRef<HTMLInputElement>(null);
  const [catFilter, setCatFilter] = useState("");

  const filteredCats = useMemo(() => {
    if (!catFilter.trim()) return categories;
    const q = catFilter.toLowerCase();
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, catFilter]);

  const { bottomOffset: addBottomOffset, vpHeight: addVpHeight } = useKeyboardOffset();

  useEffect(() => {
    if (step === "name") {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    } else {
      setCatFilter("");
      setTimeout(() => catFilterRef.current?.focus(), 100);
    }
  }, [step]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bg-surface rounded-t-[20px] flex flex-col"
        style={{
          maxHeight: addVpHeight - 72,
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
          bottom: addBottomOffset,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        {step === "name" ? (
          <div className="px-5 pb-5 flex flex-col gap-3">
            <h3 className="text-base font-bold text-text-1">Neuer Artikel</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onNameSubmit();
              }}
              autoComplete="off"
            >
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-3"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--zu-border)",
                }}
              >
                <input
                  ref={nameInputRef}
                  type="search"
                  placeholder="Artikelname eingeben…"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="sentences"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
                  style={{ caretColor: "var(--accent)" }}
                />
              </div>
              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full mt-3 py-3 rounded-full text-sm font-semibold text-white transition"
                style={{
                  background: name.trim() ? "var(--accent)" : "var(--surface-2)",
                  color: name.trim() ? "white" : "var(--text-3)",
                }}
              >
                Weiter
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="px-5 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={onBack}
                  className="w-8 h-8 flex items-center justify-center rounded-lg active:bg-surface-2 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-text-1" />
                </button>
                <div>
                  <h3 className="text-base font-bold text-text-1">Kategorie wählen</h3>
                  <p className="text-sm text-text-2 mt-0.5">
                    Für &bdquo;{name}&ldquo;
                  </p>
                </div>
              </div>
            </div>
            {/* Category search */}
            <div className="px-5 pb-2 flex-shrink-0">
              <div
                className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2"
                style={{ border: "1px solid var(--zu-border)" }}
              >
                <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
                <input
                  ref={catFilterRef}
                  type="search"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="sentences"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  placeholder="Kategorie suchen..."
                  className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
                  style={{ caretColor: "var(--accent)" }}
                />
                {catFilter && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setCatFilter("")}
                    className="text-text-3 hover:text-text-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto px-5 pb-5 min-h-0"
              style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
            >
              <div className="flex flex-wrap gap-2">
                {filteredCats.map((cat) => {
                  const c = getCatColor(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => onCategorySelect(cat)}
                      onPointerDown={(e) => e.preventDefault()}
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition whitespace-nowrap bg-surface-2 hover:opacity-80 text-[12px]"
                      style={{ color: "var(--text-1)" }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.text }}
                      />
                      {cat}
                    </button>
                  );
                })}
                {filteredCats.length === 0 && (
                  <p className="text-sm text-text-2 text-center py-4 w-full">
                    Keine Kategorien gefunden
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── Category Picker Drawer (for changing category) ─────────────────
function CategoryPickerDrawer({
  itemName,
  categories,
  onSelect,
  onClose,
}: {
  itemName: string;
  categories: string[];
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return categories;
    const q = filterQuery.toLowerCase().trim();
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, filterQuery]);

  const { bottomOffset: catBottomOffset, vpHeight: catVpHeight } = useKeyboardOffset();

  useEffect(() => {
    setTimeout(() => filterInputRef.current?.focus(), 100);
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bg-surface rounded-t-[20px] flex flex-col"
        style={{
          maxHeight: catVpHeight - 72,
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
          bottom: catBottomOffset,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-2 flex-shrink-0">
          <h3 className="text-base font-bold text-text-1">Kategorie wechseln</h3>
          <p className="text-sm text-text-2 mt-0.5">
            Für &bdquo;{itemName}&ldquo;
          </p>
        </div>
        {/* Search */}
        <div className="px-5 pb-2 flex-shrink-0">
          <div
            className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2"
            style={{ border: "1px solid var(--zu-border)" }}
          >
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              ref={filterInputRef}
              type="search"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="sentences"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Kategorie suchen..."
              className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
              style={{ caretColor: "var(--accent)" }}
            />
            {filterQuery && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setFilterQuery("")}
                className="text-text-3 hover:text-text-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 pb-5 min-h-0"
          style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
        >
          <div className="flex flex-wrap gap-2">
            {filtered.map((cat) => {
              const c = getCatColor(cat);
              return (
              <button
                key={cat}
                onClick={() => onSelect(cat)}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition whitespace-nowrap bg-surface-2 hover:opacity-80 text-[12px]"
                style={{ color: "var(--text-1)" }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.text }}
                />
                {cat}
              </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-text-2 text-center py-4 w-full">
                Keine Kategorien gefunden
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────
function DeleteConfirmModal({
  articleName,
  onConfirm,
  onCancel,
}: {
  articleName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { bottomOffset: delBottomOffset, vpHeight: delVpHeight } = useKeyboardOffset();
  return createPortal(
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 9999 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
      />
      <motion.div
        className="absolute left-0 right-0 bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        style={{ boxShadow: "var(--shadow-elevated)", bottom: delBottomOffset, maxHeight: delVpHeight - 72 }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <h3 className="text-base font-bold text-text-1 text-center">
          Artikel löschen?
        </h3>
        <p className="text-sm text-text-3 text-center mt-2 mb-5">
          &bdquo;{articleName}&ldquo; wird aus deiner Artikeldatenbank entfernt.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-2 text-sm font-semibold transition"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-danger text-white text-sm font-semibold transition"
          >
            Löschen
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── New Category Drawer ────────────────────────────────────────────
function NewCategoryDrawer({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const { bottomOffset: newCatBottomOffset, vpHeight: newCatVpHeight } = useKeyboardOffset();

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bg-surface rounded-t-[20px]"
        style={{
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
          bottom: newCatBottomOffset,
          maxHeight: newCatVpHeight - 72,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3">
          <h3 className="text-base font-bold text-text-1">Neue Kategorie</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onSubmit(name);
            }}
            autoComplete="off"
          >
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-3"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--zu-border)",
              }}
            >
              <input
                ref={inputRef}
                type="search"
                placeholder="Kategoriename eingeben…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
                style={{ caretColor: "var(--accent)" }}
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full mt-3 py-3 rounded-full text-sm font-semibold transition"
              style={{
                background: name.trim() ? "var(--accent)" : "var(--surface-2)",
                color: name.trim() ? "white" : "var(--text-3)",
              }}
            >
              Anlegen
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── Rename Category Drawer ─────────────────────────────────────────
function RenameCategoryDrawer({
  currentName,
  onSubmit,
  onClose,
}: {
  currentName: string;
  onSubmit: (newName: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const { bottomOffset: renameBottomOffset, vpHeight: renameVpHeight } = useKeyboardOffset();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bg-surface rounded-t-[20px]"
        style={{
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
          bottom: renameBottomOffset,
          maxHeight: renameVpHeight - 72,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3">
          <h3 className="text-base font-bold text-text-1">Kategorie umbenennen</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onSubmit(name);
            }}
            autoComplete="off"
          >
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-3"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--zu-border)",
              }}
            >
              <input
                ref={inputRef}
                type="search"
                placeholder="Neuer Kategoriename eingeben…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
                style={{ caretColor: "var(--accent)" }}
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full mt-3 py-3 rounded-full text-sm font-semibold transition"
              style={{
                background: name.trim() ? "var(--accent)" : "var(--surface-2)",
                color: name.trim() ? "white" : "var(--text-3)",
              }}
            >
              Umbenennen
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ── Rename Article Drawer ──────────────────────────────────────────
function RenameArticleDrawer({
  currentName,
  onSubmit,
  onClose,
}: {
  currentName: string;
  onSubmit: (newName: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const { bottomOffset: artBottomOffset, vpHeight: artVpHeight } = useKeyboardOffset();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bg-surface rounded-t-[20px]"
        style={{
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
          bottom: artBottomOffset,
          maxHeight: artVpHeight - 72,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3">
          <h3 className="text-base font-bold text-text-1">Artikel umbenennen</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onSubmit(name);
            }}
            autoComplete="off"
          >
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-3"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--zu-border)",
              }}
            >
              <input
                ref={inputRef}
                type="search"
                placeholder="Neuer Artikelname eingeben…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
                style={{ caretColor: "var(--accent)" }}
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full mt-3 py-3 rounded-full text-sm font-semibold transition"
              style={{
                background: name.trim() ? "var(--accent)" : "var(--surface-2)",
                color: name.trim() ? "white" : "var(--text-3)",
              }}
            >
              Umbenennen
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}