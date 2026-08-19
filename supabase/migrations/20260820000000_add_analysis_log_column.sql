-- Add a `log` column to meal_analyses so the Edge Function can store
-- progress messages that the client can display to the user.
alter table public.meal_analyses
  add column if not exists log text;

-- Helper function to append a log line (called from the Edge Function)
create or replace function public.append_analysis_log(
  p_analysis_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.meal_analyses
  set log = coalesce(log, '') || p_message || E'\n',
      updated_at = now()
  where id = p_analysis_id and user_id = auth.uid();
end;
$$;

-- Add an index on status + updated_at for efficient pending/failed lookups
create index if not exists meal_analyses_status_updated_idx
  on public.meal_analyses(status, updated_at desc);
