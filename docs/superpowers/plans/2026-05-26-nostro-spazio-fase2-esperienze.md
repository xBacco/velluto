# Nostro Spazio — Fase 2: Esperienze + Calendario + Foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il modulo 📅 **Calendario & esperienze**: diario delle esperienze con vista calendario mensile + timeline, voto a fiamme (0–5) e foto multiple su **Supabase Storage privato** (servite via signed URL).

**Architecture:** Stessa struttura della Fase 1 — frontend statico HTML/CSS/JS vanilla, `@supabase/supabase-js` da CDN. Logica pura (griglia calendario, raggruppamenti, fiamme, path foto) in `js/lib/logic.js`, testata con `node --test`. Accesso dati in `js/store.js` con client Supabase **iniettabile** (testato con client finto, incluso un mock di Storage). UI con helper DOM **senza `innerHTML`**. Le tabelle `esperienze`/`esperienza_foto` esistono già (create nello schema in Fase 1); qui si aggiungono il **bucket Storage `foto` privato** + le policy.

**Tech Stack:** HTML5, CSS3 (mobile-first), JavaScript ES modules, Supabase (Postgres + RLS + Storage privato + signed URL), Node test runner (`node --test`), Playwright per lo smoke test.

---

## File Structure

```
nostro-spazio/
├── index.html                    # MODIFICA: aggiungere <section id="p-calendario">
├── styles.css                    # MODIFICA: stili calendario, fiamme, thumbnails
├── supabase/
│   └── storage.sql               # NUOVO: policy Storage bucket 'foto' (eseguito in dashboard)
├── js/
│   ├── store.js                  # MODIFICA: CRUD esperienze + wrapper foto (upload/list/signed/delete)
│   ├── app.js                    # MODIFICA: TAB 'calendario' + branch render
│   ├── lib/
│   │   └── logic.js              # MODIFICA: monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath
│   └── modules/
│       └── calendario.js         # NUOVO: UI modulo Esperienze (calendario + timeline + sheet add/edit + foto)
└── test/
    ├── calendario.test.js        # NUOVO: unit test funzioni pure calendario
    └── esperienze.test.js        # NUOVO: unit test store esperienze + foto (client finto con storage)
```

**Responsabilità:**
- `lib/logic.js`: pura, nessun I/O. Calcolo griglia mese, etichette, raggruppamenti, fiamme, costruzione path foto deterministica (con `now` iniettabile).
- `store.js`: parla con Supabase (DB + Storage); ogni funzione riceve `client` come primo argomento. Nessuna logica di UI.
- `modules/calendario.js`: solo orchestrazione UI/DOM, riusa gli helper di `ui.js`.
- `supabase/storage.sql`: policy Storage versionate (eseguite a mano in dashboard, come `schema.sql`).

---

## Prerequisiti — Setup Supabase Storage (l'utente esegue, l'agente guida)

> Le tabelle `esperienze` e `esperienza_foto` esistono già (Fase 1). Qui serve solo lo Storage. Eseguire PRIMA della Task 6 (smoke test). Spuntare quando fatto.

- [ ] **P1. Creare il bucket privato `foto`.** Dashboard Supabase → **Storage** → **New bucket**: nome esatto `foto`, **Public bucket = OFF** (privato). Salva.

- [ ] **P2. Applicare le policy Storage** eseguendo `supabase/storage.sql` (scritto in Task 0) nel **SQL Editor**. Atteso: "Success. No rows returned". *Nota: per `create policy` su `storage.objects` può comparire l'avviso "Potential issue detected"; è un falso positivo — clicca "Run and enable RLS".*

---

## Task 0: Policy Storage (file SQL versionato)

**Files:**
- Create: `nostro-spazio/supabase/storage.sql`

- [ ] **Step 1: Creare `supabase/storage.sql`**

Le foto vivono nel bucket privato `foto` con path `'<couple_id>/<esperienza_id>/<file>'`. La prima cartella del path è il `couple_id`: le policy concedono accesso solo se l'utente loggato è membro di quella coppia, riusando la funzione `is_member()` già definita in `schema.sql`.

