# Mappa Luoghi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a Velluto un 6° tab "🗺️ Mappa" con i luoghi della coppia su mappa scura Leaflet, scheda-polaroid per ogni luogo, e un drawer statistiche (barre per mese, switch 📍/🔥).

**Architecture:** Stessa struttura degli altri tab: logica pura in `js/lib/logic.js` (testata con `node:test`), CRUD in `js/store.js` (testato con fake client), modulo UI `js/modules/mappa.js` agganciato in `js/app.js`, migrazione in `supabase/luoghi.sql`. Le foto riusano la tabella/bucket `foto` esistenti col nuovo contesto `'luogo'`. Mappa via Leaflet + tile CARTO dark da CDN (niente API key). Modali e scroll-lock riusano `openSheet`/`.modal` esistenti.

**Tech Stack:** Vanilla ES modules, Supabase JS, Leaflet 1.9.4 (CDN), Nominatim (geocoding gratuito OSM), `node --test`.

---

## Setup branch (prima di iniziare)

Il lavoro corrente è sul branch `feat/strip-poker` (non correlato, con modifiche non committate). La mappa è indipendente: va su un branch dedicato a partire da una base pulita.

- [ ] **Crea il branch/worktree dedicato**

Usa la skill `superpowers:using-git-worktrees` per creare un workspace isolato `feat/mappa-luoghi` a partire da `main` (NON da `feat/strip-poker`). Se si lavora in-place senza worktree, fai comunque partire `feat/mappa-luoghi` da `main`. Tutti i commit di questo piano vanno su quel branch (commit + push automatici, come da regola del progetto).

## File Structure

- `js/lib/logic.js` — **modifica** (append): funzioni pure per la mappa (aggregazioni per mese, totali, voto a cuori, etichette data).
- `test/luoghi.test.js` — **crea**: test delle funzioni pure.
- `supabase/luoghi.sql` — **crea**: tabella `luoghi` + RLS + estensione del check `foto.contesto`.
- `js/store.js` — **modifica** (append): CRUD `luoghi`.
- `test/luoghi-store.test.js` — **crea**: test CRUD con fake client (supporta `.single()`).
- `styles.css` — **modifica** (append): blocco `/* ===== MAPPA ===== */`.
- `index.html` — **modifica**: CSS/JS Leaflet nel `<head>` + `<section class="panel" id="p-mappa">`.
- `js/app.js` — **modifica**: import + voce in `TABS` + ramo in `render()`.
- `js/modules/mappa.js` — **crea**: modulo del tab (mappa, pin, polaroid, statistiche, aggiunta/modifica luogo).

---

### Task 1: Logica pura della mappa

**Files:**
- Modify: `js/lib/logic.js` (append in fondo al file)
- Test: `test/luoghi.test.js`

- [ ] **Step 1: Scrivi i test (falliscono)**

Crea `test/luoghi.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meseDi, aggregaPerMese, soloIntimi, totaliLuoghi, luoghiDelMese, cuoriLabel, etichettaData,
} from '../js/lib/logic.js';

const sample = [
  { id: 'a', nome: 'Tropea',  intimo: true,  voto: 5, data_evento: '2025-08-21' },
  { id: 'b', nome: 'Sorrento', intimo: true,  voto: 4, data_evento: '2025-08-12' },
  { id: 'c', nome: 'Uffizi',   intimo: false, voto: 0, data_evento: '2026-01-12' },
  { id: 'd', nome: 'Senza',    intimo: false, voto: 0, data_evento: null },
];

test('meseDi ritorna indice 0-based o null', () => {
  assert.equal(meseDi(sample[0]), 7);   // agosto
  assert.equal(meseDi(sample[2]), 0);   // gennaio
  assert.equal(meseDi(sample[3]), null);
});

test('aggregaPerMese conta vis (tutti) e fat (intimi), salta senza data', () => {
  const { vis, fat } = aggregaPerMese(sample);
  assert.equal(vis[7], 2);  // ago: Tropea + Sorrento
  assert.equal(fat[7], 2);  // entrambi intimi
  assert.equal(vis[0], 1);  // gen: Uffizi
  assert.equal(fat[0], 0);  // non intimo
  assert.equal(vis.reduce((a, b) => a + b, 0), 3); // 'd' senza data esclusa
});

test('soloIntimi filtra il sottoinsieme', () => {
  assert.deepEqual(soloIntimi(sample).map(l => l.id), ['a', 'b']);
});

test('totaliLuoghi conta luoghi, volte (intimi) e mesi attivi', () => {
  const t = totaliLuoghi(sample);
  assert.equal(t.luoghi, 4);
  assert.equal(t.volte, 2);
  assert.equal(t.mesiAttivi, 2); // agosto + gennaio
});

test('luoghiDelMese separa visited e fatto', () => {
  const r = luoghiDelMese(sample, 7);
  assert.deepEqual(r.visited.map(l => l.id), ['a', 'b']);
  assert.deepEqual(r.fatto.map(l => l.id), ['a', 'b']);
  const gen = luoghiDelMese(sample, 0);
  assert.deepEqual(gen.visited.map(l => l.id), ['c']);
  assert.equal(gen.fatto.length, 0);
});

test('cuoriLabel rende cuori pieni/vuoti, clamp 0-5', () => {
  assert.equal(cuoriLabel(3), '❤❤❤♡♡');
  assert.equal(cuoriLabel(0), '♡♡♡♡♡');
  assert.equal(cuoriLabel(9), '❤❤❤❤❤');
});

test('etichettaData: breve capitalizzata e con giorno minuscola', () => {
  assert.equal(etichettaData('2025-08-21'), 'Ago 2025');
  assert.equal(etichettaData('2025-08-21T10:30:00Z', { conGiorno: true }), '21 ago 2025');
  assert.equal(etichettaData(null), '');
});
```

- [ ] **Step 2: Esegui i test → falliscono**

Run: `npm test`
Expected: FAIL (`meseDi is not a function`, ecc.)

