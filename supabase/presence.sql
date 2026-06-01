-- Presenza (heartbeat). Eseguire nel SQL Editor di Supabase.
-- last_seen aggiornato ogni ~30s mentre l'app è in foreground (vedi js/lib/presence.js).
-- Nullable: i profili esistenti partono senza presenza (offline finché non battono).
alter table profiles
  add column if not exists last_seen timestamptz;
