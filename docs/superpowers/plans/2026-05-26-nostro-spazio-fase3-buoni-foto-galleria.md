# Fase 3 — Buoni + Foto riutilizzabili + Galleria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il modulo Buoni, una primitiva foto riutilizzabile (tabella `foto` unica) e una Galleria, riusando l'infrastruttura privata già esistente (bucket privato + RLS + signed URL).

**Architecture:** Una tabella Postgres `foto` polimorfica (`contesto` + `ref_id`) sostituisce `esperienza_foto`. Un modulo UI `foto.js` riusabile (editor + thumbs + viewer) è agganciato sia da Buoni che da Esperienze. Le transizioni di stato dei buoni e i raggruppamenti sono funzioni pure testate. Galleria legge tutte le foto della coppia e le raggruppa per contesto.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules, niente build), Supabase JS v2 via CDN, `node:test` per gli unit, Playwright per lo smoke. Stile "Velluto notturno" (`styles.css`).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-26-nostro-spazio-fase3-buoni-foto-galleria.md`
**Mockup UI:** `mockups/fase3.html`

**Convenzioni del progetto (rispettarle):**
- `store.js`: ogni funzione riceve `client` come 1° arg; usa `check({data,error})` che lancia su errore (niente fallimenti silenziosi). Insert che servono indietro usano `.select().single()`.
- `lib/logic.js`: solo funzioni pure (dati in → dati out), `now` iniettabile dove serve tempo.
- Moduli render: `export async function renderX({ client, me, panel })`; FAB delega via evento `fab:<key>`; UI costruita con `mk/add/clear` da `ui.js` (VIETATO `innerHTML`, c'è un hook che lo blocca); modali con `openSheet(title, buildBody)`.
- Test: fake client a builder (`from`) + `storage` (vedi `test/esperienze.test.js`), client iniettato.
- Comandi: `cd C:\Users\TomasCoro\nostro-spazio`; test = `node --test`; server statico per smoke = `python -m http.server 5500`.

---

## File Structure

**Creare:**
- `supabase/foto.sql` — tabella `foto` + RLS + (sezione) migrazione dati da `esperienza_foto`.
- `js/modules/foto.js` — componente foto riusabile: `fotoEditor`, `loadThumbsInto`, `openViewer`.
- `js/modules/buoni.js` — modulo Buoni (3 viste, crea regalo/bundle/richiesta, azioni stato).
- `js/modules/galleria.js` — modulo Galleria (griglia, filtri contesto/autore, viewer).
- `test/foto.test.js` — unit store foto.
- `test/buoni.test.js` — unit logica + store buoni.

**Modificare:**
- `js/store.js` — sostituire le funzioni foto con versioni generiche; aggiungere funzioni buoni.
- `js/lib/logic.js` — `fotoPath` (nuova firma) + `groupFotoByContesto`; transizioni/filtri/bundle buoni.
- `js/modules/calendario.js` — usare la primitiva foto generica (`contesto='esperienza'`).
- `test/esperienze.test.js` — aggiornare i test foto alla nuova firma generica.
- `js/app.js` — registrare tab/panel Buoni e Galleria.
- `index.html` — aggiungere i `<section class="panel">` per Buoni e Galleria.
- `styles.css` — stili buoni (card, pill stato, bundle), galleria (grid, tag, viewer), blur thumbs.

---

## Task 1: Tabella `foto` + RLS + migrazione SQL

**Files:**
- Create: `supabase/foto.sql`

Questa task produce SQL da eseguire **a mano** nel SQL Editor di Supabase (pattern del progetto "io scrivo, tu esegui"). NON droppa ancora `esperienza_foto` (lo si fa in Task 12, dopo lo smoke).

- [ ] **Step 1: Scrivere `supabase/foto.sql`**

```sql
-- ============ NOSTRO SPAZIO — Fase 3: tabella 'foto' generica ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql e storage.sql.
-- Riusa is_member(uuid) e il bucket privato 'foto' già esistenti.
-- 'esperienza_foto' NON viene droppata qui: si elimina a mano dopo lo smoke (Task 12).

-- 1. Tabella foto polimorfica (contesto + ref_id puntano a tabelle diverse → nessuna FK su ref_id)
create table if not exists foto (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  contesto text not null check (contesto in ('esperienza','buono')),
  ref_id uuid not null,
  storage_path text not null,
  didascalia text,
  creato timestamptz not null default now()
);
create index if not exists foto_ref_idx on foto (contesto, ref_id);
create index if not exists foto_couple_idx on foto (couple_id);

-- 2. RLS: stesso pattern delle altre tabelle di coppia
alter table foto enable row level security;
create policy foto_all on foto for all using (is_member(couple_id)) with check (is_member(couple_id));

-- 3. Migrazione dati dalle foto delle esperienze (idempotente: salta quelle già migrate)
insert into foto (couple_id, autore_id, contesto, ref_id, storage_path, creato)
select ef.couple_id,
       e.autore_id,                       -- autore = autore dell'esperienza
       'esperienza', ef.esperienza_id, ef.storage_path, ef.creato
from esperienza_foto ef
join esperienze e on e.id = ef.esperienza_id
where not exists (
  select 1 from foto f
  where f.contesto = 'esperienza' and f.ref_id = ef.esperienza_id and f.storage_path = ef.storage_path
);

-- 4. Verifica conteggi (devono coincidere):
--    select count(*) from esperienza_foto;
--    select count(*) from foto where contesto='esperienza';
```

- [ ] **Step 2: Far eseguire lo script all'utente**

Chiedere all'utente di incollare `supabase/foto.sql` nel SQL Editor di Supabase ed eseguirlo, poi di lanciare le due `select count(*)` del commento e confermare che i conteggi coincidono. (NB: ambiente attuale ha 0 o pochissime foto reali → migrazione banale.)

- [ ] **Step 3: Commit**

```bash
git add supabase/foto.sql
git commit -m "feat(db): tabella foto generica + RLS + migrazione da esperienza_foto"
```

---

## Task 2: Funzioni pure foto in `lib/logic.js`

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/logic.test.js` (aggiunge casi)

- [ ] **Step 1: Scrivere i test che falliscono** — aggiungere in `test/logic.test.js`:

```js
import { fotoPath, groupFotoByContesto } from '../js/lib/logic.js';

test('fotoPath usa couple/contesto/ref e sanifica il filename', () => {
  const p = fotoPath('cpl', 'buono', 'b1', 'fo to!@#.jpg', 1000);
  assert.equal(p, 'cpl/buono/b1/1000-fo_to___.jpg');
});

test('groupFotoByContesto raggruppa per contesto', () => {
  const g = groupFotoByContesto([
    { id: '1', contesto: 'esperienza' }, { id: '2', contesto: 'buono' }, { id: '3', contesto: 'esperienza' },
  ]);
  assert.equal(g.esperienza.length, 2);
  assert.equal(g.buono.length, 1);
});
```

- [ ] **Step 2: Eseguire i test e verificare il fallimento**

Run: `node --test test/logic.test.js`
Expected: FAIL (`fotoPath` cambia firma / `groupFotoByContesto` non esiste).

