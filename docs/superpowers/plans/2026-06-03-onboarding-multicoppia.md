# Onboarding multi-coppia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere a coppie sconosciute di registrarsi e creare/unirsi a una coppia in autonomia tramite codice invito, mantenendo invariato l'isolamento RLS dei dati.

**Architecture:** Lo schema `couples` resta non scrivibile dal client. Creazione coppia e join passano da funzioni Postgres `security definer` (`crea_coppia`, `unisci_coppia`, `rigenera_codice`) che applicano gli invarianti in transazione. Il client espone wrapper sottili in `js/store.js` che chiamano `client.rpc(...)`, più un modulo UI di onboarding e il routing al boot in `js/app.js`. La logica pura (generazione/validità codice) vive in `js/lib/logic.js` ed è testata con `node:test`.

**Tech Stack:** Vanilla JS (ES modules, no framework), Supabase (Postgres + Auth + RLS), `node:test` per la logica pura e i wrapper store con `fakeClient`.

---

## Note operative (non bloccano l'implementazione)

- **Codice invito:** 7 giorni di scadenza (rigenerabile), 6 caratteri, alfabeto senza simboli ambigui `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (esclusi `0 O 1 I L`). Confermato dall'utente 2026-06-03.
- **Verifica DB consigliata prima del deploy SQL** (Track A, dashboard Supabase): (A1) `select tablename, rowsecurity from pg_tables where schemaname='public';` per confermare RLS attiva; (A3) `select polname, cmd, qual, with_check from pg_policies where tablename='couples';` per confermare che esiste solo `couples_sel`. Lo schema committato (`supabase/schema.sql`) è la fonte di verità per questo piano; le query servono a confermare che il DB live combaci.
- **RPC e RLS NON sono coperte dai test unitari** (i mock non eseguono Postgres). Vanno verificate con la suite d'integrazione a due account reali (Track F) + smoke a due dispositivi. Questo è dichiarato esplicitamente per non dare falsa copertura.
- **Conferma email:** assunta ON nel progetto Supabase. Con conferma ON, `signUp` non apre una sessione finché l'utente non clicca il link. SMTP custom è fuori scope (Track operativo).
- **Sicurezza codice invito:** il codice è un token d'accesso (permette di unirsi a una coppia e vederne i dati privati). Generazione con CSPRNG sia lato client (`rndSicuro` via Web Crypto, Task 1) sia lato server (`_genera_codice_invito` via `pgcrypto`, Task 3); produzione vera = server. La resistenza al brute-force online di un codice a 6 caratteri (≈887M combinazioni, monouso, scadenza 7gg) si appoggia al **rate-limiting sulla RPC `unisci_coppia`** — controllo complementare da implementare in **Track B (hardening)**, fuori da questo piano. Segnalato da review di sicurezza automatica il 2026-06-03.

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `js/lib/logic.js` | Aggiunge `ALFABETO_CODICE`, `generaCodiceInvito()`, `codiceScaduto()` (puri) | Modify |
| `test/onboarding.test.js` | Test della logica pura + wrapper store onboarding | Create |
| `supabase/onboarding.sql` | Migrazione: `membro_b` nullable, tabella `codici_invito` + RLS, RPC `security definer`, hardening `profiles` | Create |
| `js/store.js` | Wrapper `createCouple`/`joinCouple`/`regenInvite`/`getInvitoAttivo` su `client.rpc` | Modify |
| `js/auth.js` | `signUp`, `resetPasswordForEmail`, fix `currentProfile()` (ritorna `null` se profilo assente) | Modify |
| `js/modules/onboarding.js` | UI onboarding: scelta crea/unisci, raccolta nome+avatar, reveal codice | Create |
| `index.html` | Link "Registrati"/"Password dimenticata?" nel login + contenitore onboarding | Modify |
| `js/app.js` | Routing al boot: sessione senza profilo → onboarding; handler registrazione/reset | Modify |

---

## Task 1: Logica pura — generazione e scadenza codice

**Files:**
- Modify: `js/lib/logic.js` (aggiungere in coda, sezione nuova)
- Test: `test/onboarding.test.js`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `test/onboarding.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALFABETO_CODICE, generaCodiceInvito, codiceScaduto } from '../js/lib/logic.js';

test('ALFABETO_CODICE esclude i simboli ambigui 0 O 1 I L', () => {
  for (const ch of '0O1IL') assert.equal(ALFABETO_CODICE.includes(ch), false, `contiene ${ch}`);
  assert.equal(ALFABETO_CODICE.length, 31);
});

test('generaCodiceInvito produce 6 caratteri dal solo alfabeto', () => {
  const cod = generaCodiceInvito();
  assert.equal(cod.length, 6);
  for (const ch of cod) assert.ok(ALFABETO_CODICE.includes(ch), `char fuori alfabeto: ${ch}`);
});

test('generaCodiceInvito usa rnd iniettabile in modo deterministico', () => {
  // rnd costante = 0 → sempre il primo carattere dell'alfabeto
  const cod = generaCodiceInvito(() => 0);
  assert.equal(cod, ALFABETO_CODICE[0].repeat(6));
});

