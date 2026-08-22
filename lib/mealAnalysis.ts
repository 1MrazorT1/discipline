/**
 * Parsing and validation logic for the NVIDIA meal-analysis AI response.
 *
 * This module is shared between the client and tested via Jest.
 * The Supabase Edge Function (`supabase/functions/analyze-meal`) uses
 * an identical inline copy because it runs on Deno and cannot import
 * from the app's `lib/` directory at deploy time.
 */

export type MealAnalysisConfidence = "low" | "medium" | "high";

export type MealAnalysisItem = {
  name: string;
  estimated_grams: number | null;
  estimated_kcal: number;
  kcal_per_100g: number | null;
  volume_ml: number | null;
  quantity: number | null;
};

export type MealAnalysis = {
  meal_name: string;
  items: MealAnalysisItem[];
  total_kcal: number;
  confidence: MealAnalysisConfidence;
};

/**
 * A pre-logged ingredient from the seeded reference table (Issue #13).
 * These are common ingredients with known nutrition values that users
 * can quickly select without creating a custom one.
 */
export type PreLoggedIngredient = {
  id: string;
  name: string;
  kcal_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  unit: "g" | "ml";
};

const CONFIDENCE_VALUES: MealAnalysisConfidence[] = ["low", "medium", "high"];

export const parseMealAnalysis = (content: string): MealAnalysis => {
  // Strip optional markdown code fences
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Could not parse meal analysis JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("NVIDIA response did not match the expected meal analysis schema.");
  }

  const obj = parsed as Record<string, unknown>;

  if (
    typeof obj.meal_name !== "string" ||
    !Array.isArray(obj.items) ||
    typeof obj.total_kcal !== "number" ||
    !CONFIDENCE_VALUES.includes(obj.confidence as MealAnalysisConfidence)
  ) {
    throw new Error("NVIDIA response did not match the expected meal analysis schema.");
  }

  const items = obj.items.map((item) => {
    if (
      typeof item?.name !== "string" ||
      typeof item?.estimated_kcal !== "number" ||
      (item.estimated_grams != null && typeof item.estimated_grams !== "number") ||
      (item.kcal_per_100g != null && typeof item.kcal_per_100g !== "number")
    ) {
      throw new Error("NVIDIA response contained an invalid meal item.");
    }

    return {
      name: item.name,
      estimated_grams: item.estimated_grams ?? computeEstimatedGrams(Math.round(item.estimated_kcal), item.kcal_per_100g ?? null),
      estimated_kcal: Math.round(item.estimated_kcal),
      kcal_per_100g: item.kcal_per_100g ?? null,
      volume_ml: item.volume_ml ?? null,
      quantity: item.quantity ?? null,
    };
  });

  return {
    meal_name: obj.meal_name,
    items,
    total_kcal: Math.round(obj.total_kcal),
    confidence: obj.confidence as MealAnalysisConfidence,
  };
};

/**
 * Compute kcal per 100g from estimated_kcal and estimated_grams.
 * Returns null when grams are unknown or zero.
 */
export const computeKcalPer100g = (
  kcal: number,
  grams: number | null,
): number | null => {
  if (grams === null || grams <= 0) return null;
  return Math.round((kcal / grams) * 100);
};

/**
 * Compute estimated_grams from estimated_kcal and kcal_per_100g.
 * Returns null when kcal_per_100g is unknown or zero.
 */
export const computeEstimatedGrams = (
  kcal: number,
  kcalPer100g: number | null,
): number | null => {
  if (kcalPer100g === null || kcalPer100g === undefined || kcalPer100g <= 0) return null;
  return Math.round((kcal * 100) / kcalPer100g);
};

/**
 * Return the kcal_per_100g value to display for a meal item.
 * Prefers the AI-provided value; falls back to computing from kcal/grams.
 */
export const getKcalPer100g = (
  itemKcalPer100g: number | null,
  kcal: number,
  grams: number | null,
): number | null => {
  if (itemKcalPer100g !== null && itemKcalPer100g !== undefined) return itemKcalPer100g;
  return computeKcalPer100g(kcal, grams);
};

/**
 * Return the estimated_grams value to display for a meal item.
 * Prefers the AI-provided value; falls back to computing from kcal/kcal_per_100g.
 */
export const getEstimatedGrams = (
  itemGrams: number | null,
  kcal: number,
  kcalPer100g: number | null,
): number | null => {
  if (itemGrams !== null && itemGrams !== undefined) return itemGrams;
  return computeEstimatedGrams(kcal, kcalPer100g);
};

/**
 * Fuzzy-match a pre-logged ingredient by name.
 * Returns the best match or null if no close match is found.
 * Used to enrich AI-analyzed meal items with known nutrition data.
 */
export const matchPreLoggedIngredient = (
  name: string,
  candidates: PreLoggedIngredient[],
): PreLoggedIngredient | null => {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  // Exact match (case-insensitive)
  const exact = candidates.find((c) => c.name.toLowerCase() === normalized);
  if (exact) return exact;

  // Partial match: ingredient name contains search term or vice versa
  const partial = candidates.find(
    (c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()),
  );
  if (partial) return partial;

  return null;
};

/**
 * Enrich a meal analysis item with nutrition data from a pre-logged ingredient.
 * If a match is found, fills in missing kcal_per_100g, protein, carbs, and fat.
 */
export const enrichWithPreLogged = (
  item: MealAnalysisItem,
  preLogged: PreLoggedIngredient | null,
): MealAnalysisItem & { protein_g: number | null; carbs_g: number | null; fat_g: number | null } => {
  if (!preLogged) {
    return {
      ...item,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
  }

  return {
    ...item,
    kcal_per_100g: item.kcal_per_100g ?? preLogged.kcal_per_100g,
    protein_g: preLogged.protein_g,
    carbs_g: preLogged.carbs_g,
    fat_g: preLogged.fat_g,
  };
};