- [ ] **Step 3: Aggiornare `lib/logic.js`** — sostituire la vecchia `fotoPath` e aggiungere `groupFotoByContesto`:

```js
// Path deterministico nel bucket 'foto'. `now` iniettabile per i test.
export function fotoPath(coupleId, contesto, refId, filename, now = Date.now()) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${coupleId}/${contesto}/${refId}/${now}-${safe}`;
}

export function groupFotoByContesto(rows) {
  const m = {};
  for (const r of rows) (m[r.contesto] ||= []).push(r);
  return m;
}
```

- [ ] **Step 4: Eseguire i test e verificare il passaggio**

Run: `node --test test/logic.test.js`
Expected: PASS (la vecchia `fotoPath` a 3 arg non è più referenziata: `calendario.js` viene aggiornato in Task 4).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/logic.test.js
git commit -m "feat(logic): fotoPath generica (contesto) + groupFotoByContesto"
```

---

## Task 3: Funzioni store foto generiche

**Files:**
- Modify: `js/store.js`
- Test: `test/foto.test.js` (nuovo)

- [ ] **Step 1: Scrivere `test/foto.test.js` (fallisce)** — riusa il fake client con storage:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadFoto, listFoto, listFotoGalleria, signedUrl, deleteFoto, deleteFotoDi } from '../js/store.js';

function fakeClient(initialTables = {}) {
  const calls = [];
  const tables = {};
  for (const [t, rows] of Object.entries(initialTables)) tables[t] = [...rows];
  function builder(table) {
    tables[table] ||= [];
    const state = { table, op: 'select', payload: null, filters: {}, order: null, single: false };
    const api = {
      select() { if (state.op !== 'insert') state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order(col, opts) { state.order = { col, opts }; return api; },
      single() { state.single = true; return api; },
      then(resolve) {
        calls.push(state);
        const rows = tables[table];
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data: state.single ? (data[0] ?? null) : data, error: null });
        } else if (state.op === 'insert') {
          const created = { id: 'new-' + (rows.length + 1), ...state.payload };
          rows.push(created); resolve({ data: state.single ? created : [created], error: null });
        } else if (state.op === 'delete') {
          for (let i = rows.length - 1; i >= 0; i--)
            if (Object.entries(state.filters).every(([k, v]) => rows[i][k] === v)) rows.splice(i, 1);
          resolve({ data: null, error: null });
        } else { resolve({ data: null, error: null }); }
      },
    };
    return api;
  }
  const storage = { ops: [], from(bucket) { return {
    upload: async (path, file) => { storage.ops.push({ op: 'upload', bucket, path, file }); return { data: { path }, error: null }; },
    createSignedUrl: async (path, exp) => { storage.ops.push({ op: 'sign', bucket, path, exp }); return { data: { signedUrl: 'https://signed/' + path + '?e=' + exp }, error: null }; },
    remove: async (paths) => { storage.ops.push({ op: 'remove', bucket, paths }); return { data: {}, error: null }; },
  }; } };
  return { from: builder, storage, _calls: calls, _tables: tables, _storage: storage };
}

test('uploadFoto carica e registra riga con contesto e ref_id', async () => {
  const c = fakeClient();
  const row = await uploadFoto(c, { coupleId: 'cpl', autoreId: 'u1', contesto: 'buono', refId: 'b1', file: { name: 'x.jpg' }, path: 'cpl/buono/b1/1-x.jpg', didascalia: 'ciao' });
  const up = c._storage.ops.find(o => o.op === 'upload');
  assert.equal(up.bucket, 'foto');
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.contesto, 'buono');
  assert.equal(ins.payload.ref_id, 'b1');
  assert.equal(ins.payload.didascalia, 'ciao');
  assert.equal(ins.payload.storage_path, 'cpl/buono/b1/1-x.jpg');
  assert.ok(row.id);
});

test('uploadFoto: didascalia vuota -> null', async () => {
  const c = fakeClient();
  await uploadFoto(c, { coupleId: 'cpl', autoreId: 'u1', contesto: 'buono', refId: 'b1', file: { name: 'x.jpg' }, path: 'p' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.didascalia, null);
});

test('listFoto filtra per contesto e ref_id', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', contesto: 'buono', ref_id: 'b1', storage_path: 'a' },
    { id: 'f2', contesto: 'esperienza', ref_id: 'e1', storage_path: 'b' },
  ] });
  const data = await listFoto(c, { contesto: 'buono', refId: 'b1' });
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'f1');
});

test('listFotoGalleria prende tutte le foto della coppia', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', couple_id: 'cpl', contesto: 'buono' }, { id: 'f2', couple_id: 'cpl', contesto: 'esperienza' },
    { id: 'f3', couple_id: 'altra', contesto: 'buono' },
  ] });
  const data = await listFotoGalleria(c, 'cpl');
  assert.equal(data.length, 2);
});

test('signedUrl ritorna URL firmato', async () => {
  const c = fakeClient();
  assert.equal(await signedUrl(c, 'p/x.jpg', 3600), 'https://signed/p/x.jpg?e=3600');
});

test('deleteFoto rimuove da storage e cancella riga', async () => {
  const c = fakeClient({ foto: [{ id: 'f1', storage_path: 'p/x.jpg' }] });
  await deleteFoto(c, { id: 'f1', storagePath: 'p/x.jpg' });
  assert.deepEqual(c._storage.ops.find(o => o.op === 'remove').paths, ['p/x.jpg']);
  assert.equal(c._tables.foto.length, 0);
});

