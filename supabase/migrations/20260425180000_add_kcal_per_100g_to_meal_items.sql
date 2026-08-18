-- Add kcal_per_100g column to meal_items for storing AI-provided nutrition density
alter table public.meal_items
  add column kcal_per_100g numeric(10, 2) check (kcal_per_100g is null or kcal_per_100g >= 0);

-- Backfill existing rows: compute kcal_per_100g from estimated_kcal / estimated_grams where possible
update public.meal_items
set kcal_per_100g = round(estimated_kcal / (estimated_grams / 100.0), 2)
where estimated_grams is not null
  and estimated_grams > 0;
