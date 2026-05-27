-- ============ NOSTRO SPAZIO — Calendario redesign: tipi di momento ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql.
-- Riusa is_member(uuid). I "tipi" sono le categorie di momento (es. Scopata 🌶️,
-- Pompino 🫦) editabili dall'app e persistite per coppia. Il seeding dei default
-- avviene lato app al primo caricamento (vedi js/lib/logic.tipiDefaultRows).

-- 1. TIPI (emoji + nome, ordinabili)
create table if not exists tipi (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  emoji text not null,
  label text not null,
  ordine int not null default 0,
  creato timestamptz not null default now()
);
create index if not exists tipi_couple_idx on tipi (couple_id);

alter table tipi enable row level security;
create policy tipi_all on tipi for all using (is_member(couple_id)) with check (is_member(couple_id));

-- 2. ESPERIENZE: ora ogni riga può avere un tipo; il titolo diventa facoltativo.
--    - momento rapido  = tipo_id valorizzato, titolo NULL (creato dal tally "Segna al volo")
--    - evento ricco     = tipo_id valorizzato, titolo presente (voto/testo/foto opzionali)
-- on delete set null: se elimini un tipo, i suoi eventi restano (mostrati come generici).
alter table esperienze add column if not exists tipo_id uuid references tipi(id) on delete set null;
alter table esperienze alter column titolo drop not null;
