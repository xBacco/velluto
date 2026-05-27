-- ============ NOSTRO SPAZIO — Mappa: tabella 'luoghi' ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql, storage.sql, foto.sql.
-- Riusa is_member(uuid), couples, esperienze e la tabella/bucket 'foto' (contesto 'luogo').

create table if not exists luoghi (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  nome text not null,
  citta text,
  lat float8 not null,
  lng float8 not null,
  intimo boolean not null default false,
  voto int not null default 0 check (voto between 0 and 5),
  descrizione text,
  data_evento date not null,
  esperienza_id uuid references esperienze(id) on delete set null,
  creato timestamptz not null default now()
);
create index if not exists luoghi_couple_idx on luoghi (couple_id);

alter table luoghi enable row level security;
create policy luoghi_all on luoghi for all using (is_member(couple_id)) with check (is_member(couple_id));

-- Estendi i contesti ammessi per le foto: aggiungi 'luogo' (il check inline si chiama foto_contesto_check)
alter table foto drop constraint if exists foto_contesto_check;
alter table foto add constraint foto_contesto_check check (contesto in ('esperienza', 'buono', 'luogo'));
