import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Search, Heart, Clock, ChevronLeft, Star, Minus, ExternalLink,
  Pencil, X, Loader2, Link2, FileText, Camera, Trash2, ArrowRightLeft, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../supabase-client";
import { useKvRealtime, broadcastChange } from "../use-kv-realtime";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import type {
  Recipe, MealPlanEntry, Ingredient, RecipeStep, CategoryFilter,
} from "./kochen-types";
import { RECIPE_CATEGORIES } from "./kochen-types";
import { useBackHandler, pushBack, popBack } from "../ui/use-back-handler";
import { useAuth } from "../auth-context";

const DRAWER_SPRING = { type: "spring" as const, damping: 25, stiffness: 300 };

// ── Helpers ────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12);
}

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function dayLabel(d: Date) {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return days[d.getDay()];
}

function dateNum(d: Date) {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function totalTime(r: Recipe) {
  const t = (r.prep_time_minutes || 0) + (r.cook_time_minutes || 0);
  return t > 0 ? `${t} Min.` : null;
}

function isToday(d: Date) {
  const now = new Date();
  return fmtDate(d) === fmtDate(now);
}

// Generate 11 days: today −3 .. today +7
function generateDays(): Date[] {
  const result: Date[] = [];
  const now = new Date();
  for (let i = -3; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    result.push(d);
  }
  return result;
}

// ── Empty recipe template ──────────────────────────────────────────

function emptyRecipe(): Recipe {
  return {
    id: genId(),
    title: "",
    description: "",
    prep_time_minutes: null,
    cook_time_minutes: null,
    servings: 4,
    ingredients: [],
    steps: [],
    image_url: null,
    categories: [],
    source_url: "",
    rating: 0,
    comment: "",
    is_favorite: false,
    household_id: "",
    created_at: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════
// MAIN KOCHEN SCREEN
// ══════════════════════════════════════════════════════════════════════

export function KochenScreen({ openRecipeId }: { openRecipeId?: string | null } = {}) {
  const { householdId } = useAuth();
  // ── State ──────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Views
  const [activeView, setActiveView] = useState<"main" | "detail" | "edit">("main");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);

  // Kochbuch filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("Alle");
  const [searchQuery, setSearchQuery] = useState("");

  // Bottom sheets / modals
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [importing, setImporting] = useState(false);

  // Meal plan modals
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [showFreetextInput, setShowFreetextInput] = useState(false);
  const [mealPickerDate, setMealPickerDate] = useState<string | null>(null);
  const [freetextValue, setFreetextValue] = useState("");
  const [mealPickerSearch, setMealPickerSearch] = useState("");

  // Day popover (long-press on occupied day)
  const [dayPopover, setDayPopover] = useState<{ date: string; x: number; y: number } | null>(null);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [moveSourceDate, setMoveSourceDate] = useState<string | null>(null);

  // Zutaten-Transfer modal
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [ingredientsRecipe, setIngredientsRecipe] = useState<Recipe | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [ingredientStore, setIngredientStore] = useState("alle");
  const [stores, setStores] = useState<any[]>([]);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Wochenplaner scroll ref
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Segmented control
  const [kochenTab, setKochenTab] = useState<"rezepte" | "wochenplaner">("rezepte");

  // ── Back-gesture handlers for drawers/modals ──────────────────────
  useBackHandler(showAddSheet, () => setShowAddSheet(false));
  useBackHandler(showUrlImport, () => { setShowUrlImport(false); setUrlInput(""); });
  useBackHandler(showMealPicker, () => { setShowMealPicker(false); setMealPickerDate(null); });
  useBackHandler(showFreetextInput, () => setShowFreetextInput(false));
  useBackHandler(!!dayPopover, () => setDayPopover(null));
  useBackHandler(showMoveSheet, () => setShowMoveSheet(false));
  useBackHandler(showIngredientsModal, () => { setShowIngredientsModal(false); setIngredientsRecipe(null); });
  useBackHandler(!!deleteConfirm, () => setDeleteConfirm(null));

  // ── Load data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [recipeRes, mealRes, storeRes] = await Promise.all([
        apiFetch(`/recipes?household_id=${householdId}`),
        apiFetch(`/meal-plan?household_id=${householdId}`),
        apiFetch(`/store-settings?household_id=${householdId}`),
      ]);
      setRecipes(recipeRes.recipes || []);
      setMealPlan(mealRes.entries || []);
      setStores(storeRes.settings || []);
    } catch (err) {
      console.error("Fehler beim Laden der Kochen-Daten:", err);
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Supabase Realtime subscription for live sync ──
  useKvRealtime(
    [`recipes:${householdId}`, `meal_plan:${householdId}`],
    loadData,
  );

  // ── Visibility / focus handlers for reconnection ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[Kochen] App visible again, reloading data...");
        loadData();
      }
    };
    const handleFocus = () => {
      console.log("[Kochen] Window focused, reloading data...");
      loadData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadData]);

  // Center today in the week scroller on mount and when switching to wochenplaner tab
  useEffect(() => {
    if (kochenTab === "wochenplaner" && weekScrollRef.current) {
      // Today is at index 3 (0-based), each card ~120px wide + 12px gap
      const cardWidth = 120;
      const gap = 12;
      const idx = 3;
      const scrollLeft = idx * (cardWidth + gap) - weekScrollRef.current.clientWidth / 2 + cardWidth / 2;
      weekScrollRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [loading, kochenTab]);

  // ── Save helpers ───────────────────────────────────────────────────

  const saveRecipes = useCallback(async (updated: Recipe[]) => {
    setRecipes(updated);
    try {
      broadcastChange([`recipes:${householdId}`]);
      await apiFetch("/recipes", {
        method: "PUT",
        body: JSON.stringify({ household_id: householdId, recipes: updated }),
      });
    } catch (err) {
      console.error("Fehler beim Speichern der Rezepte:", err);
      toast.error("Speichern fehlgeschlagen");
    }
  }, [householdId]);

  const saveMealPlan = useCallback(async (updated: MealPlanEntry[]) => {
    setMealPlan(updated);
    try {
      broadcastChange([`meal_plan:${householdId}`]);
      await apiFetch("/meal-plan", {
        method: "PUT",
        body: JSON.stringify({ household_id: householdId, entries: updated }),
      });
    } catch (err) {
      console.error("Fehler beim Speichern des Wochenplans:", err);
      toast.error("Speichern fehlgeschlagen");
    }
  }, [householdId]);

  // ── Derived data ───────────────────────────────────────────────────

  const days = useMemo(() => generateDays(), []);

  const mealByDate = useMemo(() => {
    const m = new Map<string, MealPlanEntry>();
    mealPlan.forEach((e) => m.set(e.date, e));
    return m;
  }, [mealPlan]);

  const filteredRecipes = useMemo(() => {
    let list = recipes;
    if (categoryFilter === "Favoriten") {
      list = list.filter((r) => r.is_favorite);
    } else if (categoryFilter === "Schnell") {
      list = list.filter((r) => {
        const t = (r.prep_time_minutes || 0) + (r.cook_time_minutes || 0);
        return t > 0 && t <= 30;
      });
    } else if (categoryFilter !== "Alle") {
      list = list.filter((r) => r.categories.includes(categoryFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [recipes, categoryFilter, searchQuery]);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  // ── Handlers ───────────────────────────────────────────────────────

  const openRecipeDetail = (id: string) => {
    setSelectedRecipeId(id);
    setActiveView("detail");
    pushBack(() => { setActiveView("main"); setSelectedRecipeId(null); });
  };

  // Deep-link: open a specific recipe when the prop changes
  useEffect(() => {
    if (openRecipeId && !loading) {
      openRecipeDetail(openRecipeId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecipeId, loading]);

  const openEditMode = (recipe: Recipe) => {
    setEditRecipe({ ...recipe, ingredients: [...recipe.ingredients], steps: [...recipe.steps], categories: [...recipe.categories] });
    setActiveView("edit");
    pushBack(() => {
      setEditRecipe(null);
      if (selectedRecipeId) setActiveView("detail");
      else setActiveView("main");
    });
  };

  const saveEdit = async () => {
    if (!editRecipe) return;
    const cameFromDetail = !!selectedRecipeId; // true if editing existing recipe from detail view
    const updated = recipes.map((r) => (r.id === editRecipe.id ? editRecipe : r));
    // If new recipe (not in list), add
    if (!recipes.find((r) => r.id === editRecipe.id)) {
      updated.push(editRecipe);
    }
    await saveRecipes(updated);
    setSelectedRecipeId(editRecipe.id);
    setActiveView("detail");
    setEditRecipe(null);
    popBack(); // remove edit history entry
    // If this was a new recipe (came from main → edit, not detail → edit),
    // we need to push a detail handler so swipe-back works on the detail view.
    if (!cameFromDetail) {
      pushBack(() => { setActiveView("main"); setSelectedRecipeId(null); });
    }
    toast.success("Rezept gespeichert");
  };

  const toggleFavorite = async (id: string) => {
    const updated = recipes.map((r) =>
      r.id === id ? { ...r, is_favorite: !r.is_favorite } : r
    );
    await saveRecipes(updated);
  };

  const setRating = async (id: string, rating: number) => {
    const updated = recipes.map((r) => (r.id === id ? { ...r, rating } : r));
    await saveRecipes(updated);
  };

  // ── Day interactions ───────────────────────────────────────────────

  const handleDayTap = (dateStr: string) => {
    const entry = mealByDate.get(dateStr);
    if (entry?.recipe_id) {
      openRecipeDetail(entry.recipe_id);
    } else if (!entry) {
      // Empty day → open picker
      setMealPickerDate(dateStr);
      setShowMealPicker(true);
    }
  };

  const handleDayLongPressStart = (dateStr: string, e: React.TouchEvent | React.MouseEvent) => {
    const entry = mealByDate.get(dateStr);
    if (!entry) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => {
      setDayPopover({ date: dateStr, x: clientX, y: clientY });
    }, 500);
  };

  const handleDayLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const assignRecipeToDate = async (recipeId: string, dateStr: string) => {
    const existing = mealPlan.filter((e) => e.date !== dateStr);
    existing.push({
      id: genId(),
      date: dateStr,
      recipe_id: recipeId,
      free_text: null,
      household_id: householdId || "",
    });
    await saveMealPlan(existing);
    setShowMealPicker(false);
    setMealPickerDate(null);
    setMealPickerSearch("");

    // Offer ingredient transfer
    const recipe = recipes.find((r) => r.id === recipeId);
    if (recipe && recipe.ingredients.length > 0) {
      setIngredientsRecipe(recipe);
      setSelectedIngredients(recipe.ingredients.map(() => true));
      setShowIngredientsModal(true);
    }
  };

  const assignFreetextToDate = async (text: string, dateStr: string) => {
    const existing = mealPlan.filter((e) => e.date !== dateStr);
    existing.push({
      id: genId(),
      date: dateStr,
      recipe_id: null,
      free_text: text,
      household_id: householdId || "",
    });
    await saveMealPlan(existing);
    setShowFreetextInput(false);
    setFreetextValue("");
    setMealPickerDate(null);
  };

  const deleteMealEntry = async (dateStr: string) => {
    await saveMealPlan(mealPlan.filter((e) => e.date !== dateStr));
    setDayPopover(null);
    setDeleteConfirm(null);
  };

  const moveMealEntry = async (fromDate: string, toDate: string) => {
    const entry = mealByDate.get(fromDate);
    if (!entry) return;
    const updated = mealPlan.filter((e) => e.date !== fromDate);
    updated.push({ ...entry, id: genId(), date: toDate });
    await saveMealPlan(updated);
    setShowMoveSheet(false);
    setMoveSourceDate(null);
    setDayPopover(null);
    toast.success("Verschoben");
  };

  // ── URL import ─────────────────────────────────────────────────────

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      toast.error("VITE_ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in Vercel unter Environment Variables hinterlegen.");
      return;
    }
    setImporting(true);
    try {
      const res = await apiFetch("/import-recipe", {
        method: "POST",
        body: JSON.stringify({ url: urlInput.trim(), anthropic_api_key: anthropicKey }),
      });
      if (res.recipe) {
        const newRecipe: Recipe = {
          ...emptyRecipe(),
          ...res.recipe,
          id: genId(),
          household_id: householdId || "",
          created_at: new Date().toISOString(),
          rating: 0,
          comment: "",
          is_favorite: false,
          categories: res.recipe.categories || [],
          ingredients: res.recipe.ingredients || [],
          steps: res.recipe.steps || [],
        };
        setEditRecipe(newRecipe);
        setActiveView("edit");
        setShowUrlImport(false);
        setShowAddSheet(false);
        setUrlInput("");
        pushBack(() => { setEditRecipe(null); setActiveView("main"); });
        toast.success("Rezept importiert — bitte prüfen");
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast.error(err?.message || "Import fehlgeschlagen");
    } finally {
      setImporting(false);
    }
  };

  // ── Ingredients to shopping list ───────────────────────────────────

  const addIngredientsToShopping = async () => {
    if (!ingredientsRecipe) return;
    try {
      const shoppingRes = await apiFetch(`/shopping?household_id=${householdId}`);
      const existingItems: any[] = shoppingRes.items || [];
      const chosen = ingredientsRecipe.ingredients.filter((_, i) => selectedIngredients[i]);
      const newItems = chosen.map((ing, i) => ({
        id: genId(),
        name: `${ing.quantity ? ing.quantity + " " : ""}${ing.unit ? ing.unit + " " : ""}${ing.name}`.trim(),
        store: ingredientStore,
        category: "Sonstiges",
        is_checked: false,
        position: existingItems.length + i,
        quantity: 1,
        unit: null,
        household_id: householdId || "",
      }));
      await apiFetch("/shopping", {
        method: "PUT",
        body: JSON.stringify({
          household_id: householdId,
          items: [...existingItems, ...newItems],
        }),
      });
      toast.success(`${chosen.length} Zutaten hinzugefügt`);
    } catch (err) {
      console.error("Fehler beim Hinzufügen zur Einkaufsliste:", err);
      toast.error("Fehler beim Hinzufügen");
    }
    setShowIngredientsModal(false);
    setIngredientsRecipe(null);
  };

  // Delete a recipe
  const deleteRecipe = async (id: string) => {
    const updated = recipes.filter((r) => r.id !== id);
    // Also remove from meal plan
    const updatedMeal = mealPlan.filter((e) => e.recipe_id !== id);
    await saveRecipes(updated);
    await saveMealPlan(updatedMeal);
    popBack(); // pop detail history entry
    setActiveView("main");
    setSelectedRecipeId(null);
    toast.success("Rezept gelöscht");
  };

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // ── Recipe Detail View ─────────────────────────────────────────────
  if (activeView === "detail" && selectedRecipe) {
    return (
      <RecipeDetailView
        recipe={selectedRecipe}
        onBack={() => { popBack(); setActiveView("main"); setSelectedRecipeId(null); }}
        onEdit={() => openEditMode(selectedRecipe)}
        onToggleFavorite={() => toggleFavorite(selectedRecipe.id)}
        onSetRating={(r) => setRating(selectedRecipe.id, r)}
        onDelete={() => setDeleteConfirm(selectedRecipe.id)}
        onAddToShopping={() => {
          if (selectedRecipe.ingredients.length > 0) {
            setIngredientsRecipe(selectedRecipe);
            setSelectedIngredients(selectedRecipe.ingredients.map(() => true));
            setShowIngredientsModal(true);
          }
        }}
        onSaveComment={async (comment) => {
          const updated = recipes.map((r) =>
            r.id === selectedRecipe.id ? { ...r, comment } : r
          );
          await saveRecipes(updated);
        }}
        stores={stores}
      />
    );
  }

  // ── Recipe Edit View ───────────────────────────────────────────────
  if (activeView === "edit" && editRecipe) {
    return (
      <RecipeEditView
        recipe={editRecipe}
        onChange={setEditRecipe}
        onSave={saveEdit}
        onCancel={() => {
          popBack(); // remove edit history entry
          setEditRecipe(null);
          if (selectedRecipeId) setActiveView("detail");
          else setActiveView("main");
        }}
      />
    );
  }

  // ── Main View (Wochenplaner + Kochbuch) ────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header + Segmented Control */}
      <div className="flex-shrink-0 flex flex-col items-center gap-3 px-4 pt-4 pb-2" style={{ background: 'var(--zu-bg)' }}>
        <div className="w-full flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-1">Kochen</h2>
        </div>
        {/* Segmented Control */}
        <div
          className="flex items-center"
          style={{
            width: 220,
            padding: 3,
            borderRadius: 999,
            background: "var(--color-surface-2)",
          }}
        >
          {(["rezepte", "wochenplaner"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setKochenTab(tab)}
              className="flex-1 text-center text-xs py-1.5 transition-all"
              style={{
                borderRadius: 999,
                fontWeight: kochenTab === tab ? 600 : 400,
                color: kochenTab === tab ? "var(--color-text-1)" : "var(--color-text-3)",
                background: kochenTab === tab
                  ? "var(--color-surface)"
                  : "transparent",
                boxShadow: kochenTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab === "rezepte" ? "Rezepte" : "Wochenplaner"}
            </button>
          ))}
        </div>
      </div>

      {/* WOCHENPLANER — only when tab active */}
      {kochenTab === "wochenplaner" && (
      <div className="flex-shrink-0 border-b border-border" style={{ background: 'var(--surface)' }}>
        <div className="px-4 pt-3 pb-1" />
        <div
          ref={weekScrollRef}
          className="flex gap-3 overflow-x-auto px-4 pb-4 pt-1 scrollbar-hide"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {days.map((d) => {
            const dateStr = fmtDate(d);
            const entry = mealByDate.get(dateStr);
            const recipe = entry?.recipe_id ? recipes.find((r) => r.id === entry.recipe_id) : null;
            const today = isToday(d);
            return (
              <div
                key={dateStr}
                className="flex-shrink-0 flex flex-col items-center"
                style={{ width: 120, scrollSnapAlign: "center" }}
              >
                {/* Day label */}
                <div className={`text-xs font-medium mb-1 ${today ? "text-accent" : "text-text-3"}`}>
                  {dayLabel(d)} {dateNum(d)}
                </div>
                {/* Card */}
                <div
                  className={`w-full rounded-xl overflow-hidden cursor-pointer transition-all ${
                    today ? "ring-2 ring-accent ring-offset-1" : "border border-border"
                  }`}
                  style={{ height: 140 }}
                  onClick={() => handleDayTap(dateStr)}
                  onTouchStart={(e) => handleDayLongPressStart(dateStr, e)}
                  onTouchEnd={handleDayLongPressEnd}
                  onTouchCancel={handleDayLongPressEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (entry) {
                      setDayPopover({ date: dateStr, x: e.clientX, y: e.clientY });
                    }
                  }}
                >
                  {recipe ? (
                    <div className="h-full flex flex-col">
                      <div className="flex-1 bg-surface-2">
                        {recipe.image_url ? (
                          <ImageWithFallback
                            src={recipe.image_url}
                            alt={recipe.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">
                            🍽️
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5 bg-surface">
                        <p className="text-xs font-medium text-text-1 truncate">{recipe.title}</p>
                      </div>
                    </div>
                  ) : entry?.free_text ? (
                    <div className="h-full flex flex-col items-center justify-center bg-accent-light px-2">
                      <span className="text-2xl mb-1">📝</span>
                      <p className="text-xs text-text-2 text-center truncate w-full">{entry.free_text}</p>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-surface-2">
                      <Plus className="w-6 h-6 text-text-3" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* KOCHBUCH — visible in both tabs (recipes always, wochenplaner shows it below) */}
      {kochenTab === "rezepte" && (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* + Button only, no title — screen title "Kochen" is enough */}
        <div className="flex items-center justify-end px-4 pt-2 pb-2">
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {RECIPE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs transition ${
                  categoryFilter === cat
                    ? "font-semibold"
                    : "font-medium"
                }`}
                style={
                  categoryFilter === cat
                    ? {
                        background: "var(--accent-light)",
                        color: "var(--accent)",
                        border: "1.5px solid var(--accent)",
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-2)",
                        border: "1px solid var(--zu-border)",
                      }
                }
              >
                {cat === "Schnell" ? "Schnell (<30 Min)" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <input
              type="search"
              name="recipe-search"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              placeholder="Rezepte oder Zutaten suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-2 rounded-[var(--radius-input)] text-sm border-0 outline-none"
            />
          </div>
        </div>

        {/* Recipe Grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredRecipes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-3">
              <span className="text-4xl mb-3">📖</span>
              <p className="text-sm">Noch keine Rezepte</p>
              <p className="text-xs mt-1">Tippe auf + um ein Rezept hinzuzufügen</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-xl overflow-hidden bg-surface border border-border cursor-pointer active:scale-[0.98] transition"
                  onClick={() => openRecipeDetail(recipe.id)}
                >
                  <div className="relative aspect-square bg-surface-2">
                    {recipe.image_url ? (
                      <ImageWithFallback
                        src={recipe.image_url}
                        alt={recipe.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(recipe.id);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-surface/80 flex items-center justify-center"
                    >
                      <Heart
                        className={`w-4 h-4 ${recipe.is_favorite ? "fill-accent text-accent" : "text-text-3"}`}
                      />
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-medium text-text-1 truncate">{recipe.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {totalTime(recipe) && (
                        <span className="text-xs text-text-3 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {totalTime(recipe)}
                        </span>
                      )}
                      {recipe.categories[0] && (
                        <span className="text-xs text-text-3 ml-auto">{recipe.categories[0]}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── OVERLAYS / MODALS ─────────────────────────────────────── */}

      {/* Day Popover */}
      {dayPopover && (
        <div className="contents">
          <div className="fixed inset-0 z-[1000]" onClick={() => setDayPopover(null)} />
          <div
            className="fixed z-[1000] rounded-xl py-2 min-w-[200px]"
            style={{
              top: Math.min(dayPopover.y, window.innerHeight - 200),
              left: Math.min(dayPopover.x, window.innerWidth - 220),
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--zu-border)',
            }}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-text-2 hover:bg-surface-2 rounded-lg"
              onClick={() => {
                const entry = mealByDate.get(dayPopover.date);
                if (entry?.recipe_id) {
                  setDayPopover(null);
                  setMealPickerDate(dayPopover.date);
                  setShowMealPicker(true);
                }
              }}
            >
              Rezept ändern
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-text-2 hover:bg-surface-2 rounded-lg"
              onClick={() => {
                setMoveSourceDate(dayPopover.date);
                setShowMoveSheet(true);
              }}
            >
              Verschieben
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger-light rounded-lg"
              onClick={() => setDeleteConfirm(dayPopover.date)}
            >
              Löschen
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <motion.div
              className="relative w-full bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
              style={{ boxShadow: "var(--shadow-elevated)" }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <h3 className="text-base font-semibold text-text-1 text-center mb-2">Eintrag löschen?</h3>
              <p className="text-sm text-text-3 text-center mb-5">Der Wochenplan-Eintrag wird entfernt.</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-surface-2 text-text-2"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Abbrechen
                </button>
                <button
                  className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-danger text-white"
                  onClick={() => deleteMealEntry(deleteConfirm)}
                >
                  Löschen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move Sheet */}
      <AnimatePresence>
        {showMoveSheet && moveSourceDate && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowMoveSheet(false); setMoveSourceDate(null); }} />
            <motion.div
              className="relative w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)] max-h-[50vh]"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)' }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-base font-semibold">Verschieben nach</h3>
                <button onClick={() => { setShowMoveSheet(false); setMoveSourceDate(null); }}>
                  <X className="w-5 h-5 text-text-3" />
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto px-4 py-4">
                {days.map((d) => {
                  const dateStr = fmtDate(d);
                  const occupied = mealByDate.has(dateStr);
                  const isSrc = dateStr === moveSourceDate;
                  return (
                    <button
                      key={dateStr}
                      disabled={occupied || isSrc}
                      onClick={() => moveMealEntry(moveSourceDate, dateStr)}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-medium transition ${
                        isSrc
                          ? "bg-accent-light text-accent border-2 border-accent-mid"
                          : occupied
                            ? "bg-surface-2 text-text-3"
                            : "bg-surface-2 text-text-2 hover:bg-accent-light hover:text-accent"
                      }`}
                    >
                      <span className="font-bold">{dayLabel(d)}</span>
                      <span>{dateNum(d)}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meal Picker (Rezept auswählen) */}
      <AnimatePresence>
        {showMealPicker && mealPickerDate && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowMealPicker(false); setMealPickerDate(null); setMealPickerSearch(""); }} />
            <motion.div
              className="relative w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)] max-h-[70vh] flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)' }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
                <h3 className="text-base font-semibold">Was gibt's zu essen?</h3>
                <button onClick={() => { setShowMealPicker(false); setMealPickerDate(null); setMealPickerSearch(""); }}>
                  <X className="w-5 h-5 text-text-3" />
                </button>
              </div>
            {/* Options */}
            <div className="flex gap-2 px-4 py-3">
              <button
                className="flex-1 py-3 rounded-xl bg-surface-2 text-sm font-medium text-text-2 flex flex-col items-center gap-1"
                onClick={() => {
                  // Switch to freetext
                  setShowMealPicker(false);
                  setShowFreetextInput(true);
                }}
              >
                <FileText className="w-5 h-5 text-text-3" />
                Freitext
              </button>
            </div>
            {/* Search */}
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
                <input
                  type="search"
                  name="meal-picker-search"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder="Rezept suchen..."
                  value={mealPickerSearch}
                  onChange={(e) => setMealPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface-2 rounded-[var(--radius-input)] text-sm border-0 outline-none"
                />
              </div>
            </div>
            {/* Recipe list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {recipes
                .filter((r) =>
                  !mealPickerSearch.trim() || r.title.toLowerCase().includes(mealPickerSearch.toLowerCase())
                )
                .map((recipe) => (
                  <button
                    key={recipe.id}
                    className="w-full flex items-center gap-3 py-2.5 border-b border-border text-left"
                    onClick={() => assignRecipeToDate(recipe.id, mealPickerDate)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-surface-2 flex-shrink-0 overflow-hidden">
                      {recipe.image_url ? (
                        <ImageWithFallback src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-lg">🍽️</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-1 truncate">{recipe.title}</p>
                      {totalTime(recipe) && (
                        <p className="text-xs text-text-3">{totalTime(recipe)}</p>
                      )}
                    </div>
                  </button>
                ))}
              {recipes.length === 0 && (
                <p className="text-center text-text-3 text-sm py-8">Noch keine Rezepte im Kochbuch</p>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Freetext Input */}
      <AnimatePresence>
        {showFreetextInput && mealPickerDate && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowFreetextInput(false); setFreetextValue(""); setMealPickerDate(null); }} />
            <motion.div
              className="relative w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)' }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <h3 className="text-base font-semibold mb-3">Freitext-Eintrag</h3>
            <input
              type="search"
              name="freetext-entry"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              placeholder='z.B. "Restaurant", "Reste"...'
              value={freetextValue}
              onChange={(e) => setFreetextValue(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-2 rounded-xl text-sm border-0 outline-none mb-3"
              autoFocus
            />
            <button
              disabled={!freetextValue.trim()}
              onClick={() => assignFreetextToDate(freetextValue.trim(), mealPickerDate)}
              className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40"
            >
              Speichern
            </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Recipe Bottom Sheet */}
      <AnimatePresence>
        {showAddSheet && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddSheet(false)} />
            <motion.div
              className="relative w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)' }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: 'var(--zu-border)' }} />
              </div>
              <h3 className="text-base font-semibold mb-3">Rezept hinzufügen</h3>
              <div className="flex flex-col gap-2">
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-accent-light transition text-left"
                onClick={() => { setShowAddSheet(false); setShowUrlImport(true); }}
              >
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-1">URL einfügen</p>
                  <p className="text-xs text-text-3">Website, TikTok oder Instagram</p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-accent-light transition text-left"
                onClick={() => {
                  const r = emptyRecipe();
                  setEditRecipe(r);
                  setActiveView("edit");
                  setShowAddSheet(false);
                  pushBack(() => { setEditRecipe(null); setActiveView("main"); });
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-1">Manuell erstellen</p>
                  <p className="text-xs text-text-3">Alle Felder selbst ausfüllen</p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-accent-light transition text-left"
                onClick={() => toast.info("Foto-Upload kommt bald")}
              >
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                  <Camera className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-1">Foto hochladen</p>
                  <p className="text-xs text-text-3">Rezept aus einem Foto extrahieren</p>
                </div>
              </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* URL Import Modal */}
      <AnimatePresence>
        {showUrlImport && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowUrlImport(false); setUrlInput(""); }} />
            <motion.div
              className="relative w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)' }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: 'var(--zu-border)' }} />
              </div>
              <h3 className="text-base font-semibold mb-3">URL importieren</h3>
            <input
              type="search"
              name="recipe-url-import"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              inputMode="text"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-2 rounded-xl text-sm border-0 outline-none mb-3"
              autoFocus
            />
            <button
              disabled={!urlInput.trim() || importing}
              onClick={handleUrlImport}
              className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {importing ? (
                <div className="contents">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importiere...
                </div>
              ) : (
                "Importieren"
              )}
            </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ingredients Transfer Modal */}
      <AnimatePresence>
        {showIngredientsModal && ingredientsRecipe && (
          <IngredientsModal
            recipe={ingredientsRecipe}
            selected={selectedIngredients}
            onToggle={(i) => {
              const next = [...selectedIngredients];
              next[i] = !next[i];
              setSelectedIngredients(next);
            }}
            store={ingredientStore}
            onStoreChange={setIngredientStore}
            stores={stores}
            onAdd={addIngredientsToShopping}
            onSkip={() => { setShowIngredientsModal(false); setIngredientsRecipe(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// RECIPE DETAIL VIEW
// ══════════════════════════════════════════════════════════════════════

function RecipeDetailView({
  recipe,
  onBack,
  onEdit,
  onToggleFavorite,
  onSetRating,
  onDelete,
  onAddToShopping,
  onSaveComment,
  stores,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onSetRating: (r: number) => void;
  onDelete: () => void;
  onAddToShopping: () => void;
  onSaveComment: (c: string) => void;
  stores: any[];
}) {
  const [servings, setServings] = useState(recipe.servings || 4);
  const [comment, setComment] = useState(recipe.comment || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  useBackHandler(showDeleteConfirm, () => setShowDeleteConfirm(false));
  const scale = recipe.servings ? servings / recipe.servings : 1;
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCommentChange = (val: string) => {
    setComment(val);
    if (commentTimer.current) clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => onSaveComment(val), 500);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Hero Image */}
      <div className="relative flex-shrink-0" style={{ height: 220 }}>
        {recipe.image_url ? (
          <ImageWithFallback src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent-light to-accent-light/50 flex items-center justify-center text-5xl">
            🍽️
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-surface/80 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-text-2" />
          </button>
          <div className="flex gap-2">
            <button onClick={onToggleFavorite} className="w-8 h-8 rounded-full bg-surface/80 flex items-center justify-center">
              <Heart className={`w-4 h-4 ${recipe.is_favorite ? "fill-accent text-accent" : "text-text-3"}`} />
            </button>
            <button onClick={onEdit} className="w-8 h-8 rounded-full bg-surface/80 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-text-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <h1 className="text-2xl font-bold text-text-1 mt-4">{recipe.title}</h1>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => onSetRating(s)}>
              <Star
                className={`w-5 h-5 ${s <= recipe.rating ? "fill-accent text-accent" : "text-text-3"}`}
              />
            </button>
          ))}
          {recipe.categories.length > 0 && (
            <div className="flex gap-1 ml-3">
              {recipe.categories.map((c) => (
                <span key={c} className="px-2 py-0.5 bg-accent-light text-accent-dark text-xs rounded-full">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time + Servings */}
        <div className="flex items-center gap-4 mt-3 text-sm text-text-2">
          {totalTime(recipe) && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {totalTime(recipe)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setServings(Math.max(1, servings - 1))} className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center">
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-medium text-text-1">{servings} Portionen</span>
            <button onClick={() => setServings(servings + 1)} className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Source URL */}
        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent mt-2 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Original-Link
          </a>
        )}

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-text-2 mt-3">{recipe.description}</p>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-text-1">Zutaten</h3>
              <button
                onClick={onAddToShopping}
                className="text-xs text-accent font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Zur Einkaufsliste
              </button>
            </div>
            <div className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => {
                const qty = ing.quantity ? parseFloat(ing.quantity) : NaN;
                const scaledQty = !isNaN(qty) ? (qty * scale).toFixed(qty * scale % 1 === 0 ? 0 : 1) : ing.quantity;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <span className="text-text-2">
                      {scaledQty && <span className="font-medium">{scaledQty} </span>}
                      {ing.unit && <span>{ing.unit} </span>}
                      {ing.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Steps */}
        {recipe.steps.length > 0 && (
          <div className="mt-5">
            <h3 className="text-base font-semibold text-text-1 mb-2">Zubereitung</h3>
            <div className="space-y-3">
              {recipe.steps
                .sort((a, b) => a.position - b.position)
                .map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-accent-dark">{i + 1}</span>
                    </div>
                    <p className="text-sm text-text-2 leading-relaxed">{step.description}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Comment */}
        <div className="mt-5">
          <h3 className="text-base font-semibold text-text-1 mb-2">Kommentare</h3>
          <textarea
            value={comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            placeholder="Eigene Notizen..."
            name="recipe-comment"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none resize-none"
            rows={3}
          />
        </div>

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 text-sm text-danger mt-6"
        >
          <Trash2 className="w-4 h-4" /> Rezept löschen
        </button>
      </div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
            <motion.div
              className="relative w-full bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
              style={{ boxShadow: "var(--shadow-elevated)" }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <h3 className="text-base font-semibold text-text-1 text-center mb-2">Rezept löschen?</h3>
              <p className="text-sm text-text-3 text-center mb-5">
                „{recipe.title}" wird unwiderruflich gelöscht.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-surface-2 text-text-2"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-danger text-white"
                  onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                >
                  Löschen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// RECIPE EDIT VIEW
// ══════════════════════════════════════════════════════════════════════

function RecipeEditView({
  recipe,
  onChange,
  onSave,
  onCancel,
}: {
  recipe: Recipe;
  onChange: (r: Recipe) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const update = (partial: Partial<Recipe>) => onChange({ ...recipe, ...partial });

  const updateIngredient = (idx: number, field: keyof Ingredient, val: string) => {
    const next = [...recipe.ingredients];
    next[idx] = { ...next[idx], [field]: val };
    update({ ingredients: next });
  };

  const addIngredient = () => {
    update({ ingredients: [...recipe.ingredients, { name: "", quantity: "", unit: "" }] });
  };

  const removeIngredient = (idx: number) => {
    update({ ingredients: recipe.ingredients.filter((_, i) => i !== idx) });
  };

  const updateStep = (idx: number, desc: string) => {
    const next = [...recipe.steps];
    next[idx] = { ...next[idx], description: desc };
    update({ steps: next });
  };

  const addStep = () => {
    update({
      steps: [...recipe.steps, { position: recipe.steps.length + 1, description: "" }],
    });
  };

  const removeStep = (idx: number) => {
    const next = recipe.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 }));
    update({ steps: next });
  };

  const toggleCategory = (cat: string) => {
    if (recipe.categories.includes(cat)) {
      update({ categories: recipe.categories.filter((c) => c !== cat) });
    } else {
      update({ categories: [...recipe.categories, cat] });
    }
  };

  const isNull = (val: any) => val === null || val === undefined || val === "";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--zu-border)" }}>
        <button onClick={onCancel} className="text-sm text-text-3">Abbrechen</button>
        <h3 className="text-base font-semibold">Rezept bearbeiten</h3>
        <button
          onClick={onSave}
          disabled={isNull(recipe.title)}
          className="text-sm font-semibold text-accent"
          style={isNull(recipe.title) ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >Speichern</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Title */}
        <div className="mt-4">
          <label className="text-xs text-text-3 mb-1 block">Titel{isNull(recipe.title) && <span style={{ color: "var(--danger)" }}> *</span>}</label>
          <input
            type="search"
            value={recipe.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Rezeptname"
            name="recipe-title"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
          />
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="text-xs text-text-3 mb-1 block">Beschreibung</label>
          <textarea
            value={recipe.description || ""}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Kurze Beschreibung..."
            name="recipe-desc"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none resize-none"
            rows={2}
          />
        </div>

        {/* Image URL */}
        <div className="mt-3">
          <label className="text-xs text-text-3 mb-1 block">Bild-URL</label>
          <input
            type="search"
            value={recipe.image_url || ""}
            onChange={(e) => update({ image_url: e.target.value || null })}
            placeholder="https://..."
            name="recipe-image-url"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
          />
        </div>

        {/* Source URL */}
        <div className="mt-3">
          <label className="text-xs text-text-3 mb-1 block">Original-URL</label>
          <input
            type="search"
            value={recipe.source_url || ""}
            onChange={(e) => update({ source_url: e.target.value })}
            placeholder="https://..."
            name="recipe-source-url"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
          />
        </div>

        {/* Time + Servings row — type="search" suppresses Chrome toolbar, inputMode="numeric" keeps number keyboard */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-xs text-text-3 mb-1 block">Vorbereit. (Min)</label>
            <input
              type="search"
              inputMode="numeric"
              name="recipe-prep-time"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={recipe.prep_time_minutes ?? ""}
              onChange={(e) => update({ prep_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">Kochzeit (Min)</label>
            <input
              type="search"
              inputMode="numeric"
              name="recipe-cook-time"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={recipe.cook_time_minutes ?? ""}
              onChange={(e) => update({ cook_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">Portionen</label>
            <input
              type="search"
              inputMode="numeric"
              name="recipe-servings"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={recipe.servings ?? ""}
              onChange={(e) => update({ servings: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="mt-4">
          <label className="text-xs text-text-3 mb-1 block">Kategorien</label>
          <div className="flex flex-wrap gap-2">
            {RECIPE_CATEGORIES.filter((c) => c !== "Alle" && c !== "Favoriten" && c !== "Schnell").map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs transition ${
                  recipe.categories.includes(cat)
                    ? "font-semibold"
                    : "font-medium"
                }`}
                style={
                  recipe.categories.includes(cat)
                    ? {
                        background: "var(--accent-light)",
                        color: "var(--accent)",
                        border: "1.5px solid var(--accent)",
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-2)",
                        border: "1px solid var(--zu-border)",
                      }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-text-3">Zutaten</label>
            <button onClick={addIngredient} className="text-xs text-accent font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {recipe.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="search"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                  placeholder="Menge"
                  name="ing-qty"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="w-16 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none"
                />
                <input
                  type="search"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  placeholder="Einh."
                  name="ing-unit"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="w-14 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none"
                />
                <input
                  type="search"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  placeholder="Zutat"
                  name="ing-name"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="flex-1 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none"
                />
                <button onClick={() => removeIngredient(i)} className="flex-shrink-0">
                  <X className="w-4 h-4 text-text-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-text-3">Zubereitungsschritte</label>
            <button onClick={addStep} className="text-xs text-accent font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {recipe.steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs font-bold text-accent-dark">{i + 1}</span>
                </div>
                <textarea
                  value={step.description}
                  onChange={(e) => updateStep(i, e.target.value)}
                  placeholder={`Schritt ${i + 1}...`}
                  name="recipe-step"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="flex-1 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none resize-none"
                  rows={2}
                />
                <button onClick={() => removeStep(i)} className="flex-shrink-0 mt-1">
                  <X className="w-4 h-4 text-text-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// INGREDIENTS MODAL
// ══════════════════════════════════════════════════════════════════════

function IngredientsModal({
  recipe,
  selected,
  onToggle,
  store,
  onStoreChange,
  stores,
  onAdd,
  onSkip,
}: {
  recipe: Recipe;
  selected: boolean[];
  onToggle: (i: number) => void;
  store: string;
  onStoreChange: (s: string) => void;
  stores: any[];
  onAdd: () => void;
  onSkip: () => void;
}) {
  const activeStores = stores.filter((s: any) => s.isActive !== false);

  return (
    <motion.div
      className="fixed inset-0 z-[999] flex items-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={DRAWER_SPRING}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onSkip} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] pb-[env(safe-area-inset-bottom)] max-h-[70vh] flex flex-col"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={DRAWER_SPRING}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-4 py-2 border-b border-border flex-shrink-0">
          <h3 className="text-base font-semibold">Zutaten zur Einkaufsliste?</h3>
          <p className="text-xs text-text-3 mt-0.5">{recipe.title}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {recipe.ingredients.map((ing, i) => (
            <label key={i} className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={() => onToggle(i)}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm text-text-2">
                {ing.quantity && <span className="font-medium">{ing.quantity} </span>}
                {ing.unit && <span>{ing.unit} </span>}
                {ing.name}
              </span>
            </label>
          ))}
        </div>

        {/* Store selector */}
        <div className="px-4 pb-3 flex-shrink-0">
          <label className="text-xs text-text-3 mb-1 block">Zu welchem Laden?</label>
          <select
            value={store}
            onChange={(e) => onStoreChange(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
          >
            <option value="alle">Alle</option>
            {activeStores.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 px-4 pb-4 flex-shrink-0">
          <button onClick={onSkip} className="flex-1 py-2.5 rounded-xl bg-surface-2 text-sm font-medium text-text-2">
            Überspringen
          </button>
          <button onClick={onAdd} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium">
            Hinzufügen
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
