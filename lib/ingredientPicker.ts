import type { UserIngredient } from "@/types/database";

let activeIngredientPicker: ((ingredient: UserIngredient) => void) | null = null;

export const setIngredientPicker = (handler: ((ingredient: UserIngredient) => void) | null) => {
  activeIngredientPicker = handler;
};

export const pickIngredient = (ingredient: UserIngredient) => {
  activeIngredientPicker?.(ingredient);
  activeIngredientPicker = null;
};

export const hasIngredientPicker = () => activeIngredientPicker !== null;
