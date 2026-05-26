-- ============ NOSTRO SPAZIO — Storage policies (bucket privato 'foto') ============
-- Prerequisito: bucket 'foto' creato come PRIVATO (Storage → New bucket).
-- Path foto = '<couple_id>/<esperienza_id>/<filename>'. La 1a cartella è il couple_id.
-- Riusa is_member(uuid) definita in schema.sql. RLS su storage.objects è già attiva.

create policy "foto_sel" on storage.objects for select
  using ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );

create policy "foto_ins" on storage.objects for insert
  with check ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );

create policy "foto_upd" on storage.objects for update
  using ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );

create policy "foto_del" on storage.objects for delete
  using ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );
