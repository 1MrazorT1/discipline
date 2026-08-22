export type Confidence = "low" | "medium" | "high";

export type Profile = {
  id: string;
  name: string | null;
  daily_goal_kcal: number;
  color: string | null;
  avatar_url: string | null;
  household_id: string | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
};

export type Meal = {
  id: string;
  photo_url: string | null;
  total_kcal: number;
  confidence: Confidence;
  meal_name: string;
  eaten_at: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type MealItem = {
  id: string;
  meal_id: string;
  name: string;
  estimated_grams: number | null;
  estimated_kcal: number;
  kcal_per_100g: number | null;
  volume_ml: number | null;
  quantity: number | null;
  created_at: string;
  updated_at: string;
};

export type MealWithItems = Meal & {
  meal_items: MealItem[];
};

export type UserIngredient = {
  id: string;
  user_id: string;
  name: string;
  kcal_per_100g: number;
  photo_url: string | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
  updated_at: string;
};

export type DailyProfile = Pick<
  Profile,
  "id" | "name" | "daily_goal_kcal" | "color" | "avatar_url" | "effective_date"
>;

export type MealAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type MealAnalysis = {
  id: string;
  user_id: string;
  object_keys: string[];
  note: string | null;
  meal_weight_grams: number | null;
  status: MealAnalysisStatus;
  meal_id: string | null;
  error: string | null;
  log: string | null;
  created_at: string;
  updated_at: string;
};
