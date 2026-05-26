-- ============ NOSTRO SPAZIO — Fase 3: tabella 'foto' generica ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql e storage.sql.
-- Riusa is_member(uuid) e il bucket privato 'foto' già esistenti.
-- 'esperienza_foto' NON viene droppata qui: si elimina a mano dopo lo smoke (Task 12).

-- 1. Tabella foto polimorfica (contesto + ref_id puntano a tabelle diverse → nessuna FK su ref_id)
create table if not exists foto (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  contesto text not null check (contesto in ('esperienza','buono')),
  ref_id uuid not null,
  storage_path text not null,
  didascalia text,
  creato timestamptz not null default now()
);
create index if not exists foto_ref_idx on foto (contesto, ref_id);
create index if not exists foto_couple_idx on foto (couple_id);

-- 2. RLS: stesso pattern delle altre tabelle di coppia
alter table foto enable row level security;
create policy foto_all on foto for all using (is_member(couple_id)) with check (is_member(couple_id));

-- 3. Migrazione dati dalle foto delle esperienze (idempotente: salta quelle già migrate)
insert into foto (couple_id, autore_id, contesto, ref_id, storage_path, creato)
select ef.couple_id,
       e.autore_id,                       -- autore = autore dell'esperienza
       'esperienza', ef.esperienza_id, ef.storage_path, ef.creato
from esperienza_foto ef
join esperienze e on e.id = ef.esperienza_id
where not exists (
  select 1 from foto f
  where f.contesto = 'esperienza' and f.ref_id = ef.esperienza_id and f.storage_path = ef.storage_path
);

-- 4. Verifica conteggi (devono coincidere):
--    select count(*) from esperienza_foto;
--    select count(*) from foto where contesto='esperienza';
