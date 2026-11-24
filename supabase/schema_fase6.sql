insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "adjuntos leer" on storage.objects;
drop policy if exists "adjuntos subir" on storage.objects;
drop policy if exists "adjuntos cambiar" on storage.objects;
drop policy if exists "adjuntos borrar" on storage.objects;

create policy "adjuntos leer" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "adjuntos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "adjuntos cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "adjuntos borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);
