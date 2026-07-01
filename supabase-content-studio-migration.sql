-- Content Studio: storage bucket for generated post images
insert into storage.buckets (id, name, public)
values ('content-images', 'content-images', true)
on conflict (id) do nothing;

create policy "Allow all read content-images" on storage.objects
  for select using (bucket_id = 'content-images');

create policy "Allow all insert content-images" on storage.objects
  for insert with check (bucket_id = 'content-images');

create policy "Allow all update content-images" on storage.objects
  for update using (bucket_id = 'content-images');

create policy "Allow all delete content-images" on storage.objects
  for delete using (bucket_id = 'content-images');