```sql
-- ============ NOSTRO SPAZIO — Storage policies (bucket privato 'foto') ============
-- Prerequisito: bucket 'foto' creato come PRIVATO (Storage → New bucket).
-- Path foto = '<couple_id>/<esperienza_id>/<filename>'. La 1a cartella è il couple_id.
-- Riusa is_member(uuid) definita in schema.sql. RLS su storage.objects è già attiva.

create policy "foto_sel" on storage.objects for select
  using ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );

create policy "foto_ins" on storage.objects for insert
  with check ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );

create policy "foto_del" on storage.objects for delete
  using ( bucket_id = 'foto' and is_member( ((storage.foldername(name))[1])::uuid ) );
```

- [ ] **Step 2: Commit**

```bash
cd nostro-spazio
git add supabase/storage.sql
git commit -m "feat(db): policy Storage bucket privato foto (accesso per coppia)"
```

> L'esecuzione effettiva in dashboard è il prerequisito P2 (dopo aver creato il bucket P1).

---

## Task 1: Logica pura — calendario, fiamme, path foto (TDD)

**Files:**
- Modify: `nostro-spazio/js/lib/logic.js`
- Test: `nostro-spazio/test/calendario.test.js`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `test/calendario.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath } from '../js/lib/logic.js';

test('monthMatrix gennaio 2026: 5 settimane, giorno 1 al posto giovedì (lun-dom)', () => {
  const w = monthMatrix(2026, 0); // 0 = gennaio
  assert.equal(w.length, 5);
  assert.equal(w[0][0], null);              // lun vuoto
  assert.equal(w[0][1], null);              // mar vuoto
  assert.equal(w[0][2], null);              // mer vuoto
  assert.equal(w[0][3].day, 1);             // gio = 1 gennaio
  assert.equal(w[0][3].iso, '2026-01-01');
});

test('monthMatrix conta tutti i giorni del mese', () => {
  const days = monthMatrix(2026, 0).flat().filter(Boolean);
  assert.equal(days.length, 31);
  assert.equal(days[days.length - 1].iso, '2026-01-31');
});

test('monthLabel in italiano', () => {
  assert.equal(monthLabel(2026, 0), 'Gennaio 2026');
  assert.equal(monthLabel(2026, 4), 'Maggio 2026');
});

test('groupByDay raggruppa per data', () => {
  const g = groupByDay([
    { id: 'a', data: '2026-05-01' },
    { id: 'b', data: '2026-05-01' },
    { id: 'c', data: '2026-05-03' },
  ]);
  assert.equal(g['2026-05-01'].length, 2);
  assert.equal(g['2026-05-03'].length, 1);
  assert.equal(g['2026-05-02'], undefined);
});

test('sortByDateDesc ordina dalla data più recente, senza mutare', () => {
  const src = [{ id: 'a', data: '2026-01-01' }, { id: 'b', data: '2026-03-01' }, { id: 'c', data: '2026-02-01' }];
  const copy = [...src];
  const out = sortByDateDesc(src);
  assert.deepEqual(out.map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(src, copy);
});

test('fiammeLabel: voto -> 5 simboli', () => {
  assert.equal(fiammeLabel(0), '🤍🤍🤍🤍🤍');
  assert.equal(fiammeLabel(3), '🔥🔥🔥🤍🤍');
  assert.equal(fiammeLabel(5), '🔥🔥🔥🔥🔥');
  assert.equal(fiammeLabel(9), '🔥🔥🔥🔥🔥'); // clamp
});

test('fotoPath: <couple>/<esp>/<now>-<file sanificato>', () => {
  const p = fotoPath('cpl', 'esp', 'La mia foto!.JPG', 1700000000000);
  assert.equal(p, 'cpl/esp/1700000000000-La_mia_foto_.JPG');
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `cd nostro-spazio && node --test`
Atteso: FAIL — export mancanti (`monthMatrix` ecc. non definite).

- [ ] **Step 3: Aggiungere le funzioni a `js/lib/logic.js`**

Aggiungi in fondo a `js/lib/logic.js` (lasciando intatte `sortByRecent`/`filterDesideri`):

```js
// ---- CALENDARIO / ESPERIENZE (pure) ----

