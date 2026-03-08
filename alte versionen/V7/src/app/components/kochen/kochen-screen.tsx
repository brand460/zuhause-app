import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Search, Heart, Clock, ChevronLeft, Star, Minus, ExternalLink,
  Pencil, X, Loader2, Link2, FileText, Camera, Trash2, ArrowRightLeft, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../supabase-client";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import type {
  Recipe, MealPlanEntry, Ingredient, RecipeStep, CategoryFilter,
} from "./kochen-types";
import { HOUSEHOLD_ID, RECIPE_CATEGORIES } from "./kochen-types";

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
    household_id: HOUSEHOLD_ID,
    created_at: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════
// MAIN KOCHEN SCREEN
// ══════════════════════════════════════════════════════════════════════

export function KochenScreen() {
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

  // ── Load data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [recipeRes, mealRes, storeRes] = await Promise.all([
        apiFetch(`/recipes?household_id=${HOUSEHOLD_ID}`),
        apiFetch(`/meal-plan?household_id=${HOUSEHOLD_ID}`),
        apiFetch(`/store-settings?household_id=${HOUSEHOLD_ID}`),
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
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Center today in the week scroller on mount
  useEffect(() => {
    if (weekScrollRef.current) {
      // Today is at index 3 (0-based), each card ~120px wide + 12px gap
      const cardWidth = 120;
      const gap = 12;
      const idx = 3;
      const scrollLeft = idx * (cardWidth + gap) - weekScrollRef.current.clientWidth / 2 + cardWidth / 2;
      weekScrollRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [loading]);

  // ── Save helpers ───────────────────────────────────────────────────

  const saveRecipes = useCallback(async (updated: Recipe[]) => {
    setRecipes(updated);
    try {
      await apiFetch("/recipes", {
        method: "PUT",
        body: JSON.stringify({ household_id: HOUSEHOLD_ID, recipes: updated }),
      });
    } catch (err) {
      console.error("Fehler beim Speichern der Rezepte:", err);
      toast.error("Speichern fehlgeschlagen");
    }
  }, []);

  const saveMealPlan = useCallback(async (updated: MealPlanEntry[]) => {
    setMealPlan(updated);
    try {
      await apiFetch("/meal-plan", {
        method: "PUT",
        body: JSON.stringify({ household_id: HOUSEHOLD_ID, entries: updated }),
      });
    } catch (err) {
      console.error("Fehler beim Speichern des Wochenplans:", err);
      toast.error("Speichern fehlgeschlagen");
    }
  }, []);

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
  };

  const openEditMode = (recipe: Recipe) => {
    setEditRecipe({ ...recipe, ingredients: [...recipe.ingredients], steps: [...recipe.steps], categories: [...recipe.categories] });
    setActiveView("edit");
  };

  const saveEdit = async () => {
    if (!editRecipe) return;
    const updated = recipes.map((r) => (r.id === editRecipe.id ? editRecipe : r));
    // If new recipe (not in list), add
    if (!recipes.find((r) => r.id === editRecipe.id)) {
      updated.push(editRecipe);
    }
    await saveRecipes(updated);
    setSelectedRecipeId(editRecipe.id);
    setActiveView("detail");
    setEditRecipe(null);
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
      household_id: HOUSEHOLD_ID,
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
      household_id: HOUSEHOLD_ID,
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
          household_id: HOUSEHOLD_ID,
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
      const shoppingRes = await apiFetch(`/shopping?household_id=${HOUSEHOLD_ID}`);
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
        household_id: HOUSEHOLD_ID,
      }));
      await apiFetch("/shopping", {
        method: "PUT",
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
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
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  // ── Recipe Detail View ─────────────────────────────────────────────
  if (activeView === "detail" && selectedRecipe) {
    return (
      <RecipeDetailView
        recipe={selectedRecipe}
        onBack={() => { setActiveView("main"); setSelectedRecipeId(null); }}
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
      {/* WOCHENPLANER */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100">
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-lg font-bold text-gray-900">Wochenplaner</h2>
        </div>
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
                <div className={`text-xs font-medium mb-1 ${today ? "text-orange-500" : "text-gray-500"}`}>
                  {dayLabel(d)} {dateNum(d)}
                </div>
                {/* Card */}
                <div
                  className={`w-full rounded-xl overflow-hidden cursor-pointer transition-all ${
                    today ? "ring-2 ring-orange-500 ring-offset-1" : "border border-gray-200"
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
                      <div className="flex-1 bg-gray-100">
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
                      <div className="px-2 py-1.5 bg-white">
                        <p className="text-xs font-medium text-gray-900 truncate">{recipe.title}</p>
                      </div>
                    </div>
                  ) : entry?.free_text ? (
                    <div className="h-full flex flex-col items-center justify-center bg-orange-50 px-2">
                      <span className="text-2xl mb-1">📝</span>
                      <p className="text-xs text-gray-600 text-center truncate w-full">{entry.free_text}</p>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-50">
                      <Plus className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KOCHBUCH */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold text-gray-900">Kochbuch</h2>
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white"
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
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition ${
                  categoryFilter === cat
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {cat === "Schnell" ? "Schnell (<30 Min)" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
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
              className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>

        {/* Recipe Grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredRecipes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-3">📖</span>
              <p className="text-sm">Noch keine Rezepte</p>
              <p className="text-xs mt-1">Tippe auf + um ein Rezept hinzuzufügen</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-xl overflow-hidden bg-white border border-gray-100 cursor-pointer active:scale-[0.98] transition"
                  onClick={() => openRecipeDetail(recipe.id)}
                >
                  <div className="relative aspect-square bg-gray-100">
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
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center"
                    >
                      <Heart
                        className={`w-4 h-4 ${recipe.is_favorite ? "fill-orange-500 text-orange-500" : "text-gray-400"}`}
                      />
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{recipe.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {totalTime(recipe) && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {totalTime(recipe)}
                        </span>
                      )}
                      {recipe.categories[0] && (
                        <span className="text-xs text-gray-400 ml-auto">{recipe.categories[0]}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── OVERLAYS / MODALS ─────────────────────────────────────── */}

      {/* Day Popover */}
      {dayPopover && (
        <div className="contents">
          <div className="fixed inset-0 z-50" onClick={() => setDayPopover(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[200px]"
            style={{
              top: Math.min(dayPopover.y, window.innerHeight - 200),
              left: Math.min(dayPopover.x, window.innerWidth - 220),
            }}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
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
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setMoveSourceDate(dayPopover.date);
                setShowMoveSheet(true);
              }}
            >
              Verschieben
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50"
              onClick={() => setDeleteConfirm(dayPopover.date)}
            >
              Löschen
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-white rounded-2xl p-6 mx-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-900 mb-2">Eintrag löschen?</h3>
              <p className="text-sm text-gray-500 mb-5">Der Wochenplan-Eintrag wird entfernt.</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Abbrechen
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white"
                  onClick={() => deleteMealEntry(deleteConfirm)}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Sheet */}
      {showMoveSheet && moveSourceDate && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => { setShowMoveSheet(false); setMoveSourceDate(null); }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[50vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold">Verschieben nach</h3>
              <button onClick={() => { setShowMoveSheet(false); setMoveSourceDate(null); }}>
                <X className="w-5 h-5 text-gray-400" />
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
                        ? "bg-orange-100 text-orange-500 border-2 border-orange-300"
                        : occupied
                          ? "bg-gray-100 text-gray-300"
                          : "bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-orange-500"
                    }`}
                  >
                    <span className="font-bold">{dayLabel(d)}</span>
                    <span>{dateNum(d)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Meal Picker (Rezept auswählen) */}
      {showMealPicker && mealPickerDate && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => { setShowMealPicker(false); setMealPickerDate(null); setMealPickerSearch(""); }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold">Was gibt's zu essen?</h3>
              <button onClick={() => { setShowMealPicker(false); setMealPickerDate(null); setMealPickerSearch(""); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {/* Options */}
            <div className="flex gap-2 px-4 py-3">
              <button
                className="flex-1 py-3 rounded-xl bg-gray-50 text-sm font-medium text-gray-700 flex flex-col items-center gap-1"
                onClick={() => {
                  // Switch to freetext
                  setShowMealPicker(false);
                  setShowFreetextInput(true);
                }}
              >
                <FileText className="w-5 h-5 text-gray-400" />
                Freitext
              </button>
            </div>
            {/* Search */}
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
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
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
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
                    className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 text-left"
                    onClick={() => assignRecipeToDate(recipe.id, mealPickerDate)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                      {recipe.image_url ? (
                        <ImageWithFallback src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-lg">🍽️</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{recipe.title}</p>
                      {totalTime(recipe) && (
                        <p className="text-xs text-gray-400">{totalTime(recipe)}</p>
                      )}
                    </div>
                  </button>
                ))}
              {recipes.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Noch keine Rezepte im Kochbuch</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Freetext Input */}
      {showFreetextInput && mealPickerDate && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => { setShowFreetextInput(false); setFreetextValue(""); setMealPickerDate(null); }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] p-4">
            <h3 className="text-base font-semibold mb-3">Freitext-Eintrag</h3>
            <input
              type="text"
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
              className="w-full px-4 py-2.5 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200 mb-3"
              autoFocus
            />
            <button
              disabled={!freetextValue.trim()}
              onClick={() => assignFreetextToDate(freetextValue.trim(), mealPickerDate)}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium disabled:opacity-40"
            >
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* Add Recipe Bottom Sheet */}
      {showAddSheet && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowAddSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] p-4">
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-3">Rezept hinzufügen</h3>
            <div className="flex flex-col gap-2">
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-orange-50 transition text-left"
                onClick={() => { setShowAddSheet(false); setShowUrlImport(true); }}
              >
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">URL einfügen</p>
                  <p className="text-xs text-gray-400">Website, TikTok oder Instagram</p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-orange-50 transition text-left"
                onClick={() => {
                  const r = emptyRecipe();
                  setEditRecipe(r);
                  setActiveView("edit");
                  setShowAddSheet(false);
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Manuell erstellen</p>
                  <p className="text-xs text-gray-400">Alle Felder selbst ausfüllen</p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-orange-50 transition text-left"
                onClick={() => toast.info("Foto-Upload kommt bald")}
              >
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Foto hochladen</p>
                  <p className="text-xs text-gray-400">Rezept aus einem Foto extrahieren</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL Import Modal */}
      {showUrlImport && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => { setShowUrlImport(false); setUrlInput(""); }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] p-4">
            <h3 className="text-base font-semibold mb-3">URL importieren</h3>
            <input
              type="url"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200 mb-3"
              autoFocus
            />
            <button
              disabled={!urlInput.trim() || importing}
              onClick={handleUrlImport}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
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
          </div>
        </div>
      )}

      {/* Ingredients Transfer Modal */}
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
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center text-5xl">
            🍽️
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex gap-2">
            <button onClick={onToggleFavorite} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
              <Heart className={`w-4 h-4 ${recipe.is_favorite ? "fill-orange-500 text-orange-500" : "text-gray-500"}`} />
            </button>
            <button onClick={onEdit} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <h1 className="text-2xl font-bold text-gray-900 mt-4">{recipe.title}</h1>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => onSetRating(s)}>
              <Star
                className={`w-5 h-5 ${s <= recipe.rating ? "fill-orange-400 text-orange-400" : "text-gray-300"}`}
              />
            </button>
          ))}
          {recipe.categories.length > 0 && (
            <div className="flex gap-1 ml-3">
              {recipe.categories.map((c) => (
                <span key={c} className="px-2 py-0.5 bg-orange-50 text-orange-600 text-xs rounded-full">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time + Servings */}
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
          {totalTime(recipe) && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {totalTime(recipe)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setServings(Math.max(1, servings - 1))} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-medium text-gray-900">{servings} Portionen</span>
            <button onClick={() => setServings(servings + 1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
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
            className="inline-flex items-center gap-1 text-xs text-orange-500 mt-2 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Original-Link
          </a>
        )}

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-gray-600 mt-3">{recipe.description}</p>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-gray-900">Zutaten</h3>
              <button
                onClick={onAddToShopping}
                className="text-xs text-orange-500 font-medium flex items-center gap-1"
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
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    <span className="text-gray-700">
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
            <h3 className="text-base font-semibold text-gray-900 mb-2">Zubereitung</h3>
            <div className="space-y-3">
              {recipe.steps
                .sort((a, b) => a.position - b.position)
                .map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-orange-600">{i + 1}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Comment */}
        <div className="mt-5">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Kommentare</h3>
          <textarea
            value={comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            placeholder="Eigene Notizen..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            rows={3}
          />
        </div>

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 text-sm text-red-500 mt-6"
        >
          <Trash2 className="w-4 h-4" /> Rezept löschen
        </button>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="contents">
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-white rounded-2xl p-6 mx-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-900 mb-2">Rezept löschen?</h3>
              <p className="text-sm text-gray-500 mb-5">
                „{recipe.title}" wird unwiderruflich gelöscht.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white"
                  onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onCancel} className="text-sm text-gray-500">Abbrechen</button>
        <h3 className="text-base font-semibold">Rezept bearbeiten</h3>
        <button onClick={onSave} className="text-sm font-semibold text-orange-500">Speichern</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Title */}
        <div className="mt-4">
          <label className="text-xs text-gray-500 mb-1 block">Titel</label>
          <input
            value={recipe.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Rezeptname"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className={`w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 ${
              isNull(recipe.title) ? "border-2 border-orange-300" : "border-0"
            }`}
          />
          {isNull(recipe.title) && <p className="text-xs text-orange-500 mt-1">Bitte ergänzen</p>}
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Beschreibung</label>
          <textarea
            value={recipe.description || ""}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Kurze Beschreibung..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            rows={2}
          />
        </div>

        {/* Image URL */}
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Bild-URL</label>
          <input
            value={recipe.image_url || ""}
            onChange={(e) => update({ image_url: e.target.value || null })}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
          />
        </div>

        {/* Source URL */}
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Original-URL</label>
          <input
            value={recipe.source_url || ""}
            onChange={(e) => update({ source_url: e.target.value })}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
          />
        </div>

        {/* Time + Servings row */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vorbereit. (Min)</label>
            <input
              type="tel"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={recipe.prep_time_minutes ?? ""}
              onChange={(e) => update({ prep_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
              className={`w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 ${
                isNull(recipe.prep_time_minutes) ? "border-2 border-orange-300" : "border-0"
              }`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Kochzeit (Min)</label>
            <input
              type="tel"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={recipe.cook_time_minutes ?? ""}
              onChange={(e) => update({ cook_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
              className={`w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 ${
                isNull(recipe.cook_time_minutes) ? "border-2 border-orange-300" : "border-0"
              }`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Portionen</label>
            <input
              type="number"
              value={recipe.servings ?? ""}
              onChange={(e) => update({ servings: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="mt-4">
          <label className="text-xs text-gray-500 mb-1 block">Kategorien</label>
          <div className="flex flex-wrap gap-2">
            {RECIPE_CATEGORIES.filter((c) => c !== "Alle" && c !== "Favoriten" && c !== "Schnell").map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  recipe.categories.includes(cat)
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Zutaten</label>
            <button onClick={addIngredient} className="text-xs text-orange-500 font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {recipe.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                  placeholder="Menge"
                  className="w-16 px-2 py-1.5 bg-gray-50 rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
                />
                <input
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  placeholder="Einh."
                  className="w-14 px-2 py-1.5 bg-gray-50 rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
                />
                <input
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  placeholder="Zutat"
                  className="flex-1 px-2 py-1.5 bg-gray-50 rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200"
                />
                <button onClick={() => removeIngredient(i)} className="flex-shrink-0">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Zubereitungsschritte</label>
            <button onClick={addStep} className="text-xs text-orange-500 font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {recipe.steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs font-bold text-orange-600">{i + 1}</span>
                </div>
                <textarea
                  value={step.description}
                  onChange={(e) => updateStep(i, e.target.value)}
                  placeholder={`Schritt ${i + 1}...`}
                  className="flex-1 px-2 py-1.5 bg-gray-50 rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-orange-200 resize-none"
                  rows={2}
                />
                <button onClick={() => removeStep(i)} className="flex-shrink-0 mt-1">
                  <X className="w-4 h-4 text-gray-400" />
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
    <div className="contents">
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onSkip} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[70vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold">Zutaten zur Einkaufsliste?</h3>
          <p className="text-xs text-gray-400 mt-0.5">{recipe.title}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {recipe.ingredients.map((ing, i) => (
            <label key={i} className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={() => onToggle(i)}
                className="w-4 h-4 rounded accent-orange-500"
              />
              <span className="text-sm text-gray-700">
                {ing.quantity && <span className="font-medium">{ing.quantity} </span>}
                {ing.unit && <span>{ing.unit} </span>}
                {ing.name}
              </span>
            </label>
          ))}
        </div>

        {/* Store selector */}
        <div className="px-4 pb-3 flex-shrink-0">
          <label className="text-xs text-gray-500 mb-1 block">Zu welchem Laden?</label>
          <select
            value={store}
            onChange={(e) => onStoreChange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm border-0 outline-none"
          >
            <option value="alle">Alle</option>
            {activeStores.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 px-4 pb-4 flex-shrink-0">
          <button onClick={onSkip} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-medium text-gray-600">
            Überspringen
          </button>
          <button onClick={onAdd} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium">
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}
