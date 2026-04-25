grant usage on schema public to authenticated;

grant select, insert, update, delete
on table public.households,
         public.profiles,
         public.meals,
         public.meal_items
to authenticated;

grant execute on function public.profile_household_id(uuid) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_meal_household_member(uuid) to authenticated;
grant execute on function public.created_household(uuid) to authenticated;
