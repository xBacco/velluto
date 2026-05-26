# Nostro Spazio — Fase 1: Fondamenta + Desideri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in piedi le fondamenta dell'app (Supabase + login separati + profili + scheletro UI mobile-first "Velluto notturno") e il primo modulo completo end-to-end: 🔥 Desideri & fantasie.

**Architecture:** Frontend statico HTML/CSS/JS vanilla (niente build), `@supabase/supabase-js` da CDN. Backend Supabase: Auth (login), Postgres con Row Level Security per "coppia", (Storage arriva in Fase 2). Logica pura isolata in `js/lib/logic.js` (testata con `node --test`); accesso dati in `js/store.js` con client Supabase **iniettabile** (testato con client finto). UI costruita con helper DOM **senza `innerHTML`** (un hook di sicurezza lo blocca).

**Tech Stack:** HTML5, CSS3 (mobile-first), JavaScript ES modules, Supabase (Auth + Postgres + RLS), Node test runner (`node --test`), Playwright per lo smoke test.

---

## File Structure

```
nostro-spazio/
├── index.html              # shell app + gate login (markup statico)
├── styles.css              # stile "Velluto notturno", mobile-first
├── config.example.js       # template config (URL + anon key) — versionato
├── config.js               # config reale — NON versionato (.gitignore)
├── js/
│   ├── supabase.js         # init client da config + helper sessione
│   ├── auth.js             # login / logout / stato sessione
│   ├── store.js            # CRUD dati (client iniettabile)
│   ├── ui.js               # helper DOM sicuri (no innerHTML), toast, modali
│   ├── app.js              # bootstrap, routing tra sezioni
│   └── lib/
│       └── logic.js        # funzioni pure (filtri/ordinamento) — testabili
├── supabase/
│   └── schema.sql          # tabelle + RLS + (bucket foto, predisposto)
├── test/
│   ├── logic.test.js       # unit test funzioni pure
│   └── store.test.js       # unit test store con client finto
└── package.json            # "type":"module", script test
```

**Responsabilità:**
- `lib/logic.js`: pura, nessuna dipendenza, nessun I/O. Solo dati in → dati out.
- `store.js`: parla con Supabase; ogni funzione riceve `client` come primo argomento (iniettabile per test). Nessuna logica di UI.
- `auth.js`/`supabase.js`: sessione e init.
- `ui.js`: solo manipolazione DOM sicura, riusata da tutti i moduli.
- `app.js`: collega tutto, decide quale sezione mostrare.

---

## Prerequisiti — Setup Supabase (l'utente esegue, l'agente guida)

> Questi passi non sono codice: l'agente accompagna l'utente nella dashboard Supabase. Eseguire PRIMA della Task 1. Spuntare quando fatto.

- [ ] **P1.** L'utente crea un account gratuito su https://supabase.com e un nuovo **progetto** (regione EU, es. Frankfurt). Annota la **Project URL** e la **anon public key** (Settings → API).
- [ ] **P2.** L'utente apre **Authentication → Providers → Email**: abilita Email, **disattiva "Enable email confirmations"** (così i due account funzionano subito) e in **Authentication → Sign In / Providers** disattiva la **registrazione pubblica** (Allow new users to sign up = OFF). *Nota: gli account li crea l'agente in P4 da admin.*
- [ ] **P3.** L'utente esegue lo `supabase/schema.sql` (Task 1) nel **SQL Editor** della dashboard. (Si fa dopo aver scritto il file in Task 1.)
- [ ] **P4.** Creare i due utenti in **Authentication → Users → Add user** (email + password per Tomas e per Giulia, "Auto Confirm User" = ON). Annotare i due `user id` (UUID). Poi nel SQL Editor inserire coppia + profili (snippet fornito in Task 1, Step 4).

---

## Task 1: Schema database + RLS

**Files:**
- Create: `nostro-spazio/supabase/schema.sql`

- [ ] **Step 1: Creare lo schema SQL completo**

Crea `supabase/schema.sql` con TUTTE le tabelle (anche quelle usate nelle fasi successive: definirle ora evita migrazioni ripetute). RLS attiva ovunque, vincolata all'appartenenza alla coppia.

