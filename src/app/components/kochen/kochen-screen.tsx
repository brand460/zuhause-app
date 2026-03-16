import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import {
  Plus, Search, Heart, Clock, ChevronLeft, Star, Minus, ExternalLink,
  Pencil, X, Loader2, Link2, FileText, Camera, Trash2,
  Image as ImageIcon, ShoppingCart, CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, apiFetch, API_BASE } from "../supabase-client";
import { useKvRealtime, broadcastChange } from "../use-kv-realtime";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import type {
  Recipe, MealPlanEntry, Ingredient, RecipeStep, CategoryFilter,
} from "./kochen-types";
import { RECIPE_CATEGORIES } from "./kochen-types";
import { useBackHandler, pushBack, popBack } from "../ui/use-back-handler";
import { useAuth, type HouseholdMember } from "../auth-context";
import { useKeyboardOffset } from "../ui/use-keyboard-offset";
import { INGREDIENT_UNITS } from "./ingredient-units";
import { GROCERY_DATABASE, DEFAULT_STORES, buildMergedItems, buildExcludeSet, getCategoryChipColor, getLogoUrl, getItemCategoryDot, getAllCategories } from "../einkaufen/shopping-data";

const DRAWER_SPRING = { type: "spring" as const, damping: 25, stiffness: 300 };

