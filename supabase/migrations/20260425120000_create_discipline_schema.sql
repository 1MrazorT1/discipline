create extension if not exists pgcrypto;

create type public.meal_confidence as enum ('low', 'medium', 'high');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid() references auth.users(id) on delete cascade,
  name text,
  daily_goal_kcal integer not null default 2000 check (daily_goal_kcal > 0),
  color text,
  avatar_url text,
  household_id uuid references public.households(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  photo_url text,
  total_kcal integer not null check (total_kcal >= 0),
  confidence public.meal_confidence not null,
  meal_name text not null,
  eaten_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  name text not null,
  estimated_grams numeric(10, 2) check (estimated_grams is null or estimated_grams >= 0),
  estimated_kcal integer not null check (estimated_kcal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_household_id_idx on public.profiles(household_id);
create index households_created_by_idx on public.households(created_by);
create index meals_household_id_idx on public.meals(household_id);
create index meals_user_id_idx on public.meals(user_id);
create index meals_eaten_at_idx on public.meals(eaten_at desc);
create index meal_items_meal_id_idx on public.meal_items(meal_id);

create or replace function public.profile_household_id(profile_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id
  from public.profiles
  where id = profile_id
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and household_id = target_household_id
  )
$$;

create or replace function public.is_meal_household_member(target_meal_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.meals
    where id = target_meal_id
      and public.is_household_member(household_id)
  )
$$;

create or replace function public.created_household(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.households
    where id = target_household_id
      and created_by = auth.uid()
  )
$$;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

create policy "Household members can read households"
on public.households
for select
to authenticated
using (
  public.is_household_member(id)
  or created_by = auth.uid()
);

create policy "Users can create households"
on public.households
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Household members can update households"
on public.households
for update
to authenticated
using (
  public.is_household_member(id)
  or created_by = auth.uid()
)
with check (
  public.is_household_member(id)
  or created_by = auth.uid()
);

create policy "Household members can delete households"
on public.households
for delete
to authenticated
using (
  public.is_household_member(id)
  or created_by = auth.uid()
);

create policy "Household members can read profiles"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_household_member(household_id)
);

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and (
    household_id is null
    or public.is_household_member(household_id)
    or public.created_household(household_id)
  )
);

create policy "Users can update profiles in their household"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.is_household_member(household_id)
)
with check (
  household_id is null
  or public.is_household_member(household_id)
  or (
    id = auth.uid()
    and public.created_household(household_id)
  )
);

create policy "Users can delete their own profile"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

create policy "Household members can read meals"
on public.meals
for select
to authenticated
using (public.is_household_member(household_id));

create policy "Household members can create meals"
on public.meals
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_household_member(household_id)
  and public.profile_household_id(user_id) = household_id
);

create policy "Household members can update meals"
on public.meals
for update
to authenticated
using (public.is_household_member(household_id))
with check (
  public.is_household_member(household_id)
  and public.profile_household_id(user_id) = household_id
);

create policy "Household members can delete meals"
on public.meals
for delete
to authenticated
using (public.is_household_member(household_id));

create policy "Household members can read meal items"
on public.meal_items
for select
to authenticated
using (public.is_meal_household_member(meal_id));

create policy "Household members can create meal items"
on public.meal_items
for insert
to authenticated
with check (public.is_meal_household_member(meal_id));

create policy "Household members can update meal items"
on public.meal_items
for update
to authenticated
using (public.is_meal_household_member(meal_id))
with check (public.is_meal_household_member(meal_id));

create policy "Household members can delete meal items"
on public.meal_items
for delete
to authenticated
using (public.is_meal_household_member(meal_id));