```sql
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

-- 4. ESPERIENZE (+foto in Fase 2)
create table if not exists esperienze (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  titolo text not null,
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

-- ============ RLS ============
alter table couples        enable row level security;
alter table profiles       enable row level security;
alter table desideri       enable row level security;
alter table esperienze     enable row level security;
alter table esperienza_foto enable row level security;
alter table buoni          enable row level security;
alter table carte          enable row level security;
alter table ruota_giri     enable row level security;

-- couples: leggibile dai membri
create policy couples_sel on couples for select using (membro_a = auth.uid() or membro_b = auth.uid());

-- profiles: membri della stessa coppia
create policy profiles_sel on profiles for select using (is_member(couple_id));
create policy profiles_ins on profiles for insert with check (id = auth.uid() and is_member(couple_id));
create policy profiles_upd on profiles for update using (id = auth.uid());

-- macro per tabelle "di coppia": una policy ALL basata su is_member
create policy desideri_all   on desideri        for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy esperienze_all on esperienze       for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy expfoto_all    on esperienza_foto  for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy buoni_all      on buoni            for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy carte_all      on carte            for all using (is_member(couple_id)) with check (is_member(couple_id));
create policy ruota_all      on ruota_giri       for all using (is_member(couple_id)) with check (is_member(couple_id));
```

- [ ] **Step 2: L'utente esegue lo schema**

Guidare l'utente: dashboard → **SQL Editor** → incolla il contenuto di `supabase/schema.sql` → **Run**. Atteso: "Success. No rows returned".

- [ ] **Step 3: Commit dello schema**

```bash
cd nostro-spazio
git add supabase/schema.sql
git commit -m "feat(db): schema Supabase + RLS per coppia"
```

- [ ] **Step 4: Creare coppia e profili (utente + agente)**

Dopo aver creato i due utenti (P4: Authentication → Add user, Auto Confirm ON) e annotato i due UUID, eseguire nel SQL Editor (sostituendo gli UUID e i nomi):

```sql
-- sostituisci <UUID_TOMAS> e <UUID_GIULIA> con i veri id da Authentication → Users
insert into couples (membro_a, membro_b) values ('<UUID_TOMAS>', '<UUID_GIULIA>')
returning id; -- annota questo couple id come <UUID_COUPLE>

insert into profiles (id, couple_id, display_name, avatar) values
  ('<UUID_TOMAS>',  '<UUID_COUPLE>', 'Tomas',  '🦊'),
  ('<UUID_GIULIA>', '<UUID_COUPLE>', 'Giulia', '🦋');
```

Atteso: due righe in `profiles`, una in `couples`.

---

## Task 2: Scaffolding progetto (package.json, config, .gitignore)

**Files:**
- Create: `nostro-spazio/package.json`
- Create: `nostro-spazio/config.example.js`
- Create: `nostro-spazio/.gitignore`

- [ ] **Step 1: Creare `package.json`**

```json
{
  "name": "nostro-spazio",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Creare `config.example.js` (template versionato)**

```js
// Copia questo file in config.js e inserisci i valori del TUO progetto Supabase.
// config.js NON va committato (è in .gitignore). La anon key è pubblica per design.
export const SUPABASE_URL = "https://XXXXXXXX.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ....(anon public key)....";
```

- [ ] **Step 3: Creare `.gitignore`**

```
node_modules/
config.js
.DS_Store
```

- [ ] **Step 4: Creare `config.js` reale (l'utente incolla URL + anon key da P1)**

Copiare `config.example.js` in `config.js` e sostituire i due valori con quelli reali del progetto (Settings → API). Verifica: il file esiste e NON compare in `git status`.

- [ ] **Step 5: Commit**

```bash
git add package.json config.example.js .gitignore
git commit -m "chore: scaffolding progetto + template config"
```

---

## Task 3: Logica pura — filtri/ordinamento Desideri (TDD)

**Files:**
- Create: `nostro-spazio/js/lib/logic.js`
- Test: `nostro-spazio/test/logic.test.js`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `test/logic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortByRecent, filterDesideri } from '../js/lib/logic.js';

const sample = [
  { id: 'a', stato: 'da_provare', autore_id: 'u1', creato: '2026-01-01T00:00:00Z' },
  { id: 'b', stato: 'realizzato', autore_id: 'u2', creato: '2026-03-01T00:00:00Z' },
  { id: 'c', stato: 'da_provare', autore_id: 'u2', creato: '2026-02-01T00:00:00Z' },
];