// ── Store Logo (lokal, identisch mit StoreLogo in einkaufen-screen) ──
function StoreLogoKochen({ store, size = 48, isSelected }: { store: any; size?: number; isSelected?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getLogoUrl(store.domain);
  const showLogo = logoUrl && !imgError;
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden transition-all"
      style={{
        width: size,
        height: size,
        backgroundColor: showLogo ? "var(--color-surface-2)" : store.bgColor || "var(--color-surface-2)",
        border: isSelected ? "2.5px solid var(--color-accent)" : "2.5px solid transparent",
      }}
    >
      {store.emoji ? (
        <span className="select-none" style={{ fontSize: size * 0.45 }}>{store.emoji}</span>
      ) : showLogo ? (
        <img
          src={logoUrl!}
          alt={store.name}
          className="object-contain p-1.5"
          style={{ width: size * 0.75, height: size * 0.75, imageRendering: "crisp-edges" }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          className="font-bold select-none"
          style={{ fontSize: size * 0.35, color: imgError ? "#6B7280" : (store.color || "#fff") }}
        >
          {(store.name || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12);
}

// WICHTIG: toISOString() liefert UTC → Off-by-one in lokalen Zeitzonen.
// Immer lokale Zeitzone verwenden:
function fmtLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
// Alias damit alle bestehenden fmtDate-Aufrufe korrekt arbeiten
const fmtDate = fmtLocalDate;

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
  return fmtLocalDate(d) === fmtLocalDate(now);
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

// Generate 14 days starting from today
function generateFutureDays(): Date[] {
  const result: Date[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    result.push(d);
  }
  return result;
}

const MEAL_TYPES = [
  { id: "fruehstueck" as const, label: "Frühstück", emoji: "🌅" },
  { id: "mittag" as const, label: "Mittag", emoji: "☀️" },
  { id: "abend" as const, label: "Abend", emoji: "🌙" },
];

// ── Empty recipe template ──────────────────────────────────────────

function emptyRecipe(): Recipe {
  return {
    id: genId(),
    title: "",
    description: "",
    prep_time_minutes: null,
    cook_time_minutes: null,
    servings: 4,
    ingredients: [{ name: "", quantity: "", unit: "" }],
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
  const { householdId, householdMembers } = useAuth();
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

  // Photo extraction workflow
  const [photoCropSrc, setPhotoCropSrc] = useState<string | null>(null);
  const [photoCrop, setPhotoCrop] = useState<Point>({ x: 0, y: 0 });
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoCroppedArea, setPhotoCroppedArea] = useState<Area | null>(null);
  const [photoExtracting, setPhotoExtracting] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoUpload, setPendingPhotoUpload] = useState(false);

  // Meal plan modals
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [showFreetextInput, setShowFreetextInput] = useState(false);
  const [mealPickerDate, setMealPickerDate] = useState<string | null>(null);
  const [freetextValue, setFreetextValue] = useState("");
  const [mealPickerSearch, setMealPickerSearch] = useState("");
  const [mealPickerMealType, setMealPickerMealType] = useState<"fruehstueck" | "mittag" | "abend">("mittag");
  const [mealPickerUserIds, setMealPickerUserIds] = useState<string[]>([]);
  const [mealPickerTab, setMealPickerTab] = useState<"rezept" | "freitext">("rezept");
  const [mealPickerSelectedRecipeId, setMealPickerSelectedRecipeId] = useState<string | null>(null);

  // Entry popover (long-press on meal entry card)
  const [entryPopover, setEntryPopover] = useState<{ entry: MealPlanEntry; x: number; y: number } | null>(null);
  const [showEditEntrySheet, setShowEditEntrySheet] = useState(false);
  const [editEntryDate, setEditEntryDate] = useState<string>("");
  const [editEntryMealType, setEditEntryMealType] = useState<"fruehstueck" | "mittag" | "abend">("mittag");
  const [editUserIds, setEditUserIds] = useState<string[]>([]);

  // Zutaten-Transfer modal
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [ingredientsRecipe, setIngredientsRecipe] = useState<Recipe | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [ingredientStore, setIngredientStore] = useState("alle");
  const [stores, setStores] = useState<any[]>([]);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Segmented control
  const [kochenTab, setKochenTab] = useState<"rezepte" | "wochenplaner">("rezepte");

  // ── Custom recipe categories (user-defined, lazy-persisted) ────────
  const [customRecipeCategories, setCustomRecipeCategories] = useState<string[]>([]);

  // ── Keyboard offset for drawers ────────────────────────────────────
  const { bottomOffset, vpHeight } = useKeyboardOffset();

  // ── Back-gesture handlers for drawers/modals ──────────────────────
  useBackHandler(showAddSheet, () => setShowAddSheet(false));
  useBackHandler(showUrlImport, () => { setShowUrlImport(false); setUrlInput(""); });
  useBackHandler(!!photoCropSrc && !photoExtracting, () => { setPhotoCropSrc(null); });
  useBackHandler(photoExtracting, () => {}); // block back during extraction
  useBackHandler(showMealPicker, () => { setShowMealPicker(false); setMealPickerDate(null); });
  useBackHandler(!!entryPopover, () => setEntryPopover(null));
  useBackHandler(showEditEntrySheet, () => setShowEditEntrySheet(false));
  useBackHandler(showIngredientsModal, () => { setShowIngredientsModal(false); setIngredientsRecipe(null); });
  useBackHandler(!!deleteConfirm, () => setDeleteConfirm(null));

  // ── Load data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [recipeRes, mealRes, storeRes, customCatRes] = await Promise.all([
        apiFetch(`/recipes?household_id=${householdId}`),
        apiFetch(`/meal-plan?household_id=${householdId}`),
        apiFetch(`/store-settings?household_id=${householdId}`),
        apiFetch(`/custom-recipe-categories?household_id=${householdId}`).catch(() => ({ categories: [] })),
      ]);
      setRecipes(recipeRes.recipes || []);
      setMealPlan(mealRes.entries || []);
      const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      setCustomRecipeCategories((customCatRes.categories || []).map(capitalizeFirst));
      // Merge StoreSettingEntry[] with DEFAULT_STORES to get full StoreInfo objects
      // (same logic as applyStoreSettings in einkaufen-screen)
      const rawSettings: Array<{ store_id: string; position: number; is_visible: boolean }> =
        storeRes.settings || [];
      const settingsMap = new Map(rawSettings.map((s) => [s.store_id, s]));
      const mergedStores = DEFAULT_STORES.filter((s) => {
        if (s.id === "alle") return false; // "Alle" makes no sense in add-to-shopping drawer
        const setting = settingsMap.get(s.id);
        return setting ? setting.is_visible !== false : true;
      }).sort((a, b) => {
        const pa = settingsMap.get(a.id)?.position ?? 999;
        const pb = settingsMap.get(b.id)?.position ?? 999;
        return pa - pb;
      });
      setStores(mergedStores.length > 0 ? mergedStores : DEFAULT_STORES.filter((s) => s.id !== "alle"));
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

  // No horizontal scroll centering needed — vertical table layout now

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
    const m = new Map<string, MealPlanEntry[]>();
    mealPlan.forEach((e) => {
      const arr = m.get(e.date) || [];
      arr.push(e);
      m.set(e.date, arr);
    });
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
    const ings = recipe.ingredients.length > 0
      ? [...recipe.ingredients]
      : [{ name: "", quantity: "", unit: "" }];
    setEditRecipe({ ...recipe, ingredients: ings, steps: [...recipe.steps], categories: [...recipe.categories] });
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
    const cleanedRecipe = {
      ...editRecipe,
      ingredients: editRecipe.ingredients.filter((ing) => ing.name.trim() !== ""),
      steps: editRecipe.steps.filter((step) => step.description.trim() !== ""),
      categories: editRecipe.categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
    };
    const updated = recipes.map((r) => (r.id === cleanedRecipe.id ? cleanedRecipe : r));
    // If new recipe (not in list), add
    if (!recipes.find((r) => r.id === cleanedRecipe.id)) {
      updated.push(cleanedRecipe);
    }
    await saveRecipes(updated);

    // ── Lazy-persist new custom categories ──
    // Determine all currently "known" categories (built-in + already persisted custom)
    // Case-insensitive so "Vegan" from import doesn't duplicate a known "Vegan" entry
    const allKnownLower = [...RECIPE_CATEGORIES, ...customRecipeCategories].map((k) =>
      k.toLowerCase(),
    );
    const newCats = cleanedRecipe.categories.filter(
      (c) => !allKnownLower.includes(c.toLowerCase()),
    );
    if (newCats.length > 0) {
      const merged = [...customRecipeCategories, ...newCats.filter((c) => !customRecipeCategories.includes(c))];
      setCustomRecipeCategories(merged);
      try {
        await apiFetch("/custom-recipe-categories", {
          method: "PUT",
          body: JSON.stringify({ household_id: householdId, categories: merged }),
        });
      } catch (err) {
        console.log("[saveEdit] Fehler beim Speichern custom recipe categories:", err);
      }
    }

    setSelectedRecipeId(cleanedRecipe.id);
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

  // ── Entry interactions (Wochenplaner table) ─────────────────────────

  const entryLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryLongPressPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleEntryPointerDown = (entry: MealPlanEntry, e: React.PointerEvent) => {
    entryLongPressPos.current = { x: e.clientX, y: e.clientY };
    entryLongPressTimer.current = setTimeout(() => {
      setEntryPopover({ entry, x: e.clientX, y: e.clientY });
    }, 500);
  };

  const handleEntryPointerUp = () => {
    if (entryLongPressTimer.current) {
      clearTimeout(entryLongPressTimer.current);
      entryLongPressTimer.current = null;
    }
  };

  const handleEntryPointerMove = (e: React.PointerEvent) => {
    if (entryLongPressTimer.current) {
      const dx = Math.abs(e.clientX - entryLongPressPos.current.x);
      const dy = Math.abs(e.clientY - entryLongPressPos.current.y);
      if (dx > 5 || dy > 5) {
        clearTimeout(entryLongPressTimer.current);
        entryLongPressTimer.current = null;
      }
    }
  };

  const handleEntryTap = (entry: MealPlanEntry) => {
    if (entry.recipe_id) {
      openRecipeDetail(entry.recipe_id);
    }
  };

  const openDayPicker = (dateStr: string) => {
    setMealPickerDate(dateStr);
    setMealPickerMealType("mittag");
    setMealPickerUserIds(householdMembers.map((m) => m.id));
    setMealPickerTab("rezept");
    setMealPickerSelectedRecipeId(null);
    setMealPickerSearch("");
    setFreetextValue("");
    setShowMealPicker(true);
  };

  const assignRecipeToDate = async (recipeId: string, dateStr: string) => {
    const newEntry: MealPlanEntry = {
      id: genId(),
      date: dateStr,
      recipe_id: recipeId,
      free_text: null,
      meal_type: mealPickerMealType,
      assigned_to: mealPickerUserIds.length > 0 ? mealPickerUserIds : householdMembers.map((m) => m.id),
      household_id: householdId || "",
    };
    await saveMealPlan([...mealPlan, newEntry]);
    setShowMealPicker(false);
    setMealPickerDate(null);
    setMealPickerSearch("");

  };

  const assignFreetextToDate = async (text: string, dateStr: string) => {
    const newEntry: MealPlanEntry = {
      id: genId(),
      date: dateStr,
      recipe_id: null,
      free_text: text,
      meal_type: mealPickerMealType,
      assigned_to: mealPickerUserIds.length > 0 ? mealPickerUserIds : householdMembers.map((m) => m.id),
      household_id: householdId || "",
    };
    await saveMealPlan([...mealPlan, newEntry]);
    setShowFreetextInput(false);
    setFreetextValue("");
    setMealPickerDate(null);
  };

  const deleteMealEntry = async (entryId: string) => {
    await saveMealPlan(mealPlan.filter((e) => e.id !== entryId));
    setEntryPopover(null);
    setDeleteConfirm(null);
  };

  const saveEntryEdits = async () => {
    if (!entryPopover) return;
    const entryId = entryPopover.entry.id;
    const updated = mealPlan.map((e) =>
      e.id === entryId
        ? { ...e, date: editEntryDate, meal_type: editEntryMealType, assigned_to: editUserIds }
        : e
    );
    await saveMealPlan(updated);
    setShowEditEntrySheet(false);
    setEntryPopover(null);
    toast.success("Gespeichert");
  };

  // ── Pending photo upload: wait for drawer animation to finish ─────
  useEffect(() => {
    if (!pendingPhotoUpload) return;
    const timer = setTimeout(() => {
      photoFileRef.current?.click();
      setPendingPhotoUpload(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [pendingPhotoUpload]);

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
        const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        const newRecipe: Recipe = {
          ...emptyRecipe(),
          ...res.recipe,
          id: genId(),
          household_id: householdId || "",
          created_at: new Date().toISOString(),
          rating: 0,
          comment: "",
          is_favorite: false,
          categories: (res.recipe.categories || []).map(capitalizeFirst),
          ingredients: (res.recipe.ingredients && res.recipe.ingredients.length > 0)
            ? res.recipe.ingredients
            : [{ name: "", quantity: "", unit: "" }],
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

  // ── Photo file selection ─────────────────────────────────────────────
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoCropSrc(dataUrl);
      setPhotoCrop({ x: 0, y: 0 });
      setPhotoZoom(1);
      setPhotoCroppedArea(null);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  // ── Photo extraction via Claude Vision ──────────────────────────────
  const handlePhotoExtract = async () => {
    if (!photoCropSrc || !photoCroppedArea) return;

    const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      toast.error("VITE_ANTHROPIC_API_KEY nicht gesetzt");
      setPhotoCropSrc(null);
      return;
    }

    const croppedSrc = photoCropSrc;
    const croppedArea = photoCroppedArea;
    setPhotoCropSrc(null);
    setPhotoExtracting(true);

    try {
      // Crop the image
      const croppedBlob = await getCroppedImg(croppedSrc, croppedArea);
      // Compress for Claude (higher res for text readability)
      const compressedBlob = await compressImage(new File([croppedBlob], "photo.jpg", { type: "image/jpeg" }), 1200);
      // Convert to base64
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:image/jpeg;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedBlob);
      });

      // Call Claude Vision API with 30s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64Image }
              },
              {
                type: "text",
                text: `Extrahiere das Rezept aus diesem Bild. Antworte NUR mit einem JSON-Objekt, kein weiterer Text, keine Markdown-Backticks.
Format:
{
  "title": "Rezeptname",
  "prep_time_minutes": null,
  "cook_time_minutes": null,
  "servings": 4,
  "categories": ["Kategorie"],
  "ingredients": [{"name": "Zutat", "quantity": "250", "unit": "g", "category": "Obst & Gemüse"}],
  "steps": [{"position": 1, "description": "Schritt 1"}]
}
Verfügbare Zutaten-Kategorien: Obst & Gemüse, Backwaren, Fleisch & Wurst, Milch & Käse, Eier, Nudeln & Reis, Konserven, Saucen & Gewürze, Kaffee & Tee, Müsli & Frühstück, Tiefkühl, Süßwaren & Snacks, Getränke, Veggie & Bio, Haushalt & Reinigung, Körperpflege, Gesundheit & Medizin, Sonstiges.
Regeln:
- Mengenangaben wie "nach Geschmack", "etwas", "nach Belieben" → quantity leer lassen
- ALLE Zutaten extrahieren inkl. Toppings, optionale Zutaten und Untergruppen
- Bei Untergruppen (z.B. "Für das Topping:") den Gruppennamen als Prefix: "Topping: Kirschtomaten"
- Alternativen (z.B. "Butter oder Öl") → erste Option nehmen
- Schritte vollständig extrahieren, auch wenn mehrzeilig
- Falls kein Rezept erkennbar: { "error": "Kein Rezept gefunden" }`
              }
            ]
          }]
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        console.error("Claude API error:", errText);
        throw new Error("API-Fehler");
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      // Parse JSON (strip potential markdown backticks just in case)
      const cleanText = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
      const parsed = JSON.parse(cleanText);

      if (parsed.error) {
        toast.error("Kein Rezept erkannt — bitte nochmal versuchen");
        return;
      }

      // Build recipe object (same logic as URL import)
      const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const newRecipe: Recipe = {
        ...emptyRecipe(),
        ...parsed,
        id: genId(),
        household_id: householdId || "",
        created_at: new Date().toISOString(),
        rating: 0,
        comment: "",
        is_favorite: false,
        image_url: null,
        source_url: "",
        description: "",
        categories: (parsed.categories || []).map(capitalizeFirst),
        ingredients: (parsed.ingredients && parsed.ingredients.length > 0)
          ? parsed.ingredients
          : [{ name: "", quantity: "", unit: "" }],
        steps: parsed.steps || [],
      };

      setEditRecipe(newRecipe);
      setActiveView("edit");
      setShowAddSheet(false);
      pushBack(() => { setEditRecipe(null); setActiveView("main"); });
      toast.success("Rezept erkannt — bitte prüfen ✅");
    } catch (err: any) {
      console.error("Photo extraction error:", err);
      if (err?.name === "AbortError") {
        toast.error("Zeitüberschreitung — bitte nochmal versuchen");
      } else {
        toast.error("Rezeptextraktion fehlgeschlagen");
      }
    } finally {
      setPhotoExtracting(false);
    }
  };

  // ── Ingredients to shopping list ───────────────────────────────────

  const addIngredientsToShopping = async () => {
    if (!ingredientsRecipe) return;
    const UNITS_NAME_ONLY = ["tl", "el", "päckchen", "pck", "pk"];
    try {
      const shoppingRes = await apiFetch(`/shopping?household_id=${householdId}`);
      const existingItems: any[] = shoppingRes.items || [];
      const chosen = ingredientsRecipe.ingredients.filter((_, i) => selectedIngredients[i]);

      // Build lookup map for merge-by-name
      const existingMap = new Map<string, any>();
      existingItems.forEach((item) => existingMap.set(item.name.toLowerCase(), item));

      let addedCount = 0;
      const updatedItems = [...existingItems];

      for (const ing of chosen) {
        const dbMatch = GROCERY_DATABASE.find(
          (g) => g.name.toLowerCase() === ing.name.toLowerCase()
        );
        const category = dbMatch?.category || "Sonstiges";

        const unitNorm = (ing.unit || "").trim().toLowerCase();
        const skipQtyUnit = UNITS_NAME_ONLY.includes(unitNorm);

        const itemName = ing.name.trim();
        const rawQty = ing.quantity ? parseFloat(ing.quantity) || 1 : 1;
        const itemQty = skipQtyUnit ? 1 : rawQty;
        const itemUnit = skipQtyUnit ? null : (ing.unit || null);

        const existingKey = itemName.toLowerCase();
        const existingEntry = existingMap.get(existingKey);

        if (existingEntry) {
          existingEntry.quantity = (existingEntry.quantity || 1) + itemQty;
        } else {
          const storeVal = ingredientStore === "alle" ? null : ingredientStore;
          const newItem = {
            id: genId(),
            name: itemName,
            store: storeVal,
            category,
            is_checked: false,
            position: updatedItems.length,
            quantity: itemQty,
            unit: itemUnit,
            household_id: householdId || "",
          };
          updatedItems.push(newItem);
          existingMap.set(existingKey, newItem);
          addedCount++;
        }
      }

      await apiFetch("/shopping", {
        method: "PUT",
        body: JSON.stringify({
          household_id: householdId,
          items: updatedItems,
        }),
      });
      toast.success(`${addedCount} Zutaten hinzugefügt`);
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
    // Navigate first, then clear all related state
    setActiveView("main");
    setSelectedRecipeId(null);
    setEditRecipe(null);
    setDeleteConfirm(null); // prevent Wochenplaner delete drawer from appearing
    popBack(); // remove detail-view back handler
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
        onBack={() => { popBack(); setActiveView("main"); setSelectedRecipeId(null); setDeleteConfirm(null); }}
        onEdit={() => openEditMode(selectedRecipe)}
        onToggleFavorite={() => toggleFavorite(selectedRecipe.id)}
        onSetRating={(r) => setRating(selectedRecipe.id, r)}
        onDelete={() => deleteRecipe(selectedRecipe.id)}
        onSaveComment={async (comment) => {
          const updated = recipes.map((r) =>
            r.id === selectedRecipe.id ? { ...r, comment } : r
          );
          await saveRecipes(updated);
        }}
        stores={stores}
        mealPlan={mealPlan}
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
        householdId={householdId || ""}
        customRecipeCategories={customRecipeCategories}
      />
    );
  }

  // ── Main View (Wochenplaner + Kochbuch) ────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header + Segmented Control */}
      <div className="flex-shrink-0" style={{ background: 'var(--zu-bg)' }}>
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <div className="flex items-center px-4 pt-4 pb-1">
            <h2 className="text-lg font-bold text-text-1">Kochen</h2>
          </div>
          <div className="flex justify-center pb-3 pt-1">
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
        </div>
      </div>

      {/* WOCHENPLANER — vertical table, only when tab active */}
      {kochenTab === "wochenplaner" && (
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          {days.map((d) => {
            const dateStr = fmtDate(d);
            const entries = mealByDate.get(dateStr) || [];
            const today = isToday(d);
            return (
              <div
                key={dateStr}
                className="flex border-b border-border"
                style={{ marginBottom: 0 }}
              >
                {/* Day label column — aligned to top of first card */}
                <div
                  className="flex-shrink-0 flex flex-col items-center pt-3 pb-2"
                  style={{ width: 72 }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: today ? "var(--color-accent)" : "var(--color-text-1)" }}
                  >
                    {dayLabel(d)}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: today ? "var(--color-accent)" : "var(--color-text-3)" }}
                  >
                    {dateNum(d)}
                  </span>
                </div>

                {/* Content column */}
                <div className="flex-1 min-w-0 pt-2 pb-2 pr-3 flex flex-col gap-1.5">
                  {entries.map((entry) => {
                    const recipe = entry.recipe_id
                      ? recipes.find((r) => r.id === entry.recipe_id)
                      : null;
                    const isFreeText = !!entry.free_text && !entry.recipe_id;
                    const mealType = MEAL_TYPES.find((m) => m.id === entry.meal_type);
                    const assignedMembers = (entry.assigned_to || [])
                      .map((uid) => householdMembers.find((m) => m.id === uid))
                      .filter(Boolean) as HouseholdMember[];

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 cursor-pointer active:scale-[0.98] transition-all"
                        style={{
                          background: isFreeText ? "var(--accent-light)" : "var(--color-surface-2)",
                          border: isFreeText ? "1px dashed color-mix(in srgb, var(--color-accent) 30%, transparent)" : "1px solid transparent",
                          touchAction: "pan-y",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                          WebkitTouchCallout: "none",
                        } as React.CSSProperties}
                        onClick={() => handleEntryTap(entry)}
                        onPointerDown={(e) => handleEntryPointerDown(entry, e)}
                        onPointerUp={handleEntryPointerUp}
                        onPointerCancel={handleEntryPointerUp}
                        onPointerMove={handleEntryPointerMove}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setEntryPopover({ entry, x: e.clientX, y: e.clientY });
                        }}
                      >
                        {/* Thumbnail / Freitext Icon */}
                        {isFreeText ? (
                          <div
                            className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
                            style={{ background: "var(--accent-light)" }}
                          >
                            📝
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-surface">
                            {recipe?.image_url ? (
                              <ImageWithFallback
                                src={recipe.image_url}
                                alt={recipe.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg">
                                🍽️
                              </div>
                            )}
                          </div>
                        )}

                        {/* Name + chips */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-1 truncate">
                            {recipe?.title || entry.free_text || "–"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {mealType && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ background: "var(--color-surface)", color: "var(--color-text-2)" }}
                              >
                                {mealType.emoji} {mealType.label}
                              </span>
                            )}
                            {/* Avatar chips */}
                            {assignedMembers.length > 0 && (
                              <div className="flex -space-x-1.5">
                                {assignedMembers.slice(0, 4).map((member) => {
                                  const initials = member.display_name
                                    .split(" ")
                                    .map((n) => n[0] || "")
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2);
                                  return (
                                    <div
                                      key={member.id}
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold overflow-hidden"
                                      style={{
                                        background: member.avatar_url ? undefined : member.initials_color,
                                        border: "1.5px solid var(--color-surface-2)",
                                      }}
                                    >
                                      {member.avatar_url ? (
                                        <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span>{initials}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* "+ Hinzufügen" button — full width */}
                  <button
                    onClick={() => openDayPicker(dateStr)}
                    className="w-full py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all mt-0.5"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-3)" }}
                    onPointerEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
                    }}
                    onPointerLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-3)";
                    }}
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
                    }}
                    onPointerUp={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-3)";
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* KOCHBUCH */}
      {kochenTab === "rezepte" && (
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Filter Chips */}
        <div className="flex-shrink-0 px-4 pb-2" style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
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
        <div className="flex-shrink-0 px-4 pb-3" style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <input
              type="search"
              name="recipe-search"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="sentences"
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
        <div className="flex-1 overflow-y-auto pb-4">
          <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", padding: "0 16px" }}>
          {filteredRecipes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-3">
              <span className="text-4xl mb-3">📖</span>
              <p className="text-sm">Noch keine Rezepte</p>
              <p className="text-xs mt-1">Tippe auf + um ein Rezept hinzuzufügen</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="cursor-pointer active:scale-[0.97] transition overflow-hidden"
                  style={{ borderRadius: 16, boxShadow: "var(--shadow-card)" }}
                  onClick={() => openRecipeDetail(recipe.id)}
                >
                  {/* Full-bleed image with overlay — aspect 4/5 */}
                  <div className="relative bg-surface-2" style={{ aspectRatio: "4/5" }}>
                    {recipe.image_url ? (
                      <ImageWithFallback
                        src={recipe.image_url}
                        alt={recipe.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl bg-surface-2">🍽️</div>
                    )}

                    {/* Dark gradient overlay bottom */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 50%, transparent 100%)",
                        borderRadius: "inherit",
                      }}
                    />

                    {/* Favorite button — top right */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(recipe.id);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.32)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${recipe.is_favorite ? "fill-white text-white" : "text-white/80"}`}
                      />
                    </button>

                    {/* Title + meta chips — bottom overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-6">
                      <p
                        className="text-white font-semibold leading-tight"
                        style={{ fontSize: 14, textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
                      >
                        {recipe.title}
                      </p>
                      {totalTime(recipe) && (
                         <p
                           className="text-white/75 mt-0.5"
                           style={{ fontSize: 11, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                         >
                           {totalTime(recipe)}
                         </p>
                       )}
                       
                       
                      <div className="flex flex-wrap gap-1" style={{display:"none"}}>
                        {recipe.ingredients.length > 0 && (
                          <span
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium"
                            style={{ fontSize: 10, background: "rgba(255,255,255,0.40)", color: "#374151", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
                          >
                            {recipe.ingredients.length} Zutaten
                          </span>
                        )}
                        {totalTime(recipe) && (
                          <span
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium"
                            style={{ fontSize: 10, background: "rgba(255,255,255,0.40)", color: "#374151", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
                          >
                            <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                            {totalTime(recipe)}
                          </span>
                        )}
                        {recipe.categories[0] && (
                          <span
                            className="flex items-center px-1.5 py-0.5 rounded-full font-medium"
                            style={{ fontSize: 10, background: "rgba(255,255,255,0.40)", color: "#374151", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
                          >
                            {recipe.categories[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      )}

      {/* ── OVERLAYS / MODALS ─────────────────────────────────────── */}

      {/* Entry Popover (long-press on meal card) */}
      {entryPopover && (
        <div className="contents">
          <div className="fixed inset-0 z-[1000]" onClick={() => setEntryPopover(null)} />
          <div
            className="fixed z-[1000] rounded-xl py-2 min-w-[180px]"
            style={{
              top: Math.min(entryPopover.y, window.innerHeight - 160),
              left: Math.min(entryPopover.x, window.innerWidth - 200),
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--zu-border)',
            }}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-text-2 hover:bg-surface-2 rounded-lg flex items-center gap-2.5"
              onClick={() => {
                setEditEntryDate(entryPopover.entry.date);
                setEditEntryMealType(entryPopover.entry.meal_type || "mittag");
                setEditUserIds(entryPopover.entry.assigned_to || householdMembers.map((m) => m.id));
                setShowEditEntrySheet(true);
              }}
            >
              <Pencil className="w-4 h-4 text-text-3" />
              Bearbeiten
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger-light rounded-lg flex items-center gap-2.5"
              onClick={() => { setDeleteConfirm(entryPopover.entry.id); setEntryPopover(null); }}
            >
              <Trash2 className="w-4 h-4" />
              Löschen
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 z-[999]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
            <motion.div
              className="absolute left-0 right-0 bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
              style={{ boxShadow: "var(--shadow-elevated)", bottom: bottomOffset, maxHeight: vpHeight - 72 }}
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
                  onClick={() => { setDeleteConfirm(null); setEntryPopover(null); }}
                >
                  Abbrechen
                </button>
                <button
                  className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-danger text-white"
                  onClick={() => deleteMealEntry(deleteConfirm!)}
                >
                  Löschen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bearbeiten Sheet (Tag + Mahlzeit + Personen) */}
      <AnimatePresence>
        {showEditEntrySheet && entryPopover && (
          <motion.div
            className="fixed inset-0 z-[1001]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowEditEntrySheet(false)} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[calc(1rem+env(safe-area-inset-bottom))]"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)', bottom: bottomOffset, maxHeight: vpHeight - 72 }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <h3 className="text-base font-semibold text-text-1">Eintrag bearbeiten</h3>
                <button onClick={() => setShowEditEntrySheet(false)}>
                  <X className="w-5 h-5 text-text-3" />
                </button>
              </div>

              {/* Tag */}
              <div className="px-5 pb-3">
                <p className="text-xs font-semibold text-text-3 mb-2">Tag</p>
                <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {generateFutureDays().map((d) => {
                    const dateStr = fmtDate(d);
                    const isSelected = dateStr === editEntryDate;
                    const todayDay = isToday(d);
                    return (
                      <button
                        key={dateStr}
                        onClick={() => setEditEntryDate(dateStr)}
                        className="flex-shrink-0 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                        style={{
                          minWidth: 52,
                          background: isSelected ? "var(--color-accent)" : "var(--color-surface-2)",
                        }}
                      >
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: isSelected ? "rgba(255,255,255,0.8)" : todayDay ? "var(--color-accent)" : "var(--color-text-3)" }}
                        >
                          {dayLabel(d)}
                        </span>
                        <span
                          className="text-sm font-bold"
                          style={{ color: isSelected ? "#fff" : "var(--color-text-1)" }}
                        >
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mahlzeit */}
              <div className="px-5 pb-3">
                <p className="text-xs font-semibold text-text-3 mb-2">Mahlzeit</p>
                <div className="flex gap-2">
                  {MEAL_TYPES.map((mt) => {
                    const isActive = editEntryMealType === mt.id;
                    return (
                      <button
                        key={mt.id}
                        onClick={() => setEditEntryMealType(mt.id)}
                        className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-medium transition-all"
                        style={{
                          background: isActive ? "var(--color-accent)" : "var(--color-surface-2)",
                          color: isActive ? "#fff" : "var(--color-text-2)",
                        }}
                      >
                        <span className="text-lg">{mt.emoji}</span>
                        <span className="text-xs font-semibold">{mt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Wer isst? */}
              <div className="px-5 pb-4">
                <p className="text-xs font-semibold text-text-3 mb-2">Wer isst?</p>
                <div className="flex gap-4 flex-wrap">
                  {householdMembers.map((member) => (
                    <MemberChip
                      key={member.id}
                      member={member}
                      selected={editUserIds.includes(member.id)}
                      onToggle={() => {
                        setEditUserIds((prev) => {
                          if (prev.includes(member.id)) {
                            if (prev.length === 1) return prev;
                            return prev.filter((uid) => uid !== member.id);
                          }
                          return [...prev, member.id];
                        });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Speichern */}
              <div className="px-5 pb-4">
                <button
                  onClick={saveEntryEdits}
                  className="w-full py-3 rounded-full text-sm font-semibold text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  Speichern
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meal Picker (unified sheet with Rezept/Freitext tabs) */}
      <AnimatePresence>
        {showMealPicker && mealPickerDate && (
          <motion.div
            className="fixed inset-0 z-[999]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowMealPicker(false); setMealPickerDate(null); }} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)', bottom: bottomOffset, maxHeight: vpHeight - 72 }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
                <h3 className="text-base font-semibold">Was gibt's zu essen?</h3>
                <button onClick={() => { setShowMealPicker(false); setMealPickerDate(null); }}>
                  <X className="w-5 h-5 text-text-3" />
                </button>
              </div>

              {/* Mahlzeit */}
              <div className="px-4 pb-2 flex-shrink-0">
                <p className="text-xs font-semibold text-text-3 mb-2">Mahlzeit</p>
                <div className="flex gap-2">
                  {MEAL_TYPES.map((mt) => {
                    const isActive = mealPickerMealType === mt.id;
                    return (
                      <button
                        key={mt.id}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => setMealPickerMealType(mt.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: isActive ? "var(--color-accent)" : "var(--color-surface-2)",
                          color: isActive ? "#fff" : "var(--color-text-2)",
                        }}
                      >
                        <span>{mt.emoji}</span>
                        <span>{mt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Wer isst? */}
              {householdMembers.length > 0 && (
                <div className="px-4 pb-3 flex-shrink-0">
                  <p className="text-xs font-semibold text-text-3 mb-2">Wer isst?</p>
                  <div className="flex gap-3 flex-wrap">
                    {householdMembers.map((member) => (
                      <MemberChip
                        key={member.id}
                        member={member}
                        selected={mealPickerUserIds.includes(member.id)}
                        onToggle={() => {
                          setMealPickerUserIds((prev) => {
                            if (prev.includes(member.id)) {
                              if (prev.length === 1) return prev;
                              return prev.filter((uid) => uid !== member.id);
                            }
                            return [...prev, member.id];
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Segmented Control: Rezept / Freitext */}
              <div className="px-4 pb-3 flex-shrink-0">
                <div
                  className="flex items-center"
                  style={{
                    padding: 3,
                    borderRadius: 999,
                    background: "var(--color-surface-2)",
                  }}
                >
                  {(["rezept", "freitext"] as const).map((tab) => (
                    <button
                      key={tab}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setMealPickerTab(tab);
                        setMealPickerSelectedRecipeId(null);
                      }}
                      className="flex-1 text-center text-xs py-1.5 transition-all"
                      style={{
                        borderRadius: 999,
                        fontWeight: mealPickerTab === tab ? 600 : 400,
                        color: mealPickerTab === tab ? "var(--color-text-1)" : "var(--color-text-3)",
                        background: mealPickerTab === tab ? "var(--color-surface)" : "transparent",
                        boxShadow: mealPickerTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      {tab === "rezept" ? "Rezept" : "Freitext"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              {mealPickerTab === "rezept" ? (
                <div className="flex flex-col flex-1 min-h-0">
                  {/* Search */}
                  <div className="px-4 pb-2 flex-shrink-0">
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
                        style={{ caretColor: "var(--color-accent)" }}
                      />
                    </div>
                  </div>
                  {/* Recipe list */}
                  <div className="flex-1 overflow-y-auto px-4">
                    {recipes
                      .filter((r) =>
                        !mealPickerSearch.trim() || r.title.toLowerCase().includes(mealPickerSearch.toLowerCase())
                      )
                      .map((recipe) => {
                        const isSelected = mealPickerSelectedRecipeId === recipe.id;
                        return (
                          <button
                            key={recipe.id}
                            className="w-full flex items-center gap-3 py-2.5 border-b border-border text-left transition-all"
                            style={{
                              background: isSelected ? "var(--accent-light)" : "transparent",
                              borderRadius: isSelected ? 12 : 0,
                              borderBottom: isSelected ? "none" : undefined,
                              marginBottom: isSelected ? 2 : 0,
                              paddingLeft: isSelected ? 8 : 0,
                              paddingRight: isSelected ? 8 : 0,
                            }}
                            onClick={() => setMealPickerSelectedRecipeId(isSelected ? null : recipe.id)}
                          >
                            <div className="w-10 h-10 rounded-lg bg-surface-2 flex-shrink-0 overflow-hidden">
                              {recipe.image_url ? (
                                <ImageWithFallback src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="w-full h-full flex items-center justify-center text-lg">🍽️</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-text-1 truncate">{recipe.title}</p>
                              {totalTime(recipe) && (
                                <p className="text-xs text-text-3">{totalTime(recipe)}</p>
                              )}
                            </div>
                            {isSelected && (
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: "var(--color-accent)" }}
                              >
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    {recipes.length === 0 && (
                      <p className="text-center text-text-3 text-sm py-8">Noch keine Rezepte im Kochbuch</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 flex-1 min-h-0">
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
                    className="w-full px-4 py-3 bg-surface-2 rounded-xl text-sm border-0 outline-none"
                    style={{ caretColor: "var(--color-accent)" }}
                    autoFocus
                  />
                </div>
              )}

              {/* Hinzufügen button — always visible at bottom */}
              <div className="px-4 pt-3 pb-2 flex-shrink-0">
                <button
                  disabled={
                    mealPickerTab === "rezept"
                      ? !mealPickerSelectedRecipeId
                      : !freetextValue.trim()
                  }
                  onClick={() => {
                    if (mealPickerTab === "rezept" && mealPickerSelectedRecipeId) {
                      assignRecipeToDate(mealPickerSelectedRecipeId, mealPickerDate!);
                    } else if (mealPickerTab === "freitext" && freetextValue.trim()) {
                      assignFreetextToDate(freetextValue.trim(), mealPickerDate!);
                    }
                  }}
                  className="w-full py-3 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "var(--color-accent)" }}
                >
                  Hinzufügen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Recipe Bottom Sheet */}
      <AnimatePresence>
        {showAddSheet && (
          <motion.div
            className="fixed inset-0 z-[999]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddSheet(false)} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)', bottom: bottomOffset, maxHeight: vpHeight - 72 }}
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
                onClick={() => {
                  setShowAddSheet(false);
                  setPendingPhotoUpload(true);
                }}
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

      {/* Hidden file input for photo extraction — outside all drawers so it survives drawer close */}
      <input
        ref={photoFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoFileChange}
      />

      {/* URL Import Modal */}
      <AnimatePresence>
        {showUrlImport && (
          <motion.div
            className="fixed inset-0 z-[999]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowUrlImport(false); setUrlInput(""); }} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-elevated)', bottom: bottomOffset, maxHeight: vpHeight - 72 }}
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

      {/* ── Photo Crop Screen (full-page overlay) ── */}
      <AnimatePresence>
        {photoCropSrc && !photoExtracting && (
          <motion.div
            className="fixed inset-0 z-[3000] flex flex-col"
            style={{ background: "#000", touchAction: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-center px-4 flex-shrink-0"
              style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: 8 }}
            >
              <span className="text-white text-sm font-semibold">Schneide den Rezeptbereich aus</span>
            </div>

            {/* Cropper area — free aspect ratio, explicit height for react-easy-crop */}
            <div
              className="relative flex-shrink-0"
              style={{ height: "calc(100dvh - 120px)", position: "relative" }}
            >
              <Cropper
                image={photoCropSrc}
                crop={photoCrop}
                zoom={photoZoom}
                aspect={undefined}
                cropShape="rect"
                showGrid={true}
                onCropChange={setPhotoCrop}
                onZoomChange={setPhotoZoom}
                onCropComplete={(_croppedArea, pixels) => setPhotoCroppedArea(pixels)}
                style={{
                  containerStyle: { background: "#000" },
                  mediaStyle: {},
                  cropAreaStyle: {},
                }}
              />
            </div>

            {/* Zoom hint */}
            <div className="flex justify-center pb-2 flex-shrink-0">
              <span className="text-white/50 text-xs">Zwei Finger zum Zoomen</span>
            </div>

            {/* Buttons */}
            <div
              className="flex gap-3 px-4 flex-shrink-0"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)", paddingTop: 12 }}
            >
              <button
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
                onClick={() => setPhotoCropSrc(null)}
              >
                Abbrechen
              </button>
              <button
                className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: "var(--color-accent)", color: "#fff" }}
                onClick={handlePhotoExtract}
              >
                <Camera className="w-4 h-4" />
                Extrahieren
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Photo Extraction Loading Screen ── */}
      <AnimatePresence>
        {photoExtracting && (
          <motion.div
            className="fixed inset-0 z-[3000] flex flex-col items-center justify-center"
            style={{ background: "var(--zu-bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="text-6xl mb-6 select-none"
            >
              🍳
            </motion.div>
            <p className="text-base font-semibold text-text-1 mb-1">Rezept wird erkannt...</p>
            <p className="text-sm text-text-3">Bitte einen Moment Geduld</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB — nur im Rezepte-Tab */}
      {kochenTab === "rezepte" && (
        <button
          onClick={() => setShowAddSheet(true)}
          className="fixed flex items-center justify-center rounded-full bg-accent text-white shadow-lg active:scale-95 transition-transform"
          style={{
            width: 52,
            height: 52,
            bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)",
            right: 16,
            zIndex: 40,
          }}
          aria-label="Rezept hinzufügen"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ── Member avatar chip for Wochenplaner Drawer ─────────────────────
function MemberChip({
  member,
  selected,
  onToggle,
}: {
  member: HouseholdMember;
  selected: boolean;
  onToggle: () => void;
}) {
  const initials = member.display_name
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <button
      onClick={onToggle}
      className="flex flex-col items-center gap-1"
      style={{ minWidth: 56 }}
    >
      <div className="relative" style={{ width: 48, height: 48 }}>
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold text-sm overflow-hidden"
          style={{ background: member.avatar_url ? undefined : member.initials_color }}
        >
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.display_name} className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        {selected && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-accent)", border: "2px solid var(--color-surface)" }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-xs text-center leading-tight" style={{ color: "var(--color-text-2)" }}>
        {member.display_name.split(" ")[0]}
      </span>
    </button>
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
  onSaveComment,
  stores,
  mealPlan,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onSetRating: (r: number) => void;
  onDelete: () => void;
  onSaveComment: (c: string) => void;
  stores: any[];
  mealPlan: MealPlanEntry[];
}) {
  const { householdId, householdMembers } = useAuth();
  const [servings, setServings] = useState(recipe.servings || 4);
  const [comment, setComment] = useState(recipe.comment || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShoppingDrawer, setShowShoppingDrawer] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<boolean[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>(
    () => stores[0]?.id || "aldi"
  );
  const [addingToShopping, setAddingToShopping] = useState(false);

  // ── Wochenplaner Drawer ────────────────────────────────────────────
  const [showMealPlanDrawer, setShowMealPlanDrawer] = useState(false);
  const [selectedMealDate, setSelectedMealDate] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<"fruehstueck" | "mittag" | "abend">("mittag");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [addingToMealPlan, setAddingToMealPlan] = useState(false);

  const futureDays = useMemo(() => generateFutureDays(), []);
  const occupiedDates = useMemo(() => {
    const s = new Set<string>();
    mealPlan.forEach((e) => s.add(e.date));
    return s;
  }, [mealPlan]);

  useBackHandler(showDeleteConfirm, () => setShowDeleteConfirm(false));
  useBackHandler(showShoppingDrawer, () => setShowShoppingDrawer(false));
  useBackHandler(showMealPlanDrawer, () => setShowMealPlanDrawer(false));
  const { bottomOffset: detailBottomOffset, vpHeight: detailVpHeight } = useKeyboardOffset();
  const scale = recipe.servings ? servings / recipe.servings : 1;
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openShoppingDrawer = () => {
    setCheckedIngredients(recipe.ingredients.map(() => true));
    setSelectedStore(stores[0]?.id || "aldi");
    setShowShoppingDrawer(true);
  };

  const openMealPlanDrawer = () => {
    setSelectedMealDate(null);
    setSelectedMealType("mittag");
    setSelectedUserIds(householdMembers.map((m) => m.id));
    setShowMealPlanDrawer(true);
  };

  const toggleMealPlanUser = (id: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((uid) => uid !== id);
      }
      return [...prev, id];
    });
  };

  const handleAddToMealPlan = async () => {
    if (!selectedMealDate || selectedUserIds.length === 0) return;
    setAddingToMealPlan(true);
    try {
      const mealPlanRes = await apiFetch(`/meal-plan?household_id=${householdId}`);
      const currentEntries: MealPlanEntry[] = mealPlanRes.entries || [];

      const newEntry: MealPlanEntry = {
        id: genId(),
        date: selectedMealDate,
        meal_type: selectedMealType,
        recipe_id: recipe.id,
        free_text: null,
        assigned_to: selectedUserIds,
        household_id: householdId || "",
      };

      broadcastChange([`meal_plan:${householdId}`]);
      await apiFetch("/meal-plan", {
        method: "PUT",
        body: JSON.stringify({
          household_id: householdId,
          entries: [...currentEntries, newEntry],
        }),
      });

      setShowMealPlanDrawer(false);
      const d = new Date(selectedMealDate + "T12:00:00");
      toast.success(`Zu ${dayLabel(d)} ${dateNum(d)} hinzugefügt ✅`);
    } catch (err: any) {
      console.error("[RecipeDetail] addToMealPlan error:", err);
      toast.error(err?.message || "Fehler beim Hinzufügen zum Wochenplaner");
    } finally {
      setAddingToMealPlan(false);
    }
  };

  const handleCommentChange = (val: string) => {
    setComment(val);
    if (commentTimer.current) clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => onSaveComment(val), 500);
  };

  const handleAddToShopping = async () => {
    const chosen = recipe.ingredients.filter((_, i) => checkedIngredients[i]);
    if (chosen.length === 0) return;
    setAddingToShopping(true);
    try {
      const shoppingRes = await apiFetch(`/shopping?household_id=${householdId}`);
      const existingItems: any[] = shoppingRes.items || [];

      // Build a lookup map for existing items (by lowercased name)
      const existingMap = new Map<string, any>();
      existingItems.forEach((item) => {
        existingMap.set(item.name.toLowerCase(), item);
      });

      // Units where qty/unit have no meaning on a shopping list — only the name matters
      const UNITS_NAME_ONLY = ["tl", "el", "päckchen", "pck", "pk"];

      const scaledChosen = chosen.map((ing) => {
        const qty = ing.quantity ? parseFloat(ing.quantity) : NaN;
        const scaledQty = !isNaN(qty) ? (qty * scale) : null;
        return { ...ing, scaledQty };
      });

      let addedCount = 0;
      const updatedItems = [...existingItems];

      for (const ing of scaledChosen) {
        // Category lookup: GROCERY_DATABASE first, fallback "Sonstiges"
        const dbMatch = GROCERY_DATABASE.find(
          (g) => g.name.toLowerCase() === ing.name.toLowerCase()
        );
        const category = dbMatch?.category || "Sonstiges";

        const unitNorm = (ing.unit || "").trim().toLowerCase();
        const skipQtyUnit = UNITS_NAME_ONLY.includes(unitNorm);

        // Name: always ONLY the ingredient name — never concat qty/unit
        const itemName = ing.name.trim();

        // Quantity: use the scaled/original qty; set to 1 for TL/EL/Päckchen
        const rawQty = ing.scaledQty !== null
          ? parseFloat(
              Number.isInteger(ing.scaledQty)
                ? String(ing.scaledQty)
                : ing.scaledQty.toFixed(2)
            )
          : (ing.quantity ? parseFloat(ing.quantity) || 1 : 1);
        const itemQty = skipQtyUnit ? 1 : rawQty;

        // Unit: pass through the ingredient unit; null for TL/EL/Päckchen
        const itemUnit = skipQtyUnit ? null : (ing.unit || null);

        // Check if an item with the same name already exists (case-insensitive)
        const existingKey = itemName.toLowerCase();
        const existingEntry = existingMap.get(existingKey);

        if (existingEntry) {
          // Merge: add the actual ingredient quantity instead of a flat +1
          existingEntry.quantity = (existingEntry.quantity || 1) + itemQty;
        } else {
          const storeVal = selectedStore === "alle" ? null : selectedStore;
          const newItem = {
            id: genId(),
            name: itemName,
            store: storeVal,
            category,
            is_checked: false,
            position: updatedItems.length,
            quantity: itemQty,
            unit: itemUnit,
            household_id: householdId || "",
          };
          updatedItems.push(newItem);
          existingMap.set(existingKey, newItem);
          addedCount++;
        }
      }

      await apiFetch("/shopping", {
        method: "PUT",
        body: JSON.stringify({
          household_id: householdId,
          items: updatedItems,
        }),
      });

      setShowShoppingDrawer(false);
      toast.success(`${addedCount} Zutaten hinzugefügt ✅`);
    } catch (err: any) {
      console.error("[RecipeDetail] addToShopping error:", err);
      toast.error(err?.message || "Fehler beim Hinzufügen");
    } finally {
      setAddingToShopping(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Mobile layout (< 768px) ─────────────────────────────────── */}
      <div className="md:hidden flex-1 flex flex-col min-h-0">
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
                <Heart className={`w-4 h-4 ${recipe.is_favorite ? "fill-accent text-accent" : "text-text-2"}`} />
              </button>
              <button onClick={onEdit} className="w-8 h-8 rounded-full bg-surface/80 flex items-center justify-center">
                <Pencil className="w-4 h-4 text-text-2" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <h1 className="text-2xl font-bold text-text-1 mt-4">{recipe.title}</h1>

          {/* Rating + Categories */}
          <div className="flex items-center gap-1 mt-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => onSetRating(s)}>
                <Star className={`w-5 h-5 ${s <= recipe.rating ? "fill-accent text-accent" : "text-text-3"}`} />
              </button>
            ))}
            {recipe.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 ml-3">
                {recipe.categories.map((c) => (
                  <span key={c} className="px-2 py-0.5 bg-accent-light text-accent-dark text-xs rounded-full">{c}</span>
                ))}
              </div>
            )}
          </div>

          {/* Time + Servings */}
          <div className="flex items-center gap-4 mt-3 text-sm text-text-2">
            {totalTime(recipe) && (
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {totalTime(recipe)}</span>
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
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent mt-2 hover:underline">
              <ExternalLink className="w-3 h-3" /> Original-Link
            </a>
          )}

          {/* Description */}
          {recipe.description && <p className="text-sm text-text-2 mt-3">{recipe.description}</p>}

          {/* Ingredients */}
          {recipe.ingredients.length > 0 && (
            <div className="mt-5">
              <h3 className="text-base font-semibold text-text-1 mb-2">Zutaten</h3>
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
                {recipe.steps.sort((a, b) => a.position - b.position).map((step, i) => (
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

          {/* Comment — read-only, only shown when set */}
          {recipe.comment?.trim() && (
            <div className="mt-5">
              <h3 className="text-base font-semibold text-text-1 mb-2">Kommentare</h3>
              <p className="text-sm text-text-2 leading-relaxed whitespace-pre-wrap">{recipe.comment}</p>
            </div>
          )}

          {/* Delete */}
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-sm text-danger mt-6">
            <Trash2 className="w-4 h-4" /> Rezept löschen
          </button>
        </div>
      </div>

      {/* ── Tablet layout (≥ 768px) ─────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-y-auto">

        {/* Row 1 — Image (40%) + Header (60%) */}
        <div className="relative grid flex-shrink-0" style={{ gridTemplateColumns: "40% 60%" }}>

          {/* Left: image */}
          <div className="relative" style={{ height: 240 }}>
            {recipe.image_url ? (
              <ImageWithFallback src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent-light to-accent-light/50 flex items-center justify-center text-6xl rounded-xl">
                🍽️
              </div>
            )}
            {/* Back button over image */}
            <button onClick={onBack} className="absolute top-3 left-3 w-8 h-8 rounded-full bg-surface/80 flex items-center justify-center">
              <ChevronLeft className="w-5 h-5 text-text-2" />
            </button>
          </div>

          {/* Right: title, categories, stars, time, link */}
          <div className="relative px-6 py-4 flex flex-col justify-center">
            {/* Favorite + Edit — top right */}
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={onToggleFavorite} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
                <Heart className={`w-4 h-4 ${recipe.is_favorite ? "fill-accent text-accent" : "text-text-2"}`} />
              </button>
              <button onClick={onEdit} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
                <Pencil className="w-4 h-4 text-text-2" />
              </button>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold text-text-1 pr-20 leading-tight">{recipe.title}</h1>

            {/* Categories — plain accent-coloured text, no chip style */}
            {recipe.categories.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-2">
                {recipe.categories.map((c) => (
                  <span key={c} className="text-sm font-medium" style={{ color: "var(--color-accent)" }}>{c}</span>
                ))}
              </div>
            )}

            {/* Stars */}
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => onSetRating(s)}>
                  <Star className={`w-5 h-5 ${s <= recipe.rating ? "fill-accent text-accent" : "text-text-3"}`} />
                </button>
              ))}
            </div>

            {/* Time */}
            {totalTime(recipe) && (
              <span className="flex items-center gap-1 mt-2 text-sm text-text-2">
                <Clock className="w-4 h-4" /> {totalTime(recipe)}
              </span>
            )}

            {/* Source URL */}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent mt-1 hover:underline">
                <ExternalLink className="w-3 h-3" /> Original-Link
              </a>
            )}

            {/* Description */}
            {recipe.description && null}
          </div>
        </div>

        {/* Row 2 — Ingredients (25%) + Steps + Comment (75%) */}
        <div className="grid gap-8 px-6 mt-6 pb-10" style={{ gridTemplateColumns: "25% 1fr" }}>

          {/* Left: Ingredients + stepper + delete */}
          <div className="flex flex-col">
            <h3 className="text-base font-semibold text-text-1 mb-2">Zutaten</h3>

            {/* Portionen-Stepper */}
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setServings(Math.max(1, servings - 1))}
                className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center">
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-sm font-medium text-text-1">{servings} Portionen</span>
              <button onClick={() => setServings(servings + 1)}
                className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center">
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Ingredient list */}
            <div className="space-y-1.5 flex-1">
              {recipe.ingredients.map((ing, i) => {
                const qty = ing.quantity ? parseFloat(ing.quantity) : NaN;
                const scaledQty = !isNaN(qty) ? (qty * scale).toFixed(qty * scale % 1 === 0 ? 0 : 1) : ing.quantity;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--color-accent)" }} />
                    <span className="text-text-2">
                      {scaledQty && <span className="font-medium">{scaledQty} </span>}
                      {ing.unit && <span>{ing.unit} </span>}
                      {ing.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Delete */}
            <button onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-danger mt-6 self-start">
              <Trash2 className="w-4 h-4" /> Rezept löschen
            </button>
          </div>

          {/* Right: Steps + Comment */}
          <div>
            {recipe.steps.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-text-1 mb-3">Zubereitung</h3>
                <div className="space-y-4">
                  {recipe.steps.sort((a, b) => a.position - b.position).map((step, i) => (
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

            {/* Comment — read-only, only shown when set */}
            {recipe.comment?.trim() && (
              <div className="mt-6">
                <h3 className="text-base font-semibold text-text-1 mb-2">Kommentare</h3>
                <p className="text-sm text-text-2 leading-relaxed whitespace-pre-wrap">{recipe.comment}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar FAB — add to Wochenplaner */}
      <button
        onClick={openMealPlanDrawer}
        style={{
          position: "fixed",
          bottom: recipe.ingredients.length > 0
            ? "calc(72px + env(safe-area-inset-bottom) + 16px + 52px + 12px)"
            : "calc(72px + env(safe-area-inset-bottom) + 16px)",
          right: 16,
          zIndex: 40,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "var(--color-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        }}
      >
        <CalendarPlus className="w-5 h-5 text-white" />
      </button>

      {/* Shopping FAB */}
      {recipe.ingredients.length > 0 && (
        <button
          onClick={openShoppingDrawer}
          style={{
            position: "fixed",
            bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)",
            right: 16,
            zIndex: 40,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--color-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          }}
        >
          <ShoppingCart className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Shopping Drawer */}
      <AnimatePresence>
        {showShoppingDrawer && (
          <motion.div
            className="fixed inset-0 z-[1000]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowShoppingDrawer(false)}
            />
            <motion.div
              className="absolute left-0 right-0 bg-surface rounded-t-[20px] flex flex-col"
              style={{
                boxShadow: "var(--shadow-elevated)",
                bottom: detailBottomOffset,
                maxHeight: detailVpHeight - 72,
              }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--zu-border)" }}>
                <h3 className="text-base font-semibold text-text-1">Zutaten einkaufen</h3>
                <button
                  onClick={() => setShowShoppingDrawer(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  <X className="w-4 h-4 text-text-2" />
                </button>
              </div>

              {/* Ingredient list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {recipe.ingredients.map((ing, i) => {
                  const qty = ing.quantity ? parseFloat(ing.quantity) : NaN;
                  const scaledQty = !isNaN(qty)
                    ? (qty * scale % 1 === 0 ? (qty * scale).toString() : (qty * scale).toFixed(1))
                    : ing.quantity;
                  return (
                    <button
                      key={i}
                      onClick={() => setCheckedIngredients((prev) => {
                        const next = [...prev];
                        next[i] = !next[i];
                        return next;
                      })}
                      className="w-full flex items-center gap-3 py-2 text-left"
                    >
                      <div
                        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                        style={{
                          background: checkedIngredients[i] ? "var(--color-accent)" : "transparent",
                          border: checkedIngredients[i] ? "none" : "1.5px solid var(--zu-border)",
                        }}
                      >
                        {checkedIngredients[i] && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-text-2">
                        {scaledQty && <span className="font-medium">{scaledQty} </span>}
                        {ing.unit && <span>{ing.unit} </span>}
                        {ing.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Store picker */}
              <div className="px-4 pt-2 pb-3 flex-shrink-0" style={{ borderTop: "1px solid var(--zu-border)" }}>
                <p className="text-xs text-text-3 mb-2 font-medium">Zu welchem Laden?</p>
                <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {stores
                    .map((s: any) => {
                      const isSelected = selectedStore === s.id;
                      return (
                        <button
                          key={s.id}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => setSelectedStore(s.id)}
                          className="flex-shrink-0 flex flex-col items-center gap-1"
                        >
                          <StoreLogoKochen store={s} size={48} isSelected={isSelected} />
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: isSelected ? "var(--color-accent)" : "var(--color-text-3)" }}
                          >
                            {s.name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Add button */}
              <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex-shrink-0">
                <button
                  onClick={handleAddToShopping}
                  disabled={addingToShopping || checkedIngredients.every((c) => !c)}
                  className="w-full py-3 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{
                    background: "var(--color-accent)",
                    opacity: (addingToShopping || checkedIngredients.every((c) => !c)) ? 0.5 : 1,
                  }}
                >
                  {addingToShopping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  Hinzufügen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wochenplaner Drawer */}
      <AnimatePresence>
        {showMealPlanDrawer && (
          <motion.div
            className="fixed inset-0 z-[1000]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowMealPlanDrawer(false)}
            />
            <motion.div
              className="absolute left-0 right-0 bg-surface rounded-t-[20px] flex flex-col"
              style={{
                boxShadow: "var(--shadow-elevated)",
                bottom: detailBottomOffset,
                maxHeight: detailVpHeight - 72,
              }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--zu-border)" }}>
                <h3 className="text-base font-semibold text-text-1">Zum Wochenplaner</h3>
                <button
                  onClick={() => setShowMealPlanDrawer(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  <X className="w-4 h-4 text-text-2" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                {/* Tag wählen */}
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-3)" }}>Tag</p>
                    {selectedMealDate === null && (
                      <p className="text-xs" style={{ color: "var(--color-text-3)" }}>Bitte Tag auswählen</p>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {futureDays.map((d) => {
                      const dateStr = fmtLocalDate(d);
                      const isSelected = selectedMealDate === dateStr;
                      const todayDay = isToday(d);
                      const occupied = occupiedDates.has(dateStr);
                      return (
                        <button
                          key={dateStr}
                          onClick={() => setSelectedMealDate(dateStr)}
                          className="flex-shrink-0 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                          style={{
                            minWidth: 52,
                            background: isSelected ? "var(--color-accent)" : "var(--color-surface-2)",
                          }}
                        >
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: isSelected ? "rgba(255,255,255,0.8)" : todayDay ? "var(--color-accent)" : "var(--color-text-3)" }}
                          >
                            {dayLabel(d)}
                          </span>
                          <span
                            className="text-sm font-bold"
                            style={{ color: isSelected ? "#fff" : "var(--color-text-1)" }}
                          >
                            {d.getDate()}
                          </span>
                          {/* Occupied indicator dot */}
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              background: occupied
                                ? (isSelected ? "rgba(255,255,255,0.7)" : "var(--color-accent)")
                                : "transparent",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mahlzeit wählen */}
                <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--zu-border)" }}>
                  <p className="text-xs font-semibold text-text-3 mb-2 uppercase tracking-wide pt-4">Mahlzeit</p>
                  <div className="flex gap-2">
                    {MEAL_TYPES.map((mt) => {
                      const isActive = selectedMealType === mt.id;
                      return (
                        <button
                          key={mt.id}
                          onClick={() => setSelectedMealType(mt.id)}
                          className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            background: isActive ? "var(--color-accent)" : "var(--color-surface-2)",
                            color: isActive ? "#fff" : "var(--color-text-2)",
                          }}
                        >
                          <span className="text-lg">{mt.emoji}</span>
                          <span className="text-xs font-semibold">{mt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Wer isst? */}
                {householdMembers.length > 0 && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--zu-border)" }}>
                    <p className="text-xs font-semibold text-text-3 mb-3 uppercase tracking-wide pt-4">Wer isst?</p>
                    <div className="flex gap-4 flex-wrap">
                      {householdMembers.map((member) => (
                        <MemberChip
                          key={member.id}
                          member={member}
                          selected={selectedUserIds.includes(member.id)}
                          onToggle={() => toggleMealPlanUser(member.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Hinzufügen button */}
              <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 flex-shrink-0" style={{ borderTop: "1px solid var(--zu-border)" }}>
                <button
                  onClick={handleAddToMealPlan}
                  disabled={addingToMealPlan || selectedMealDate === null}
                  className="w-full py-3 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{
                    background: "var(--color-accent)",
                    opacity: (addingToMealPlan || selectedMealDate === null) ? 0.4 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {addingToMealPlan ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CalendarPlus className="w-4 h-4" />
                  )}
                  Hinzufügen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 z-[999]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
            <motion.div
              className="absolute left-0 right-0 bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
              style={{ boxShadow: "var(--shadow-elevated)", bottom: detailBottomOffset, maxHeight: detailVpHeight - 72 }}
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
// AUTO-UNIT LOOKUP (uses INGREDIENT_UNITS from ingredient-units.ts)
// ══════════════════════════════════════════════════════════════════════

function guessUnit(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  // Exact match
  if (INGREDIENT_UNITS.hasOwnProperty(lower)) return INGREDIENT_UNITS[lower];
  // Partial match
  for (const [key, unit] of Object.entries(INGREDIENT_UNITS)) {
    if (lower.includes(key) || key.includes(lower)) return unit;
  }
  return null;
}

// ── Global items type (for ingredient autocomplete) ──
interface GlobalItem {
  name: string;
  category: string;
  created_by_household_id: string;
  times_used: number;
  original_name?: string;
  deleted?: boolean;
}

// ── Shared category chip for ingredient category picker ──────────────
function IngCategoryChip({ category, onClick }: { category: string; onClick: () => void }) {
  const colors = getCategoryChipColor(category);
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition bg-surface-2 hover:opacity-80 whitespace-nowrap text-[12px]"
      style={{ color: "var(--text-1)" }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dot }} />
      {category}
    </button>
  );
}

// ── Category picker drawer for new ingredients ───────────────────────
function IngCategoryPickerModal({
  itemName,
  onSelect,
  onClose,
}: {
  itemName: string;
  onSelect: (category: string) => void;
  onClose: () => void;
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const { bottomOffset, vpHeight } = useKeyboardOffset();

  useEffect(() => {
    setTimeout(() => filterInputRef.current?.focus(), 100);
  }, []);

  const allCats = useMemo(() => getAllCategories(), []);
  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return allCats;
    const q = filterQuery.toLowerCase().trim();
    return allCats.filter((c) => c.toLowerCase().includes(q));
  }, [allCats, filterQuery]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40"
      style={{ touchAction: "none", zIndex: 9999 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={DRAWER_SPRING}
        onClick={(e) => e.stopPropagation()}
        className="fixed left-0 right-0 w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{
          bottom: bottomOffset,
          maxHeight: vpHeight - 72,
          boxShadow: "var(--shadow-elevated)",
          zIndex: 9999,
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-2 flex-shrink-0">
          <h3 className="text-base font-bold text-text-1">Kategorie wählen</h3>
          <p className="text-sm text-text-2 mt-0.5">Für &bdquo;{itemName}&ldquo;</p>
        </div>
        {/* Search field */}
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
            {filtered.map((cat) => (
              <IngCategoryChip key={cat} category={cat} onClick={() => onSelect(cat)} />
            ))}
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

// ══════════════════════════════════════════════════════════════════════
// COMPRESS IMAGE HELPER
// ══════════════════════════════════════════════════════════════════════

function compressImage(file: File, maxSize: number = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context failed")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ── Crop helper: draw the cropped area onto a canvas and return JPEG blob ──
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("toBlob fehlgeschlagen")),
      "image/jpeg",
      0.85,
    )
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
  householdId,
  customRecipeCategories = [],
}: {
  recipe: Recipe;
  onChange: (r: Recipe) => void;
  onSave: () => void;
  onCancel: () => void;
  householdId: string;
  customRecipeCategories?: string[];
}) {
  const update = (partial: Partial<Recipe>) => onChange({ ...recipe, ...partial });

  // ── Image upload state ──
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Crop state ──
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // ── Ingredient autocomplete state ──
  const [activeIngIdx, setActiveIngIdx] = useState<number | null>(null);
  const [ingQuery, setIngQuery] = useState("");
  const [globalItems, setGlobalItems] = useState<GlobalItem[]>([]);
  // State for "new unknown ingredient → pick category" flow
  const [pendingCustomIngName, setPendingCustomIngName] = useState<{ name: string; idx: number } | null>(null);

  // Fetch global items for autocomplete
  useEffect(() => {
    if (!householdId) return;
    (async () => {
      try {
        const res = await apiFetch(`/global-items?household_id=${householdId}`);
        setGlobalItems(res.items || []);
      } catch (err) {
        console.log("[RecipeEdit] Failed to load global items:", err);
      }
    })();
  }, [householdId]);

  // Build merged suggestion list using shared buildMergedItems — correctly
  // handles renames (old DB entries suppressed) and soft-deletes.
  const mergedItemsForDot = useMemo(() => buildMergedItems(globalItems), [globalItems]);

  const ingredientSuggestions = useMemo(() => {
    if (!ingQuery.trim()) return [];
    const q = ingQuery.toLowerCase();
    return mergedItemsForDot
      .filter((g) => g.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((g) => ({ name: g.name, category: g.category }));
  }, [ingQuery, mergedItemsForDot]);

  // ── Back handlers for image drawers & crop screen ──
  useBackHandler(!!cropImageSrc, () => setCropImageSrc(null));
  useBackHandler(showImageSheet, () => setShowImageSheet(false));
  useBackHandler(showUrlInput, () => { setShowUrlInput(false); setImageUrlDraft(""); });

  const { bottomOffset: editBottomOffset, vpHeight: editVpHeight } = useKeyboardOffset();

  // ── Ensure ingredients have at least one empty row ──
  useEffect(() => {
    if (recipe.ingredients.length === 0) {
      onChange({ ...recipe, ingredients: [{ name: "", quantity: "", unit: "" }] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ensure steps have at least one empty row ──
  useEffect(() => {
    if (recipe.steps.length === 0) {
      onChange({ ...recipe, steps: [{ position: 1, description: "" }] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ingredient refs for auto-focus ──
  const ingNameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateIngredient = (idx: number, field: keyof Ingredient, val: string) => {
    const next = [...recipe.ingredients];
    next[idx] = { ...next[idx], [field]: val };
    update({ ingredients: next });
  };

  const selectIngredientSuggestion = (idx: number, name: string) => {
    const next = [...recipe.ingredients];
    next[idx] = { ...next[idx], name };
    // Auto-set unit when selecting from autocomplete (not while typing)
    if (!next[idx].unit) {
      const unitFromMap = INGREDIENT_UNITS[name.toLowerCase()];
      const unitFromGuess = guessUnit(name);
      const resolved = unitFromMap !== undefined ? unitFromMap : (unitFromGuess ?? "");
      if (resolved) next[idx] = { ...next[idx], unit: resolved };
    }
    update({ ingredients: next });
    setActiveIngIdx(null);
    setIngQuery("");
  };

  // ── New unknown ingredient → category picker flow ──────────────────
  const handleAddUnknownIngredient = (idx: number, name: string) => {
    setActiveIngIdx(null);
    setIngQuery("");
    setPendingCustomIngName({ name, idx });
  };

  const handleCustomIngCategoryPicked = async (category: string) => {
    if (!pendingCustomIngName) return;
    const { name, idx } = pendingCustomIngName;
    setPendingCustomIngName(null);

    // 1. Persist to global_items via server
    try {
      await apiFetch("/global-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: householdId, name, category }),
      });
    } catch (err) {
      console.log("[RecipeEdit] upsertGlobalItem error:", err);
    }

    // 2. Update local globalItems so dot appears immediately everywhere
    setGlobalItems((prev) => {
      const existing = prev.findIndex((g) => g.name.toLowerCase() === name.toLowerCase());
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = { ...copy[existing], category, times_used: copy[existing].times_used + 1 };
        return copy;
      }
      return [...prev, { name, category, times_used: 0, created_by_household_id: householdId }];
    });

    // 3. Set the ingredient name in the recipe row
    selectIngredientSuggestion(idx, name);
  };

  // Close category picker on back gesture
  useBackHandler(!!pendingCustomIngName, () => setPendingCustomIngName(null));

  const addIngredient = () => {
    const newIngredients = [...recipe.ingredients, { name: "", quantity: "", unit: "" }];
    update({ ingredients: newIngredients });
    // Focus the new ingredient's name field after render
    setTimeout(() => {
      ingNameRefs.current[newIngredients.length - 1]?.focus();
    }, 50);
  };

  const removeIngredient = (idx: number) => {
    const next = recipe.ingredients.filter((_, i) => i !== idx);
    update({ ingredients: next.length === 0 ? [{ name: "", quantity: "", unit: "" }] : next });
  };

  // ── Step refs for auto-focus ──
  const stepRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const updateStep = (idx: number, desc: string) => {
    const next = [...recipe.steps];
    next[idx] = { ...next[idx], description: desc };
    update({ steps: next });
  };

  const addStep = () => {
    const newSteps = [...recipe.steps, { position: recipe.steps.length + 1, description: "" }];
    update({ steps: newSteps });
    setTimeout(() => {
      stepRefs.current[newSteps.length - 1]?.focus();
    }, 50);
  };

  const removeStep = (idx: number) => {
    const next = recipe.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 }));
    update({ steps: next.length === 0 ? [{ position: 1, description: "" }] : next });
  };

  const toggleCategory = (cat: string) => {
    const normCat = cat.charAt(0).toUpperCase() + cat.slice(1);
    if (recipe.categories.some((c) => c.toLowerCase() === normCat.toLowerCase())) {
      update({ categories: recipe.categories.filter((c) => c.toLowerCase() !== normCat.toLowerCase()) });
    } else {
      update({ categories: [...recipe.categories, normCat] });
    }
  };

  // ── Auto-grow textarea helper ──
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  // Auto-grow existing step textareas on mount
  useEffect(() => {
    stepRefs.current.forEach((el) => { if (el) autoGrow(el); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.steps.length]);

  // ── Image upload via file picker — opens crop screen first ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setShowImageSheet(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCropImageSrc(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Upload cropped blob to Supabase Storage ──
  const uploadCroppedBlob = async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const path = `${householdId}/${recipe.id}.jpg`;
    const { error } = await supabase.storage
      .from("recipe-images")
      .upload(path, uint8Array, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(path);
    return `${publicUrl}?t=${Date.now()}`;
  };

  // ── Crop confirm: crop → compress → upload ──
  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    const src = cropImageSrc;
    setCropImageSrc(null);
    setUploading(true);
    try {
      const blob = await getCroppedImg(src, croppedAreaPixels);
      const publicUrl = await uploadCroppedBlob(blob);
      update({ image_url: publicUrl });
      toast.success("Bild gespeichert ✅");
    } catch (err: any) {
      console.error("[RecipeEdit] Crop upload error:", err);
      toast.error(err?.message || "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
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

      <div className="flex-1 overflow-y-auto pb-6">
        {/* ── Image Area ── */}
        <div
          className="relative w-full flex-shrink-0 cursor-pointer"
          style={{ height: 220 }}
          onClick={() => !uploading && setShowImageSheet(true)}
        >
          {uploading ? (
            <div className="w-full h-full bg-surface-2 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-xs text-text-3">Wird hochgeladen…</span>
            </div>
          ) : recipe.image_url ? (
            <div className="relative w-full h-full">
              <ImageWithFallback src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); update({ image_url: null }); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <div className="w-full h-full bg-surface-2 flex flex-col items-center justify-center gap-2">
              <Camera className="w-8 h-8 text-text-3" />
              <span className="text-sm text-text-3">Foto hinzufügen</span>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="px-4">
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
              autoCapitalize="sentences"
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
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
            />
          </div>

          {/* Time + Servings row */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label className="text-xs text-text-3 mb-1 block px-[0px] pt-[12px] pb-[0px]">Vorbereit. (Min)</label>
              <input
                type="search"
                inputMode="numeric"
                name="recipe-prep-time"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={recipe.prep_time_minutes ?? ""}
                onChange={(e) => update({ prep_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-text-3 mb-1 block px-[0px] pt-[12px] pb-[0px]">Kochzeit (Min)</label>
              <input
                type="search"
                inputMode="numeric"
                name="recipe-cook-time"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={recipe.cook_time_minutes ?? ""}
                onChange={(e) => update({ cook_time_minutes: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 bg-surface-2 rounded-xl text-sm border-0 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-text-3 mb-1 block px-[0px] pt-[12px] pb-[0px]">Portionen</label>
              <input
                type="search"
                inputMode="numeric"
                name="recipe-servings"
                autoComplete="off"
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
          {(() => {
            // All "known" toggleable categories: built-in + user-persisted custom
            const builtInCats = RECIPE_CATEGORIES.filter(
              (c) => c !== "Alle" && c !== "Favoriten" && c !== "Schnell",
            );
            const allKnownCatsList = [...RECIPE_CATEGORIES, ...customRecipeCategories];
            const allKnownLower = allKnownCatsList.map((k) => k.toLowerCase());
            // "Extra" = in recipe.categories but NOT in any known list — case-insensitive
            const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
            const extraCategories = recipe.categories.filter(
              (c) => !allKnownLower.includes(c.toLowerCase()),
            );
            return (
              <div className="mt-4">
                <label className="text-xs text-text-3 mb-1 block px-[0px] pt-[12px] pb-[0px]">Kategorien</label>
                <div className="flex flex-wrap gap-2">
                  {/* ── Built-in + persisted custom: toggleable ── */}
                  {[...builtInCats, ...customRecipeCategories].map((cat) => {
                    const selected = recipe.categories.some(
                      (c) => c.toLowerCase() === cat.toLowerCase(),
                    );
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs transition ${selected ? "font-semibold" : "font-medium"}`}
                        style={
                          selected
                            ? { background: "var(--accent-light)", color: "var(--accent)", border: "1.5px solid var(--accent)" }
                            : { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--zu-border)" }
                        }
                      >
                        {cat}
                      </button>
                    );
                  })}
                  {/* ── Import extras: always selected, removable with × ── */}
                  {extraCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 pl-3 pr-2 py-1 rounded-full text-xs font-semibold"
                      style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1.5px solid var(--accent)" }}
                    >
                      {capitalise(cat)}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          update({ categories: recipe.categories.filter((c) => c !== cat) });
                        }}
                        className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-accent/20 transition"
                        aria-label={`${cat} entfernen`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Ingredients ── */}
          <div className="mt-4">
            <label className="text-xs text-text-3 mb-2 block px-[0px] pt-[12px] pb-[0px]">Zutaten</label>
            <div className="space-y-2">
              {recipe.ingredients.map((ing, i) => {
                const ingDotColor = getItemCategoryDot(ing.name, mergedItemsForDot);
                return (
                <div key={i} className="relative">
                  <div className="flex items-center gap-2">
                    {/* Category dot — always reserves space; colored when known */}
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: ingDotColor ?? "transparent" }}
                    />
                    {/* Name — no background, like shopping list */}
                    <input
                      ref={(el) => { ingNameRefs.current[i] = el; }}
                      type="search"
                      value={ing.name}
                      onChange={(e) => {
                        updateIngredient(i, "name", e.target.value);
                        setIngQuery(e.target.value);
                        setActiveIngIdx(i);
                      }}
                      onFocus={() => {
                        setActiveIngIdx(i);
                        setIngQuery(ing.name);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveIngIdx((prev) => (prev === i ? null : prev));
                          setIngQuery("");
                        }, 200);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setActiveIngIdx(null);
                          setIngQuery("");
                          if (i === recipe.ingredients.length - 1) {
                            addIngredient();
                          } else {
                            ingNameRefs.current[i + 1]?.focus();
                          }
                        }
                      }}
                      placeholder="Zutat"
                      name="ing-name"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="sentences"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="flex-1 min-w-0 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none text-text-1 placeholder:text-text-3"
                      style={{ caretColor: 'var(--accent)' }}
                    />
                    {/* Quantity — compact pill */}
                    <input
                      type="search"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                      placeholder="—"
                      name="ing-qty"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="sentences"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="w-14 px-2 py-1.5 bg-surface-2 rounded-lg text-sm text-center border-0 outline-none text-text-1 placeholder:text-text-3"
                      style={{ caretColor: 'var(--accent)' }}
                    />
                    {/* Unit — compact pill */}
                    <input
                      type="search"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                      placeholder="—"
                      name="ing-unit"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="sentences"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="w-14 px-2 py-1.5 bg-surface-2 rounded-lg text-sm text-center border-0 outline-none text-text-1 placeholder:text-text-3"
                      style={{ caretColor: 'var(--accent)' }}
                    />
                    {/* Remove */}
                    <button onClick={() => removeIngredient(i)} className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      <X className="w-4 h-4 text-text-3" />
                    </button>
                  </div>
                  {/* Autocomplete dropdown — opens upward */}
                  {(() => {
                    const trimmed = ingQuery.trim();
                    if (!trimmed || activeIngIdx !== i) return null;
                    const exactMatch = mergedItemsForDot.some(
                      (g) => g.name.toLowerCase() === trimmed.toLowerCase(),
                    );
                    const showAddBtn = !exactMatch;
                    if (ingredientSuggestions.length === 0 && !showAddBtn) return null;
                    return (
                      <div
                        className="absolute left-0 right-0 z-50 rounded-xl overflow-hidden"
                        style={{
                          bottom: "100%",
                          marginBottom: 4,
                          background: "var(--surface)",
                          border: "1px solid var(--zu-border)",
                          boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
                          maxHeight: 200,
                          overflowY: "auto",
                        }}
                      >
                        {ingredientSuggestions.map((s) => {
                          const catColor = getCategoryChipColor(s.category);
                          return (
                            <button
                              key={s.name}
                              onPointerDown={(e) => e.preventDefault()}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectIngredientSuggestion(i, s.name)}
                              className="w-full text-left px-3 py-2.5 hover:bg-surface-2 flex items-center gap-2 transition"
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: catColor.dot }}
                              />
                              <span className="text-sm text-text-1 flex-1 min-w-0">{s.name}</span>
                              <span className="text-[10px] text-text-3 ml-2 flex-shrink-0">{s.category}</span>
                            </button>
                          );
                        })}
                        {showAddBtn && (
                          <button
                            onPointerDown={(e) => e.preventDefault()}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleAddUnknownIngredient(i, trimmed)}
                            className="w-full text-left px-3 py-2.5 hover:bg-surface-2 transition"
                          >
                            <span className="text-sm text-accent font-medium">
                              + &bdquo;{trimmed}&ldquo; hinzufügen&hellip;
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ); })}
            </div>
            <button onClick={addIngredient} className="text-xs text-accent font-medium flex items-center gap-1 mt-2">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>

          {/* ── Steps ── */}
          <div className="mt-4">
            <label className="text-xs text-text-3 mb-2 block px-[0px] pt-[12px] pb-[0px]">Zubereitungsschritte</label>
            <div className="space-y-2">
              {recipe.steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-xs font-bold text-accent-dark">{i + 1}</span>
                  </div>
                  <textarea
                    ref={(el) => { stepRefs.current[i] = el; }}
                    value={step.description}
                    onChange={(e) => {
                      updateStep(i, e.target.value);
                      autoGrow(e.target);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        const ta = e.target as HTMLTextAreaElement;
                        // Only add new step if cursor is at end
                        if (ta.selectionStart === ta.value.length) {
                          e.preventDefault();
                          if (i === recipe.steps.length - 1) {
                            addStep();
                          } else {
                            stepRefs.current[i + 1]?.focus();
                          }
                        }
                      }
                    }}
                    onFocus={(e) => autoGrow(e.target)}
                    placeholder={`Schritt ${i + 1}...`}
                    name="recipe-step"
                    autoComplete="off"
                    autoCapitalize="sentences"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    className="flex-1 px-2 py-1.5 bg-surface-2 rounded-lg text-sm border-0 outline-none resize-none"
                    rows={1}
                    style={{ overflow: "hidden" }}
                  />
                  <button onClick={() => removeStep(i)} className="flex-shrink-0 mt-1">
                    <X className="w-4 h-4 text-text-3" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="text-xs text-accent font-medium flex items-center gap-1 mt-2">
              <Plus className="w-3 h-3" /> Hinzufügen
            </button>
          </div>

          {/* ── Kommentare ── */}
          <div className="mt-4">
            <label className="text-xs text-text-3 mb-2 block px-[0px] pt-[12px] pb-[0px]">Kommentare</label>
            <textarea
              value={recipe.comment || ""}
              onChange={(e) => update({ comment: e.target.value })}
              placeholder="Eigene Notizen, Tipps, Varianten..."
              name="recipe-comment-edit"
              autoComplete="off"
              autoCapitalize="sentences"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="w-full px-3 py-2.5 bg-surface-2 rounded-xl text-sm border-0 outline-none resize-none"
              rows={3}
              style={{ caretColor: "var(--color-accent)" }}
            />
          </div>
        </div>
      </div>

      {/* ── Image Source Bottom Sheet ── */}
      <AnimatePresence>
        {showImageSheet && (
          <motion.div
            className="fixed inset-0 z-[1000]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowImageSheet(false)} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-elevated)", bottom: editBottomOffset, maxHeight: editVpHeight - 72 }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <h3 className="text-base font-semibold mb-3">Bild hinzufügen</h3>
              <div className="flex flex-col gap-2">
                <button
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-accent-light transition text-left"
                  onClick={() => {
                    setShowImageSheet(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                    <Camera className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-1">Foto aufnehmen / aus Galerie</p>
                    <p className="text-xs text-text-3">Bild direkt hochladen</p>
                  </div>
                </button>
                <button
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-accent-light transition text-left"
                  onClick={() => {
                    setShowImageSheet(false);
                    setImageUrlDraft(recipe.image_url || "");
                    setShowUrlInput(true);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-1">URL eingeben</p>
                    <p className="text-xs text-text-3">Bild-URL direkt einfügen</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Crop Screen (full-page overlay, above all other drawers) ── */}
      <AnimatePresence>
        {cropImageSrc && (
          <motion.div
            className="fixed inset-0 z-[3000] flex flex-col"
            style={{ background: "#000", touchAction: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-center px-4 pt-[env(safe-area-inset-top)] flex-shrink-0"
              style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: 12 }}
            >
              <span className="text-white text-sm font-semibold">Bild zuschneiden</span>
            </div>

            {/* Cropper area */}
            <div className="relative flex-1">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={4 / 5}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_croppedArea, pixels) => setCroppedAreaPixels(pixels)}
                style={{
                  containerStyle: { background: "#000" },
                  mediaStyle: {},
                  cropAreaStyle: {},
                }}
              />
            </div>

            {/* Zoom hint */}
            <div className="flex justify-center pb-2 flex-shrink-0">
              <span className="text-white/50 text-xs">Zwei Finger zum Zoomen</span>
            </div>

            {/* Buttons */}
            <div
              className="flex gap-3 px-4 pb-[env(safe-area-inset-bottom)] flex-shrink-0"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)", paddingTop: 12 }}
            >
              <button
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
                onClick={() => setCropImageSrc(null)}
              >
                Abbrechen
              </button>
              <button
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "var(--color-accent)", color: "#fff" }}
                onClick={handleCropConfirm}
              >
                Übernehmen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── URL Input Bottom Sheet ── */}
      <AnimatePresence>
        {showUrlInput && (
          <motion.div
            className="fixed inset-0 z-[1000]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={DRAWER_SPRING}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowUrlInput(false); setImageUrlDraft(""); }} />
            <motion.div
              className="absolute left-0 right-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] p-5"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-elevated)", bottom: editBottomOffset, maxHeight: editVpHeight - 72 }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={DRAWER_SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
              </div>
              <h3 className="text-base font-semibold mb-3">Bild-URL eingeben</h3>
              <input
                type="search"
                name="recipe-image-url-input"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                inputMode="url"
                placeholder="https://..."
                value={imageUrlDraft}
                onChange={(e) => setImageUrlDraft(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-2 rounded-xl text-sm border-0 outline-none mb-3"
                autoFocus
              />
              <button
                disabled={!imageUrlDraft.trim()}
                onClick={() => {
                  const urlSrc = imageUrlDraft.trim();
                  if (!urlSrc) return;
                  setShowUrlInput(false);
                  setImageUrlDraft("");
                  setCropImageSrc(urlSrc);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                  setCroppedAreaPixels(null);
                }}
                className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40"
              >
                Weiter
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Category picker for new unknown ingredients ── */}
      <AnimatePresence>
        {pendingCustomIngName && (
          <IngCategoryPickerModal
            itemName={pendingCustomIngName.name}
            onSelect={handleCustomIngCategoryPicked}
            onClose={() => setPendingCustomIngName(null)}
          />
        )}
      </AnimatePresence>
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
  const { bottomOffset: ingBottomOffset, vpHeight: ingVpHeight } = useKeyboardOffset();

  return (
    <motion.div
      className="fixed inset-0 z-[999]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={DRAWER_SPRING}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onSkip} />
      <motion.div
        className="absolute left-0 right-0 bg-surface rounded-t-[20px] pb-[env(safe-area-inset-bottom)] flex flex-col"
        style={{ boxShadow: "var(--shadow-elevated)", bottom: ingBottomOffset, maxHeight: ingVpHeight - 72 }}
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
            <label key={`ingredient-${i}-${ing.name}`} className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={() => onToggle(i)}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm text-text-2">
                {ing.quantity ? <span key="qty" className="font-medium">{ing.quantity} </span> : null}
                {ing.unit ? <span key="unit">{ing.unit} </span> : null}
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
