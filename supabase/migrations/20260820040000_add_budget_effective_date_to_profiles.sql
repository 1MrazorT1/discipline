-- Add effective_date to profiles for calorie budget effective date (Issue #19).
-- Allows users to set a start date from which their daily goal kcal applies,
-- so historical entries aren't penalized by a goal set in the future.
alter table public.profiles
  add column if not exists effective_date date;

create index if not exists profiles_effective_date_idx on public.profiles(effective_date);
