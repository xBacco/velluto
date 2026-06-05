-- brace · home "La Posta" — ultimo "visto" del feed (spec 2026-06-03-home-fusione-posta)
-- profiles.home_visto_at: il flag "nuovo" delle card del feed si calcola confrontando
-- creato > home_visto_at (vedi feedEventi in js/lib/logic.js). null = primo accesso.
-- Idempotente, rieseguibile. NB: se si riesegue onboarding.sql DOPO questa migrazione
-- il grant resta corretto: il suo elenco per-colonna include già home_visto_at.

alter table profiles add column if not exists home_visto_at timestamptz;

-- Scrivibile solo dal proprietario del profilo: la policy profiles_upd (onboarding.sql)
-- già limita a id = auth.uid(). Il grant per-colonna è additivo rispetto a
-- display_name, avatar, last_seen concessi da onboarding.sql.
grant update (home_visto_at) on profiles to authenticated;
