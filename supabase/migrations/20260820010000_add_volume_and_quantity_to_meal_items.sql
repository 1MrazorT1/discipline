-- Add volume (mL) and quantity fields to meal_items for better
-- estimation of liquid ingredients and multiple-item servings.
alter table public.meal_items
  add column if not exists volume_ml numeric(10, 2)
    check (volume_ml is null or volume_ml >= 0),
  add column if not exists quantity integer
    check (quantity is null or quantity >= 0);

-- Indexes for common queries
create index if not exists meal_items_volume_ml_idx on public.meal_items(volume_ml);
create index if not exists meal_items_quantity_idx on public.meal_items(quantity);