- [ ] **Step 3: Implementa le funzioni pure**

Aggiungi in fondo a `js/lib/logic.js`:

```js
// ---- LUOGHI / MAPPA (pure) ----
// data_evento = 'YYYY-MM-DD'. mese ritornato 0..11, oppure null se senza data.
export function meseDi(luogo) {
  return luogo.data_evento ? Number(luogo.data_evento.slice(5, 7)) - 1 : null;
}

// Conteggi per mese: vis = tutti i luoghi, fat = solo intimi. Salta i luoghi senza data.
export function aggregaPerMese(luoghi) {
  const vis = Array(12).fill(0), fat = Array(12).fill(0);
  for (const l of luoghi) {
    const m = meseDi(l);
    if (m == null) continue;
    vis[m]++;
    if (l.intimo) fat[m]++;
  }
  return { vis, fat };
}

export function soloIntimi(luoghi) {
  return luoghi.filter(l => l.intimo);
}

// Totali per le etichette: luoghi totali, volte (= intimi), mesi con almeno un luogo.
export function totaliLuoghi(luoghi) {
  const { vis } = aggregaPerMese(luoghi);
  return {
    luoghi: luoghi.length,
    volte: soloIntimi(luoghi).length,
    mesiAttivi: vis.filter(n => n > 0).length,
  };
}

// Luoghi di un mese (0..11): visited (tutti) + fatto (solo intimi).
export function luoghiDelMese(luoghi, mese) {
  const visited = luoghi.filter(l => meseDi(l) === mese);
  return { visited, fatto: visited.filter(l => l.intimo) };
}

// Voto a cuori per il retro della polaroid.
export function cuoriLabel(voto) {
  const v = Math.max(0, Math.min(5, voto | 0));
  return '❤'.repeat(v) + '♡'.repeat(5 - v);
}

// Etichetta data breve italiana. conGiorno=false → "Ago 2025"; true → "21 ago 2025".
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function etichettaData(iso, { conGiorno = false } = {}) {
  if (!iso) return '';
  const [y, mm, dd] = iso.slice(0, 10).split('-');
  const mese = MESI_BREVI[Number(mm) - 1] || '';
  if (conGiorno) return `${Number(dd)} ${mese} ${y}`;
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`;
}
```

- [ ] **Step 4: Esegui i test → passano**

Run: `npm test`
Expected: PASS (tutti i test, inclusi quelli preesistenti)

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/luoghi.test.js
git commit -m "feat(mappa): logica pura luoghi (aggregazioni, totali, etichette)"
```

---

### Task 2: Migrazione Supabase `luoghi`

**Files:**
- Create: `supabase/luoghi.sql`

- [ ] **Step 1: Scrivi la migrazione**

Crea `supabase/luoghi.sql`:

```sql
-- ============ NOSTRO SPAZIO — Mappa: tabella 'luoghi' ============
-- Eseguire nel SQL Editor di Supabase DOPO schema.sql, storage.sql, foto.sql.
-- Riusa is_member(uuid), couples, esperienze e la tabella/bucket 'foto' (contesto 'luogo').

create table if not exists luoghi (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  autore_id uuid not null references auth.users(id),
  nome text not null,
  citta text,
  lat float8 not null,
  lng float8 not null,
  intimo boolean not null default false,
  voto int not null default 0 check (voto between 0 and 5),
  descrizione text,
  data_evento date not null,
  esperienza_id uuid references esperienze(id) on delete set null,
  creato timestamptz not null default now()
);
create index if not exists luoghi_couple_idx on luoghi (couple_id);

alter table luoghi enable row level security;
create policy luoghi_all on luoghi for all using (is_member(couple_id)) with check (is_member(couple_id));

-- Estendi i contesti ammessi per le foto: aggiungi 'luogo' (il check inline si chiama foto_contesto_check)
alter table foto drop constraint if exists foto_contesto_check;
alter table foto add constraint foto_contesto_check check (contesto in ('esperienza', 'buono', 'luogo'));
```

- [ ] **Step 2: Verifica sintattica locale (no DB richiesto)**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('supabase/luoghi.sql','utf8');if(!/create table if not exists luoghi/.test(s)||!/foto_contesto_check/.test(s))process.exit(1);console.log('ok')"`
Expected: `ok`

> Nota: l'esecuzione reale nel SQL Editor di Supabase avviene nello smoke (Task 9). Il file non viene applicato automaticamente.

- [ ] **Step 3: Commit**

```bash
git add supabase/luoghi.sql
git commit -m "feat(mappa): migrazione tabella luoghi + RLS + contesto foto 'luogo'"
```

---

### Task 3: CRUD `luoghi` nello store

**Files:**
- Modify: `js/store.js` (append in fondo)
- Test: `test/luoghi-store.test.js`

- [ ] **Step 1: Scrivi i test (falliscono)**

Crea `test/luoghi-store.test.js` (fake client locale che supporta `.single()`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listLuoghi, addLuogo, updateLuogo, deleteLuogo } from '../js/store.js';

