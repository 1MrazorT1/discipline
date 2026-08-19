-- Track meal analysis jobs so results can survive app backgrounding /
-- client disconnects. The Edge Function updates the status as it
-- progresses: pending → processing → completed | failed.
create type public.meal_analysis_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.meal_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  object_keys text[] not null,
  note text,
  status public.meal_analysis_status not null default 'pending',
  meal_id uuid references public.meals(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_analyses_user_id_idx on public.meal_analyses(user_id);
create index meal_analyses_status_idx on public.meal_analyses(status);

-- Auto-update updated_at on row changes
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger handle_updated_at
  before update on public.meal_analyses
  for each row execute function public.handle_updated_at();

-- Allow authenticated users to read their own analyses and create new ones.
-- Status updates are performed by the Edge Function using the service role key.
alter table public.meal_analyses enable row level security;

create policy "Users can read their own meal analyses"
on public.meal_analyses
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own meal analyses"
on public.meal_analyses
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Service role can update analyses"
on public.meal_analyses
for update
to authenticated
using (true)
with check (true);
