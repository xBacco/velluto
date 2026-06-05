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

-- 3. RPC di pairing (security definer, search_path blindato).
-- Tutte sollevano eccezioni con messaggi leggibili in italiano.

-- pgcrypto fornisce gen_random_bytes (CSPRNG). Il codice invito è un token di accesso,
-- quindi NON si usa random() (PRNG prevedibile).
create extension if not exists pgcrypto;

-- Genera 6 caratteri dall'alfabeto senza ambigui usando un CSPRNG, con rejection
-- sampling per evitare bias: 256 mod 31 = 8, quindi si scartano i byte >= 248 (= 8*31).
-- search_path include 'extensions': su Supabase pgcrypto vive lì, e il search_path
-- blindato a solo public la escluderebbe (gen_random_bytes does not exist a runtime).
create or replace function _genera_codice_invito()
returns text
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_alfabeto text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  -- 31 caratteri
  v_out text := '';
  v_byte int;
begin
  while length(v_out) < 6 loop
    v_byte := get_byte(gen_random_bytes(1), 0);  -- 0..255
    if v_byte < 248 then
      v_out := v_out || substr(v_alfabeto, (v_byte % 31) + 1, 1);
    end if;
  end loop;
  return v_out;
end;
$$;

-- funzione interna: nessun bisogno che PUBLIC la chiami direttamente.
revoke execute on function _genera_codice_invito() from public;

-- crea_coppia: l'utente crea la propria coppia (resta solo finché il partner non si unisce)
-- e ottiene un codice invito. Ritorna il codice.
create or replace function crea_coppia(p_nome text, p_avatar text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_codice text;
  v_tentativi int := 0;
begin
  if v_uid is null then
    raise exception 'Non autenticato';
  end if;
  -- Serializza per-utente: chiude la race tra due crea_coppia/unisci_coppia concorrenti
  -- dello stesso utente (eviterebbe il check "già in una coppia" e lascerebbe couples orfane).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  if exists (select 1 from couples where membro_a = v_uid or membro_b = v_uid)
     or exists (select 1 from profiles where id = v_uid) then
    raise exception 'Sei già in una coppia';
  end if;

  insert into couples (membro_a) values (v_uid) returning id into v_couple;
  insert into profiles (id, couple_id, display_name, avatar)
    values (v_uid, v_couple, p_nome, coalesce(nullif(p_avatar, ''), '❤️'));

  -- codice univoco con retry su collisione (alfabeto senza 0/O/1/I/L)
  loop
    v_tentativi := v_tentativi + 1;
    v_codice := _genera_codice_invito();
    begin
      insert into codici_invito (codice, couple_id, scadenza)
        values (v_codice, v_couple, now() + interval '7 days');
      exit;
    exception when unique_violation then
      if v_tentativi >= 10 then raise exception 'Impossibile generare un codice, riprova'; end if;
    end;
  end loop;

  return v_codice;
end;
$$;

-- unisci_coppia: il partner usa un codice per unirsi. Ritorna il couple_id.
create or replace function unisci_coppia(p_codice text, p_nome text, p_avatar text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_membro_a uuid;
  v_membro_b uuid;
  v_usato uuid;
  v_scad timestamptz;
  v_rows int;
begin
  if v_uid is null then
    raise exception 'Non autenticato';
  end if;
  -- stessa serializzazione per-utente di crea_coppia (vedi commento là).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  if exists (select 1 from couples where membro_a = v_uid or membro_b = v_uid)
     or exists (select 1 from profiles where id = v_uid) then
    raise exception 'Sei già in una coppia';
  end if;

  select couple_id, usato_da, scadenza into v_couple, v_usato, v_scad
    from codici_invito where codice = upper(p_codice);
  if v_couple is null or v_usato is not null
     or (v_scad is not null and v_scad <= now()) then
    raise exception 'Codice non valido o scaduto';
  end if;

  select membro_a, membro_b into v_membro_a, v_membro_b
    from couples where id = v_couple for update;
  if v_membro_a = v_uid then
    raise exception 'Non puoi unirti alla tua stessa coppia';
  end if;
  if v_membro_b is not null then
    raise exception 'Questa coppia è già completa';
  end if;

  -- Consuma il codice in modo ATOMICO: la condizione usato_da is null fa da gate
  -- contro due join concorrenti con lo stesso codice (chiude la finestra TOCTOU tra
  -- il check iniziale e il lock). Se 0 righe → un altro l'ha già usato.
  update codici_invito set usato_da = v_uid, usato_il = now()
    where codice = upper(p_codice) and usato_da is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Codice non valido o scaduto';
  end if;

  update couples set membro_b = v_uid where id = v_couple;
  insert into profiles (id, couple_id, display_name, avatar)
    values (v_uid, v_couple, p_nome, coalesce(nullif(p_avatar, ''), '❤️'));

  return v_couple;
end;
$$;

-- rigenera_codice: il creatore in attesa sostituisce il codice attivo. Ritorna il nuovo codice.
create or replace function rigenera_codice()
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_membro_b uuid;
  v_codice text;
  v_tentativi int := 0;
begin
  if v_uid is null then
    raise exception 'Non autenticato';
  end if;
  select id, membro_b into v_couple, v_membro_b
    from couples where membro_a = v_uid or membro_b = v_uid for update;
  if v_couple is null then
    raise exception 'Non sei in una coppia';
  end if;
  if v_membro_b is not null then
    raise exception 'La coppia è già completa';
  end if;

  -- elimina solo il codice attivo (usato_da is null) → il vincolo unico parziale resta valido;
  -- i codici storici già usati non vengono toccati.
  delete from codici_invito where couple_id = v_couple and usato_da is null;

  loop
    v_tentativi := v_tentativi + 1;
    v_codice := _genera_codice_invito();
    begin
      insert into codici_invito (codice, couple_id, scadenza)
        values (v_codice, v_couple, now() + interval '7 days');
      exit;
    exception when unique_violation then
      if v_tentativi >= 10 then raise exception 'Impossibile generare un codice, riprova'; end if;
    end;
  end loop;

  return v_codice;
end;
$$;

-- 4. Hardening profiles: couple_id immutabile dal client.
-- with check su profiles_upd impedisce di spostarsi in un'altra coppia;
-- i grant per-colonna impediscono di scrivere couple_id del tutto.
drop policy if exists profiles_upd on profiles;
create policy profiles_upd on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_member(couple_id));

-- last_seen è introdotta da presence.sql; la creiamo qui se assente per rendere
-- questa migrazione autosufficiente (il grant per-colonna sotto la richiede).
alter table profiles add column if not exists last_seen timestamptz;

revoke update on profiles from authenticated;
grant update (display_name, avatar, last_seen) on profiles to authenticated;

-- 5. Chiusura INSERT diretto su profiles: i profili nascono SOLO dentro le RPC
-- security definer (crea_coppia/unisci_coppia), che bypassano grant e RLS.
-- Nessun flusso client fa insert diretto (verificato: zero .from('profiles').insert in js/).
-- Doppia cintura: via la policy E via il grant.
drop policy if exists profiles_ins on profiles;
revoke insert on profiles from authenticated;
