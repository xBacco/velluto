-- Strip Poker (Fase 4c). Eseguire nel SQL Editor di Supabase.
-- Persiste solo l'ESITO delle partite; lo stato di gioco vive in memoria.

create table if not exists strip_partite (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples(id),
  vincitore_id uuid not null references auth.users(id),
  perdente_id  uuid not null references auth.users(id),
  modalita     text not null check (modalita in ('draw','holdem')),
  creato       timestamptz not null default now()
);
create index if not exists strip_partite_idx on strip_partite (couple_id, creato desc);

alter table strip_partite enable row level security;
create policy strip_partite_all on strip_partite
  for all using (is_member(couple_id)) with check (is_member(couple_id));
