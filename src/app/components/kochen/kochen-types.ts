// ── Kochen Types ───────────────────────────────────────────────────

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeStep {
  position: number;
  description: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  image_url: string | null;
  categories: string[];
  source_url: string;
  rating: number;
  comment: string;
  is_favorite: boolean;
  household_id: string;
  created_at: string;
}

export interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  recipe_id: string | null;
  free_text: string | null;
  household_id: string;
}

export const HOUSEHOLD_ID = "dev-household";

export const RECIPE_CATEGORIES = [
  "Alle",
  "Asiatisch",
  "Mexikanisch",
  "Vegetarisch",
  "Vegan",
  "Baby & Kleinkind",
  "Backen",
  "Schnell",
  "Favoriten",
] as const;

export type CategoryFilter = (typeof RECIPE_CATEGORIES)[number];