// Griglia del mese come array di settimane (lun→dom). Ogni cella: {day,iso} oppure null.
export function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // lun=0 … dom=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(year, month) {
  const nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${nomi[month]} ${year}`;
}

export function groupByDay(rows) {
  const m = {};
  for (const r of rows) (m[r.data] ||= []).push(r);
  return m;
}

export function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

export function fiammeLabel(voto) {
  const v = Math.max(0, Math.min(5, voto | 0));
  return '🔥'.repeat(v) + '🤍'.repeat(5 - v);
}

// Path deterministico nel bucket 'foto'. `now` iniettabile per i test.
export function fotoPath(coupleId, esperienzaId, filename, now = Date.now()) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${coupleId}/${esperienzaId}/${now}-${safe}`;
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `cd nostro-spazio && node --test`
Atteso: PASS — i 7 nuovi test verdi (più i 12 della Fase 1).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/calendario.test.js
git commit -m "feat(logic): calendario, fiamme e path foto + test"
```

---

## Task 2: Store — CRUD esperienze + wrapper foto (TDD)

**Files:**
- Modify: `nostro-spazio/js/store.js`
- Test: `nostro-spazio/test/esperienze.test.js`

> Il client finto qui imita sia il query builder (con `.single()`) sia lo Storage (`client.storage.from(bucket).upload/createSignedUrl/remove`).

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `test/esperienze.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza,
  uploadFoto, listFotoRows, signedUrl, deleteFoto,
} from '../js/store.js';

// --- fake client: query builder (con single) + storage ---
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
          rows.push(created);
          resolve({ data: state.single ? created : [created], error: null });
        } else {
          resolve({ data: null, error: null });
        }
      },
    };
    return api;
  }
  const storage = {
    ops: [],
    from(bucket) {
      return {
        upload: async (path, file) => { storage.ops.push({ op: 'upload', bucket, path, file }); return { data: { path }, error: null }; },
        createSignedUrl: async (path, exp) => { storage.ops.push({ op: 'sign', bucket, path, exp }); return { data: { signedUrl: 'https://signed/' + path + '?e=' + exp }, error: null }; },
        remove: async (paths) => { storage.ops.push({ op: 'remove', bucket, paths }); return { data: {}, error: null }; },
      };
    },
  };
  return { from: builder, storage, _calls: calls, _tables: tables, _storage: storage };
}

test('listEsperienze filtra per couple_id e ordina per data', async () => {
  const c = fakeClient({ esperienze: [{ id: 'a', couple_id: 'cpl', data: '2026-05-01' }] });
  const data = await listEsperienze(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].table, 'esperienze');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
  assert.equal(c._calls[0].order.col, 'data');
});

test('addEsperienza inserisce con voto default e ritorna la riga con id', async () => {
  const c = fakeClient();
  const row = await addEsperienza(c, { couple_id: 'cpl', autore_id: 'u1', titolo: 'Serata', testo: '', data: '2026-05-26' });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.voto, 0);
  assert.equal(ins.payload.testo, null);     // stringa vuota -> null
  assert.equal(ins.payload.titolo, 'Serata');
  assert.ok(row.id);                          // id restituito per le foto
});

test('updateEsperienza aggiorna campi e filtra per id', async () => {
  const c = fakeClient();
  await updateEsperienza(c, 'e1', { titolo: 'X', testo: 'ok', data: '2026-05-26', voto: 4 });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.voto, 4);
  assert.equal(upd.payload.titolo, 'X');
  assert.equal(upd.filters.id, 'e1');
});

test('deleteEsperienza elimina per id', async () => {
  const c = fakeClient();
  await deleteEsperienza(c, 'e1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'e1');
});

test('listFotoRows filtra per esperienza_id', async () => {
  const c = fakeClient({ esperienza_foto: [{ id: 'f1', esperienza_id: 'e1', storage_path: 'cpl/e1/x.jpg' }] });
  const data = await listFotoRows(c, 'e1');
  assert.equal(data.length, 1);
  assert.equal(c._calls[0].filters.esperienza_id, 'e1');
});

test('uploadFoto carica su storage e registra la riga', async () => {
  const c = fakeClient();
  const fileLike = { name: 'foto.jpg' };
  const row = await uploadFoto(c, { coupleId: 'cpl', esperienzaId: 'e1', file: fileLike, path: 'cpl/e1/123-foto.jpg' });
  const up = c._storage.ops.find(o => o.op === 'upload');
  assert.equal(up.bucket, 'foto');
  assert.equal(up.path, 'cpl/e1/123-foto.jpg');
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.storage_path, 'cpl/e1/123-foto.jpg');
  assert.equal(ins.payload.esperienza_id, 'e1');
  assert.ok(row.id);
});