test('generaCodiceInvito accetta lunghezza custom', () => {
  assert.equal(generaCodiceInvito(Math.random, 8).length, 8);
});

test('codiceScaduto: scadenza null non scade mai', () => {
  assert.equal(codiceScaduto(null, new Date('2030-01-01T00:00:00Z')), false);
});

test('codiceScaduto: scadenza futura non è scaduta', () => {
  assert.equal(codiceScaduto('2026-06-10T00:00:00Z', new Date('2026-06-03T00:00:00Z')), false);
});

test('codiceScaduto: scadenza passata è scaduta', () => {
  assert.equal(codiceScaduto('2026-06-01T00:00:00Z', new Date('2026-06-03T00:00:00Z')), true);
});

test('codiceScaduto: accetta now come stringa ISO', () => {
  assert.equal(codiceScaduto('2026-06-01T00:00:00Z', '2026-06-03T00:00:00Z'), true);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `node --test test/onboarding.test.js`
Expected: FAIL — `ALFABETO_CODICE`/`generaCodiceInvito`/`codiceScaduto` non esportati (`SyntaxError` o `undefined is not a function`).

- [ ] **Step 3: Implementa il minimo per far passare**

Aggiungi in coda a `js/lib/logic.js`:

```js
// ---- ONBOARDING / CODICE INVITO (puro) ----
// Alfabeto senza simboli ambigui (esclusi 0 O 1 I L) per codici dettabili a voce.
export const ALFABETO_CODICE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// Genera un codice invito di `len` caratteri dall'ALFABETO_CODICE. `rnd` (∈[0,1)) iniettabile.
// L'unicità è garantita a valle (retry nella RPC); qui è solo formato.
export function generaCodiceInvito(rnd = Math.random, len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALFABETO_CODICE[Math.floor(rnd() * ALFABETO_CODICE.length)];
  return out;
}

// True se il codice è scaduto. `scadenza` ISO string o null (null = non scade mai).
// `now` Date o ISO string iniettabile.
export function codiceScaduto(scadenza, now = new Date()) {
  if (!scadenza) return false;
  const oraMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return new Date(scadenza).getTime() <= oraMs;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `node --test test/onboarding.test.js`
Expected: PASS (8 test della logica pura).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/onboarding.test.js
git commit -m "feat(onboarding): logica pura codice invito (genera + scadenza)"
```

---

## Task 2: Migrazione SQL — schema codici invito

**Files:**
- Create: `supabase/onboarding.sql`

> SQL non ha test unitari Node. La verifica è l'esecuzione nel SQL Editor di Supabase + query di controllo. Non applicare al DB live finché il piano non è completo e rivisto; il file va comunque committato come fonte di verità della migrazione.

- [ ] **Step 1: Crea il file con la sezione schema**

Crea `supabase/onboarding.sql` con esattamente questo contenuto (le sezioni RPC e hardening arrivano nei Task 3 e 4, nello stesso file):

```sql
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
```

- [ ] **Step 2: Verifica statica del file**

Run: `node -e "const s=require('fs').readFileSync('supabase/onboarding.sql','utf8'); if(!/drop not null/.test(s)||!/create table if not exists codici_invito/.test(s)) throw new Error('schema mancante'); console.log('ok schema section')"`
Expected: stampa `ok schema section`.

- [ ] **Step 3: Commit**

```bash
git add supabase/onboarding.sql
git commit -m "feat(onboarding): migrazione schema codici_invito + membro_b nullable"
```

---

## Task 3: Migrazione SQL — funzioni RPC security definer

**Files:**
- Modify: `supabase/onboarding.sql` (append)

- [ ] **Step 1: Aggiungi le tre RPC in coda al file**

Append a `supabase/onboarding.sql`:

```sql
-- 3. RPC di pairing (security definer, search_path blindato).
-- Tutte sollevano eccezioni con messaggi leggibili in italiano.

-- pgcrypto fornisce gen_random_bytes (CSPRNG). Il codice invito è un token di accesso,
-- quindi NON si usa random() (PRNG prevedibile).
create extension if not exists pgcrypto;

-- Genera 6 caratteri dall'alfabeto senza ambigui usando un CSPRNG, con rejection
-- sampling per evitare bias: 256 mod 31 = 8, quindi si scartano i byte >= 248 (= 8*31).
create or replace function _genera_codice_invito()
returns text
language plpgsql
set search_path = public, pg_temp
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
    from couples where membro_a = v_uid or membro_b = v_uid;
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
```

- [ ] **Step 2: Verifica statica del file**

Run: `node -e "const s=require('fs').readFileSync('supabase/onboarding.sql','utf8'); for(const f of ['crea_coppia','unisci_coppia','rigenera_codice']){ if(!new RegExp('function '+f).test(s)) throw new Error('manca '+f); } if((s.match(/set search_path = public, pg_temp/g)||[]).length<3) throw new Error('search_path mancante in qualche RPC'); console.log('ok rpc section')"`
Expected: stampa `ok rpc section`.

- [ ] **Step 3: Commit**

```bash
git add supabase/onboarding.sql
git commit -m "feat(onboarding): RPC crea_coppia/unisci_coppia/rigenera_codice (security definer)"
```

---

## Task 4: Migrazione SQL — hardening profiles (couple_id immutabile)

**Files:**
- Modify: `supabase/onboarding.sql` (append)

> Chiude il punto 🟡 dell'audit (`supabase/schema.sql:155`): oggi `profiles_upd` permette `update using (id = auth.uid())` senza `with check`, quindi un utente potrebbe cambiare il proprio `couple_id` e leggere i dati di un'altra coppia. Si blindano la policy e i grant a livello di colonna.

- [ ] **Step 1: Aggiungi la sezione hardening in coda al file**

Append a `supabase/onboarding.sql`:

```sql
-- 4. Hardening profiles: couple_id immutabile dal client.
-- with check su profiles_upd impedisce di spostarsi in un'altra coppia;
-- i grant per-colonna impediscono di scrivere couple_id del tutto.
drop policy if exists profiles_upd on profiles;
create policy profiles_upd on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_member(couple_id));

revoke update on profiles from authenticated;
grant update (display_name, avatar, last_seen) on profiles to authenticated;
```

> Nota: `last_seen` è una colonna usata da `js/lib/presence.js`/`updateLastSeen` (`js/store.js:316`). Se in fase di applicazione il SQL Editor segnala che `last_seen` non esiste, applicare prima la migrazione che la introduce, oppure rimuovere `last_seen` dalla lista del grant. Verifica con: `select column_name from information_schema.columns where table_name='profiles';`

- [ ] **Step 2: Verifica statica del file**

Run: `node -e "const s=require('fs').readFileSync('supabase/onboarding.sql','utf8'); if(!/grant update \(display_name, avatar, last_seen\) on profiles/.test(s)) throw new Error('grant mancante'); if(!/with check \(id = auth.uid\(\) and is_member\(couple_id\)\)/.test(s)) throw new Error('with check mancante'); console.log('ok hardening section')"`
Expected: stampa `ok hardening section`.

- [ ] **Step 3: Commit**

```bash
git add supabase/onboarding.sql
git commit -m "feat(onboarding): blinda profiles_upd (couple_id immutabile, grant per-colonna)"
```

---

## Task 5: Wrapper store — RPC pairing

**Files:**
- Modify: `js/store.js` (aggiungere sezione ONBOARDING)
- Test: `test/onboarding.test.js` (append)

- [ ] **Step 1: Aggiungi i test che falliscono**

Append a `test/onboarding.test.js`:

```js
import { createCouple, joinCouple, regenInvite, getInvitoAttivo } from '../js/store.js';

// fake client con supporto a .rpc(name, params) e select su codici_invito
function fakeRpcClient(rpcImpl = {}, rows = []) {
  const calls = [];
  return {
    _calls: calls,
    rpc(name, params) {
      calls.push({ name, params });
      const impl = rpcImpl[name];
      if (impl) return Promise.resolve(impl(params));
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      const state = { table, filters: {} };
      const api = {
        select() { return api; },
        eq(c, v) { state.filters[c] = v; return api; },
        is(c, v) { state.filters[c] = v; return api; },
        maybeSingle() {
          calls.push({ table, filters: state.filters });
          const found = rows.find(r =>
            Object.entries(state.filters).every(([k, v]) => (v === null ? r[k] == null : r[k] === v)));
          return Promise.resolve({ data: found || null, error: null });
        },
      };
      return api;
    },
  };
}

test('createCouple chiama crea_coppia coi parametri giusti e ritorna il codice', async () => {
  const c = fakeRpcClient({ crea_coppia: () => ({ data: 'ABC234', error: null }) });
  const cod = await createCouple(c, { nome: 'Lei', avatar: '🌹' });
  assert.equal(cod, 'ABC234');
  assert.deepEqual(c._calls[0], { name: 'crea_coppia', params: { p_nome: 'Lei', p_avatar: '🌹' } });
});

test('joinCouple chiama unisci_coppia e ritorna il couple_id', async () => {
  const c = fakeRpcClient({ unisci_coppia: () => ({ data: 'cpl-1', error: null }) });
  const id = await joinCouple(c, { codice: 'abc234', nome: 'Lui', avatar: '🔥' });
  assert.equal(id, 'cpl-1');
  assert.deepEqual(c._calls[0], { name: 'unisci_coppia', params: { p_codice: 'abc234', p_nome: 'Lui', p_avatar: '🔥' } });
});

test('regenInvite chiama rigenera_codice e ritorna il nuovo codice', async () => {
  const c = fakeRpcClient({ rigenera_codice: () => ({ data: 'XYZ789', error: null }) });
  const cod = await regenInvite(c);
  assert.equal(cod, 'XYZ789');
  assert.deepEqual(c._calls[0], { name: 'rigenera_codice', params: {} });
});

test('createCouple propaga l\'errore RPC come eccezione', async () => {
  const c = fakeRpcClient({ crea_coppia: () => ({ data: null, error: { message: 'Sei già in una coppia' } }) });
  await assert.rejects(() => createCouple(c, { nome: 'X', avatar: '❤️' }), /Sei già in una coppia/);
});

test('getInvitoAttivo legge il codice non ancora usato della coppia', async () => {
  const c = fakeRpcClient({}, [
    { codice: 'ABC234', couple_id: 'cpl-1', usato_da: null },
    { codice: 'OLD999', couple_id: 'cpl-1', usato_da: 'u-vecchio' },
  ]);
  const row = await getInvitoAttivo(c, 'cpl-1');
  assert.equal(row.codice, 'ABC234');
});

test('getInvitoAttivo ritorna null se non c\'è codice attivo', async () => {
  const c = fakeRpcClient({}, []);
  const row = await getInvitoAttivo(c, 'cpl-1');
  assert.equal(row, null);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/onboarding.test.js`
Expected: FAIL — `createCouple`/`joinCouple`/`regenInvite`/`getInvitoAttivo` non esportati da `js/store.js`.

- [ ] **Step 3: Implementa i wrapper**

Aggiungi in coda a `js/store.js`:

```js
// ---- ONBOARDING / PAIRING (RPC security definer) ----
// La logica vera vive in Postgres; questi sono wrapper sottili che propagano gli errori.

function checkRpc({ data, error }) {
  if (error) throw new Error(error.message || 'Errore RPC');
  return data;
}

export async function createCouple(client, { nome, avatar }) {
  return checkRpc(await client.rpc('crea_coppia', { p_nome: nome, p_avatar: avatar }));
}

export async function joinCouple(client, { codice, nome, avatar }) {
  return checkRpc(await client.rpc('unisci_coppia', { p_codice: codice, p_nome: nome, p_avatar: avatar }));
}

export async function regenInvite(client) {
  return checkRpc(await client.rpc('rigenera_codice', {}));
}

// Codice invito ancora valido (usato_da null) della coppia, o null. Per il banner "attesa partner".
export async function getInvitoAttivo(client, coupleId) {
  const { data, error } = await client.from('codici_invito')
    .select('*').eq('couple_id', coupleId).is('usato_da', null).maybeSingle();
  if (error) throw new Error(error.message || 'Errore lettura codice');
  return data || null;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `node --test test/onboarding.test.js`
Expected: PASS (logica pura + 6 test wrapper store).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/onboarding.test.js
git commit -m "feat(onboarding): wrapper store createCouple/joinCouple/regenInvite/getInvitoAttivo"
```

---

## Task 6: Auth — signUp, reset password, fix currentProfile

**Files:**
- Modify: `js/auth.js`
- Test: `test/onboarding.test.js` (append)

> Fix bug P4: oggi `currentProfile()` (`js/auth.js:18`) lancia se il profilo manca. Deve invece ritornare `null` quando il profilo non esiste (utente registrato ma senza coppia → onboarding), continuando a lanciare sugli errori veri. Si usa `.maybeSingle()` che ritorna `data: null, error: null` quando non ci sono righe.

- [ ] **Step 1: Aggiungi i test che falliscono**

Append a `test/onboarding.test.js`:

```js
import { currentProfile, signUp, resetPasswordForEmail } from '../js/auth.js';

// fake client per auth: getUser + select profiles.maybeSingle + auth.signUp/reset
function fakeAuthClient({ user = null, profile = null, profileError = null } = {}) {
  const calls = [];
  return {
    _calls: calls,
    auth: {
      getUser: () => Promise.resolve({ data: { user } }),
      signUp: (args) => { calls.push({ fn: 'signUp', args }); return Promise.resolve({ data: { user: { id: 'new' } }, error: null }); },
      resetPasswordForEmail: (email) => { calls.push({ fn: 'reset', email }); return Promise.resolve({ data: {}, error: null }); },
    },
    from() {
      const api = {
        select() { return api; },
        eq() { return api; },
        maybeSingle: () => Promise.resolve({ data: profile, error: profileError }),
      };
      return api;
    },
  };
}

test('currentProfile ritorna null se non c\'è utente', async () => {
  assert.equal(await currentProfile(fakeAuthClientWrap({ user: null })), null);
});

test('currentProfile ritorna null se l\'utente non ha ancora un profilo', async () => {
  assert.equal(await currentProfile(fakeAuthClientWrap({ user: { id: 'u1' }, profile: null })), null);
});

test('currentProfile ritorna il profilo quando esiste', async () => {
  const p = { id: 'u1', couple_id: 'cpl', display_name: 'Lei', avatar: '🌹' };
  const got = await currentProfile(fakeAuthClientWrap({ user: { id: 'u1' }, profile: p }));
  assert.deepEqual(got, p);
});

test('currentProfile lancia su errore di rete', async () => {
  await assert.rejects(
    () => currentProfile(fakeAuthClientWrap({ user: { id: 'u1' }, profileError: { message: 'network down' } })),
    /network down/);
});

test('signUp inoltra email e password a auth.signUp', async () => {
  const c = fakeAuthClientWrap({});
  await signUp(c, 'a@b.it', 'segreta');
  const call = c._calls.find(x => x.fn === 'signUp');
  assert.deepEqual(call.args, { email: 'a@b.it', password: 'segreta' });
});

test('resetPasswordForEmail inoltra l\'email', async () => {
  const c = fakeAuthClientWrap({});
  await resetPasswordForEmail(c, 'a@b.it');
  assert.ok(c._calls.find(x => x.fn === 'reset' && x.email === 'a@b.it'));
});
```

> **Nota di firma:** le funzioni di `js/auth.js` oggi usano il `client` importato internamente. Per renderle testabili **senza toccare i call-site esistenti**, si aggiunge un parametro opzionale `client` con default al client reale (vedi Step 3). Nei test usiamo l'helper `fakeAuthClientWrap` definito qui sotto.

Aggiungi anche questo helper in `test/onboarding.test.js` (subito dopo `fakeAuthClient`):

```js
// alias: i test passano il fake come PRIMO argomento esplicito alle funzioni auth
const fakeAuthClientWrap = (opts) => fakeAuthClient(opts);
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/onboarding.test.js`
Expected: FAIL — `signUp`/`resetPasswordForEmail` non esistono e `currentProfile` non accetta un client iniettato / lancia invece di ritornare null.

- [ ] **Step 3: Riscrivi `js/auth.js`**

Sostituisci l'intero `js/auth.js` con:

```js
import { client as defaultClient } from './supabase.js';

export async function login(email, password, client = defaultClient) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Email o password non corretti.');
  return data.user;
}

export async function logout(client = defaultClient) {
  await client.auth.signOut();
}

// Registrazione. Con conferma email ON non apre sessione finché l'utente non conferma.
export async function signUp(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

// Invio email di reset password.
export async function resetPasswordForEmail(client, email) {
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

// Profilo del coniuge loggato (id, couple_id, display_name, avatar).
// Ritorna null se non c'è sessione O se l'utente non ha ancora un profilo (→ onboarding).
// Lancia solo su errori di rete/DB reali.
export async function currentProfile(client = defaultClient) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Errore profilo: ' + error.message);
  return data || null;
}
```

> **Attenzione alle firme:** `signUp`/`resetPasswordForEmail` prendono `client` come **primo** argomento (coerente con `js/store.js`). `login`/`logout`/`currentProfile` prendono `client` come argomento **opzionale finale** con default, così i call-site esistenti in `js/app.js` (`login($('email').value...)`, `currentProfile()`) continuano a funzionare senza modifiche.

- [ ] **Step 4: Esegui tutta la suite**

Run: `node --test`
Expected: PASS — i test esistenti (235) restano verdi e si aggiungono quelli nuovi di `test/onboarding.test.js`.

- [ ] **Step 5: Commit**

```bash
git add js/auth.js test/onboarding.test.js
git commit -m "feat(onboarding): auth signUp + reset password; currentProfile ritorna null senza profilo"
```

---

## Task 7: Markup — login con link + contenitore onboarding

**Files:**
- Modify: `index.html` (blocco login `index.html:38-48`)

> Markup statico, nessun test Node. La verifica è visiva (Task 10, smoke manuale).

- [ ] **Step 1: Aggiungi i link al blocco login**

In `index.html`, sostituisci il blocco `<div id="login">` (righe 38-48) con:

```html
  <!-- GATE LOGIN -->
  <div id="login" style="display:none">
    <div class="candle">🕯️</div>
    <div class="login-kick">il nostro spazio</div>
    <div class="login-title">brace<span class="wm-dot">.</span></div>
    <form id="loginForm" autocomplete="on">
      <input id="email" type="email" placeholder="Email" autocomplete="username" required>
      <input id="password" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="btn" type="submit">Entra</button>
    </form>
    <div id="loginErr" class="login-err"></div>
    <div class="login-links">
      <button type="button" id="goSignup" class="login-link">Registrati</button>
      <span class="login-sep">·</span>
      <button type="button" id="goReset" class="login-link">Password dimenticata?</button>
    </div>
  </div>
```

- [ ] **Step 2: Aggiungi il contenitore onboarding dopo il blocco login**

Subito dopo il `</div>` di chiusura di `#login`, inserisci:

```html
  <!-- GATE ONBOARDING (registrato senza coppia) -->
  <div id="onboardingRoot" style="display:none"></div>
```

- [ ] **Step 3: Verifica statica**

Run: `node -e "const s=require('fs').readFileSync('index.html','utf8'); for(const id of ['goSignup','goReset','onboardingRoot']){ if(!s.includes('id=\"'+id+'\"')) throw new Error('manca '+id); } console.log('ok markup')"`
Expected: stampa `ok markup`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(onboarding): link registrati/reset nel login + contenitore onboarding"
```

---

## Task 8: Modulo UI onboarding

**Files:**
- Create: `js/modules/onboarding.js`

> UI DOM-heavy: la logica testabile è già coperta (Task 1/5). Qui la verifica è manuale (Task 10). Si riusano `mk/add/clear/toast` da `js/ui.js`, il pattern picker emoji da `js/modules/impostazioni.js:13,87`, e i wrapper di `js/store.js`.

- [ ] **Step 1: Crea il modulo**

Crea `js/modules/onboarding.js`:

```js
import { mk, add, clear, toast } from '../ui.js';
import { createCouple, joinCouple } from '../store.js';

const EMOJI = ['🐻','🧁','🦊','🦋','🐰','🐱','🐺','🦌','🌹','🍑','🔥','💋','🍒','🌙','⭐','🥃','🍫','🐝','🦢','🕯️','🍓','💎'];

// Campo nome + selettore avatar emoji. Ritorna { wrap, getNome, getAvatar }.
function profiloFields(avatarIniziale = '❤️') {
  const wrap = mk('div', 'ob-fields');
  const av = mk('button', 'ob-avatar', avatarIniziale); av.type = 'button';
  const picker = mk('div', 'ob-picker');
  EMOJI.forEach(e => {
    const b = mk('button', null, e); b.type = 'button';
    b.onclick = () => { av.textContent = e; picker.classList.remove('show'); };
    add(picker, b);
  });
  av.onclick = () => picker.classList.toggle('show');
  const nome = mk('input', 'ob-fld'); nome.placeholder = 'Il tuo nome'; nome.maxLength = 40;
  add(wrap, av, picker, nome);
  return { wrap, getNome: () => nome.value.trim(), getAvatar: () => av.textContent };
}

function showCodice(root, codice, onDone) {
  clear(root);
  const card = mk('div', 'ob-card');
  add(card, mk('div', 'ob-kick', 'La vostra coppia è pronta'));
  add(card, mk('div', 'ob-codice', codice));
  add(card, mk('div', 'ob-sub', 'Condividi questo codice col tuo partner: gli serve per unirsi.'));
  const azioni = mk('div', 'ob-azioni');
  const share = mk('button', 'btn', 'Condividi');
  share.onclick = async () => {
    const testo = `Unisciti alla nostra coppia su brace. — codice: ${codice}`;
    try {
      if (navigator.share) await navigator.share({ text: testo });
      else { await navigator.clipboard.writeText(codice); toast('Codice copiato', 'ok'); }
    } catch (_) { /* utente ha annullato lo share: nessun errore */ }
  };
  const copia = mk('button', 'btn ghost', 'Copia');
  copia.onclick = async () => {
    try { await navigator.clipboard.writeText(codice); toast('Codice copiato', 'ok'); }
    catch (_) { toast('Copia non riuscita', 'err'); }
  };
  add(azioni, share, copia);
  add(card, azioni);
  const entra = mk('button', 'ob-entra', 'Entra nell\'app');
  entra.onclick = () => onDone();
  add(card, entra);
  add(root, card);
}

// Schermata onboarding. `onDone` viene chiamata quando il profilo è stato creato
// (entra/rientra nell'app via app.js).
export function renderOnboarding({ client, root, onDone }) {
  clear(root);
  root.style.display = '';

  // STATO scelta
  const scelta = mk('div', 'ob-card');
  add(scelta, mk('div', 'ob-kick', 'Benvenuti'));
  add(scelta, mk('div', 'ob-title', 'brace.'));
  const bCrea = mk('button', 'btn', 'Create la vostra coppia');
  const bUni = mk('button', 'btn ghost', 'Ho un codice');
  add(scelta, bCrea, bUni);

  const renderScelta = () => { clear(root); add(root, scelta); };

  // STATO crea
  bCrea.onclick = () => {
    clear(root);
    const card = mk('div', 'ob-card');
    add(card, mk('div', 'ob-kick', 'Crea la coppia'));
    const f = profiloFields();
    add(card, f.wrap);
    const err = mk('div', 'login-err');
    const ok = mk('button', 'btn', 'Crea e ottieni il codice');
    ok.onclick = async () => {
      err.textContent = '';
      if (!f.getNome()) { err.textContent = 'Scrivi il tuo nome.'; return; }
      ok.disabled = true;
      try {
        const codice = await createCouple(client, { nome: f.getNome(), avatar: f.getAvatar() });
        showCodice(root, codice, onDone);
      } catch (e) { err.textContent = e.message; ok.disabled = false; }
    };
    const back = mk('button', 'ob-back', '← Indietro'); back.onclick = renderScelta;
    add(card, ok, err, back);
    add(root, card);
  };

  // STATO unisci
  bUni.onclick = () => {
    clear(root);
    const card = mk('div', 'ob-card');
    add(card, mk('div', 'ob-kick', 'Unisciti con un codice'));
    const cod = mk('input', 'ob-fld'); cod.placeholder = 'Codice (6 caratteri)'; cod.maxLength = 6;
    cod.autocapitalize = 'characters'; cod.style.textTransform = 'uppercase';
    const f = profiloFields();
    add(card, cod, f.wrap);
    const err = mk('div', 'login-err');
    const ok = mk('button', 'btn', 'Unisciti');
    ok.onclick = async () => {
      err.textContent = '';
      if (!cod.value.trim()) { err.textContent = 'Inserisci il codice.'; return; }
      if (!f.getNome()) { err.textContent = 'Scrivi il tuo nome.'; return; }
      ok.disabled = true;
      try {
        await joinCouple(client, { codice: cod.value.trim().toUpperCase(), nome: f.getNome(), avatar: f.getAvatar() });
        onDone();
      } catch (e) { err.textContent = e.message; ok.disabled = false; }
    };
    const back = mk('button', 'ob-back', '← Indietro'); back.onclick = renderScelta;
    add(card, ok, err, back);
    add(root, card);
  };

  renderScelta();
}
```

- [ ] **Step 2: Verifica che la suite non si rompa (import path validi)**

Run: `node --test`
Expected: PASS (il modulo non è importato dai test; questo step conferma che nessun test esistente si rompe).

- [ ] **Step 3: Commit**

```bash
git add js/modules/onboarding.js
git commit -m "feat(onboarding): modulo UI crea/unisci coppia con reveal codice"
```

---

## Task 9: Routing al boot in app.js

**Files:**
- Modify: `js/app.js` (`boot` righe 34-44, `enterApp` righe 86-101, `onLogin` righe 70-79)

> Cambio di flusso: sessione presente ma profilo assente → onboarding (oggi fa `location.reload()` trattandolo come token scaduto). Inoltre il login mostra i link Registrati/Reset.

- [ ] **Step 1: Aggiorna gli import in cima a `js/app.js`**

Modifica la riga 2 di `js/app.js` da:

```js
import { login, logout, currentProfile } from './auth.js';
```

a:

```js
import { login, logout, currentProfile, signUp, resetPasswordForEmail } from './auth.js';
import { renderOnboarding } from './modules/onboarding.js';
```

- [ ] **Step 2: Aggiorna `boot()` per cablare login + onboarding**

Sostituisci la funzione `boot()` (righe 34-44) con:

```js
async function boot() {
  const t0 = Date.now();
  setTimeout(openIntroCurtains, 3000); // failsafe
  document.addEventListener('pointerdown', skipIntroCurtains, { once: true });
  const { data: { session } } = await client.auth.getSession();
  if (session) await enterApp();
  else $('login').style.display = '';
  $('loginForm').addEventListener('submit', onLogin);
  wireAuthLinks();
  const wait = Math.max(0, 400 - (Date.now() - t0));
  setTimeout(openIntroCurtains, wait);
}

// Link "Registrati" e "Password dimenticata?" sotto il form di login.
function wireAuthLinks() {
  $('goSignup').onclick = onSignup;
  $('goReset').onclick = onReset;
}

async function onSignup() {
  const email = $('email').value.trim();
  const password = $('password').value;
  $('loginErr').textContent = '';
  if (!email || !password) { $('loginErr').textContent = 'Inserisci email e password per registrarti.'; return; }
  try {
    await signUp(client, email, password);
    $('loginErr').textContent = 'Ti abbiamo inviato una mail di conferma: aprila per attivare l\'account, poi accedi.';
  } catch (e) { $('loginErr').textContent = e.message; }
}

async function onReset() {
  const email = $('email').value.trim();
  $('loginErr').textContent = '';
  if (!email) { $('loginErr').textContent = 'Scrivi la tua email, poi tocca "Password dimenticata?".'; return; }
  try {
    await resetPasswordForEmail(client, email);
    $('loginErr').textContent = 'Se l\'email è registrata, riceverai un link per reimpostare la password.';
  } catch (e) { $('loginErr').textContent = e.message; }
}
```

- [ ] **Step 3: Aggiorna `enterApp()` per instradare all'onboarding**

Sostituisci le prime righe di `enterApp()` (righe 86-88) da:

```js
async function enterApp() {
  me = await currentProfile();
  if (!me) { location.reload(); return; } // token scaduto/non valido → torna al login
```

a:

```js
async function enterApp() {
  me = await currentProfile();
  if (!me) { showOnboarding(); return; } // sessione valida ma nessun profilo → onboarding
```

- [ ] **Step 4: Aggiungi `showOnboarding()` dopo `enterApp()`**

Subito dopo la chiusura di `enterApp()` (dopo la riga 101), inserisci:

```js
// Registrato senza coppia: mostra la scelta crea/unisci. Al termine rientra in enterApp.
function showOnboarding() {
  $('login').style.display = 'none';
  $('login').classList.add('gone');
  renderOnboarding({
    client,
    root: $('onboardingRoot'),
    onDone: async () => {
      $('onboardingRoot').style.display = 'none';
      await enterApp();
    },
  });
}
```

- [ ] **Step 5: Esegui la suite completa**

Run: `node --test`
Expected: PASS — 235 esistenti + nuovi di `test/onboarding.test.js`, 0 fail. (app.js non è importato dai test ma le firme di auth.js restano compatibili.)

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(onboarding): routing boot — sessione senza profilo apre l'onboarding"
```

---

## Task 10: Banner "attesa partner" + verifica manuale

**Files:**
- Modify: `js/modules/home.js` (avviso discreto) — o `js/modules/impostazioni.js` se l'avviso in Home risulta invasivo
- Test: smoke manuale (`test/smoke.md`)

> Lo spec (§4 punto 3) chiede un avviso discreto, col codice da condividere + "rigenera", visibile finché `couples.membro_b` è null. Si legge il codice attivo con `getInvitoAttivo` e si rigenera con `regenInvite` (Task 5).

- [ ] **Step 1: Leggi la struttura di home.js per il punto d'innesto**

Run: `node -e "const s=require('fs').readFileSync('js/modules/home.js','utf8'); console.log('export renderHome:', /export (async )?function renderHome/.test(s)); console.log('righe:', s.split(String.fromCharCode(10)).length)"`
Expected: stampa `export renderHome: true` e il numero di righe — conferma il punto dove inserire il banner all'interno di `renderHome`.

- [ ] **Step 2: Aggiungi il banner in `renderHome`**

In `js/modules/home.js`, importa i wrapper (aggiungi all'import esistente da `../store.js`):

```js
import { getInvitoAttivo, regenInvite } from '../store.js';
```

E dentro `renderHome({ client, me })`, dopo aver determinato che il partner manca, inserisci (adatta il punto al layout reale della home):

```js
  // Avviso "attesa partner": visibile solo finché la coppia non è completa.
  try {
    const partner = await getPartner(client, me.couple_id, me.id);
    if (!partner) {
      const invito = await getInvitoAttivo(client, me.couple_id);
      if (invito) {
        const banner = mk('div', 'home-attesa');
        add(banner, mk('span', 'home-attesa-t', 'In attesa del partner · codice '));
        add(banner, mk('strong', null, invito.codice));
        const rig = mk('button', 'home-attesa-rig', 'Rigenera');
        rig.onclick = async () => {
          try { const nuovo = await regenInvite(client); toast('Nuovo codice: ' + nuovo, 'ok'); renderHome({ client, me }); }
          catch (e) { toast(e.message, 'err'); }
        };
        add(banner, rig);
        // inserisci `banner` nel contenitore radice della home (vedi struttura esistente)
      }
    }
  } catch (_) { /* il banner è non-critico: un errore qui non deve rompere la home */ }
```

> `getPartner` è già esportata da `js/store.js:300`. Importa anche `mk, add, toast` se non già presenti nel file (verifica gli import in cima a `home.js`).

- [ ] **Step 3: Esegui la suite**

Run: `node --test`
Expected: PASS, 0 fail.

- [ ] **Step 4: Aggiorna lo smoke manuale**

In `test/smoke.md`, aggiungi una sezione "Onboarding multi-coppia" con questi passi (da eseguire dopo aver applicato `supabase/onboarding.sql` nel SQL Editor):

```markdown
## Onboarding multi-coppia (smoke a due account)
1. Account A: Registrati (email+password) → conferma via mail → accedi.
2. Account A: "Create la vostra coppia" → nome+avatar → appare il codice di 6 caratteri.
3. Account A: usa l'app da solo; la Home mostra il banner "In attesa del partner · codice XXXXXX".
4. Account A: "Rigenera" → il codice cambia, il vecchio non funziona più.
5. Account B (altro device/browser): Registrati → conferma → accedi → "Ho un codice" → inserisci il codice → nome+avatar → entra.
6. Account B vede lo storico di A; la presenza mostra entrambi al refresh.
7. Riprova con Account C usando un codice già usato/scaduto → errore chiaro, nessuno stato sporco.
8. Account A prova a unirsi al proprio codice → "Non puoi unirti alla tua stessa coppia".
```

- [ ] **Step 5: Commit**

```bash
git add js/modules/home.js test/smoke.md
git commit -m "feat(onboarding): banner attesa partner con codice + rigenera; smoke a due account"
```

---

## Self-Review

**1. Spec coverage:**
- §1 Schema (membro_b nullable, `codici_invito`, indice parziale, RLS) → Task 2. ✅
- §2 RPC `crea_coppia`/`unisci_coppia`/`rigenera_codice` (search_path, retry, errori distinti) → Task 3. ✅
- §3 Auth (`signUp`, `resetPasswordForEmail`, fix `currentProfile`→null) → Task 6. ✅
- §4 Flusso app (login con link, routing profilo assente→onboarding, scelta crea/unisci, reveal codice, stato attesa partner) → Task 7+8+10. ✅
- §5 Isolamento (profiles_upd `with check` + grant per-colonna, una coppia per utente nelle RPC) → Task 4 (+ controlli RPC nel Task 3). ✅
- §6 Edge case (codice invalido/scaduto/usato, email già registrata, unirsi alla propria/piena, collisione retry) → gestiti nelle RPC (Task 3) e nei toast UI (Task 8). ✅
- §7 Test (logica pura `generaCodiceInvito`/`codiceScaduto`; wrapper store con fakeClient; RPC/RLS esplicitamente fuori dai mock → integrazione) → Task 1, 5, 6 + nota Track F. ✅

**2. Placeholder scan:** nessun "TBD/implementa dopo/gestisci edge case" generico; ogni step ha codice o comando completo. ✅

**3. Type consistency:**
- Wrapper store: `createCouple({nome,avatar})`, `joinCouple({codice,nome,avatar})`, `regenInvite()`, `getInvitoAttivo(client,coupleId)` — usati identici in Task 5 (def/test) e Task 8/10 (consumo). ✅
- RPC param names: `p_nome`/`p_avatar`/`p_codice` coerenti tra SQL (Task 3) e wrapper (Task 5). ✅
- `currentProfile` ritorna `null` (Task 6) ed è il contratto su cui si basa il routing (Task 8). ✅
- Firme auth: `signUp(client, email, password)` e `resetPasswordForEmail(client, email)` con `client` primo arg, coerenti tra def (Task 6), test (Task 6) e call-site (Task 8). `login`/`currentProfile` con `client` opzionale finale → call-site esistenti invariati. ✅
