-- ============ NOSTRO SPAZIO — Fase 4a: Dadi (facce editabili) ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql.
-- Riusa is_member(uuid). Contenuti dei dadi modificabili dall'app e persistiti per coppia
-- (ribalta la spec Fase 4 §12 che li dava hardcoded). Il seeding delle 18 righe default
-- avviene lato app al primo caricamento (vedi js/lib/logic.facceDefaultRows).

-- Tre dadi: az=azione, co=corpo, lu=dove. Sei facce per dado (ordine 0..5).
create table if not exists dadi_facce (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  dado text not null check (dado in ('az','co','lu')),
  ordine int not null check (ordine between 0 and 5),
  emoji text not null,
  testo text not null,
  creato timestamptz not null default now()
);
create index if not exists dadi_facce_couple_idx on dadi_facce (couple_id);
-- una sola faccia per (coppia, dado, posizione)
create unique index if not exists dadi_facce_slot_idx on dadi_facce (couple_id, dado, ordine);

-- RLS: stesso pattern delle altre tabelle di coppia
alter table dadi_facce enable row level security;
create policy dadi_facce_all on dadi_facce for all using (is_member(couple_id)) with check (is_member(couple_id));
