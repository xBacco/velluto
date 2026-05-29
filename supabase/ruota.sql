-- Economia ruota — flag persistente "prossimo premio ×2".
-- Settato dallo spicchio 🪄 'doppio', consumato dal prossimo spin "vero" (non da 🔁 'ancora').

alter table couples
  add column if not exists ruota_flag_doppio boolean not null default false;
