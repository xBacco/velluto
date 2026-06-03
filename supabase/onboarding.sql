-- ============ ONBOARDING MULTI-COPPIA — migrazione ============
-- Eseguire nel SQL Editor di Supabase DOPO supabase/schema.sql.
-- Idempotente dove possibile (if not exists / create or replace).

-- 1. couples: il secondo membro arriva dopo il pairing.
alter table couples alter column membro_b drop not null;

-- 2. codici invito: un codice attivo per coppia, consumato all'uso.
create table if not exists codici_invito (
  codice     text primary key,            -- 6 caratteri, charset senza 0/O/1/I/L
  couple_id  uuid not null references couples(id) on delete cascade,
  creato     timestamptz not null default now(),
  scadenza   timestamptz,                 -- null = non scade; default app: +7 giorni
  usato_da   uuid references auth.users(id),
  usato_il   timestamptz
);

-- max 1 codice attivo (non ancora usato) per coppia
create unique index if not exists codici_invito_couple_attivo
  on codici_invito (couple_id) where usato_da is null;

alter table codici_invito enable row level security;

-- solo i membri della coppia leggono il proprio codice; scrittura SOLO via RPC.
drop policy if exists codici_sel on codici_invito;
create policy codici_sel on codici_invito for select using (is_member(couple_id));
