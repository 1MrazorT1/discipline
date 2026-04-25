insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do update
set public = excluded.public;

create policy "Users can upload their own meal photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meal-photos'
  and name like auth.uid()::text || '/%'
);

create policy "Users can read their own meal photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meal-photos'
  and name like auth.uid()::text || '/%'
);

create policy "Users can delete their own meal photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meal-photos'
  and name like auth.uid()::text || '/%'
);
