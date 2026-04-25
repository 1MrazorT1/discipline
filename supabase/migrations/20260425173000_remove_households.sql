drop policy if exists "Household members can read meal items" on public.meal_items;
drop policy if exists "Household members can create meal items" on public.meal_items;
drop policy if exists "Household members can update meal items" on public.meal_items;
drop policy if exists "Household members can delete meal items" on public.meal_items;

drop policy if exists "Household members can read meals" on public.meals;
drop policy if exists "Household members can create meals" on public.meals;
drop policy if exists "Household members can update meals" on public.meals;
drop policy if exists "Household members can delete meals" on public.meals;

drop policy if exists "Household members can read profiles" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update profiles in their household" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;

drop policy if exists "Household members can read households" on public.households;
drop policy if exists "Users can create households" on public.households;
drop policy if exists "Household members can update households" on public.households;
drop policy if exists "Household members can delete households" on public.households;

drop table if exists public.household_invites cascade;

drop index if exists public.meals_household_id_idx;
drop index if exists public.profiles_household_id_idx;
drop index if exists public.households_created_by_idx;

drop function if exists public.is_meal_household_member(uuid);
drop function if exists public.is_household_member(uuid);
drop function if exists public.profile_household_id(uuid);
drop function if exists public.created_household(uuid);

alter table public.meals
  drop column if exists household_id;

alter table public.profiles
  drop column if exists household_id;

drop table if exists public.households cascade;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can delete their own profile"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

create policy "Users can read their own meals"
on public.meals
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own meals"
on public.meals
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own meals"
on public.meals
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own meals"
on public.meals
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read their own meal items"
on public.meal_items
for select
to authenticated
using (
  exists (
    select 1
    from public.meals
    where meals.id = meal_items.meal_id
      and meals.user_id = auth.uid()
  )
);

create policy "Users can create their own meal items"
on public.meal_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.meals
    where meals.id = meal_items.meal_id
      and meals.user_id = auth.uid()
  )
);

create policy "Users can update their own meal items"
on public.meal_items
for update
to authenticated
using (
  exists (
    select 1
    from public.meals
    where meals.id = meal_items.meal_id
      and meals.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.meals
    where meals.id = meal_items.meal_id
      and meals.user_id = auth.uid()
  )
);

create policy "Users can delete their own meal items"
on public.meal_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.meals
    where meals.id = meal_items.meal_id
      and meals.user_id = auth.uid()
  )
);

drop policy if exists "Users can upload their own meal photos" on storage.objects;
drop policy if exists "Users can read their own meal photos" on storage.objects;
drop policy if exists "Users can delete their own meal photos" on storage.objects;

create policy "Users can upload their own meal photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meal-photos'
  and name like 'meals/' || auth.uid()::text || '/%'
);

create policy "Users can read their own meal photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meal-photos'
  and name like 'meals/' || auth.uid()::text || '/%'
);

create policy "Users can delete their own meal photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meal-photos'
  and name like 'meals/' || auth.uid()::text || '/%'
);
