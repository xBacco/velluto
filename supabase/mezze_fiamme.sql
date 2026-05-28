-- 2026-05-28: Voti con step 0.5 (mezze fiamme / mezzi cuori).
-- Cambia il tipo della colonna `voto` da int a numeric(2,1) su `esperienza`
-- e `luoghi`, e ricrea il CHECK constraint includendo lo step di 0.5.
--
-- Eseguire da dashboard Supabase → SQL Editor.
-- Sicuro su righe esistenti: ogni int N viene preservato come N.0.

-- --- ESPERIENZE -----------------------------------------------------------
alter table esperienza
  alter column voto type numeric(2,1) using voto::numeric;

alter table esperienza
  drop constraint if exists esperienza_voto_check;

alter table esperienza
  add constraint esperienza_voto_check
  check (voto >= 0 and voto <= 5 and (voto * 2) = floor(voto * 2));

-- --- LUOGHI ---------------------------------------------------------------
alter table luoghi
  alter column voto type numeric(2,1) using voto::numeric;

alter table luoghi
  drop constraint if exists luoghi_voto_check;

alter table luoghi
  add constraint luoghi_voto_check
  check (voto >= 0 and voto <= 5 and (voto * 2) = floor(voto * 2));

-- Sanity check (opzionale, mostrare in console dopo l'esecuzione):
--   select 'esperienza' as t, min(voto), max(voto), count(*) from esperienza
--   union all
--   select 'luoghi', min(voto), max(voto), count(*) from luoghi;