test('deleteFotoDi cancella tutte le foto di un genitore e ritorna 0 fallite', async () => {
  const c = fakeClient({ foto: [
    { id: 'f1', contesto: 'buono', ref_id: 'b1', storage_path: 'a' },
    { id: 'f2', contesto: 'buono', ref_id: 'b1', storage_path: 'b' },
  ] });
  const fallite = await deleteFotoDi(c, { contesto: 'buono', refId: 'b1' });
  assert.equal(fallite, 0);
  assert.equal(c._tables.foto.length, 0);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test test/foto.test.js`
Expected: FAIL (le funzioni nuove non esistono / firme diverse).

- [ ] **Step 3: Sostituire la sezione FOTO in `js/store.js`** — rimpiazzare il blocco `// ---- FOTO ...` (righe ~56-83) con:

```js
// ---- FOTO (Storage privato bucket 'foto' + tabella 'foto' generica) ----
// path = '<couple_id>/<contesto>/<ref_id>/<file>' (vedi lib/logic.fotoPath)
export async function uploadFoto(client, { coupleId, autoreId, contesto, refId, file, path, didascalia }) {
  const up = await client.storage.from('foto').upload(path, file);
  if (up.error) throw new Error('Upload foto: ' + up.error.message);
  const res = await client.from('foto').insert({
    couple_id: coupleId, autore_id: autoreId, contesto, ref_id: refId,
    storage_path: path, didascalia: didascalia || null,
  }).select().single();
  return check(res);
}

export async function listFoto(client, { contesto, refId }) {
  const res = await client.from('foto').select('*')
    .eq('contesto', contesto).eq('ref_id', refId).order('creato', { ascending: true });
  return check(res);
}

export async function listFotoGalleria(client, coupleId) {
  const res = await client.from('foto').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function signedUrl(client, storagePath, expiresIn = 3600) {
  const { data, error } = await client.storage.from('foto').createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error('Signed URL: ' + error.message);
  return data.signedUrl;
}

export async function deleteFoto(client, { id, storagePath }) {
  const rm = await client.storage.from('foto').remove([storagePath]);
  if (rm.error) throw new Error('Rimozione foto: ' + rm.error.message);
  const res = await client.from('foto').delete().eq('id', id);
  return check(res);
}

// Cancella tutte le foto di un genitore (usata quando si elimina un buono/esperienza).
// Ritorna il numero di foto NON rimosse dallo storage (per avvisare l'utente).
export async function deleteFotoDi(client, { contesto, refId }) {
  const foto = await listFoto(client, { contesto, refId });
  let fallite = 0;
  for (const f of foto) {
    try { await deleteFoto(client, { id: f.id, storagePath: f.storage_path }); } catch { fallite++; }
  }
  return fallite;
}
```

- [ ] **Step 4: Eseguire e verificare il passaggio**

Run: `node --test test/foto.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/foto.test.js
git commit -m "feat(store): funzioni foto generiche (uploadFoto/listFoto/listFotoGalleria/deleteFotoDi)"
```

---

## Task 4: Refactor Esperienze sulla primitiva foto

**Files:**
- Modify: `js/modules/calendario.js`
- Modify: `test/esperienze.test.js` (rimuovere i test foto duplicati, ora coperti da `foto.test.js`)

- [ ] **Step 1: Aggiornare `test/esperienze.test.js`** — rimuovere i test sulle vecchie funzioni foto (`listFotoRows`, e gli assert su `uploadFoto`/`deleteFoto` con firma vecchia) e l'import relativo, lasciando solo i test su `listEsperienze/addEsperienza/updateEsperienza/deleteEsperienza` e `addEsperienza propaga errore`. Import in cima:

```js
import {
  listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza,
} from '../js/store.js';
```

(I test foto vivono ora in `test/foto.test.js`.)

- [ ] **Step 2: Eseguire la suite e verificare cosa fallisce**

Run: `node --test`
Expected: `test/esperienze.test.js` PASS; eventuali fallimenti residui solo da `calendario.js` non ancora aggiornato (non testato a unit, ma l'import di `listFotoRows` non esiste più → lo correggiamo ora).

- [ ] **Step 3: Aggiornare `js/modules/calendario.js`** — adeguare import e chiamate foto al nuovo store/primitiva. Cambiamenti puntuali:

Import (righe 1-6) →

```js
import { mk, add, clear, toast, openSheet } from '../ui.js';
import { monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath } from '../lib/logic.js';
import { listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza } from '../store.js';
import { fotoEditor, loadThumbsInto } from './foto.js';
```

`loadThumbs(e.id, thumbs, false)` nella card (riga ~91) →

```js
  loadThumbsInto(ctx, { contesto: 'esperienza', refId: e.id }, thumbs, false);
```

Sostituire l'intera funzione `loadThumbs(...)` (righe ~110-131) con: **rimuoverla** (sostituita da `loadThumbsInto` di `foto.js`).

`removeEsperienzaConFoto` (righe ~133-141) →

```js
async function removeEsperienzaConFoto(esperienzaId) {
  const fallite = await deleteFotoDi(ctx.client, { contesto: 'esperienza', refId: esperienzaId });
  await deleteEsperienza(ctx.client, esperienzaId);
  if (fallite) toast('Esperienza eliminata, ma ' + fallite + ' foto non rimosse dallo storage', 'err');
}
```

e aggiungere `deleteFotoDi` all'import dello store:

```js
import { listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza, deleteFotoDi } from '../store.js';
```

In `openEdit` (righe ~143-205) sostituire la gestione foto manuale (`pending`, `file`, `existing`, e il loop upload nel `save`) con il componente riusabile:

```js
  // dentro openSheet, al posto di `const file = ...`, `pending`, `existing`:
  const foto = fotoEditor(ctx, { contesto: 'esperienza', refId: esp ? esp.id : null });
```

nel `save.onclick`, sostituire il loop `for (const f of pending) { ... uploadFoto ... }` con:

```js
        await foto.flush(id);
```

e nel layout finale (`add(s, ...)`) sostituire `mk('label','lbl','Foto'), file, existing,` con:

```js
      mk('label', 'lbl', 'Foto'), foto.el,
```

- [ ] **Step 4: Verifica manuale rapida nel browser**

Avviare `python -m http.server 5500`, aprire `http://localhost:5500`, login, aprire Calendario: le foto esistenti devono comparire (thumbs blur, vedi Task 7), e l'aggiunta di una foto a un'esperienza deve funzionare. (Verifica completa nello smoke, Task 12.)

- [ ] **Step 5: Commit**

```bash
git add js/modules/calendario.js test/esperienze.test.js
git commit -m "refactor(esperienze): usa la primitiva foto generica (contesto='esperienza')"
```

---

## Task 5: Logica buoni (funzioni pure)

**Files:**
- Modify: `js/lib/logic.js`
- Test: `test/buoni.test.js` (nuovo, sezione logica)

- [ ] **Step 1: Scrivere `test/buoni.test.js` (sezione logica, fallisce)**:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicaTransizioneBuono, gruppoBundle,
  buoniRicevuti, buoniInviati, richiesteDaConcedere, richiesteInviate,
} from '../js/lib/logic.js';

test('riscatta: attivo -> riscattato con timestamp', () => {
  const patch = applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'riscatta', () => '2026-05-26T10:00:00Z');
  assert.equal(patch.stato, 'riscattato');
  assert.equal(patch.riscattato_il, '2026-05-26T10:00:00Z');
});

test('riscatta non attivo -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'riscattato' }, 'riscatta'), /attivo/);
});

test('accetta richiesta in attesa -> regalo attivo', () => {
  const patch = applicaTransizioneBuono({ tipo: 'richiesta', stato: 'in_attesa' }, 'accetta');
  assert.equal(patch.tipo, 'regalo');
  assert.equal(patch.stato, 'attivo');
});

test('rifiuta richiesta in attesa -> rifiutato', () => {
  const patch = applicaTransizioneBuono({ tipo: 'richiesta', stato: 'in_attesa' }, 'rifiuta');
  assert.equal(patch.stato, 'rifiutato');
});

test('accetta un regalo -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'accetta'), /richiesta/);
});

test('azione sconosciuta -> errore', () => {
  assert.throws(() => applicaTransizioneBuono({ tipo: 'regalo', stato: 'attivo' }, 'boh'), /sconosciuta/);
});

test('gruppoBundle: singoli separati, stesso bundle_id raggruppato, ordine preservato', () => {
  const g = gruppoBundle([
    { id: '1', bundle_id: null },
    { id: '2', bundle_id: 'B' },
    { id: '3', bundle_id: 'B' },
    { id: '4', bundle_id: null },
  ]);
  assert.equal(g.length, 3);
  assert.equal(g[0].buoni.length, 1);
  assert.equal(g[1].bundle_id, 'B');
  assert.equal(g[1].buoni.length, 2);
  assert.equal(g[2].buoni.length, 1);
});

