-- Add nutrition table and photo support to user_ingredients (Issue #24, #21)
alter table public.user_ingredients
  add column if not exists photo_url text,
  add column if not exists protein_g numeric(10, 2) not null default 0 check (protein_g >= 0),
  add column if not exists carbs_g numeric(10, 2) not null default 0 check (carbs_g >= 0),
  add column if not exists fat_g numeric(10, 2) not null default 0 check (fat_g >= 0);

-- Indexes for filtering and sorting
create index if not exists user_ingredients_protein_g_idx on public.user_ingredients(protein_g);
