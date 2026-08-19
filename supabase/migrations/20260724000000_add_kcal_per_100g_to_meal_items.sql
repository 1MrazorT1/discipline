-- Add kcal_per_100g column to meal_items table
alter table public.meal_items
add column kcal_per_100g integer;
-- Add check constraint for reasonable values
alter table public.meal_items
add constraint meal_items_kcal_per_100g_check 
check (kcal_per_100g is null or (kcal_per_100g >= 0 and kcal_per_100g <= 1000));
-- Add index for common queries
create index meal_items_kcal_per_100g_idx on public.meal_items(kcal_per_100g);
