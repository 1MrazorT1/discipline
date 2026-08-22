-- Pre-logged ingredients (Issue #13): a common reference table of
-- ingredients with nutrition facts. Seeded with a broad list covering
-- proteins, grains, vegetables, fruits, dairy, oils, and pantry items.
create table public.pre_logged_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kcal_per_100g integer not null check (kcal_per_100g >= 0),
  protein_g numeric(10, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(10, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(10, 2) not null default 0 check (fat_g >= 0),
  unit text not null default 'g' check (unit in ('g', 'ml')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pre_logged_ingredients_name_idx
  on public.pre_logged_ingredients(lower(name));

-- RLS is not needed: this is a public reference table that everyone
-- reads through the service_role / authenticated select.
grant select on public.pre_logged_ingredients to authenticated;
grant select, insert, update, delete
  on public.pre_logged_ingredients to service_role;
