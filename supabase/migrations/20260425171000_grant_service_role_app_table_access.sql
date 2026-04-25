grant usage on schema public to service_role;

grant select, insert, update, delete
on table public.households,
         public.profiles,
         public.meals,
         public.meal_items
to service_role;

grant execute on function public.profile_household_id(uuid) to service_role;
grant execute on function public.is_household_member(uuid) to service_role;
grant execute on function public.is_meal_household_member(uuid) to service_role;
grant execute on function public.created_household(uuid) to service_role;
