-- Add optional meal_weight_grams to meal_analyses so users can provide
-- the total weight of the meal (in grams) as additional context for the
-- VLM during meal analysis. (Feature: meal weight for VLM context)
alter table public.meal_analyses
  add column if not exists meal_weight_grams numeric(10, 2)
    check (meal_weight_grams is null or meal_weight_grams >= 0);