function fakeClient(initialRows = []) {
  const calls = [];
  const rows = [...initialRows];
  function builder(table) {
    const state = { table, op: null, payload: null, filters: {}, single: false };
    const api = {
      select() { if (!state.op) state.op = 'select'; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(c, v) { state.filters[c] = v; return api; },
      order() { return api; },
      single() { state.single = true; return api; },
      then(resolve) {
        calls.push(state);
        if (state.op === 'select') {
          const data = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          resolve({ data: state.single ? data[0] : data, error: null });
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
  return { from: builder, _calls: calls, _rows: rows };
}

test('listLuoghi seleziona per couple_id', async () => {
  const c = fakeClient([
    { id: 'a', couple_id: 'cpl', nome: 'x' },
    { id: 'z', couple_id: 'altra', nome: 'y' },
  ]);
  const data = await listLuoghi(c, 'cpl');
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'a');
  assert.equal(c._calls[0].table, 'luoghi');
  assert.equal(c._calls[0].filters.couple_id, 'cpl');
});

test('addLuogo inserisce con default e ritorna la riga', async () => {
  const c = fakeClient();
  const row = await addLuogo(c, {
    couple_id: 'cpl', autore_id: 'u1', nome: 'Tropea', citta: '',
    lat: 38.6, lng: 15.8, intimo: true, voto: 5, descrizione: '', data_evento: '2025-08-21',
  });
  const ins = c._calls.find(x => x.op === 'insert');
  assert.equal(ins.payload.nome, 'Tropea');
  assert.equal(ins.payload.citta, null);      // stringa vuota → null
  assert.equal(ins.payload.intimo, true);
  assert.equal(ins.payload.voto, 5);
  assert.ok(row.id);
});

test('updateLuogo aggiorna per id', async () => {
  const c = fakeClient();
  await updateLuogo(c, 'id1', { nome: 'Nuovo', citta: 'Roma', intimo: false, voto: 0, descrizione: 'x', data_evento: '2026-01-01' });
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.payload.nome, 'Nuovo');
  assert.equal(upd.filters.id, 'id1');
});

test('deleteLuogo elimina per id', async () => {
  const c = fakeClient();
  await deleteLuogo(c, 'id1');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.filters.id, 'id1');
});
```

- [ ] **Step 2: Esegui i test → falliscono**

Run: `npm test`
Expected: FAIL (`listLuoghi is not a function`, ecc.)

- [ ] **Step 3: Implementa il CRUD**

Aggiungi in fondo a `js/store.js`:

```js
// ---- LUOGHI (Mappa) ----
export async function listLuoghi(client, coupleId) {
  const res = await client.from('luoghi').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addLuogo(client, { couple_id, autore_id, nome, citta, lat, lng, intimo, voto, descrizione, data_evento, esperienza_id }) {
  const res = await client.from('luoghi').insert({
    couple_id, autore_id, nome,
    citta: citta || null, lat, lng,
    intimo: !!intimo, voto: voto ?? 0,
    descrizione: descrizione || null, data_evento,
    esperienza_id: esperienza_id || null,
  }).select().single();
  return check(res);
}

export async function updateLuogo(client, id, { nome, citta, intimo, voto, descrizione, data_evento }) {
  const res = await client.from('luoghi').update({
    nome, citta: citta || null, intimo: !!intimo, voto: voto ?? 0,
    descrizione: descrizione || null, data_evento,
  }).eq('id', id);
  return check(res);
}

export async function deleteLuogo(client, id) {
  const res = await client.from('luoghi').delete().eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Esegui i test → passano**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/luoghi-store.test.js
git commit -m "feat(mappa): CRUD luoghi nello store + test"
```

---

### Task 4: Stili del tab Mappa

**Files:**
- Modify: `styles.css` (append in fondo)

- [ ] **Step 1: Aggiungi il blocco CSS**

Aggiungi in fondo a `styles.css` (usa le variabili `:root` già presenti):

```css
/* ===== MAPPA ===== */
.mappa-area{position:relative;height:calc(100vh - 250px);min-height:430px;
  border:1px solid rgba(212,168,108,.25);border-radius:18px;overflow:hidden;}
.mappa-map{position:absolute;inset:0;background:#0d0307;}
.leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,.5)!important;color:#888!important;}
.mappa-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
  display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.85);
  box-shadow:0 3px 8px rgba(0,0,0,.5);cursor:pointer;
  background:linear-gradient(135deg,var(--gold-soft),var(--gold));}
.mappa-pin span{transform:rotate(45deg);font-size:13px;}

/* maniglia drawer (variante D) */
.mappa-handle{position:absolute;left:0;right:0;bottom:0;z-index:500;display:flex;flex-direction:column;
  align-items:center;cursor:pointer;padding:24px 0 12px;
  background:linear-gradient(180deg,transparent,rgba(13,3,7,.92));}
.mappa-grab{width:46px;height:5px;border-radius:3px;background:rgba(243,217,176,.55);}
.mappa-hlabel{font-size:12px;color:var(--gold-soft);margin-top:8px;font-weight:600;font-family:Arial,sans-serif;}

/* statistiche dentro la sheet */
.mappa-stats{--acc:var(--gold);--acc2:var(--gold-soft);}
.mappa-stats.as-fat{--acc:var(--rose);--acc2:#e08aa5;}
.mst-sw{display:flex;background:rgba(0,0,0,.35);border:1px solid rgba(212,168,108,.2);
  border-radius:999px;padding:3px;margin:2px 0 10px;}
.mst-sw button{flex:1;border:0;background:transparent;color:rgba(243,217,176,.7);
  font-size:13px;font-weight:700;padding:9px;border-radius:999px;cursor:pointer;font-family:Arial,sans-serif;}
.mappa-stats.as-vis .mst-sw button.on{background:linear-gradient(135deg,var(--gold-soft),var(--gold));color:#1a0610;}
.mappa-stats.as-fat .mst-sw button.on{background:linear-gradient(135deg,#e08aa5,var(--rose));color:#fff;}
.mst-tot{font-size:12px;color:rgba(243,217,176,.6);margin:0 0 12px;}
.mst-chart{display:flex;align-items:flex-end;gap:6px;height:140px;border-bottom:1px solid rgba(212,168,108,.18);}
.mst-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;cursor:pointer;}
.mst-num{font-size:12px;font-weight:800;color:var(--acc2);font-family:Arial,sans-serif;}
.mst-num.z{color:rgba(243,217,176,.25);}
.mst-bar{width:100%;max-width:22px;border-radius:5px 5px 0 0;min-height:3px;
  background:linear-gradient(180deg,var(--acc2),var(--acc));transition:.2s;}
.mst-bar.z{background:rgba(243,217,176,.1);}
.mst-col:hover .mst-bar{filter:brightness(1.2);}
.mst-labels{display:flex;gap:6px;margin-top:5px;}
.mst-labels div{flex:1;text-align:center;font-size:9px;color:rgba(243,217,176,.5);font-family:Arial,sans-serif;}
.mst-hint{font-size:10.5px;color:rgba(243,217,176,.4);margin-top:12px;text-align:center;}
.mst-mhead{display:flex;align-items:center;gap:8px;font-size:18px;color:var(--gold-soft);margin:2px 0 12px;}
.mst-back{background:rgba(0,0,0,.3);border:1px solid rgba(212,168,108,.25);color:var(--cream);
  width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;}
.mst-msec{margin-bottom:13px;}
.mst-lbl{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:7px;font-family:Arial,sans-serif;}
.mst-msec.v .mst-lbl{color:var(--gold-soft);} .mst-msec.f .mst-lbl{color:var(--rose);}
.mst-mrow{display:flex;align-items:center;gap:9px;padding:9px;background:rgba(0,0,0,.25);
  border-radius:10px;margin-bottom:6px;cursor:pointer;}
.mst-mnm{font-size:13px;color:var(--cream);font-weight:600;}
.mst-mct{font-size:10.5px;color:rgba(243,217,176,.5);}
.mst-empty{font-size:12px;color:rgba(243,217,176,.4);font-style:italic;padding:2px;}

/* polaroid (modale centrata, riusa .modal) */
.mappa-stage{perspective:1400px;}
.mappa-pol{position:relative;width:248px;height:312px;animation:mappaFlashIn .45s ease-out .1s both;}
@keyframes mappaFlashIn{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}
.mappa-pol-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;
  transform:rotate(-2.2deg);transition:transform .6s cubic-bezier(.4,.1,.2,1);}
.mappa-pol.flip .mappa-pol-inner{transform:rotate(-2.2deg) rotateY(180deg);}
.mappa-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  border-radius:3px;box-shadow:0 22px 45px rgba(0,0,0,.55);overflow:hidden;}
.mappa-front{background:#fbfaf4;padding:13px 13px 0;display:flex;flex-direction:column;}
.mappa-pimg{width:222px;height:222px;object-fit:cover;display:block;background:#cdbf9e;}
.mappa-pimg.mappa-noimg{display:flex;}
.mappa-cap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px 6px;}
.mappa-nm{font-family:'Segoe Script','Comic Sans MS',cursive;font-size:22px;color:#26160c;}
.mappa-dt{font-family:'Segoe Script','Comic Sans MS',cursive;font-size:13px;color:#9a7a52;}
.mappa-back{transform:rotateY(180deg);background:linear-gradient(135deg,#efe7d4,#e7dcc4);
  padding:15px;display:flex;flex-direction:column;gap:7px;}
.mappa-bnm{font-family:Georgia,serif;font-weight:700;font-size:15px;color:#3a2614;}
.mappa-added{font-family:'Courier New',monospace;font-size:10.5px;color:#8a6a44;
  border-bottom:1px solid #cdbf9e;padding-bottom:6px;}
.mappa-stamp{position:absolute;right:13px;top:12px;background:var(--rose);color:#fff;font-size:9px;
  font-weight:800;padding:6px 7px;border-radius:4px;transform:rotate(7deg);text-align:center;
  line-height:1.15;font-family:Arial;}
.mappa-hearts{color:#b83c5a;font-size:14px;letter-spacing:2px;}
.mappa-bdesc{font-family:'Segoe Script','Comic Sans MS',cursive;font-size:15.5px;line-height:1.45;
  color:#2c1d10;flex:1;padding:3px;overflow:auto;}
.mappa-bstrip{display:flex;gap:6px;flex-wrap:wrap;}
.mappa-bstrip .thumb{width:40px;height:40px;}
.mappa-tools{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:14px;}
.mappa-tbtn{background:rgba(0,0,0,.4);border:1px solid rgba(212,168,108,.35);color:var(--cream);
  padding:10px 16px;border-radius:999px;cursor:pointer;font-size:13px;font-weight:600;font-family:Arial,sans-serif;}
.mappa-tbtn.primary{background:linear-gradient(135deg,var(--gold-soft),var(--gold));color:#1a0610;border-color:transparent;}
.mappa-flash{position:absolute;inset:0;background:#fff;z-index:60;pointer-events:none;
  animation:mappaFlash .42s ease-out forwards;}
@keyframes mappaFlash{0%{opacity:0}14%{opacity:.92}100%{opacity:0}}

/* form aggiungi/modifica (dentro .sheet) */
.mappa-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}
.mappa-field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-family:Arial,sans-serif;}
.mappa-field input,.mappa-field textarea{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(212,168,108,.3);
  border-radius:10px;color:var(--cream);padding:11px;font-family:inherit;font-size:15px;}
.mappa-field textarea{min-height:70px;resize:vertical;}
.mappa-check{display:flex;align-items:center;gap:9px;margin-bottom:12px;cursor:pointer;font-size:15px;}
.mappa-voto{display:flex;gap:6px;font-size:24px;cursor:pointer;}
.mappa-cuore{color:#b83c5a;user-select:none;}
.mappa-coord{font-size:12px;color:var(--gold-soft);margin-bottom:12px;font-family:Arial,sans-serif;}
.mappa-fotolbl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);
  margin:4px 0 6px;font-family:Arial,sans-serif;}
.mappa-results{display:flex;flex-direction:column;gap:6px;margin:10px 0;}
.mappa-result{text-align:left;background:rgba(0,0,0,.3);border:1px solid rgba(212,168,108,.25);
  color:var(--cream);padding:10px;border-radius:10px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif;}
.mappa-or{text-align:center;font-size:11px;color:rgba(243,217,176,.5);margin:8px 0;text-transform:uppercase;letter-spacing:.12em;}
.mappa-del{width:100%;margin-top:10px;background:transparent;border:1px solid var(--err);color:var(--err);
  padding:10px;border-radius:10px;cursor:pointer;font-family:Arial,sans-serif;}
.mappa-btn-spacer{height:8px;}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(mappa): stili tab mappa (drawer, polaroid, statistiche, form)"
```

---

### Task 5: Aggancio Leaflet e pannello in `index.html`

**Files:**
- Modify: `index.html:8-11` (head) e `index.html:36-40` (pannelli)

- [ ] **Step 1: Aggiungi Leaflet nel `<head>`**

In `index.html`, dopo la riga `<link rel="stylesheet" href="styles.css">` e PRIMA dello script Supabase, inserisci:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

- [ ] **Step 2: Aggiungi il pannello del tab**

In `index.html`, dopo `<section class="panel" id="p-giochi"></section>`, inserisci:

```html
    <section class="panel" id="p-mappa"></section>
```

- [ ] **Step 3: Verifica che Leaflet sia raggiungibile**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');if(!/leaflet@1\.9\.4\/dist\/leaflet\.js/.test(s)||!/id=\"p-mappa\"/.test(s))process.exit(1);console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(mappa): Leaflet via CDN + pannello p-mappa"
```

---

### Task 6: Aggancio del tab in `js/app.js`

**Files:**
- Modify: `js/app.js:8` (import), `js/app.js:10-16` (TABS), `js/app.js:76-82` (render)

- [ ] **Step 1: Aggiungi l'import**

In `js/app.js`, dopo `import { renderGiochi } from './modules/giochi.js';`, aggiungi:

```js
import { renderMappa } from './modules/mappa.js';
```

- [ ] **Step 2: Aggiungi la voce in TABS**

In `js/app.js`, dentro l'array `TABS`, dopo `['giochi', '🎲', 'Giochi'],`, aggiungi:

```js
  ['mappa', '🗺️', 'Mappa'],
```

- [ ] **Step 3: Aggiungi il ramo in render()**

In `js/app.js`, dentro `render()`, dopo la riga `else if (cur === 'giochi') ...`, aggiungi:

```js
  else if (cur === 'mappa') renderMappa({ client, me, panel: $('p-mappa') }).catch(err => toast('Errore: ' + err.message, 'err'));
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(mappa): aggancio tab Mappa in app.js"
```

> Nota: a questo punto il modulo `js/modules/mappa.js` non esiste ancora → l'app non parte. Lo si crea nel Task 7 (commit successivo). Se esegui in sessione, procedi subito al Task 7 prima di aprire l'app.

---

### Task 7: Modulo `mappa.js` — mappa, pin, polaroid, statistiche

**Files:**
- Create: `js/modules/mappa.js`

Questo task crea il modulo completo per **visualizzare** la mappa, aprire la scheda-polaroid di un luogo (con modifica/eliminazione e foto) e il drawer statistiche. L'**aggiunta** di un nuovo luogo (FAB) è nel Task 8.

- [ ] **Step 1: Crea il modulo**

Crea `js/modules/mappa.js`:

```js
/* global L */
import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  aggregaPerMese, totaliLuoghi, luoghiDelMese, cuoriLabel, etichettaData, nomeMese,
} from '../lib/logic.js';
import { listLuoghi, addLuogo, updateLuogo, deleteLuogo, listFoto, signedUrl } from '../store.js';
import { fotoEditor, loadThumbsInto } from './foto.js';

const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const CENTRO_IT = [42.5, 12.5];

let ctx = null;
let luoghi = [];
let map = null;
let statView = 'vis';

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function renderMappa(context) {
  ctx = context;
  try { luoghi = await listLuoghi(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore caricamento: ' + err.message, 'err'); luoghi = []; }
  draw();
}

function handleLabel() {
  const t = totaliLuoghi(luoghi);
  return `📊 Statistiche · ${t.luoghi} luoghi · ${t.volte} volte 🔥`;
}

function draw() {
  const p = ctx.panel; clear(p);
  if (map) { map.remove(); map = null; }
  add(p, mk('h2', 'ptitle', '🗺️ La nostra mappa'),
         mk('p', 'psub', 'I posti che ci portiamo dietro.'));
  const area = mk('div', 'mappa-area');
  const mapEl = mk('div', 'mappa-map');
  const handle = mk('div', 'mappa-handle');
  add(handle, mk('div', 'mappa-grab'), mk('div', 'mappa-hlabel', handleLabel()));
  handle.onclick = openStats;
  add(area, mapEl, handle);
  add(p, area);
  initMap(mapEl);
}

function pinIcon() {
  const e = mk('div', 'mappa-pin'); add(e, mk('span', null, '📍'));
  return L.divIcon({ className: '', html: e, iconSize: [30, 30], iconAnchor: [15, 30] });
}

function initMap(mapEl) {
  map = L.map(mapEl, { zoomControl: false }).setView(CENTRO_IT, 5.2);
  L.tileLayer(TILE_DARK, { attribution: '© OpenStreetMap, © CARTO', maxZoom: 19 }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  for (const l of luoghi) {
    const marker = L.marker([l.lat, l.lng], { icon: pinIcon() }).addTo(map);
    marker.on('click', () => openDetail(l));
  }
  setTimeout(() => map.invalidateSize(), 80);
}

// ---- STATISTICHE (drawer = sheet riusata) ----
function openStats() {
  openSheet('La nostra mappa', sheet => {
    const host = mk('div', 'mappa-stats');
    sheet.appendChild(host);
    renderStatsInto(host);
  });
}

function renderStatsInto(host) {
  clear(host);
  host.className = 'mappa-stats ' + (statView === 'vis' ? 'as-vis' : 'as-fat');
  const c = aggregaPerMese(luoghi);
  const arr = statView === 'vis' ? c.vis : c.fat;
  const max = Math.max(...arr, 1);
  const tot = arr.reduce((a, b) => a + b, 0);
  const mesiAttivi = arr.filter(x => x).length;

  const sw = mk('div', 'mst-sw');
  const bv = mk('button', statView === 'vis' ? 'on' : null, '📍 Siamo stati');
  bv.onclick = () => { statView = 'vis'; renderStatsInto(host); };
  const bf = mk('button', statView === 'fat' ? 'on' : null, '🔥 Fatto qui');
  bf.onclick = () => { statView = 'fat'; renderStatsInto(host); };
  add(sw, bv, bf); add(host, sw);

  add(host, mk('div', 'mst-tot', statView === 'vis'
    ? `In totale: ${tot} luoghi in ${mesiAttivi} mesi`
    : `In totale: ${tot} volte in ${mesiAttivi} mesi`));

  const chart = mk('div', 'mst-chart');
  for (let i = 0; i < 12; i++) {
    const col = mk('div', 'mst-col');
    col.onclick = () => renderMonthInto(host, i);
    add(col, mk('div', 'mst-num' + (arr[i] ? '' : ' z'), String(arr[i])));
    const bar = mk('div', 'mst-bar' + (arr[i] ? '' : ' z'));
    bar.style.height = (arr[i] ? Math.round(arr[i] / max * 112) + 6 : 4) + 'px';
    add(col, bar); add(chart, col);
  }
  add(host, chart);
  const labels = mk('div', 'mst-labels');
  for (let i = 0; i < 12; i++) add(labels, mk('div', null, MESI[i]));
  add(host, labels);
  add(host, mk('div', 'mst-hint', 'tocca un mese per vedere i posti'));
}

function mprow(l) {
  const r = mk('div', 'mst-mrow');
  const info = mk('div');
  add(info, mk('div', 'mst-mnm', l.nome), mk('div', 'mst-mct', l.citta || ''));
  add(r, info);
  r.onclick = () => openDetail(l);
  return r;
}

function renderMonthInto(host, m) {
  clear(host);
  const { visited, fatto } = luoghiDelMese(luoghi, m);
  const h = mk('div', 'mst-mhead');
  const bk = mk('button', 'mst-back', '←'); bk.onclick = () => renderStatsInto(host);
  add(h, bk, mk('span', null, nomeMese(m)));
  add(host, h);
  const v = mk('div', 'mst-msec v');
  add(v, mk('div', 'mst-lbl', `📍 Dove siamo stati (${visited.length})`));
  if (visited.length) for (const l of visited) add(v, mprow(l));
  else add(v, mk('div', 'mst-empty', 'Nessun posto questo mese.'));
  add(host, v);
  const f = mk('div', 'mst-msec f');
  add(f, mk('div', 'mst-lbl', `🔥 Dove l'abbiamo fatto (${fatto.length})`));
  if (fatto.length) for (const l of fatto) add(f, mprow(l));
  else add(f, mk('div', 'mst-empty', 'Niente di piccante… per ora.'));
  add(host, f);
}

// ---- SCHEDA LUOGO (polaroid) ----
async function loadCover(l, img) {
  try {
    const foto = await listFoto(ctx.client, { contesto: 'luogo', refId: l.id });
    if (!foto.length) { img.classList.add('mappa-noimg'); return; }
    img.src = await signedUrl(ctx.client, foto[0].storage_path);
  } catch { img.classList.add('mappa-noimg'); }
}

function openDetail(l) {
  const ov = mk('div', 'modal on');
  const stage = mk('div', 'mappa-stage');
  const pol = mk('div', 'mappa-pol');
  const inner = mk('div', 'mappa-pol-inner');

  const front = mk('div', 'mappa-face mappa-front');
  const img = mk('img', 'mappa-pimg'); img.alt = '';
  loadCover(l, img);
  add(front, img);
  const cap = mk('div', 'mappa-cap');
  add(cap, mk('div', 'mappa-nm', l.nome), mk('div', 'mappa-dt', etichettaData(l.data_evento)));
  add(front, cap);

  const back = mk('div', 'mappa-face mappa-back');
  if (l.intimo) {
    const st = mk('div', 'mappa-stamp');
    add(st, mk('span', null, 'FATTO'), mk('br'), mk('span', null, 'QUI'));
    add(back, st);
  }
  add(back, mk('div', 'mappa-bnm', l.nome),
            mk('div', 'mappa-added', 'Aggiunta il ' + etichettaData(l.creato, { conGiorno: true })));
  if (l.intimo) add(back, mk('div', 'mappa-hearts', cuoriLabel(l.voto)));
  add(back, mk('div', 'mappa-bdesc', l.descrizione || ''));
  const strip = mk('div', 'mappa-bstrip');
  loadThumbsInto(ctx, { contesto: 'luogo', refId: l.id }, strip, false).catch(() => {});
  add(back, strip);

  add(inner, front, back);
  add(pol, inner); add(stage, pol);

  const tools = mk('div', 'mappa-tools');
  const flip = mk('button', 'mappa-tbtn primary', '↻ Gira');
  flip.onclick = () => { pol.classList.toggle('flip'); flip.textContent = pol.classList.contains('flip') ? '↺ Fronte' : '↻ Gira'; };
  const edit = mk('button', 'mappa-tbtn', '✎ Modifica');
  edit.onclick = () => { ov.remove(); openEdit(l); };
  const close = mk('button', 'mappa-tbtn', '✕ Chiudi');
  close.onclick = () => ov.remove();
  add(tools, flip, edit, close);

  add(ov, stage, tools);
  const fx = mk('div', 'mappa-flash'); add(ov, fx); setTimeout(() => fx.remove(), 450);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ---- FORM (campi condivisi) ----
function field(label, input) {
  const f = mk('div', 'mappa-field');
  add(f, mk('label', null, label), input);
  return f;
}

function votoSelector(initial) {
  const wrap = mk('div', 'mappa-voto');
  let v = initial || 0;
  const cuori = [];
  const paint = () => cuori.forEach((c, i) => { c.textContent = i < v ? '❤' : '♡'; });
  for (let i = 0; i < 5; i++) {
    const c = mk('span', 'mappa-cuore');
    c.onclick = () => { v = i + 1; paint(); };
    cuori.push(c); wrap.appendChild(c);
  }
  paint();
  return { el: wrap, get: () => v };
}

function openEdit(l) {
  openSheet('Modifica luogo', sheet => {
    const nome = mk('input'); nome.value = l.nome;
    const citta = mk('input'); citta.value = l.citta || '';
    const data = mk('input'); data.type = 'date'; data.value = l.data_evento || todayISO();
    const intimo = mk('input'); intimo.type = 'checkbox'; intimo.checked = !!l.intimo;
    const intimoRow = mk('label', 'mappa-check'); add(intimoRow, intimo, mk('span', null, " L'abbiamo fatto qui 🔥"));
    const voto = votoSelector(l.voto);
    const votoRow = mk('div', 'mappa-field'); add(votoRow, mk('label', null, 'Quanto è stato bello'), voto.el);
    votoRow.style.display = l.intimo ? '' : 'none';
    intimo.onchange = () => { votoRow.style.display = intimo.checked ? '' : 'none'; };
    const desc = mk('textarea'); desc.value = l.descrizione || '';
    const foto = fotoEditor(ctx, { contesto: 'luogo', refId: l.id });

    const save = mk('button', 'btn', 'Salva');
    save.onclick = async () => {
      if (!nome.value.trim()) { toast('Serve un nome', 'err'); return; }
      try {
        await updateLuogo(ctx.client, l.id, {
          nome: nome.value.trim(), citta: citta.value.trim(), intimo: intimo.checked,
          voto: voto.get(), descrizione: desc.value.trim(), data_evento: data.value,
        });
        await foto.flush(l.id);
        sheet.closest('.modal').remove();
        toast('Salvato');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };
    const del = mk('button', 'mappa-del', 'Elimina luogo');
    del.onclick = async () => {
      try {
        await deleteLuogo(ctx.client, l.id);
        sheet.closest('.modal').remove();
        toast('Eliminato');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };

    add(sheet, field('Nome', nome), field('Città', citta), field('Quando', data),
      intimoRow, votoRow, field('Descrizione', desc),
      mk('div', 'mappa-fotolbl', 'Foto'), foto.el, save, del);
  });
}
```

- [ ] **Step 2: Esegui i test (nessuna regressione)**

Run: `npm test`
Expected: PASS (il modulo non ha test unitari; la suite resta verde)

- [ ] **Step 3: Verifica manuale nel browser**

Servi la cartella e apri l'app (login → tab 🗺️ Mappa):

Run: `python -m http.server 8080` (oppure `npx serve .`) dalla root del progetto.

Verifica:
- Il tab "🗺️ Mappa" appare nella nav e mostra la mappa scura (tile CARTO dark) centrata sull'Italia.
- La maniglia in basso mostra "📊 Statistiche · 0 luoghi · 0 volte 🔥".
- Tap sulla maniglia → si apre la sheet con switch 📍/🔥, barre tutte a zero, e lo sfondo NON scrolla (scroll-lock attivo).

> Le verifiche su pin/polaroid/modifica richiedono almeno un luogo: si completano dopo il Task 8.

- [ ] **Step 4: Commit**

```bash
git add js/modules/mappa.js
git commit -m "feat(mappa): modulo mappa con pin, polaroid, drawer statistiche"
```

---

### Task 8: Aggiunta luogo (FAB) — ricerca indirizzo + tap sulla mappa

**Files:**
- Modify: `js/modules/mappa.js` (append delle funzioni di aggiunta + listener FAB)

- [ ] **Step 1: Aggiungi il flusso di creazione**

Aggiungi in fondo a `js/modules/mappa.js`:

```js
// ---- AGGIUNTA LUOGO ----
function openForm(latlng, prefill = {}) {
  openSheet('Nuovo luogo', sheet => {
    const nome = mk('input'); nome.placeholder = 'Nome del posto'; if (prefill.nome) nome.value = prefill.nome;
    const citta = mk('input'); citta.placeholder = 'Città (facoltativa)'; if (prefill.citta) citta.value = prefill.citta;
    const data = mk('input'); data.type = 'date'; data.value = todayISO();
    const intimo = mk('input'); intimo.type = 'checkbox';
    const intimoRow = mk('label', 'mappa-check'); add(intimoRow, intimo, mk('span', null, " L'abbiamo fatto qui 🔥"));
    const voto = votoSelector(0);
    const votoRow = mk('div', 'mappa-field'); add(votoRow, mk('label', null, 'Quanto è stato bello'), voto.el);
    votoRow.style.display = 'none';
    intimo.onchange = () => { votoRow.style.display = intimo.checked ? '' : 'none'; };
    const desc = mk('textarea'); desc.placeholder = 'Descrizione…';
    const foto = fotoEditor(ctx, { contesto: 'luogo', refId: null });
    const coordLbl = mk('div', 'mappa-coord', `📍 ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);

    const save = mk('button', 'btn', 'Salva il luogo');
    save.onclick = async () => {
      if (!nome.value.trim()) { toast('Serve un nome', 'err'); return; }
      try {
        const row = await addLuogo(ctx.client, {
          couple_id: ctx.me.couple_id, autore_id: ctx.me.id,
          nome: nome.value.trim(), citta: citta.value.trim(),
          lat: latlng.lat, lng: latlng.lng,
          intimo: intimo.checked, voto: voto.get(),
          descrizione: desc.value.trim(), data_evento: data.value,
        });
        await foto.flush(row.id);
        sheet.closest('.modal').remove();
        toast('Luogo aggiunto');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };

    add(sheet, coordLbl, field('Nome', nome), field('Città', citta), field('Quando', data),
      intimoRow, votoRow, field('Descrizione', desc),
      mk('div', 'mappa-fotolbl', 'Foto'), foto.el, save);
  });
}

// Cerca un indirizzo via Nominatim (OSM, gratuito) oppure scegli toccando la mappa.
function startAdd() {
  if (!map) { toast('Apri prima la mappa'); return; }
  openSheet('Aggiungi un luogo', sheet => {
    const q = mk('input'); q.placeholder = 'Cerca un indirizzo o una città…';
    const cerca = mk('button', 'btn', 'Cerca');
    const results = mk('div', 'mappa-results');
    cerca.onclick = async () => {
      const term = q.value.trim(); if (!term) return;
      clear(results); add(results, mk('div', 'mst-empty', 'Cerco…'));
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(term),
          { headers: { 'Accept-Language': 'it' } });
        const list = await r.json();
        clear(results);
        if (!list.length) { add(results, mk('div', 'mst-empty', 'Nessun risultato.')); return; }
        for (const it of list) {
          const row = mk('button', 'mappa-result', it.display_name);
          row.onclick = () => {
            sheet.closest('.modal').remove();
            const latlng = { lat: parseFloat(it.lat), lng: parseFloat(it.lon) };
            map.setView([latlng.lat, latlng.lng], 14);
            openForm(latlng, { citta: (it.display_name.split(',')[0] || '').trim() });
          };
          add(results, row);
        }
      } catch (err) { clear(results); toast('Ricerca fallita: ' + err.message, 'err'); }
    };
    const orTap = mk('button', 'mappa-tbtn', '📍 …o tocca un punto sulla mappa');
    orTap.onclick = () => {
      sheet.closest('.modal').remove();
      toast('Tocca la mappa nel punto giusto');
      map.once('click', e => openForm(e.latlng));
    };
    add(sheet, field('Indirizzo', q), cerca, results, mk('div', 'mappa-or', 'oppure'), orTap);
  });
}

// Il FAB globale delega al tab corrente via evento 'fab:<tab>'.
document.addEventListener('fab:mappa', startAdd);
```

- [ ] **Step 2: Esegui i test (nessuna regressione)**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add js/modules/mappa.js
git commit -m "feat(mappa): aggiunta luogo via ricerca indirizzo (Nominatim) o tap sulla mappa"
```

---

### Task 9: Applicazione migrazione + smoke end-to-end

**Files:**
- Modify: `test/smoke.md` (append della sezione Mappa)

- [ ] **Step 1: Applica la migrazione su Supabase**

Apri il SQL Editor del progetto Supabase di Velluto ed esegui il contenuto di `supabase/luoghi.sql`.
Verifica nel SQL Editor:

```sql
select count(*) from luoghi;                                   -- 0 (tabella creata)
select conname from pg_constraint where conname = 'foto_contesto_check';  -- 1 riga
```

- [ ] **Step 2: Smoke manuale (app reale, loggato)**

Servi la cartella (`python -m http.server 8080`), fai login con un utente reale e vai sul tab 🗺️ Mappa. Verifica nell'ordine:

1. **Aggiunta via ricerca:** FAB ＋ → "Cerca" un indirizzo noto → scegli un risultato → la mappa si centra → compila nome + data → Salva → toast "Luogo aggiunto" → un pin appare sulla mappa.
2. **Aggiunta via tap:** FAB ＋ → "…o tocca un punto" → tocca la mappa → compila marcando "L'abbiamo fatto qui 🔥" + voto a cuori → Salva → secondo pin.
3. **Polaroid:** tap su un pin → flash bianco → polaroid fronte (foto/nome/data) → "↻ Gira" → retro (Aggiunta il…, descrizione, cuori se intimo, francobollo FATTO QUI se intimo).
4. **Modifica:** dalla polaroid "✎ Modifica" → cambia descrizione + aggiungi una foto → Salva → riapri il pin: la foto compare nella polaroid.
5. **Statistiche:** maniglia in basso → switch 📍/🔥 → la barra del mese giusto è valorizzata → tap sul mese → compaiono i posti nelle sezioni 📍/🔥.
6. **Eliminazione:** Modifica → "Elimina luogo" → il pin sparisce.
7. **Scroll-lock:** con polaroid o sheet aperti, lo sfondo non scrolla.

- [ ] **Step 3: Annota lo smoke**

Aggiungi in fondo a `test/smoke.md`:

```markdown

## Mappa (tab 🗺️) — Fase Mappa Luoghi
- [ ] Migrazione `supabase/luoghi.sql` applicata (tabella `luoghi` + `foto_contesto_check` con 'luogo').
- [ ] Aggiunta luogo via ricerca indirizzo (Nominatim) e via tap sulla mappa.
- [ ] Pin → polaroid con flash, flip fronte/retro; francobollo + cuori solo sui luoghi intimi.
- [ ] Modifica luogo (descrizione, voto, foto) e eliminazione.
- [ ] Drawer statistiche: switch 📍/🔥, barre per mese, tap mese → posti del mese.
- [ ] Scroll-lock attivo con overlay aperti.
```

- [ ] **Step 4: Esegui tutta la suite**

Run: `npm test`
Expected: PASS (logic + store, nessuna regressione)

- [ ] **Step 5: Commit**

```bash
git add test/smoke.md
git commit -m "test(mappa): checklist smoke tab mappa"
```

- [ ] **Step 6: Chiusura branch**

Usa la skill `superpowers:finishing-a-development-branch` per decidere merge/PR di `feat/mappa-luoghi`.

---

## Note di self-review (già applicate)

- **Copertura spec:** tab 6° ✅ (Task 5/6), una sola collezione + flag `intimo` ✅ (Task 2), Leaflet+CARTO dark ✅ (Task 7), maniglia D + barre ✅ (Task 7), polaroid flip + flash + francobollo/cuori ✅ (Task 7), drawer stats con switch + mese→posti ✅ (Task 7), aggiunta via indirizzo + tap ✅ (Task 8), foto contesto `luogo` ✅ (Task 2/7/8), `esperienza_id` per il collegamento al calendario ✅ (colonna in Task 2, campo passato in `addLuogo`). Logica pura testata ✅ (Task 1), CRUD testato ✅ (Task 3).
- **Coerenza nomi:** `renderMappa`, `openStats`/`renderStatsInto`/`renderMonthInto`, `openDetail`, `openEdit`/`openForm`/`startAdd`, store `listLuoghi/addLuogo/updateLuogo/deleteLuogo`, logic `meseDi/aggregaPerMese/soloIntimi/totaliLuoghi/luoghiDelMese/cuoriLabel/etichettaData` — usati in modo consistente fra i task.
- **Niente placeholder:** ogni step di codice mostra il codice completo.
