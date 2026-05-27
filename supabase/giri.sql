-- Economia a giri (Fase 4a). Eseguire nel SQL Editor di Supabase.

-- 1. Ledger dei movimenti-giro. Rimpiazza la mai-usata ruota_giri.
drop table if exists ruota_giri cascade;

create table if not exists giri_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','gioco','giro','ancora')),
  esito     text,
  creato    timestamptz not null default now()
);
create index if not exists giri_mov_couple_idx on giri_movimenti (couple_id, user_id, creato desc);

alter table giri_movimenti enable row level security;
create policy giri_mov_all on giri_movimenti
  for all using (is_member(couple_id)) with check (is_member(couple_id));

-- 2. Contenuti editabili delle fette 🔥 (piccante) e 🎁 (buono a sorpresa).
create table if not exists ruota_contenuti (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id),
  categoria   text not null check (categoria in ('piccante','buono')),
  emoji       text,
  testo       text not null,
  descrizione text,
  ordine      int  not null default 0,
  creato      timestamptz not null default now()
);
create index if not exists ruota_cont_idx on ruota_contenuti (couple_id, categoria, ordine);

alter table ruota_contenuti enable row level security;
create policy ruota_cont_all on ruota_contenuti
  for all using (is_member(couple_id)) with check (is_member(couple_id));