test('signedUrl ritorna l’URL firmato', async () => {
  const c = fakeClient();
  const url = await signedUrl(c, 'cpl/e1/x.jpg', 3600);
  assert.equal(url, 'https://signed/cpl/e1/x.jpg?e=3600');
});

test('deleteFoto rimuove dallo storage e cancella la riga', async () => {
  const c = fakeClient();
  await deleteFoto(c, { id: 'f1', storagePath: 'cpl/e1/x.jpg' });
  const rm = c._storage.ops.find(o => o.op === 'remove');
  assert.deepEqual(rm.paths, ['cpl/e1/x.jpg']);
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'f1');
});

test('addEsperienza propaga errore', async () => {
  const bad = { from: () => ({ insert() { return this; }, select() { return this; },
    single() { return this; }, then(r) { r({ data: null, error: { message: 'boom' } }); } }) };
  await assert.rejects(() => addEsperienza(bad, { couple_id: 'c', autore_id: 'u', titolo: 't', testo: '', data: '2026-05-26' }), /boom/);
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `cd nostro-spazio && node --test`
Atteso: FAIL — export mancanti (`listEsperienze` ecc.).

- [ ] **Step 3: Aggiungere le funzioni a `js/store.js`**

Aggiungi in fondo a `js/store.js` (lasciando intatta la sezione DESIDERI e l'helper `check`):

```js
// ---- ESPERIENZE ----
export async function listEsperienze(client, coupleId) {
  const res = await client.from('esperienze').select('*').eq('couple_id', coupleId).order('data', { ascending: false });
  return check(res);
}

export async function addEsperienza(client, { couple_id, autore_id, titolo, testo, data, voto }) {
  const res = await client.from('esperienze').insert({
    couple_id, autore_id, titolo, testo: testo || null, data, voto: voto ?? 0,
  }).select().single();
  return check(res);
}

export async function updateEsperienza(client, id, { titolo, testo, data, voto }) {
  const res = await client.from('esperienze')
    .update({ titolo, testo: testo || null, data, voto: voto ?? 0 }).eq('id', id);
  return check(res);
}

export async function deleteEsperienza(client, id) {
  const res = await client.from('esperienze').delete().eq('id', id);
  return check(res);
}

// ---- FOTO (Storage privato bucket 'foto' + tabella esperienza_foto) ----
export async function uploadFoto(client, { coupleId, esperienzaId, file, path }) {
  const up = await client.storage.from('foto').upload(path, file);
  if (up.error) throw new Error('Upload foto: ' + up.error.message);
  const res = await client.from('esperienza_foto')
    .insert({ esperienza_id: esperienzaId, couple_id: coupleId, storage_path: path })
    .select().single();
  return check(res);
}

export async function listFotoRows(client, esperienzaId) {
  const res = await client.from('esperienza_foto').select('*')
    .eq('esperienza_id', esperienzaId).order('creato', { ascending: true });
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
  const res = await client.from('esperienza_foto').delete().eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `cd nostro-spazio && node --test`
Atteso: PASS — 9 nuovi test verdi.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/esperienze.test.js
git commit -m "feat(store): CRUD esperienze + wrapper foto Storage + test"
```

---

## Task 3: Stile calendario / fiamme / thumbnails

**Files:**
- Modify: `nostro-spazio/styles.css`

- [ ] **Step 1: Aggiungere gli stili in fondo a `styles.css`**

```css
/* ===== Calendario & esperienze ===== */
.cal-head{display:flex;align-items:center;justify-content:space-between;margin:4px 0 12px;}
.cal-head button{background:rgba(255,255,255,.04);border:1px solid rgba(212,168,108,.3);
  color:var(--gold-soft);width:40px;height:40px;border-radius:10px;font-size:18px;cursor:pointer;}
.cal-month{font-size:18px;color:var(--cream);}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:22px;}
.cal-dow{text-align:center;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.06em;
  text-transform:uppercase;color:#9c7f88;padding-bottom:2px;}
.cal-cell{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  border-radius:10px;font-size:14px;color:#cbab9e;border:1px solid transparent;}
.cal-cell.empty{visibility:hidden;}
.cal-cell.has{background:linear-gradient(180deg,rgba(122,21,51,.45),rgba(92,16,38,.25));
  border-color:rgba(212,168,108,.35);color:#fff;cursor:pointer;}
.cal-cell.today{border-color:var(--gold);}
.cal-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);margin-top:3px;}
.section-label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);
  margin:6px 0 10px;font-family:Arial,sans-serif;}

/* voto fiamme */
.fiamme{font-size:18px;letter-spacing:2px;}
.voto-pick{display:flex;gap:6px;margin-bottom:12px;font-size:26px;}
.voto-pick span{cursor:pointer;}

/* thumbnails foto */
.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.thumb{position:relative;width:74px;height:74px;border-radius:10px;overflow:hidden;
  border:1px solid rgba(212,168,108,.3);}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.thumb .rm{position:absolute;top:2px;right:2px;background:rgba(8,2,5,.8);color:#fff;
  width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;font-size:13px;line-height:1;}
.file-row{margin:4px 0 12px;}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(ui): stili calendario, fiamme e thumbnails foto"
```

---

## Task 4: Modulo Calendario (UI completa)

**Files:**
- Create: `nostro-spazio/js/modules/calendario.js`

- [ ] **Step 1: Creare `js/modules/calendario.js`**

```js
import { mk, add, clear, toast, openSheet } from '../ui.js';
import { monthMatrix, monthLabel, groupByDay, sortByDateDesc, fiammeLabel, fotoPath } from '../lib/logic.js';
import {
  listEsperienze, addEsperienza, updateEsperienza, deleteEsperienza,
  uploadFoto, listFotoRows, signedUrl, deleteFoto,
} from '../store.js';

let ctx = null;        // { client, me, panel }
let rows = [];         // esperienze della coppia
let viewY, viewM;      // mese visualizzato
let wired = false;

const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export async function renderCalendario(context) {
  ctx = context;
  if (!wired) { document.addEventListener('fab:calendario', () => openEdit(null, todayISO())); wired = true; }
  if (viewY == null) { const t = new Date(); viewY = t.getFullYear(); viewM = t.getMonth(); }
  try {
    rows = await listEsperienze(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '📅 Calendario & esperienze'),
         mk('p', 'psub', 'Il diario delle vostre esperienze: votale a fiamme e aggiungi foto.'));
  drawCalendar(p);
  add(p, mk('div', 'section-label', 'Più recenti'));
  const recent = sortByDateDesc(rows);
  if (!recent.length) { p.appendChild(mk('div', 'empty', 'Ancora nessuna esperienza.\nTocca ＋ per aggiungerne una.')); return; }
  for (const e of recent) p.appendChild(cardOf(e));
}

function drawCalendar(p) {
  const head = mk('div', 'cal-head');
  const prev = mk('button', null, '‹'); prev.onclick = () => shiftMonth(-1);
  const next = mk('button', null, '›'); next.onclick = () => shiftMonth(1);
  add(head, prev, mk('div', 'cal-month', monthLabel(viewY, viewM)), next);
  p.appendChild(head);

  const grid = mk('div', 'cal-grid');
  for (const d of DOW) grid.appendChild(mk('div', 'cal-dow', d));
  const byDay = groupByDay(rows);
  const today = todayISO();
  for (const week of monthMatrix(viewY, viewM)) {
    for (const cell of week) {
      if (!cell) { grid.appendChild(mk('div', 'cal-cell empty')); continue; }
      const has = byDay[cell.iso] && byDay[cell.iso].length;
      const c = mk('div', 'cal-cell' + (has ? ' has' : '') + (cell.iso === today ? ' today' : ''));
      c.appendChild(mk('span', null, String(cell.day)));
      if (has) { c.appendChild(mk('span', 'cal-dot')); c.onclick = () => openDay(cell.iso); }
      grid.appendChild(c);
    }
  }
  p.appendChild(grid);
}

function shiftMonth(delta) {
  viewM += delta;
  if (viewM < 0) { viewM = 11; viewY--; }
  else if (viewM > 11) { viewM = 0; viewY++; }
  draw();
}

function openDay(iso) {
  const list = sortByDateDesc(rows.filter(e => e.data === iso));
  openSheet('Esperienze del ' + fmt(iso), s => {
    if (!list.length) add(s, mk('p', 'muted', 'Niente in questa data.'));
    for (const e of list) {
      const r = mk('div', 'card');
      add(r, mk('div', 'fiamme', fiammeLabel(e.voto)), mk('p', null, e.titolo));
      s.appendChild(r);
    }
    const b = mk('button', 'btn', '＋ Aggiungi in questa data'); b.style.width = '100%';
    b.onclick = () => { s.closest('.modal').remove(); openEdit(null, iso); };
    s.appendChild(b);
  });
}

function cardOf(e) {
  const c = mk('div', 'card');
  const top = mk('div', 'row spread');
  add(top, mk('div', 'fiamme', fiammeLabel(e.voto)), mk('span', 'muted', fmt(e.data)));
  c.appendChild(top);
  const t = mk('p', null, e.titolo); t.style.cssText = 'margin:8px 0 4px;font-size:18px;'; c.appendChild(t);
  if (e.testo) { const tx = mk('p', 'muted', e.testo); tx.style.fontSize = '13px'; c.appendChild(tx); }

  const thumbs = mk('div', 'thumbs'); c.appendChild(thumbs);
  loadThumbs(e.id, thumbs, false);

  const act = mk('div', 'row'); act.style.cssText = 'justify-content:flex-end;margin-top:10px;';
  const edit = mk('button', 'btn sm ghost', 'Modifica'); edit.onclick = () => openEdit(e, e.data);
  const del = mk('button', 'btn sm ghost', 'Elimina');
  del.onclick = async () => {
    if (del.dataset.confirm !== '1') {
      del.textContent = 'Sicuro?'; del.dataset.confirm = '1';
      setTimeout(() => { del.textContent = 'Elimina'; del.dataset.confirm = ''; }, 2000);
      return;
    }
    try { await removeEsperienzaConFoto(e.id); await renderCalendario(ctx); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  add(act, edit, del); c.appendChild(act);
  return c;
}

// Carica le thumbnail via signed URL. withRemove=true aggiunge la ✕ per eliminare la foto.
async function loadThumbs(esperienzaId, container, withRemove) {
  try {
    const foto = await listFotoRows(ctx.client, esperienzaId);
    for (const f of foto) {
      const url = await signedUrl(ctx.client, f.storage_path);
      const wrap = mk('div', 'thumb');
      const img = mk('img'); img.src = url; img.alt = '';
      wrap.appendChild(img);
      if (withRemove) {
        const rm = mk('button', 'rm', '✕');
        rm.onclick = async () => {
          try { await deleteFoto(ctx.client, { id: f.id, storagePath: f.storage_path }); wrap.remove(); }
          catch (err) { toast('Errore rimozione foto: ' + err.message, 'err'); }
        };
        wrap.appendChild(rm);
      }
      container.appendChild(wrap);
    }
  } catch (err) {
    if (withRemove) toast('Errore foto: ' + err.message, 'err'); // nelle card non disturbo lo scroll
  }
}

async function removeEsperienzaConFoto(esperienzaId) {
  const foto = await listFotoRows(ctx.client, esperienzaId);
  for (const f of foto) {
    try { await deleteFoto(ctx.client, { id: f.id, storagePath: f.storage_path }); } catch { /* continua comunque */ }
  }
  await deleteEsperienza(ctx.client, esperienzaId);
}

function openEdit(esp, presetData) {
  const isNew = !esp;
  let voto = esp ? esp.voto : 0;
  const pending = []; // File[] selezionati, caricati al salvataggio

  openSheet(isNew ? 'Nuova esperienza' : 'Modifica esperienza', s => {
    const titolo = mk('input'); titolo.placeholder = 'Titolo'; titolo.value = esp ? esp.titolo : '';
    const data = mk('input'); data.type = 'date'; data.value = esp ? esp.data : presetData;
    const testo = mk('textarea'); testo.placeholder = 'Com’è andata…'; testo.value = esp && esp.testo ? esp.testo : '';

    const votoPick = mk('div', 'voto-pick');
    const flames = [];
    for (let i = 1; i <= 5; i++) {
      const f = mk('span', null, i <= voto ? '🔥' : '🤍');
      f.onclick = () => { voto = i; flames.forEach((el, idx) => { el.textContent = (idx + 1) <= voto ? '🔥' : '🤍'; }); };
      flames.push(f); votoPick.appendChild(f);
    }

    const file = mk('input', 'file-row'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true;
    file.onchange = () => { for (const f of file.files) pending.push(f); file.value = ''; toast(pending.length + ' foto pronte da caricare'); };

    const existing = mk('div', 'thumbs');
    if (!isNew) loadThumbs(esp.id, existing, true);

    const save = mk('button', 'btn', 'Salva'); save.style.cssText = 'width:100%;margin-top:6px;';
    save.onclick = async () => {
      if (!titolo.value.trim() || !data.value) { toast('Titolo e data sono obbligatori', 'err'); return; }
      save.disabled = true;
      try {
        let id;
        if (isNew) {
          const row = await addEsperienza(ctx.client, {
            couple_id: ctx.me.couple_id, autore_id: ctx.me.id,
            titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
          });
          id = row.id;
        } else {
          await updateEsperienza(ctx.client, esp.id, {
            titolo: titolo.value.trim(), testo: testo.value.trim(), data: data.value, voto,
          });
          id = esp.id;
        }
        for (const f of pending) {
          const path = fotoPath(ctx.me.couple_id, id, f.name);
          await uploadFoto(ctx.client, { coupleId: ctx.me.couple_id, esperienzaId: id, file: f, path });
        }
        s.closest('.modal').remove();
        await renderCalendario(ctx);
      } catch (err) { save.disabled = false; toast('Errore salvataggio: ' + err.message, 'err'); }
    };

    add(s,
      mk('label', 'lbl', 'Titolo'), titolo,
      mk('label', 'lbl', 'Data'), data,
      mk('label', 'lbl', 'Voto'), votoPick,
      mk('label', 'lbl', 'Racconto'), testo,
      mk('label', 'lbl', 'Foto'), file, existing,
      save);
  });
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
```

- [ ] **Step 2: Commit**

```bash
git add js/modules/calendario.js
git commit -m "feat(esperienze): modulo calendario+timeline, voto fiamme, foto"
```

---

## Task 5: Aggancio in app.js + index.html

**Files:**
- Modify: `nostro-spazio/index.html`
- Modify: `nostro-spazio/js/app.js`

- [ ] **Step 1: Aggiungere il pannello in `index.html`**

Dopo la riga `<section class="panel" id="p-desideri"></section>` aggiungi:

```html
    <section class="panel" id="p-calendario"></section>
```

- [ ] **Step 2: Importare e registrare il modulo in `js/app.js`**

In cima, dopo `import { renderDesideri } from './modules/desideri.js';` aggiungi:

```js
import { renderCalendario } from './modules/calendario.js';
```

Sostituisci la riga `TABS`:

```js
const TABS = [['desideri', '🔥', 'Desideri']]; // altri moduli nelle fasi successive
```

con:

```js
const TABS = [
  ['desideri', '🔥', 'Desideri'],
  ['calendario', '📅', 'Esperienze'],
];
```

Sostituisci la funzione `render()`:

```js
function render() {
  if (cur === 'desideri') renderDesideri({ client, me, panel: $('p-desideri') }).catch(err => toast('Errore: ' + err.message, 'err'));
}
```

con:

```js
function render() {
  if (cur === 'desideri') renderDesideri({ client, me, panel: $('p-desideri') }).catch(err => toast('Errore: ' + err.message, 'err'));
  else if (cur === 'calendario') renderCalendario({ client, me, panel: $('p-calendario') }).catch(err => toast('Errore: ' + err.message, 'err'));
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html js/app.js
git commit -m "feat(app): tab Esperienze + routing modulo calendario"
```

---

## Task 6: Smoke test nel browser vero (Playwright) — OBBLIGATORIO

**Files:**
- Modify: `nostro-spazio/test/smoke.md` (aggiungere la sezione Fase 2)

> Prerequisiti P1 (bucket `foto` privato) e P2 (policy Storage) DEVONO essere fatti prima. Serve un server statico locale (il modulo ES `config.js` non si carica da `file://`).

- [ ] **Step 1: Avviare un server statico locale**

```bash
cd nostro-spazio
python -m http.server 5500
```
App su `http://localhost:5500`.

- [ ] **Step 2: Verificare il flusso completo (Playwright, viewport 390×844)**

Login con l'account di Tomas, poi tab **📅 Esperienze**:
1. Calendario del mese corrente visibile (intestazioni Lun…Dom, giorno di oggi col bordo oro); timeline vuota mostra "Ancora nessuna esperienza.".
2. Tocco **＋** → sheet "Nuova esperienza": inserisco titolo, data (oggi), imposto **voto 4 fiamme**, scrivo un racconto, **seleziono 1+ foto** dal file input.
3. **Salva** → l'esperienza compare in timeline con 🔥🔥🔥🔥🤍, data e la **thumbnail della foto** (caricata via signed URL → conferma Storage privato + accesso per coppia).
4. Il giorno corrispondente nel calendario è **evidenziato** col puntino; tap sul giorno → sheet con l'esperienza.
5. **Modifica**: cambio voto a 5, apro lo sheet, rimuovo una foto con la ✕ → sparisce; salvo → la card riflette le modifiche.
6. **Elimina** (conferma "Sicuro?") → l'esperienza sparisce e il giorno non è più evidenziato.
7. **Reload** → resto loggato, le esperienze e le foto persistono.
8. (Sicurezza) In una scheda anonima/non loggata, l'URL firmato scaduto o un accesso diretto al bucket NON deve mostrare la foto.

- [ ] **Step 3: Aggiornare `test/smoke.md`**

Aggiungi in fondo a `test/smoke.md`:

```md

# Smoke test Fase 2 — esito
Data: <data>
Browser: Chromium via Playwright, viewport 390x844
- [x] calendario mese corrente + oggi evidenziato + timeline vuota
- [x] nuova esperienza (titolo/data/voto/racconto) + upload foto
- [x] card in timeline con fiamme + thumbnail via signed URL
- [x] giorno evidenziato nel calendario + tap giorno
- [x] modifica voto + rimozione foto
- [x] elimina esperienza (con conferma)
- [x] persistenza dopo reload
- [x] foto non accessibili senza login (Storage privato)
Note: ...
```

- [ ] **Step 4: Commit**

```bash
git add test/smoke.md
git commit -m "test: smoke test Fase 2 superato (esperienze + foto end-to-end)"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review (eseguita in fase di scrittura del piano)

**Copertura spec (§4.3 Calendario & esperienze):** vista calendario mensile coi giorni evidenziati ✓ (Task 4 `drawCalendar`), tap giorno → dettaglio/aggiunta ✓ (`openDay`), timeline recente ✓ (`draw`), campi `titolo/testo/data/autore/voto` ✓ (Task 2 `addEsperienza` usa `autore_id`; Task 4 form), voto 0–5 fiamme ✓ (`fiammeLabel`+`voto-pick`), foto 0..n in **Storage privato** + signed URL ✓ (Task 0 policy, Task 2 `uploadFoto/signedUrl`, Task 4 thumbnails), foto eliminabili ✓ (`deleteFoto`, ✕ in edit), azioni aggiungi/modifica/elimina ✓ (`openEdit`, conferma elimina). Sicurezza foto private ✓ (Task 0 + smoke step 8). No fallimenti silenziosi ✓ (throw in store + toast). Smoke test obbligatorio con upload foto ✓ (Task 6).

**Coerenza nomi:** colonne `couple_id, autore_id, titolo, testo, data, voto` e `esperienza_id, couple_id, storage_path` identiche tra schema (Fase 1), store (Task 2) e UI (Task 4). Funzioni store `listEsperienze/addEsperienza/updateEsperienza/deleteEsperienza/uploadFoto/listFotoRows/signedUrl/deleteFoto` coerenti tra test, implementazione e import nel modulo. Funzioni logica `monthMatrix/monthLabel/groupByDay/sortByDateDesc/fiammeLabel/fotoPath` coerenti tra test, implementazione e modulo. Bucket `foto` coerente tra policy (Task 0), store (Task 2) e path (`fotoPath`).

**Placeholder:** nessun TBD/TODO; ogni step ha codice o comando completo.

**Note di rischio:** `addEsperienza`/`uploadFoto` usano `.select().single()` — il client finto lo supporta (flag `single`); in produzione richiede che la riga inserita sia leggibile dalla policy RLS (lo è: `is_member(couple_id)`). Upload foto dopo il salvataggio dell'esperienza: se l'upload fallisce, l'esperienza resta salvata senza quella foto (coerente con spec §6: "Upload foto fallito → la voce resta salvabile senza foto").

---

## Esecuzione

Completata e superato lo smoke test, si scriverà il piano della **Fase 3 — Buoni** (regalo / bundle / richiesta-accetta-rifiuta-riscatta).
