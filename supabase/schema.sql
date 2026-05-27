-- ============ NOSTRO SPAZIO — schema ============
-- Eseguire nel SQL Editor di Supabase.

-- 1. COPPIE
create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  membro_a uuid not null references auth.users(id),
  membro_b uuid not null references auth.users(id),
  creato timestamptz not null default now()
);

-- helper: l'utente corrente è membro di questa coppia?
create or replace function is_member(c_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from couples
    where id = c_id and (membro_a = auth.uid() or membro_b = auth.uid())
  );
$$;

-- 2. PROFILI
create table if not exists profiles (
  id uuid primary key references auth.users(id),
  couple_id uuid not null references couples(id),
  display_name text not null,
  avatar text not null default '❤️',
  creato timestamptz not null default now()
);

-- 3. DESIDERI
create table if not exists desideri (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  testo text not null,
  categoria text,
  stato text not null default 'da_provare' check (stato in ('da_provare','realizzato')),
  data_realizzato date,
  creato timestamptz not null default now()
);

-- 4. TIPI di momento (editabili per coppia; vedi anche supabase/tipi.sql)
create table if not exists tipi (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  emoji text not null,
  label text not null,
  ordine int not null default 0,
  creato timestamptz not null default now()
);

-- ESPERIENZE (+foto in Fase 2; tipo_id + titolo facoltativo nel redesign Calendario)
create table if not exists esperienze (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  tipo_id uuid references tipi(id) on delete set null,
  titolo text,
  testo text,
  data date not null,
  voto int not null default 0 check (voto between 0 and 5),
  creato timestamptz not null default now()
);
create table if not exists esperienza_foto (
  id uuid primary key default gen_random_uuid(),
  esperienza_id uuid not null references esperienze(id) on delete cascade,
  couple_id uuid not null references couples(id),
  storage_path text not null,
  creato timestamptz not null default now()
);

-- 5. BUONI
create table if not exists buoni (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  da_id uuid not null references auth.users(id),
  a_id uuid not null references auth.users(id),
  emoji text not null default '🎟️',
  titolo text not null,
  descrizione text,
  tipo text not null check (tipo in ('regalo','richiesta')),
  stato text not null check (stato in ('in_attesa','attivo','rifiutato','riscattato')),
  bundle_id uuid,
  creato timestamptz not null default now(),
  riscattato_il timestamptz
);

-- 6. CARTE (Truth or Dare)
create table if not exists carte (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('verita','sfida')),
  testo text not null,
  intensita int not null default 1 check (intensita between 1 and 3),
  creato timestamptz not null default now()
);

-- 7. GIRI RUOTA
create table if not exists ruota_giri (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id uuid not null references auth.users(id),
  esito text not null,
  creato timestamptz not null default now()
);

-- 8. DADI (facce editabili per coppia — Fase 4a; vedi anche supabase/dadi.sql)
create table if not exists dadi_facce (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  dado text not null check (dado in ('az','co','lu')),
  ordine int not null check (ordine between 0 and 5),
  emoji text not null,
  testo text not null,
  creato timestamptz not null default now()
);
create unique index if not exists dadi_facce_slot_idx on dadi_facce (couple_id, dado, ordine);

-- ============ RLS ============
alter table couples        enable row level security;
alter table profiles       enable row level security;
alter table desideri       enable row level security;
alter table tipi           enable row level security;
alter table esperienze     enable row level security;
alter table esperienza_foto enable row level security;
alter table buoni          enable row level security;
alter table carte          enable row level security;
alter table ruota_giri     enable row level security;
alter table dadi_facce     enable row level security;

-- couples: leggibile dai membri
create policy couples_sel on couples for select using (membro_a = auth.uid() or membro_b = auth.uid());

-- profiles: membri della stessa coppia
create policy profiles_sel on profiles for select using (is_member(couple_id));
create policy profiles_ins on profiles for insert with check (id = auth.uid() and is_member(couple_id));
create policy profiles_upd on profiles for update using (id = auth.uid());

-- macro per tabelle "di coppia": una policy ALL basata su is_member
create policy desideri_all   on desideri        for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy tipi_all       on tipi            for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy esperienze_all on esperienze       for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy expfoto_all    on esperienza_foto  for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy buoni_all      on buoni            for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy carte_all      on carte            for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy ruota_all      on ruota_giri       for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy dadi_facce_all on dadi_facce        for all using (is_member(couple_id)) with check (is_member(couple_id));
