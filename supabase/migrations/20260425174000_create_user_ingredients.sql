create table public.user_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kcal_per_100g integer not null check (kcal_per_100g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_ingredients_user_id_idx on public.user_ingredients(user_id);
create index user_ingredients_name_idx on public.user_ingredients(lower(name));

alter table public.user_ingredients enable row level security;

create policy "Users can read their own ingredients"
on public.user_ingredients
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own ingredients"
on public.user_ingredients
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own ingredients"
on public.user_ingredients
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own ingredients"
on public.user_ingredients
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete
on table public.user_ingredients
to authenticated;

grant select, insert, update, delete
on table public.user_ingredients
to service_role;
