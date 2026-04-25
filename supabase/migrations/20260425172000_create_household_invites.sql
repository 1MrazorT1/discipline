create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create index household_invites_household_id_idx on public.household_invites(household_id);
create index household_invites_code_idx on public.household_invites(code);
create index household_invites_expires_at_idx on public.household_invites(expires_at);

alter table public.household_invites enable row level security;

create policy "Household members can read household invites"
on public.household_invites
for select
to authenticated
using (public.is_household_member(household_id));

create policy "Household members can create household invites"
on public.household_invites
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_household_member(household_id)
);

create policy "Household members can delete household invites"
on public.household_invites
for delete
to authenticated
using (public.is_household_member(household_id));

grant select, insert, delete
on table public.household_invites
to authenticated;

grant select, insert, update, delete
on table public.household_invites
to service_role;
