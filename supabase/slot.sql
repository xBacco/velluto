-- Economia slot (Fase 4b). Eseguire nel SQL Editor di Supabase.
-- Ledger simmetrico a giri_movimenti. Slot scollegata dalla ruota:
-- motivi possibili sono solo 'settimanale' (5 tiri/sett gratis) e 'tiro' (delta=-1).

create table if not exists slot_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','tiro')),
  creato    timestamptz not null default now()
);
create index if not exists slot_mov_couple_idx on slot_movimenti (couple_id, user_id, creato desc);

alter table slot_movimenti enable row level security;
create policy slot_mov_all on slot_movimenti
  for all using (is_member(couple_id)) with check (is_member(couple_id));

-- Scadenza buoni: usata da spicchi 🎟️ lampo (TTL 24h) e 📸 polaroid (TTL 24h).
-- Nullable per non rompere i buoni esistenti senza scadenza.
alter table buoni
  add column if not exists scadenza_iso timestamptz;
