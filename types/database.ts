export type Confidence = "low" | "medium" | "high";

export type Profile = {
  id: string;
  name: string | null;
  daily_goal_kcal: number;
  color: string | null;
  avatar_url: string | null;
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
  created_at: string;
  updated_at: string;
};

export type DailyProfile = Pick<
  Profile,
  "id" | "name" | "daily_goal_kcal" | "color" | "avatar_url"
>;