test('sortByRecent ordina dal più recente', () => {
  const out = sortByRecent(sample);
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
});

test('sortByRecent non muta l’array originale', () => {
  const copy = [...sample];
  sortByRecent(sample);
  assert.deepEqual(sample, copy);
});

test('filterDesideri tutti', () => {
  assert.equal(filterDesideri(sample, { tipo: 'tutti', me: 'u1' }).length, 3);
});

test('filterDesideri da_provare', () => {
  const out = filterDesideri(sample, { tipo: 'da_provare', me: 'u1' });
  assert.deepEqual(out.map(x => x.id).sort(), ['a', 'c']);
});

test('filterDesideri realizzato', () => {
  const out = filterDesideri(sample, { tipo: 'realizzato', me: 'u1' });
  assert.deepEqual(out.map(x => x.id), ['b']);
});

test('filterDesideri mine filtra per autore loggato', () => {
  const out = filterDesideri(sample, { tipo: 'mine', me: 'u2' });
  assert.deepEqual(out.map(x => x.id).sort(), ['b', 'c']);
});

test('filterDesideri ritorna ordinato per recente', () => {
  const out = filterDesideri(sample, { tipo: 'tutti', me: 'u1' });
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `cd nostro-spazio && node --test`
Atteso: FAIL — `Cannot find module '../js/lib/logic.js'` o export mancanti.

- [ ] **Step 3: Implementare `js/lib/logic.js`**

```js
// Funzioni pure: nessun I/O, nessuna dipendenza. Dati in → dati out.

export function sortByRecent(rows) {
  return [...rows].sort((a, b) => new Date(b.creato) - new Date(a.creato));
}

export function filterDesideri(rows, { tipo, me }) {
  let out = rows;
  if (tipo === 'da_provare') out = out.filter(d => d.stato === 'da_provare');
  else if (tipo === 'realizzato') out = out.filter(d => d.stato === 'realizzato');
  else if (tipo === 'mine') out = out.filter(d => d.autore_id === me);
  return sortByRecent(out);
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `cd nostro-spazio && node --test`
Atteso: PASS, 7 test ok.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/logic.test.js
git commit -m "feat(logic): filtri e ordinamento desideri + test"
```

---

## Task 4: Store — CRUD desideri con client iniettabile (TDD)

**Files:**
- Create: `nostro-spazio/js/store.js`
- Test: `nostro-spazio/test/store.test.js`

> Nota sul client finto: imitiamo il *query builder* di supabase-js, che è "thenable". `client.from(tabella)` ritorna un oggetto con `.select()/.insert()/.update()/.delete()/.eq()/.order()` concatenabili che alla fine risolvono `{ data, error }`.

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `test/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDesideri, addDesiderio, markRealizzato, deleteDesiderio } from '../js/store.js';

// --- fake client supabase ---
function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder(table) {
    const state = { table, op: null, payload: null, filters: {}, order: null };
    const api = {
      select() { state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.order = { col, opts }; return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          let data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data, error: null });
        } else if (state.op === 'insert') {
          const created = { id: 'new', ...state.payload };
          rows.push(created);
          resolve({ data: [created], error: null });
        } else {
          resolve({ data: null, error: null });
        }
      },
    };
    return api;
  }
  return { from: builder, _calls: calls, _rows: rows };
}

test('listDesideri seleziona per couple_id', async () => {
  const c = fakeClient([{ id: 'a', couple_id: 'cpl', testo: 'x' }]);
  const data = await listDesideri(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'desideri');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
});

test('addDesiderio inserisce con stato default da_provare', async () => {
  const c = fakeClient();
  await addDesiderio(c, { couple_id: 'cpl', autore_id: 'u1', testo: 'voglio x', categoria: 'Gioco' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.stato, 'da_provare');
  assert.equal(ins.payload.testo, 'voglio x');
  assert.equal(ins.payload.couple_id, 'cpl');
});

test('markRealizzato setta stato e data', async () => {
  const c = fakeClient();
  await markRealizzato(c, 'id1', '2026-05-26');
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.stato, 'realizzato');
  assert.equal(upd.payload.data_realizzato, '2026-05-26');
  assert.equal(upd.filters.id, 'id1');
});

test('deleteDesiderio elimina per id', async () => {
  const c = fakeClient();
  await deleteDesiderio(c, 'id1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'id1');
});

test('listDesideri propaga errore', async () => {
  const bad = { from: () => ({ select() { return this; }, eq() { return this; },
    order() { return this; }, then(r){ r({ data: null, error: { message: 'boom' } }); } }) };
  await assert.rejects(() => listDesideri(bad, 'cpl'), /boom/);
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `cd nostro-spazio && node --test`
Atteso: FAIL — `Cannot find module '../js/store.js'`.

- [ ] **Step 3: Implementare `js/store.js`**

```js
// Tutte le funzioni ricevono `client` (Supabase) come primo argomento → testabili.
// Nessun fallimento silenzioso: in caso di error si lancia un'eccezione.

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Errore Supabase');
  return data;
}

// ---- DESIDERI ----
export async function listDesideri(client, coupleId) {
  const res = await client.from('desideri').select('*').eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addDesiderio(client, { couple_id, autore_id, testo, categoria }) {
  const res = await client.from('desideri').insert({
    couple_id, autore_id, testo, categoria: categoria || null, stato: 'da_provare',
  });
  return check(res);
}

export async function markRealizzato(client, id, dataISO) {
  const res = await client.from('desideri').update({ stato: 'realizzato', data_realizzato: dataISO }).eq('id', id);
  return check(res);
}

export async function deleteDesiderio(client, id) {
  const res = await client.from('desideri').delete().eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `cd nostro-spazio && node --test`
Atteso: PASS (logic + store, 12 test totali).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat(store): CRUD desideri con client iniettabile + test"
```

---

## Task 5: Init client Supabase + sessione

**Files:**
- Create: `nostro-spazio/js/supabase.js`

- [ ] **Step 1: Creare `js/supabase.js`**

```js
// Carica supabase-js (via CDN, importato in index.html come modulo globale `supabase`)
// e crea il client dai valori di config.js.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data } = await client.auth.getSession();
  return data.session;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/supabase.js
git commit -m "feat: init client Supabase + helper sessione"
```

---

## Task 6: Auth — login / logout / profilo corrente

**Files:**
- Create: `nostro-spazio/js/auth.js`

- [ ] **Step 1: Creare `js/auth.js`**

```js
import { client } from './supabase.js';

export async function login(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Email o password non corretti.');
  return data.user;
}

export async function logout() {
  await client.auth.signOut();
}

// Profilo del coniuge loggato (id, couple_id, display_name, avatar)
export async function currentProfile() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw new Error('Profilo non trovato: ' + error.message);
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/auth.js
git commit -m "feat(auth): login, logout, profilo corrente"
```

---

## Task 7: Helper UI sicuri (no innerHTML)

**Files:**
- Create: `nostro-spazio/js/ui.js`

- [ ] **Step 1: Creare `js/ui.js`**

```js
// Helper DOM SENZA innerHTML (un hook di sicurezza blocca innerHTML).
export function mk(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
export function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}
export function clear(node) { node.replaceChildren(); }

// Toast d'errore/avviso visibile (no fallimenti silenziosi)
export function toast(message, kind = 'info') {
  const t = mk('div', 'toast toast-' + kind, message);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

// Bottom sheet modale; buildBody(sheetEl) riempie il contenuto.
export function openSheet(title, buildBody) {
  const overlay = mk('div', 'modal on');
  const sheet = mk('div', 'sheet');
  const x = mk('span', 'x', '✕');
  x.onclick = () => overlay.remove();
  add(sheet, x, mk('h3', null, title));
  buildBody(sheet);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui.js
git commit -m "feat(ui): helper DOM sicuri, toast, bottom sheet"
```

---

## Task 8: Shell HTML + stile Velluto notturno (mobile-first)

**Files:**
- Create: `nostro-spazio/index.html`
- Create: `nostro-spazio/styles.css`

- [ ] **Step 1: Creare `index.html`**

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#160409">
<title>Velluto</title>
<link rel="stylesheet" href="styles.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <!-- GATE LOGIN -->
  <div id="login">
    <div class="candle">🕯️</div>
    <div class="login-kick">il nostro spazio</div>
    <div class="login-title">Velluto</div>
    <form id="loginForm" autocomplete="on">
      <input id="email" type="email" placeholder="Email" autocomplete="username" required>
      <input id="password" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="btn" type="submit">Entra</button>
    </form>
    <div id="loginErr" class="login-err"></div>
  </div>

  <!-- APP -->
  <div class="wrap" id="app" style="display:none">
    <div class="topbar">
      <div class="brand">Velluto</div>
      <button class="me-chip" id="meChip"></button>
    </div>
    <nav class="nav" id="nav"></nav>
    <section class="panel" id="p-desideri"></section>
  </div>

  <button class="fab" id="fab" style="display:none">＋</button>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Creare `styles.css` (mobile-first, Velluto notturno)**

```css
:root{
  --bg:#160409; --bg2:#2a0813; --wine:#5c1026; --wine2:#7a1533;
  --gold:#d4a86c; --gold-soft:#e9c98f; --cream:#f3d9b0; --rose:#c2557a;
  --ok:#7fb069; --err:#e0556a; --shadow:rgba(0,0,0,.55);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;}
body{font-family:Georgia,"Times New Roman",serif;color:var(--cream);min-height:100vh;
  overflow-x:hidden;-webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 70% at 50% -5%,#3d0a1a 0,transparent 55%),
             linear-gradient(170deg,var(--bg),var(--bg2));background-attachment:fixed;}
.sans,input,button,.nav button,.muted,.login-kick{font-family:Arial,Helvetica,sans-serif;}

/* layout mobile-first: colonna singola */
.wrap{max-width:540px;margin:0 auto;padding:26px 16px 110px;}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.brand{font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);}
.me-chip{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.04);
  border:1px solid rgba(212,168,108,.3);border-radius:999px;padding:6px 13px;color:var(--cream);
  font-size:14px;cursor:pointer;min-height:40px;}

/* nav scrollabile orizzontale */
.nav{display:flex;gap:6px;overflow-x:auto;padding:12px 0;margin:6px 0 14px;scrollbar-width:none;}
.nav::-webkit-scrollbar{display:none;}
.nav button{flex:0 0 auto;font-size:12px;background:rgba(255,255,255,.03);
  border:1px solid rgba(212,168,108,.22);color:#d9b9a6;padding:11px 14px;border-radius:12px;
  cursor:pointer;white-space:nowrap;min-height:44px;}
.nav button.on{color:#fff;border-color:var(--wine2);
  background:linear-gradient(180deg,rgba(122,21,51,.6),rgba(92,16,38,.3));}

.panel{display:none;}
.panel.on{display:block;animation:fade .3s ease;}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ptitle{font-size:26px;margin:0 0 3px;}
.psub{font-size:13px;color:#b89aa2;margin:0 0 16px;line-height:1.5;}

/* buttons / inputs — target tap >= 44px */
.btn{appearance:none;border:none;cursor:pointer;font-family:inherit;min-height:46px;
  background:linear-gradient(180deg,var(--wine2),var(--wine));color:#fff;font-size:16px;
  font-weight:600;padding:12px 22px;border-radius:12px;
  box-shadow:0 8px 22px rgba(92,16,38,.45),inset 0 1px 0 rgba(255,255,255,.18);}
.btn:active{transform:scale(.96);}
.btn.gold{background:linear-gradient(180deg,var(--gold-soft),var(--gold));color:#3a2405;}
.btn.ghost{background:transparent;border:1px solid rgba(212,168,108,.45);color:var(--gold-soft);box-shadow:none;}
.btn.sm{font-size:13px;padding:9px 14px;min-height:40px;border-radius:9px;}
input,textarea,select{font-size:16px;width:100%;background:rgba(255,255,255,.05);
  border:1px solid rgba(212,168,108,.3);color:var(--cream);border-radius:10px;
  padding:13px;margin-bottom:11px;min-height:46px;}
textarea{min-height:74px;resize:vertical;}
label.lbl{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--gold);margin:0 0 5px 2px;}

/* login */
#login{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;padding:30px;
  background:radial-gradient(120% 80% at 50% 25%,#3d0a1a,var(--bg) 65%);}
#login.gone{display:none;}
#login form{width:100%;max-width:320px;margin-top:8px;}
.candle{font-size:46px;margin-bottom:6px;filter:drop-shadow(0 0 16px rgba(212,168,108,.5));
  animation:flick 3s ease-in-out infinite;}
@keyframes flick{0%,100%{opacity:1}50%{opacity:.85}}
.login-kick{letter-spacing:.5em;text-transform:uppercase;font-size:11px;color:var(--gold);margin-bottom:8px;}
.login-title{font-size:40px;margin-bottom:24px;
  background:linear-gradient(180deg,var(--cream),var(--gold-soft));
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.login-err{color:var(--err);font-family:Arial,sans-serif;font-size:13px;margin-top:10px;min-height:18px;}

/* cards */
.card{background:linear-gradient(160deg,rgba(92,16,38,.35),rgba(20,4,9,.4));
  border:1px solid rgba(212,168,108,.22);border-radius:16px;padding:15px 16px;margin-bottom:12px;
  box-shadow:0 6px 18px var(--shadow);}
.row{display:flex;align-items:center;gap:10px;}
.spread{justify-content:space-between;}
.pill{font-family:Arial,sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
  padding:3px 9px;border-radius:999px;border:1px solid rgba(212,168,108,.35);color:var(--gold-soft);}
.pill.done{color:var(--ok);border-color:rgba(127,176,105,.5);background:rgba(127,176,105,.12);}
.muted{color:#9c7f88;font-size:12px;}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
.filters button{font-size:12px;background:rgba(255,255,255,.03);border:1px solid rgba(212,168,108,.22);
  color:#cbab9e;padding:8px 13px;border-radius:999px;cursor:pointer;min-height:38px;}
.filters button.on{background:var(--wine);color:#fff;border-color:var(--wine2);}
.empty{text-align:center;color:#9c7f88;font-size:14px;padding:34px 10px;line-height:1.6;white-space:pre-line;}

/* FAB */
.fab{position:fixed;right:18px;bottom:22px;z-index:30;width:58px;height:58px;border-radius:50%;
  font-size:30px;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;
  background:linear-gradient(180deg,var(--gold-soft),var(--gold));color:#3a2405;
  box-shadow:0 10px 26px rgba(212,168,108,.45);}
.fab:active{transform:scale(.92);}

/* modal bottom sheet */
.modal{position:fixed;inset:0;z-index:60;background:rgba(8,2,5,.72);display:none;
  align-items:flex-end;justify-content:center;}
.modal.on{display:flex;}
.sheet{width:100%;max-width:540px;background:linear-gradient(180deg,#2a0813,#1c0610);
  border-top-left-radius:22px;border-top-right-radius:22px;border:1px solid rgba(212,168,108,.25);
  padding:20px 18px 26px;max-height:86vh;overflow-y:auto;animation:up .3s ease;}
@keyframes up{from{transform:translateY(40px)}to{transform:none}}
.sheet h3{font-size:21px;margin:0 0 14px;}
.sheet .x{float:right;font-size:22px;color:#9c7f88;cursor:pointer;}

/* toast */
.toast{position:fixed;left:50%;bottom:90px;transform:translate(-50%,20px);z-index:90;
  background:#2a0813;border:1px solid rgba(212,168,108,.4);color:var(--cream);
  padding:12px 18px;border-radius:12px;font-family:Arial,sans-serif;font-size:14px;
  opacity:0;transition:all .3s ease;max-width:90vw;text-align:center;}
.toast.show{opacity:1;transform:translate(-50%,0);}
.toast-err{border-color:var(--err);color:#ffd9de;}
```

- [ ] **Step 3: Commit**

```bash
git add index.html styles.css
git commit -m "feat(ui): shell HTML + stile Velluto notturno mobile-first"
```

---

## Task 9: App bootstrap + routing + gate login

**Files:**
- Create: `nostro-spazio/js/app.js`

- [ ] **Step 1: Creare `js/app.js`**

```js
import { client } from './supabase.js';
import { login, logout, currentProfile } from './auth.js';
import { mk, add, clear, toast } from './ui.js';
import { renderDesideri } from './modules/desideri.js';

const TABS = [['desideri', '🔥', 'Desideri']]; // altri moduli nelle fasi successive

let me = null;     // profilo loggato
let cur = 'desideri';

const $ = id => document.getElementById(id);

async function boot() {
  const { data: { session } } = await client.auth.getSession();
  if (session) await enterApp();
  $('loginForm').addEventListener('submit', onLogin);
}

async function onLogin(e) {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    await login($('email').value.trim(), $('password').value);
    await enterApp();
  } catch (err) {
    $('loginErr').textContent = err.message;
  }
}

async function enterApp() {
  me = await currentProfile();
  $('login').classList.add('gone');
  $('app').style.display = '';
  $('fab').style.display = '';
  const chip = $('meChip');
  clear(chip);
  add(chip, mk('span', null, me.avatar), mk('span', null, me.display_name + ' · esci'));
  chip.onclick = async () => { await logout(); location.reload(); };
  buildNav();
  go('desideri');
}

function buildNav() {
  const n = $('nav'); clear(n);
  for (const [k, i, l] of TABS) {
    const b = mk('button'); add(b, mk('span', null, i + ' '), mk('span', null, l));
    b.dataset.k = k; b.onclick = () => go(k); n.appendChild(b);
  }
}

function go(k) {
  cur = k;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  $('p-' + k).classList.add('on');
  render();
}

function render() {
  if (cur === 'desideri') renderDesideri({ client, me, panel: $('p-desideri') });
}

// il FAB delega al modulo corrente tramite evento
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));

boot().catch(err => toast('Errore avvio: ' + err.message, 'err'));
```

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat(app): bootstrap, gate login, routing"
```

---

## Task 10: Modulo Desideri (UI completa)

**Files:**
- Create: `nostro-spazio/js/modules/desideri.js`

- [ ] **Step 1: Creare `js/modules/desideri.js`**

```js
import { mk, add, clear, toast, openSheet } from '../ui.js';
import { filterDesideri } from '../lib/logic.js';
import { listDesideri, addDesiderio, markRealizzato, deleteDesiderio } from '../store.js';

let ctx = null;        // { client, me, panel }
let fil = 'tutti';
let rows = [];
let wired = false;

export async function renderDesideri(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:desideri', () => openAdd()); wired = true; }
  try {
    rows = await listDesideri(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🔥 Desideri & fantasie'),
         mk('p', 'psub', 'Bacheca delle cose da provare. Spuntale quando le realizzate insieme.'));
  const f = mk('div', 'filters');
  for (const [k, l] of [['tutti','Tutti'],['da_provare','Da provare'],['realizzato','Realizzati'],['mine','Scritti da me']]) {
    const b = mk('button', fil === k ? 'on' : '', l);
    b.onclick = () => { fil = k; draw(); };
    f.appendChild(b);
  }
  p.appendChild(f);
  const list = filterDesideri(rows, { tipo: fil, me: ctx.me.id });
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Ancora niente qui.\nTocca ＋ per aggiungere un desiderio.')); return; }
  for (const d of list) p.appendChild(cardOf(d));
}

function cardOf(d) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  const left = mk('div', 'row');
  left.appendChild(mk('span', d.stato === 'realizzato' ? 'pill done' : 'pill', d.stato === 'realizzato' ? 'Realizzato' : 'Da provare'));
  if (d.categoria) left.appendChild(mk('span', 'pill', d.categoria));
  add(top, left, mk('span', 'muted', d.data_realizzato ? 'Fatto il ' + fmt(d.data_realizzato) : ''));
  c.appendChild(top);
  const txt = mk('p', null, d.testo); txt.style.cssText = 'margin:10px 0 8px;font-size:18px;'; c.appendChild(txt);
  const act = mk('div', 'row'); act.style.justifyContent = 'flex-end';
  if (d.stato === 'da_provare') {
    const done = mk('button', 'btn sm gold', '✓ Realizzato');
    done.onclick = async () => {
      try { await markRealizzato(ctx.client, d.id, todayISO()); await renderDesideri(ctx); }
      catch (e) { toast('Errore: ' + e.message, 'err'); }
    };
    act.appendChild(done);
  }
  const del = mk('button', 'btn sm ghost', 'Elimina');
  del.onclick = async () => {
    try { await deleteDesiderio(ctx.client, d.id); await renderDesideri(ctx); }
    catch (e) { toast('Errore: ' + e.message, 'err'); }
  };
  act.appendChild(del);
  c.appendChild(act);
  return c;
}

function openAdd() {
  openSheet('Nuovo desiderio', s => {
    const testo = mk('textarea'); testo.placeholder = 'Cosa vorreste provare…';
    const cat = mk('input'); cat.placeholder = 'Categoria (facoltativa)';
    const b = mk('button', 'btn', 'Aggiungi alla bacheca'); b.style.width = '100%'; b.style.marginTop = '6px';
    b.onclick = async () => {
      if (!testo.value.trim()) return;
      try {
        await addDesiderio(ctx.client, { couple_id: ctx.me.couple_id, autore_id: ctx.me.id, testo: testo.value.trim(), categoria: cat.value.trim() });
        s.closest('.modal').remove();
        await renderDesideri(ctx);
      } catch (e) { toast('Errore salvataggio: ' + e.message, 'err'); }
    };
    add(s, mk('label', 'lbl', 'Desiderio'), testo, mk('label', 'lbl', 'Categoria'), cat, b);
  });
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
```

- [ ] **Step 2: Commit**

```bash
git add js/modules/desideri.js
git commit -m "feat(desideri): modulo UI completo (lista, filtri, aggiungi, realizzato, elimina)"
```

---

## Task 11: Smoke test nel browser vero (Playwright) — OBBLIGATORIO

**Files:**
- Create: `nostro-spazio/test/smoke.md` (checklist eseguita manualmente/assistita)

> Serve un server statico locale (il modulo ES `config.js` non si carica da `file://`). L'agente usa gli strumenti Playwright disponibili. La verifica NON è completa finché tutti i punti passano.

- [ ] **Step 1: Avviare un server statico locale**

```bash
cd nostro-spazio
python -m http.server 5500
```
App su `http://localhost:5500`.

- [ ] **Step 2: Verificare il flusso completo (Playwright)**

Naviga a `http://localhost:5500` e verifica, a viewport mobile (es. 390×844):
1. Compare il **gate login**; con credenziali errate → messaggio "Email o password non corretti.".
2. Login corretto (account di P4) → entra nell'app, il chip in alto mostra avatar + nome.
3. **Desideri** vuoto mostra il messaggio "Ancora niente qui."; tocco **＋** → aggiungo un desiderio con categoria → compare in lista come "Da provare".
4. Tocco **✓ Realizzato** → la pill diventa "Realizzato" con data; il filtro **Realizzati** lo mostra, **Da provare** no.
5. **Elimina** → la voce sparisce.
6. **Reload** della pagina → resto loggato (sessione) e i dati salvati persistono.
7. Logout dal chip → torno al gate login.

- [ ] **Step 3: Annotare l'esito in `test/smoke.md`**

```md
# Smoke test Fase 1 — esito
Data: <data>
Browser: <chromium via Playwright>, viewport 390x844
- [x] gate login + errore credenziali
- [x] login ok + chip profilo
- [x] aggiunta desiderio
- [x] segna realizzato + filtri
- [x] elimina
- [x] persistenza dopo reload + sessione
- [x] logout
Note: ...
```

- [ ] **Step 4: Commit**

```bash
git add test/smoke.md
git commit -m "test: smoke test Fase 1 superato (login + desideri end-to-end)"
```

---

## Self-Review (eseguita in fase di scrittura del piano)

**Copertura spec (Fase 1):** Auth/login separati ✓ (Task 6,9), profili ✓ (Task 1,6), RLS per coppia ✓ (Task 1), modulo Desideri con campi/filtri/stato/data ✓ (Task 3,4,10), stile Velluto mobile-first ✓ (Task 8), no fallimenti silenziosi ✓ (toast + throw in store), smoke test obbligatorio ✓ (Task 11). Le tabelle di esperienze/buoni/carte/ruota sono create ora (Task 1) ma usate nelle fasi 2–4.

**Coerenza nomi:** `couple_id`, `autore_id`, `stato`, `data_realizzato`, `creato` usati in modo identico tra schema (Task 1), store (Task 4), logic (Task 3) e UI (Task 10). Funzioni store: `listDesideri/addDesiderio/markRealizzato/deleteDesiderio` coerenti tra test e implementazione e import nel modulo.

**Placeholder:** nessun TBD/TODO; ogni step ha codice o comando completo.

---

## Esecuzione

Una volta completata la Fase 1 e superato lo smoke test, si scriverà il piano della **Fase 2** (Esperienze + calendario + foto su Storage privato).