test('filtri viste buoni', () => {
  const me = 'me', tu = 'tu';
  const buoni = [
    { id: 'r1', tipo: 'regalo', stato: 'attivo', a_id: me, da_id: tu },       // ricevuto attivo
    { id: 'r2', tipo: 'regalo', stato: 'riscattato', a_id: me, da_id: tu },   // ricevuto riscattato
    { id: 'i1', tipo: 'regalo', stato: 'attivo', a_id: tu, da_id: me },       // inviato
    { id: 'q1', tipo: 'richiesta', stato: 'in_attesa', a_id: tu, da_id: me }, // da concedere (io = da_id)
    { id: 'q2', tipo: 'richiesta', stato: 'in_attesa', a_id: me, da_id: tu }, // inviata da me (io = a_id)
  ];
  assert.deepEqual(buoniRicevuti(buoni, me).map(b => b.id), ['r1', 'r2']);
  assert.deepEqual(buoniInviati(buoni, me).map(b => b.id), ['i1']);
  assert.deepEqual(richiesteDaConcedere(buoni, me).map(b => b.id), ['q1']);
  assert.deepEqual(richiesteInviate(buoni, me).map(b => b.id), ['q2']);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test test/buoni.test.js`
Expected: FAIL (funzioni non definite).

- [ ] **Step 3: Aggiungere in `js/lib/logic.js`** (in fondo):

```js
// ---- BUONI (pure) ----
// Ritorna la patch da applicare alla riga buono, o lancia se la transizione è illegale.
// `nowISO` iniettabile per i test.
export function applicaTransizioneBuono(buono, azione, nowISO = () => new Date().toISOString()) {
  if (azione === 'riscatta') {
    if (buono.stato !== 'attivo') throw new Error('Solo un buono attivo può essere riscattato');
    return { stato: 'riscattato', riscattato_il: nowISO() };
  }
  if (azione === 'accetta') {
    if (buono.tipo !== 'richiesta' || buono.stato !== 'in_attesa')
      throw new Error('Solo una richiesta in attesa può essere accettata');
    return { tipo: 'regalo', stato: 'attivo' };
  }
  if (azione === 'rifiuta') {
    if (buono.tipo !== 'richiesta' || buono.stato !== 'in_attesa')
      throw new Error('Solo una richiesta in attesa può essere rifiutata');
    return { stato: 'rifiutato' };
  }
  throw new Error('Azione sconosciuta: ' + azione);
}

// Raggruppa i buoni: i singoli (bundle_id null) restano gruppi da uno; quelli con
// stesso bundle_id finiscono insieme. Ordine di prima apparizione preservato.
export function gruppoBundle(buoni) {
  const groups = [];
  const byBundle = {};
  for (const b of buoni) {
    if (!b.bundle_id) { groups.push({ bundle_id: null, buoni: [b] }); continue; }
    if (!byBundle[b.bundle_id]) { byBundle[b.bundle_id] = { bundle_id: b.bundle_id, buoni: [] }; groups.push(byBundle[b.bundle_id]); }
    byBundle[b.bundle_id].buoni.push(b);
  }
  return groups;
}

export function buoniRicevuti(buoni, me) {
  return buoni.filter(b => b.a_id === me && b.tipo === 'regalo');
}
export function buoniInviati(buoni, me) {
  return buoni.filter(b => b.da_id === me && b.tipo === 'regalo');
}
export function richiesteDaConcedere(buoni, me) {
  return buoni.filter(b => b.tipo === 'richiesta' && b.stato === 'in_attesa' && b.da_id === me);
}
export function richiesteInviate(buoni, me) {
  return buoni.filter(b => b.tipo === 'richiesta' && b.stato === 'in_attesa' && b.a_id === me);
}
```

- [ ] **Step 4: Eseguire e verificare il passaggio**

Run: `node --test test/buoni.test.js`
Expected: PASS (8 test della sezione logica).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/buoni.test.js
git commit -m "feat(logic): transizioni buoni, gruppoBundle e filtri viste"
```

---

## Task 6: Store buoni

**Files:**
- Modify: `js/store.js`
- Test: `test/buoni.test.js` (aggiunge sezione store)

- [ ] **Step 1: Aggiungere i test store in `test/buoni.test.js`** (in fondo, con un fake client locale uguale a quello di `foto.test.js`; copiare la funzione `fakeClient` in cima al file se non già presente):

```js
import { listBuoni, addBuono, updateStatoBuono, deleteBuono } from '../js/store.js';

// (riusa la stessa fakeClient di foto.test.js — copiala qui se serve)

test('listBuoni filtra per couple_id e ordina per creato desc', async () => {
  const c = fakeClient({ buoni: [{ id: 'b1', couple_id: 'cpl' }, { id: 'b2', couple_id: 'altra' }] });
  const data = await listBuoni(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].order.col, 'creato');
});

test('addBuono regalo: default emoji e ritorna riga con id', async () => {
  const c = fakeClient();
  const row = await addBuono(c, { couple_id: 'cpl', da_id: 'me', a_id: 'tu', titolo: 'Massaggio', descrizione: '', tipo: 'regalo', stato: 'attivo' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.emoji, '🎟️');
  assert.equal(ins.payload.descrizione, null);
  assert.equal(ins.payload.tipo, 'regalo');
  assert.equal(ins.payload.bundle_id, null);
  assert.ok(row.id);
});

test('addBuono con bundle_id ed emoji custom', async () => {
  const c = fakeClient();
  await addBuono(c, { couple_id: 'cpl', da_id: 'me', a_id: 'tu', emoji: '🍷', titolo: 'Cena', tipo: 'regalo', stato: 'attivo', bundle_id: 'B1' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.emoji, '🍷');
  assert.equal(ins.payload.bundle_id, 'B1');
});

test('updateStatoBuono applica la patch per id', async () => {
  const c = fakeClient();
  await updateStatoBuono(c, 'b1', { stato: 'riscattato', riscattato_il: '2026-05-26T10:00:00Z' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.stato, 'riscattato');
  assert.equal(upd.filters.id, 'b1');
});

test('deleteBuono elimina per id', async () => {
  const c = fakeClient({ buoni: [{ id: 'b1' }] });
  await deleteBuono(c, 'b1');
  assert.equal(c._tables.buoni.length, 0);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test test/buoni.test.js`
Expected: FAIL (funzioni store buoni non definite).

- [ ] **Step 3: Aggiungere in `js/store.js`** (in fondo):

```js
// ---- BUONI ----
export async function listBuoni(client, coupleId) {
  const res = await client.from('buoni').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addBuono(client, { couple_id, da_id, a_id, emoji, titolo, descrizione, tipo, stato, bundle_id }) {
  const res = await client.from('buoni').insert({
    couple_id, da_id, a_id,
    emoji: emoji || '🎟️', titolo, descrizione: descrizione || null,
    tipo, stato, bundle_id: bundle_id || null,
  }).select().single();
  return check(res);
}

export async function updateStatoBuono(client, id, patch) {
  const res = await client.from('buoni').update(patch).eq('id', id);
  return check(res);
}

export async function deleteBuono(client, id) {
  const res = await client.from('buoni').delete().eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Eseguire e verificare il passaggio**

Run: `node --test`
Expected: PASS (tutta la suite verde).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/buoni.test.js
git commit -m "feat(store): CRUD buoni (list/add/updateStato/delete)"
```

---

## Task 7: Componente foto riusabile `js/modules/foto.js`

**Files:**
- Create: `js/modules/foto.js`

Espone tre cose: `fotoEditor(ctx, {contesto, refId})` (editor con upload differito), `loadThumbsInto(ctx, {contesto, refId}, container, withRemove)` e `openViewer(ctx, foto)` (vista grande). **Privacy UI:** le thumbs partono **sfocate** (classe `thumb-blur`) e si rivelano al tap; il viewer mostra la foto piena.

- [ ] **Step 1: Creare `js/modules/foto.js`**

```js
import { mk, add, toast, openSheet } from '../ui.js';
import { fotoPath } from '../lib/logic.js';
import { uploadFoto, listFoto, signedUrl, deleteFoto } from '../store.js';

// Editor riusabile. refId può essere null (genitore non ancora creato):
// le foto già esistenti si mostrano solo se refId è valorizzato; i nuovi file
// vengono caricati da flush(finalRefId) DOPO il salvataggio del genitore.
export function fotoEditor(ctx, { contesto, refId }) {
  const pending = [];
  const wrap = mk('div');
  const file = mk('input', 'file-row'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true;
  const thumbs = mk('div', 'thumbs');
  if (refId) loadThumbsInto(ctx, { contesto, refId }, thumbs, true).catch(err => toast('Errore foto: ' + err.message, 'err'));
  file.onchange = () => {
    for (const f of file.files) if (!pending.some(x => x.name === f.name && x.size === f.size)) pending.push(f);
    file.value = ''; toast(pending.length + ' foto pronte da caricare');
  };
  add(wrap, file, thumbs);
  async function flush(finalRefId) {
    for (const f of pending) {
      const path = fotoPath(ctx.me.couple_id, contesto, finalRefId, f.name);
      await uploadFoto(ctx.client, { coupleId: ctx.me.couple_id, autoreId: ctx.me.id, contesto, refId: finalRefId, file: f, path });
    }
    pending.length = 0;
  }
  return { el: wrap, flush };
}

// Carica le thumbnail via signed URL dentro `container`. withRemove=true mostra la ✕.
export async function loadThumbsInto(ctx, { contesto, refId }, container, withRemove) {
  const foto = await listFoto(ctx.client, { contesto, refId });
  for (const f of foto) {
    const url = await signedUrl(ctx.client, f.storage_path);
    container.appendChild(thumbEl(ctx, f, url, withRemove, container));
  }
}

// Thumb sfocata di default; tap = rivela/viewer. Riusata anche dalla Galleria.
export function thumbEl(ctx, foto, url, withRemove, container) {
  const wrap = mk('div', 'thumb thumb-blur');
  const img = mk('img'); img.src = url; img.alt = '';
  wrap.appendChild(img);
  let revealed = false;
  wrap.onclick = () => {
    if (!revealed) { wrap.classList.remove('thumb-blur'); revealed = true; }
    else openViewer(ctx, foto, url);
  };
  if (withRemove) {
    const rm = mk('button', 'rm', '✕');
    rm.onclick = async (e) => {
      e.stopPropagation();
      try { await deleteFoto(ctx.client, { id: foto.id, storagePath: foto.storage_path }); wrap.remove(); }
      catch (err) { toast('Errore rimozione foto: ' + err.message, 'err'); }
    };
    wrap.appendChild(rm);
  }
  return wrap;
}

// Vista grande in bottom sheet, con didascalia.
export function openViewer(ctx, foto, url) {
  openSheet('Foto', s => {
    const big = mk('div', 'viewer-big'); big.style.backgroundImage = `url("${url}")`;
    add(s, big);
    if (foto.didascalia) add(s, mk('p', 'viewer-cap', foto.didascalia));
  });
}
```

- [ ] **Step 2: Verifica manuale**

Avviare il server, aprire Calendario: le thumb delle esperienze devono comparire sfocate; primo tap le rivela; secondo tap apre il viewer. (Verifica completa nello smoke.)

- [ ] **Step 3: Commit**

```bash
git add js/modules/foto.js
git commit -m "feat(foto): componente riusabile (editor, thumbs blur, viewer)"
```

---

## Task 8: Modulo Buoni `js/modules/buoni.js`

**Files:**
- Create: `js/modules/buoni.js`

- [ ] **Step 1: Creare `js/modules/buoni.js`**

```js
import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  sortByRecent, applicaTransizioneBuono, gruppoBundle,
  buoniRicevuti, buoniInviati, richiesteDaConcedere, richiesteInviate,
} from '../lib/logic.js';
import { listBuoni, addBuono, updateStatoBuono, deleteBuono, listFoto, signedUrl, deleteFotoDi } from '../store.js';
import { fotoEditor, thumbEl } from './foto.js';

let ctx = null;
let rows = [];
let vista = 'ricevuti';
let wired = false;

const STATO_PILL = {
  attivo: 'ok', riscattato: '', in_attesa: 'wait', rifiutato: 'no',
};

export async function renderBuoni(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:buoni', () => openCrea()); wired = true; }
  try { rows = await listBuoni(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎟️ Buoni'),
         mk('p', 'psub', 'Regali, bundle e richieste — da riscattare quando vuoi.'));

  const me = ctx.me.id;
  const nDaConcedere = richiesteDaConcedere(rows, me).length;
  const filters = mk('div', 'filters');
  for (const [k, label] of [['ricevuti', 'Ricevuti'], ['inviati', 'Inviati'], ['richieste', 'Richieste']]) {
    const b = mk('button', vista === k ? 'on' : null, label);
    if (k === 'richieste' && nDaConcedere) add(b, mk('span', 'pill wait', ' ' + nDaConcedere));
    b.onclick = () => { vista = k; draw(); };
    filters.appendChild(b);
  }
  p.appendChild(filters);

  if (vista === 'ricevuti') drawRicevuti(p, me);
  else if (vista === 'inviati') drawInviati(p, me);
  else drawRichieste(p, me);
}

function drawRicevuti(p, me) {
  const list = sortByRecent(buoniRicevuti(rows, me));
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Nessun buono ricevuto.\nFatti regalare qualcosa 😏')); return; }
  for (const g of gruppoBundle(list)) p.appendChild(g.bundle_id ? bundleCard(g) : buonoCard(g.buoni[0], { redeem: true }));
}

function drawInviati(p, me) {
  const list = sortByRecent(buoniInviati(rows, me));
  if (!list.length) { p.appendChild(mk('div', 'empty', 'Non hai ancora inviato buoni.\nTocca ＋ per crearne uno.')); return; }
  for (const g of gruppoBundle(list)) p.appendChild(g.bundle_id ? bundleCard(g) : buonoCard(g.buoni[0], { canDelete: true }));
}

function drawRichieste(p, me) {
  const daConcedere = sortByRecent(richiesteDaConcedere(rows, me));
  const inviate = sortByRecent(richiesteInviate(rows, me));
  if (!daConcedere.length && !inviate.length) { p.appendChild(mk('div', 'empty', 'Nessuna richiesta in sospeso.')); return; }
  if (daConcedere.length) {
    add(p, mk('div', 'section-label', 'Ti hanno chiesto'));
    for (const b of daConcedere) p.appendChild(buonoCard(b, { grant: true }));
  }
  if (inviate.length) {
    add(p, mk('div', 'section-label', 'In attesa di risposta'));
    for (const b of inviate) p.appendChild(buonoCard(b, {}));
  }
}

function buonoCard(b, opts) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  const left = mk('div', 'row');
  add(left, mk('span', 'bemoji', b.emoji), mk('p', 'btitle', b.titolo));
  add(top, left, mk('span', 'pill ' + (STATO_PILL[b.stato] || ''), b.stato.replace('_', ' ')));
  c.appendChild(top);
  if (b.descrizione) c.appendChild(mk('p', 'bdesc', b.descrizione));

  const thumbs = mk('div', 'thumbs'); c.appendChild(thumbs);
  loadBuonoThumbs(b.id, thumbs);

  const act = mk('div', 'actions');
  if (opts.redeem && b.stato === 'attivo') act.appendChild(azione('Riscatta 🔓', 'gold', () => transizione(b, 'riscatta')));
  if (opts.grant) {
    act.appendChild(azione('Accetta', 'gold', () => transizione(b, 'accetta')));
    act.appendChild(azione('Rifiuta', 'ghost', () => transizione(b, 'rifiuta')));
  }
  if (opts.canDelete) act.appendChild(azione('Elimina', 'ghost', () => elimina(b)));
  if (act.children.length) c.appendChild(act);
  return c;
}

function bundleCard(g) {
  const c = mk('div', 'card'); c.style.borderColor = 'rgba(212,168,108,.45)';
  const top = mk('div', 'row spread');
  add(top, mk('span', 'pill', '🎁 Bundle · ' + g.buoni.length + ' buoni'),
           mk('span', 'pill ' + (STATO_PILL[g.buoni[0].stato] || ''), g.buoni[0].stato.replace('_', ' ')));
  c.appendChild(top);
  const emojis = mk('div', 'row'); emojis.style.cssText = 'gap:12px;margin-top:10px;font-size:22px;';
  for (const b of g.buoni) emojis.appendChild(mk('span', null, b.emoji));
  c.appendChild(emojis);
  const open = azione('Apri bundle', '', () => openBundle(g));
  const act = mk('div', 'actions'); act.appendChild(open); c.appendChild(act);
  return c;
}

function openBundle(g) {
  openSheet('Bundle · ' + g.buoni.length + ' buoni', s => {
    for (const b of g.buoni) {
      const row = mk('div', 'card');
      const r = mk('div', 'row'); add(r, mk('span', 'bemoji', b.emoji), mk('p', 'btitle', b.titolo));
      row.appendChild(r);
      if (b.descrizione) row.appendChild(mk('p', 'bdesc', b.descrizione));
      if (b.stato === 'attivo') {
        const a = mk('div', 'actions'); a.appendChild(azione('Riscatta 🔓', 'gold sm', () => transizione(b, 'riscatta'))); row.appendChild(a);
      }
      s.appendChild(row);
    }
  });
}

function azione(label, kind, fn) {
  const b = mk('button', 'btn sm' + (kind ? ' ' + kind : ''), label);
  b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { b.disabled = false; toast('Errore: ' + err.message, 'err'); } };
  return b;
}

async function transizione(b, azioneNome) {
  const patch = applicaTransizioneBuono(b, azioneNome);  // lancia se illegale
  await updateStatoBuono(ctx.client, b.id, patch);
  await renderBuoni(ctx);
}

async function elimina(b) {
  await deleteFotoDi(ctx.client, { contesto: 'buono', refId: b.id });
  await deleteBuono(ctx.client, b.id);
  await renderBuoni(ctx);
}

async function loadBuonoThumbs(buonoId, container) {
  try {
    const foto = await listFoto(ctx.client, { contesto: 'buono', refId: buonoId });
    for (const f of foto) {
      const url = await signedUrl(ctx.client, f.storage_path);
      container.appendChild(thumbEl(ctx, f, url, false, container));
    }
  } catch { /* nelle card non disturbo: il viewer/foto reali si vedono in dettaglio */ }
}

// --- creazione ---
function openCrea() {
  let tipo = 'regalo';      // 'regalo' | 'richiesta' | 'bundle'
  openSheet('Nuovo buono', s => {
    const tabs = mk('div', 'filters');
    const voci = [['regalo', '🎁 Regalo'], ['richiesta', '🙏 Richiesta'], ['bundle', '📦 Bundle']];
    const btns = [];
    for (const [k, label] of voci) {
      const b = mk('button', tipo === k ? 'on' : null, label);
      b.onclick = () => { tipo = k; btns.forEach(x => x.classList.toggle('on', x.dataset.k === k)); bundleExtra.style.display = (k === 'bundle') ? '' : 'none'; foto.el.style.display = (k === 'bundle') ? 'none' : ''; };
      b.dataset.k = k; btns.push(b); tabs.appendChild(b);
    }

    const emoji = mk('input'); emoji.value = '🎟️'; emoji.style.cssText = 'width:64px;text-align:center;display:inline-block;';
    const titolo = mk('input'); titolo.placeholder = 'Titolo (es. Massaggio)';
    const descr = mk('textarea'); descr.placeholder = 'Descrizione (facoltativa)';
    const didascalia = mk('input'); didascalia.placeholder = 'Didascalia foto (facoltativa)';

    // editor foto (solo per regalo/richiesta singoli; refId null → upload dopo create)
    const foto = fotoEditor(ctx, { contesto: 'buono', refId: null });

    // extra bundle: righe titolo+emoji multiple
    const bundleExtra = mk('div'); bundleExtra.style.display = 'none';
    const righe = [];
    function addRiga() {
      const r = mk('div', 'row'); r.style.gap = '8px';
      const e = mk('input'); e.value = '🎟️'; e.style.cssText = 'width:56px;text-align:center;';
      const t = mk('input'); t.placeholder = 'Titolo buono'; t.style.flex = '1';
      add(r, e, t); righe.push({ e, t }); bundleExtra.appendChild(r);
    }
    addRiga(); addRiga();
    const piu = mk('button', 'btn ghost sm', '＋ aggiungi buono'); piu.onclick = addRiga; bundleExtra.appendChild(piu);

    const save = mk('button', 'btn gold', 'Crea'); save.style.cssText = 'width:100%;margin-top:14px;';
    save.onclick = async () => {
      save.disabled = true;
      try {
        const me = ctx.me.id, partner = await partnerId();
        if (tipo === 'bundle') {
          const items = righe.filter(r => r.t.value.trim());
          if (!items.length) { toast('Aggiungi almeno un buono al bundle', 'err'); save.disabled = false; return; }
          const bundleId = crypto.randomUUID();
          for (const r of items) {
            await addBuono(ctx.client, { couple_id: ctx.me.couple_id, da_id: me, a_id: partner, emoji: r.e.value || '🎟️', titolo: r.t.value.trim(), tipo: 'regalo', stato: 'attivo', bundle_id: bundleId });
          }
        } else {
          if (!titolo.value.trim()) { toast('Il titolo è obbligatorio', 'err'); save.disabled = false; return; }
          const isReq = tipo === 'richiesta';
          const row = await addBuono(ctx.client, {
            couple_id: ctx.me.couple_id,
            da_id: isReq ? partner : me,        // richiesta: il partner deve concedere
            a_id: isReq ? me : partner,         // richiesta: il titolare futuro sono io
            emoji: emoji.value || '🎟️', titolo: titolo.value.trim(), descrizione: descr.value.trim(),
            tipo: isReq ? 'richiesta' : 'regalo', stato: isReq ? 'in_attesa' : 'attivo',
          });
          // didascalia → applicata caricando le foto (semplice: la prima foto la usa)
          await foto.flush(row.id);
        }
        s.closest('.modal').remove();
        await renderBuoni(ctx);
      } catch (err) { save.disabled = false; toast('Errore: ' + err.message, 'err'); }
    };

    const riga = mk('div', 'row'); riga.style.gap = '8px'; add(riga, emoji, titolo);
    add(s,
      mk('label', 'lbl', 'Tipo'), tabs,
      mk('label', 'lbl', 'Emoji + Titolo'), riga,
      mk('label', 'lbl', 'Descrizione'), descr,
      mk('label', 'lbl', 'Foto (facoltativa)'), foto.el,
      bundleExtra,
      save);
  });
}

async function partnerId() {
  // il partner è l'altro membro della coppia. couples ha membro_a/membro_b.
  const { data, error } = await ctx.client.from('couples').select('membro_a,membro_b').eq('id', ctx.me.couple_id).single();
  if (error) throw new Error(error.message);
  return data.membro_a === ctx.me.id ? data.membro_b : data.membro_a;
}
```

- [ ] **Step 2: Verifica manuale rapida** — server attivo, tab Buoni, FAB ＋: la form si apre con ordine Tipo → Emoji+Titolo → Descrizione → Foto → (bundle: righe extra) → Crea; cambiando tipo a "Bundle" compaiono le righe extra e sparisce l'editor foto.

- [ ] **Step 3: Commit**

```bash
git add js/modules/buoni.js
git commit -m "feat(buoni): modulo con 3 viste, regalo/bundle/richiesta e foto allegate"
```

---

## Task 9: Modulo Galleria `js/modules/galleria.js`

**Files:**
- Create: `js/modules/galleria.js`

- [ ] **Step 1: Creare `js/modules/galleria.js`**

```js
import { mk, add, clear, toast } from '../ui.js';
import { listFotoGalleria, signedUrl } from '../store.js';

let ctx = null;
let foto = [];
let filtro = 'tutte'; // 'tutte' | 'esperienza' | 'buono' | 'mie'

// Da contesto della foto → chiave del tab di destinazione per "vai all'origine".
const CTX_TAB = { esperienza: 'calendario', buono: 'buoni' };
const CTX_LABEL = { esperienza: 'alle Esperienze', buono: 'ai Buoni' };

export async function renderGalleria(context) {
  ctx = context;
  try { foto = await listFotoGalleria(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore caricamento: ' + err.message, 'err'); foto = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🖼️ Galleria'),
         mk('p', 'psub', 'Tutte le vostre foto, raccolte. Solo voi due le vedete.'));

  const filters = mk('div', 'filters');
  for (const [k, label] of [['tutte', 'Tutte'], ['esperienza', '📅 Esperienze'], ['buono', '🎟️ Buoni'], ['mie', '👤 Mie']]) {
    const b = mk('button', filtro === k ? 'on' : null, label);
    b.onclick = () => { filtro = k; draw(); };
    filters.appendChild(b);
  }
  p.appendChild(filters);

  // slot del viewer inline (riempito al secondo tap su una tile)
  const viewerSlot = mk('div', 'gviewer-slot'); p.appendChild(viewerSlot);

  let visibili = foto;
  if (filtro === 'mie') visibili = foto.filter(f => f.autore_id === ctx.me.id);
  else if (filtro !== 'tutte') visibili = foto.filter(f => f.contesto === filtro);

  if (!visibili.length) { p.appendChild(mk('div', 'empty', 'Ancora nessuna foto qui.')); return; }

  const grid = mk('div', 'gallery'); p.appendChild(grid);
  for (const f of visibili) grid.appendChild(gTile(f, viewerSlot));
}

function gTile(f, viewerSlot) {
  const tile = mk('div', 'gtile thumb-blur');
  const img = mk('img'); img.alt = ''; tile.appendChild(img);
  add(tile, mk('span', 'gtag', f.contesto));
  signedUrl(ctx.client, f.storage_path).then(url => { img.src = url; tile._url = url; })
    .catch(err => toast('Errore foto: ' + err.message, 'err'));
  let revealed = false;
  tile.onclick = () => {
    if (!revealed) { tile.classList.remove('thumb-blur'); revealed = true; }
    else if (tile._url) showInlineViewer(viewerSlot, f, tile._url);
  };
  return tile;
}

// Viewer INLINE (non modale): foto grande + didascalia + "↩ vai all'origine".
function showInlineViewer(slot, f, url) {
  clear(slot);
  const big = mk('div', 'viewer-big'); big.style.backgroundImage = `url("${url}")`;
  slot.appendChild(big);
  if (f.didascalia) slot.appendChild(mk('p', 'viewer-cap', f.didascalia));
  const origin = mk('button', 'gorigin', '↩ Vai ' + (CTX_LABEL[f.contesto] || ''));
  origin.onclick = () => document.dispatchEvent(new CustomEvent('goto', { detail: CTX_TAB[f.contesto] }));
  slot.appendChild(origin);
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/modules/galleria.js
git commit -m "feat(galleria): griglia foto con filtri contesto/autore e viewer"
```

---

## Task 10: Wiring app shell (tab + panel)

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

- [ ] **Step 1: Aggiungere i panel in `index.html`** — dentro `<div class="wrap" id="app">`, dopo `<section class="panel" id="p-calendario"></section>`:

```html
    <section class="panel" id="p-buoni"></section>
    <section class="panel" id="p-galleria"></section>
```

- [ ] **Step 2: Aggiornare `js/app.js`** — import e TABS:

```js
import { renderDesideri } from './modules/desideri.js';
import { renderCalendario } from './modules/calendario.js';
import { renderBuoni } from './modules/buoni.js';
import { renderGalleria } from './modules/galleria.js';

const TABS = [
  ['desideri', '🔥', 'Desideri'],
  ['calendario', '📅', 'Esperienze'],
  ['buoni', '🎟️', 'Buoni'],
  ['galleria', '🖼️', 'Galleria'],
];
```

e in `render()` aggiungere i rami:

```js
function render() {
  if (cur === 'desideri') renderDesideri({ client, me, panel: $('p-desideri') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'calendario') renderCalendario({ client, me, panel: $('p-calendario') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'buoni') renderBuoni({ client, me, panel: $('p-buoni') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'galleria') renderGalleria({ client, me, panel: $('p-galleria') }).catch(err => toast('Errore: ' + err.message, 'err'));
}
```

(Il FAB già delega via `fab:<cur>`: Buoni ascolta `fab:buoni`; Galleria non usa il FAB — va bene che non faccia nulla lì.)

Aggiungere inoltre, a livello top (vicino a `$('fab').onclick = ...`), il listener per "vai all'origine" dalla Galleria:

```js
// la Galleria chiede di navigare alla sezione d'origine di una foto
document.addEventListener('goto', e => go(e.detail));
```

- [ ] **Step 3: Verifica manuale** — server attivo, login: compaiono i tab 🎟️ Buoni e 🖼️ Galleria, cliccandoli si aprono i pannelli senza errori in console. Dalla Galleria, "↩ Vai…" porta alla sezione giusta.

- [ ] **Step 4: Commit**

```bash
git add index.html js/app.js
git commit -m "feat(app): registra tab e panel Buoni e Galleria"
```

---

## Task 11: Stili Buoni + Galleria + blur foto

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Aggiungere in fondo a `styles.css`**

```css
/* ===== Buoni ===== */
.bemoji{font-size:30px;line-height:1;}
.btitle{font-size:18px;margin:0;}
.bdesc{font-size:13px;color:#d9b9a6;margin:7px 0 0;line-height:1.5;}
.actions{display:flex;gap:8px;margin-top:13px;flex-wrap:wrap;}
.pill.ok{color:var(--ok);border-color:rgba(127,176,105,.5);background:rgba(127,176,105,.12);}
.pill.wait{color:var(--gold-soft);border-color:rgba(212,168,108,.5);background:rgba(212,168,108,.1);}
.pill.no{color:var(--err);border-color:rgba(224,85,106,.5);background:rgba(224,85,106,.1);}

/* ===== Galleria ===== */
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}
.gtile{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;
  border:1px solid rgba(212,168,108,.2);cursor:pointer;background:rgba(255,255,255,.03);}
.gtile img{width:100%;height:100%;object-fit:cover;display:block;}
.gtag{position:absolute;left:5px;bottom:5px;font-family:Arial;font-size:9px;letter-spacing:.05em;
  text-transform:uppercase;background:rgba(8,2,5,.66);color:var(--gold-soft);padding:2px 6px;border-radius:6px;}

/* ===== Foto: blur privacy di default + viewer ===== */
.thumb-blur img{filter:blur(9px) saturate(1.05);}
.thumb-blur::after{content:'🔒';position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;font-size:18px;pointer-events:none;}
.gtile.thumb-blur::after{content:'🔒';position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;font-size:20px;pointer-events:none;}
.viewer-big{width:100%;aspect-ratio:3/4;background-size:cover;background-position:center;border-radius:14px;}
.viewer-cap{font-family:Arial,sans-serif;font-size:13px;color:var(--cream);margin:10px 2px 0;}

/* viewer inline della Galleria */
.gviewer-slot{margin:6px 0 14px;}
.gviewer-slot:empty{display:none;}
.gorigin{display:inline-block;margin-top:10px;font-family:Arial,sans-serif;font-size:12px;
  color:var(--gold-soft);background:transparent;border:1px solid rgba(212,168,108,.4);
  border-radius:999px;padding:7px 13px;cursor:pointer;min-height:38px;}
```

> Nota: `.thumb` ha già `position:relative` in `styles.css`; per `::after` su `.thumb-blur` assicurarsi che `.thumb` resti `position:relative` (lo è).

- [ ] **Step 2: Verifica manuale** — le thumb appaiono sfocate con lucchetto; Buoni mostra pill colorate per stato; Galleria a 3 colonne.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: buoni (pill stato), galleria (grid) e blur privacy thumbs"
```

---

## Task 12: Smoke test Playwright + drop tabella vecchia + verifica finale

**Files:**
- Modify: `test/smoke.md` (registrare l'esito Fase 3)

- [ ] **Step 1: Eseguire l'intera suite unit**

Run: `node --test`
Expected: tutti i file verdi (logic, store, foto, buoni, esperienze, calendario). Annotare numero test/pass/fail.

- [ ] **Step 2: Smoke test in browser vero (Playwright MCP)** — server `python -m http.server 5500`, viewport mobile (≈390×844). Eseguire e osservare:
  - Login con l'account di test.
  - **Buoni › Regalo**: crea un regalo con titolo + 1 foto → compare in *Ricevuti* del partner come `attivo`; la thumb è sfocata, tap la rivela, secondo tap apre il viewer.
  - **Buoni › Bundle**: crea un bundle di 2 buoni → compare come card "🎁 Bundle · 2".
  - **Buoni › Richiesta**: crea una richiesta → compare in *Richieste* (sezione giusta); l'altro account **accetta** una richiesta (→ diventa regalo attivo) e **rifiuta** un'altra (→ rifiutato).
  - **Riscatta** un regalo attivo → passa a `riscattato`.
  - **Galleria**: la foto del buono e quelle delle esperienze compaiono; filtro `Buoni`/`Esperienze`/`Mie` funziona; tap → reveal → viewer con didascalia.
  - **Esperienze (regressione)**: foto ancora visibili dopo il refactor; aggiunta nuova foto OK.
  - **Privacy**: copiare un signed URL, aprirlo in scheda anonima dopo scadenza/senza auth → niente immagine (atteso 400). In alternativa verificare che il path non sia pubblico.
  - **Reload**: dopo refresh i dati persistono; layout mobile corretto.

- [ ] **Step 3: Correggere eventuali difetti emersi**, ri-eseguire `node --test` e ripetere lo smoke finché verde. (Usare systematic-debugging in caso di bug.)

- [ ] **Step 4: Far droppare la tabella vecchia** — solo DOPO che lo smoke è verde e le foto delle esperienze si vedono dalla tabella `foto`. Chiedere all'utente di eseguire nel SQL Editor:

```sql
-- Solo dopo smoke verde: rimuove le policy storage residue? NO. Droppa solo la tabella vecchia.
drop table if exists esperienza_foto;
```

- [ ] **Step 5: Registrare l'esito in `test/smoke.md`** — aggiungere una sezione "Fase 3" con data, scenari eseguiti ed esito (come per la Fase 2).

- [ ] **Step 6: Commit finale**

```bash
git add test/smoke.md
git commit -m "test: smoke Fase 3 superato (buoni, foto generiche, galleria)"
```

---

## Note di esecuzione

- **Ordine vincolante**: Task 1 (SQL) prima di tutto (la tabella deve esistere); Task 3/4 prima di toccare i moduli che usano le foto; il **drop** di `esperienza_foto` (Task 12) è l'**ultimo** passo, mai prima dello smoke.
- **Niente fallimenti silenziosi**: ogni `catch` mostra un toast; le funzioni store lanciano via `check`.
- **Sicurezza invariata**: nessuna modifica a `storage.sql`; il bucket resta privato e l'accesso passa sempre da signed URL + RLS legate al `couple_id`.
