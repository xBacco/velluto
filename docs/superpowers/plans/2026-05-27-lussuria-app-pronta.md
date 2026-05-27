# Lussuria — "app pronta all'uso" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare Velluto in "Lussuria" e renderla un'app installabile e usabile da telefono: rename, PWA, stop overscroll, swipe pager stile iPhone, pagina Impostazioni vera (profilo, blocco PIN+biometrico per-device, modalità pudica, tag, contenuti giochi, svuota dati, cambia password, logout).

**Architecture:** Frontend statico ES-modules + Supabase. La logica testabile (PIN/lock, bulk-delete, updateProfile) sta in funzioni pure/store con unit test `node --test`; UI/pager/CSS si verificano con smoke nel browser. Layout dell'app rifatto a colonna fissa (topbar / viewport-pager / dock) per uccidere l'overscroll e ospitare il pager orizzontale.

**Tech Stack:** HTML/CSS/JS vanilla, `node --test`, supabase-js, Leaflet, WebAuthn, Service Worker, `crypto.subtle`.

**Spec:** `docs/superpowers/specs/2026-05-27-lussuria-app-pronta-design.md`

**Vincoli del progetto:** NIENTE `innerHTML` (hook di sicurezza lo blocca; usare `mk/add/clear` di `js/ui.js` o `textContent`/DOM). Mobile-first. Palette in `:root` di `styles.css`. Default branch = `master`. Commit+push automatici.

---

## File map

- `index.html` — rename, head PWA, refactor struttura `#app` (viewport+track), container gate PIN.
- `manifest.json` (nuovo, root) — manifest PWA.
- `sw.js` (nuovo, root) — service worker minimale.
- `icons/` (nuovo) — `icon.svg` sorgente fiamma + PNG generati 180/192/512/512-maskable.
- `tools/render-icons.mjs` (nuovo) — script una-tantum SVG→PNG.
- `styles.css` — layout colonna fissa, `.viewport/.track/.page`, blocco `.set-*`, `.lockgate`, `body.pudica`.
- `js/app.js` — motore pager (sostituisce `enableSwipe`), registrazione SW, chip→Impostazioni, gate PIN all'avvio.
- `js/store.js` — `updateProfile` + `wipeDesideri/wipeEsperienze/wipeBuoni/wipeGiochi/wipeLuoghi/wipeTipi`.
- `js/lib/lock.js` (nuovo) — PIN hash/verify/stato, modalità pudica, helper WebAuthn.
- `js/modules/impostazioni.js` (nuovo) — sheet Impostazioni + sotto-schermata Svuota + gate PIN UI.
- `test/lock.test.js` (nuovo), `test/store-app-pronta.test.js` (nuovo) — unit.
- `test/smoke.md` — checklist "App pronta".

---

## Task 1: Rename Velluto → Lussuria

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Sostituire le occorrenze del nome**

In `index.html`: `<title>Velluto</title>` → `<title>Lussuria</title>`; `<div class="brand">Velluto</div>` → `Lussuria`; `<div class="login-title">Velluto</div>` → `Lussuria`. Lasciare invariato il kicker `il nostro spazio`.

- [ ] **Step 2: Verificare che non resti "Velluto" come nome app**

Run: `grep -n "Velluto" index.html`
Expected: nessuna riga (o solo eventuali commenti). Le occorrenze in `docs/`, `mockups/`, memoria NON si toccano.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(rename): Velluto -> Lussuria nei testi dell'app"
```

---

## Task 2: PWA — icona, manifest, service worker

**Files:**
- Create: `icons/icon.svg`, `tools/render-icons.mjs`, `manifest.json`, `sw.js`
- Modify: `index.html`, `js/app.js`

- [ ] **Step 1: Sorgente icona fiamma (concept #2)**

Create `icons/icon.svg` (512×512, fiamma oro→rosa su bordeaux; copre tutta l'area per la versione maskable):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="62%" r="70%">
      <stop offset="0" stop-color="#3a0d1c"/><stop offset="1" stop-color="#120308"/>
    </radialGradient>
    <linearGradient id="fl" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#7a1533"/><stop offset=".5" stop-color="#c2557a"/><stop offset="1" stop-color="#e9c98f"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <path d="M256 96 C205 188 154 218 184 310 C200 372 256 404 256 404 C256 404 312 372 328 310 C358 218 307 188 256 96 Z" fill="url(#fl)"/>
  <path d="M256 228 C235 268 225 288 246 332 C256 356 256 360 256 360 C256 360 271 340 271 308 C271 268 256 258 256 228 Z" fill="#160409" opacity=".55"/>
</svg>
```

- [ ] **Step 2: Script di rendering PNG**

Create `tools/render-icons.mjs`. Usa `sharp` se presente, altrimenti stampa istruzioni. (Esecuzione una-tantum, non runtime.)

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const svg = await readFile(new URL('../icons/icon.svg', import.meta.url));
let sharp;
try { sharp = (await import('sharp')).default; }
catch { console.error('Manca "sharp". Esegui: npm i -D sharp  (oppure genera i PNG a mano da icons/icon.svg)'); process.exit(1); }
await mkdir(new URL('../icons/', import.meta.url), { recursive: true });
const sizes = [180, 192, 512];
for (const s of sizes) {
  await sharp(svg).resize(s, s).png().toFile(new URL(`../icons/icon-${s}.png`, import.meta.url).pathname);
  console.log('icon-' + s + '.png');
}
// maskable: padding ~20% (icona dentro safe-zone)
await sharp(svg).resize(410, 410).extend({ top:51, bottom:51, left:51, right:51, background:'#160409' })
  .png().toFile(new URL('../icons/icon-512-maskable.png', import.meta.url).pathname);
console.log('icon-512-maskable.png');
```

- [ ] **Step 3: Generare i PNG**

Run: `npm i -D sharp && node tools/render-icons.mjs`
Expected: stampa `icon-180.png icon-192.png icon-512.png icon-512-maskable.png`; i file esistono in `icons/`.
Se `sharp` non installabile: aprire `icons/icon.svg` nel browser e esportare i 4 PNG a mano alle misure indicate.

- [ ] **Step 4: manifest.json**

Create `manifest.json` (root):

```json
{
  "name": "Lussuria",
  "short_name": "Lussuria",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#160409",
  "theme_color": "#160409",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 5: Head PWA in index.html**

In `<head>` di `index.html`, dopo il `theme-color` esistente, aggiungere:

```html
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Lussuria">
```

- [ ] **Step 6: Service worker**

Create `sw.js` (root):

```js
const CACHE = 'lussuria-v1';
const SHELL = ['./', './index.html', './styles.css'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Mai cachare Supabase
  if (url.hostname.endsWith('supabase.co')) return;
  // network-first per i file dell'app (stessa origine), fallback cache
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // cache-first per CDN (Leaflet/supabase-js bundle)
  e.respondWith(caches.match(e.request).then(m => m || fetch(e.request)));
});
```

- [ ] **Step 7: Registrare il SW in app.js**

In `js/app.js`, in fondo (prima o dopo `boot()`), aggiungere:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
```

- [ ] **Step 8: Verifica manuale**

Run: `python -m http.server 8765 --directory .` poi aprire `http://localhost:8765/` in Chrome → DevTools → Application: Manifest valido (icone caricate), Service Worker "activated". Lighthouse PWA "Installable".

- [ ] **Step 9: Commit**

```bash
git add icons manifest.json sw.js tools/render-icons.mjs index.html js/app.js package.json package-lock.json
git commit -m "feat(pwa): manifest, icona fiamma, service worker, meta iOS"
```

---

## Task 3: Layout a colonna fissa (stop overscroll)

**Files:**
- Modify: `index.html`, `styles.css`

- [ ] **Step 1: Struttura #app in index.html**

Riorganizzare il contenuto di `<div class="wrap" id="app">` così (topbar invariata; i 6 `<section class="panel">` diventano celle dentro `#track`, **nell'ordine delle TABS**: desideri, giochi, calendario, mappa, buoni, galleria):

```html
<div class="wrap" id="app" style="display:none">
  <div class="topbar">
    <div class="brand">Lussuria</div>
    <div class="topbar-right">
      <button class="me-chip" id="meChip"></button>
    </div>
  </div>
  <div class="viewport" id="viewport">
    <div class="track" id="track">
      <section class="page" id="p-desideri"></section>
      <section class="page" id="p-giochi"></section>
      <section class="page" id="p-calendario"></section>
      <section class="page" id="p-mappa"></section>
      <section class="page" id="p-buoni"></section>
      <section class="page" id="p-galleria"></section>
    </div>
  </div>
  <nav class="nav" id="nav"></nav>
</div>
```

Nota: il bottone `#gear` viene **rimosso** dalla topbar (i tag confluiscono nelle Impostazioni — Task 9/12). Il FAB `#fab` resta dov'è.

- [ ] **Step 2: CSS layout**

In `styles.css`: sostituire le regole di `html,body`, `.wrap`, `.panel` e aggiungere `.viewport/.track/.page`.

```css
html,body{margin:0;padding:0;height:100%;overflow:hidden;overscroll-behavior:none;}
body{position:fixed;inset:0;font-family:Georgia,"Times New Roman",serif;color:var(--cream);
  -webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 70% at 50% -5%,#3d0a1a 0,transparent 55%),
             linear-gradient(170deg,var(--bg),var(--bg2));background-attachment:fixed;}

.wrap{max-width:540px;margin:0 auto;height:100%;display:flex;flex-direction:column;padding:0;}
.topbar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
  padding:max(14px,env(safe-area-inset-top)) 16px 10px;margin:0;}

.viewport{flex:1 1 auto;position:relative;overflow:hidden;touch-action:pan-y;}
.track{display:flex;height:100%;will-change:transform;}
.page{flex:0 0 100%;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;
  padding:6px 16px calc(96px + env(safe-area-inset-bottom));scrollbar-width:none;}
.page::-webkit-scrollbar{display:none;}

.nav{flex:0 0 auto;position:static;left:auto;right:auto;bottom:auto;margin:0 12px 14px;}
```

(La regola `.nav{position:fixed;...}` esistente va sostituita con quella sopra; mantenere il resto dello styling `.nav button` invariato.)

- [ ] **Step 3: Verifica manuale**

Servire e aprire da telefono/emulazione mobile: la topbar e la dock restano fisse, il contenuto scrolla solo nell'area centrale, e **non c'è più il rimbalzo** della pagina intera quando il contenuto ci sta. (Il pager non funziona ancora — solo la pagina corrente è visibile perché `go()` non è ancora riscritto: arriva nel Task 4.)

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat(layout): colonna fissa topbar/viewport/dock, stop overscroll"
```

---

## Task 4: Swipe pager (segue il dito)

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Riscrivere la sezione nav/swipe di app.js**

Sostituire `buildNav`, `enableSwipe`, `go` e l'inizializzazione con il motore pager. Codice completo (lazy render delle pagine adiacenti, mappa-isola, no-wrap con rubber-band, invalidateSize della mappa all'atterraggio):

```js
const viewport = () => $('viewport');
const track = () => $('track');
let index = 0;                 // pagina corrente
const rendered = new Set();    // indici già renderizzati

function buildNav() {
  const n = $('nav'); clear(n);
  TABS.forEach(([k, i, l], idx) => {
    const b = mk('button'); add(b, mk('span', null, i), mk('span', 'lab', l));
    b.dataset.k = k; b.onclick = () => go(k); n.appendChild(b);
  });
  enablePager();
  layout(false);
  renderNear();
}

function go(k) {
  const i = TABS.findIndex(t => t[0] === k);
  if (i < 0) return;
  index = i; cur = k;
  layout(true);
  renderNear();
}

function layout(animate) {
  const W = viewport().clientWidth;
  track().style.transition = animate ? 'transform .34s cubic-bezier(.17,.67,.18,1)' : 'none';
  track().style.transform = 'translateX(' + (-index * W) + 'px)';
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.k === cur));
}

// renderizza la pagina corrente e le adiacenti (lazy, una volta)
function renderNear() {
  [index - 1, index, index + 1].forEach(i => {
    if (i < 0 || i >= TABS.length || rendered.has(i)) return;
    rendered.add(i);
    renderTab(TABS[i][0]);
  });
  // la mappa ha bisogno di ricalcolare le dimensioni quando diventa visibile
  if (cur === 'mappa') setTimeout(() => document.dispatchEvent(new CustomEvent('mappa:resize')), 360);
}

function renderTab(k) {
  const map = {
    desideri:  () => renderDesideri({ client, me, panel: $('p-desideri') }),
    calendario:() => renderCalendario({ client, me, panel: $('p-calendario') }),
    buoni:     () => renderBuoni({ client, me, panel: $('p-buoni') }),
    galleria:  () => renderGalleria({ client, me, panel: $('p-galleria') }),
    giochi:    () => renderGiochi({ client, me, panel: $('p-giochi') }),
    mappa:     () => renderMappa({ client, me, panel: $('p-mappa') }),
  };
  (map[k] || (() => {}))().catch(err => toast('Errore: ' + err.message, 'err'));
}

// motore gesto: il track segue il dito, snap al rilascio, niente wrap, mappa = isola
function enablePager() {
  const vp = viewport();
  let startX = 0, startY = 0, dragging = false, decided = false, horiz = false;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('.mappa-area')) return;   // dentro la mappa: lascia fare a Leaflet
    dragging = true; decided = false; horiz = false;
    startX = e.clientX; startY = e.clientY;
    track().style.transition = 'none';
    try { vp.setPointerCapture(e.pointerId); } catch (_) {}
  });
  vp.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true; horiz = Math.abs(dx) > Math.abs(dy);
      if (!horiz) { dragging = false; return; }     // verticale → scroll nativo della pagina
    }
    e.preventDefault();
    const W = vp.clientWidth;
    let t = -index * W + dx;
    const min = -(TABS.length - 1) * W, max = 0;
    if (t > max) t = max + (t - max) * 0.35;          // rubber-band ai bordi
    if (t < min) t = min + (t - min) * 0.35;
    track().style.transform = 'translateX(' + t + 'px)';
  }, { passive: false });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    if (!horiz) return;
    const W = vp.clientWidth;
    const dx = (e.clientX != null ? e.clientX : startX) - startX;
    const threshold = W * 0.22;
    if (dx < -threshold && index < TABS.length - 1) go(TABS[index + 1][0]);
    else if (dx > threshold && index > 0) go(TABS[index - 1][0]);
    else layout(true);
  }
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', () => { dragging = false; layout(true); });
  window.addEventListener('resize', () => layout(false));
}
```

- [ ] **Step 2: Rimuovere il vecchio `render()` "single panel"**

L'attuale `function render() { if (cur===...) ... }` non serve più (sostituito da `renderTab`). Aggiornare il FAB e l'handler `goto` che usavano `render()`/`go()`:

```js
// il FAB delega al modulo della pagina corrente
$('fab').onclick = () => document.dispatchEvent(new CustomEvent('fab:' + cur));
// la Galleria chiede di navigare alla sezione d'origine di una foto
document.addEventListener('goto', e => go(e.detail));
```

E nel modulo mappa (`js/modules/mappa.js`), assicurarsi che esista un listener `document.addEventListener('mappa:resize', () => map.invalidateSize())` dopo l'init della mappa (se non c'è, aggiungerlo dove `map` è in scope).

- [ ] **Step 3: `.on` delle pagine non serve più**

Le `.page` sono sempre `display:block` (sono celle del track). Nessun toggle `.on`. Verificare che nessun CSS nasconda `.page` con `display:none` (la vecchia `.panel{display:none}` è stata rimossa nel Task 3).

- [ ] **Step 4: Verifica manuale (telefono)**

Servire e aprire da telefono: trascinare orizzontale → il contenuto segue il dito e scatta; verticale → scroll; bordi → rimbalzo senza wrap; pagina Mappa → la cartina pana, per uscire si usa la dock; le righe orizzontali (tally/chips) scrollano per conto loro. Tab dalla dock → snap animato.

- [ ] **Step 5: Commit**

```bash
git add js/app.js js/modules/mappa.js
git commit -m "feat(nav): swipe pager che segue il dito, snap, mappa-isola, no wrap"
```

---

## Task 5: store.updateProfile (TDD)

**Files:**
- Modify: `js/store.js`
- Test: `test/store-app-pronta.test.js` (nuovo)

- [ ] **Step 1: Test che fallisce**

Create `test/store-app-pronta.test.js` con il fake client (copiato dal pattern di `test/luoghi-store.test.js`) e il primo test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateProfile } from '../js/store.js';

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
export { fakeClient };

test('updateProfile aggiorna avatar e display_name del profilo per id', async () => {
  const c = fakeClient();
  await updateProfile(c, 'u1', { display_name: 'Tomas', avatar: '🐻' });
  const up = c._calls.find(x => x.op === 'update');
  assert.equal(up.table, 'profiles');
  assert.equal(up.payload.display_name, 'Tomas');
  assert.equal(up.payload.avatar, '🐻');
  assert.equal(up.filters.id, 'u1');
});

test('updateProfile manda solo i campi forniti', async () => {
  const c = fakeClient();
  await updateProfile(c, 'u1', { avatar: '🧁' });
  const up = c._calls.find(x => x.op === 'update');
  assert.deepEqual(Object.keys(up.payload), ['avatar']);
});
```

- [ ] **Step 2: Far fallire**

Run: `node --test test/store-app-pronta.test.js`
Expected: FAIL — `updateProfile is not a function` / `not exported`.

- [ ] **Step 3: Implementare**

In `js/store.js`, dopo `deleteFotoDi` (o vicino alle funzioni profili), aggiungere:

```js
// ---- PROFILO ----
export async function updateProfile(client, id, { display_name, avatar } = {}) {
  const patch = {};
  if (display_name !== undefined) patch.display_name = display_name;
  if (avatar !== undefined) patch.avatar = avatar;
  const res = await client.from('profiles').update(patch).eq('id', id);
  return check(res);
}
```

- [ ] **Step 4: Verde**

Run: `node --test test/store-app-pronta.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store-app-pronta.test.js
git commit -m "feat(store): updateProfile (nome+avatar) con test"
```

---

## Task 6: store.wipe* (TDD)

**Files:**
- Modify: `js/store.js`
- Test: `test/store-app-pronta.test.js`

- [ ] **Step 1: Test che fallisce**

Aggiungere a `test/store-app-pronta.test.js`:

```js
import { wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../js/store.js';

test('wipeDesideri cancella i desideri della coppia', async () => {
  const c = fakeClient();
  await wipeDesideri(c, 'cpl');
  const del = c._calls.find(x => x.op === 'delete');
  assert.equal(del.table, 'desideri');
  assert.equal(del.filters.couple_id, 'cpl');
});

test('wipeEsperienze pulisce le foto delle esperienze poi le righe', async () => {
  const c = fakeClient([{ id: 'e1', couple_id: 'cpl' }, { id: 'e9', couple_id: 'altra' }]);
  await wipeEsperienze(c, 'cpl');
  // ha provato a leggere le foto del contesto esperienza per e1 (nessuna foto seedata → nessuna storage call)
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'e1'));
  const del = c._calls.find(x => x.table === 'esperienze' && x.op === 'delete');
  assert.equal(del.filters.couple_id, 'cpl');
});

test('wipeBuoni pulisce foto buono poi righe', async () => {
  const c = fakeClient([{ id: 'b1', couple_id: 'cpl' }]);
  await wipeBuoni(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'b1'));
  assert.ok(c._calls.some(x => x.table === 'buoni' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeGiochi azzera giri_movimenti e strip_partite', async () => {
  const c = fakeClient();
  await wipeGiochi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'giri_movimenti' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
  assert.ok(c._calls.some(x => x.table === 'strip_partite' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeLuoghi pulisce foto luogo poi righe', async () => {
  const c = fakeClient([{ id: 'l1', couple_id: 'cpl' }]);
  await wipeLuoghi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'foto' && x.op === 'select' && x.filters.ref_id === 'l1'));
  assert.ok(c._calls.some(x => x.table === 'luoghi' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});

test('wipeTipi cancella i tipi della coppia', async () => {
  const c = fakeClient();
  await wipeTipi(c, 'cpl');
  assert.ok(c._calls.some(x => x.table === 'tipi' && x.op === 'delete' && x.filters.couple_id === 'cpl'));
});
```

- [ ] **Step 2: Far fallire**

Run: `node --test test/store-app-pronta.test.js`
Expected: FAIL — funzioni `wipe*` non esportate.

- [ ] **Step 3: Implementare**

In `js/store.js` aggiungere (usano `listEsperienze/listBuoni/listLuoghi` e `deleteFotoDi` già presenti):

```js
// ---- SVUOTA DATI (per couple) ----
export async function wipeDesideri(client, coupleId) {
  return check(await client.from('desideri').delete().eq('couple_id', coupleId));
}
export async function wipeEsperienze(client, coupleId) {
  const list = await listEsperienze(client, coupleId);
  for (const e of list) await deleteFotoDi(client, { contesto: 'esperienza', refId: e.id });
  return check(await client.from('esperienze').delete().eq('couple_id', coupleId));
}
export async function wipeBuoni(client, coupleId) {
  const list = await listBuoni(client, coupleId);
  for (const b of list) await deleteFotoDi(client, { contesto: 'buono', refId: b.id });
  return check(await client.from('buoni').delete().eq('couple_id', coupleId));
}
export async function wipeGiochi(client, coupleId) {
  await client.from('giri_movimenti').delete().eq('couple_id', coupleId);
  return check(await client.from('strip_partite').delete().eq('couple_id', coupleId));
}
export async function wipeLuoghi(client, coupleId) {
  const list = await listLuoghi(client, coupleId);
  for (const l of list) await deleteFotoDi(client, { contesto: 'luogo', refId: l.id });
  return check(await client.from('luoghi').delete().eq('couple_id', coupleId));
}
export async function wipeTipi(client, coupleId) {
  return check(await client.from('tipi').delete().eq('couple_id', coupleId));
}
```

- [ ] **Step 4: Verde**

Run: `node --test test/store-app-pronta.test.js`
Expected: PASS (tutti).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store-app-pronta.test.js
git commit -m "feat(store): wipe* per Svuota dati (con pulizia foto) + test"
```

---

## Task 7: lib/lock.js — PIN e modalità pudica (TDD)

**Files:**
- Create: `js/lib/lock.js`, `test/lock.test.js`

- [ ] **Step 1: Test che fallisce**

Create `test/lock.test.js` (fornisce un finto `localStorage` su `globalThis`; `crypto.subtle` è nativo in Node ≥20):

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  let m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { m = {}; },
  };
})();

const { isPinValid, setPin, verifyPin, isLockEnabled, disableLock, getPudica, setPudica } = await import('../js/lib/lock.js');

beforeEach(() => localStorage.clear());

test('isPinValid accetta 4-6 cifre, rifiuta il resto', () => {
  assert.equal(isPinValid('1234'), true);
  assert.equal(isPinValid('123456'), true);
  assert.equal(isPinValid('123'), false);
  assert.equal(isPinValid('1234567'), false);
  assert.equal(isPinValid('12a4'), false);
  assert.equal(isPinValid(''), false);
});

test('setPin abilita il lock e verifyPin distingue giusto/sbagliato', async () => {
  await setPin('2468');
  assert.equal(isLockEnabled(), true);
  assert.equal(await verifyPin('2468'), true);
  assert.equal(await verifyPin('0000'), false);
});

test('il PIN non è salvato in chiaro', async () => {
  await setPin('1357');
  const raw = JSON.stringify(localStorage.getItem('lussuria.lock'));
  assert.ok(!raw.includes('1357'));
});

test('disableLock spegne il lock', async () => {
  await setPin('1234');
  disableLock();
  assert.equal(isLockEnabled(), false);
  assert.equal(await verifyPin('1234'), false);
});

test('modalità pudica: default off, persiste', () => {
  assert.equal(getPudica(), false);
  setPudica(true);
  assert.equal(getPudica(), true);
});
```

- [ ] **Step 2: Far fallire**

Run: `node --test test/lock.test.js`
Expected: FAIL — modulo `../js/lib/lock.js` inesistente.

- [ ] **Step 3: Implementare**

Create `js/lib/lock.js`:

```js
// Stato per-dispositivo (localStorage). Niente sul server.
const LOCK_KEY = 'lussuria.lock';     // { enabled, hash, bio, credId }
const PUDICA_KEY = 'lussuria.pudica'; // "1" | assente

export function isPinValid(pin) {
  return typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function loadLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; }
  catch { return {}; }
}
function saveLock(st) { localStorage.setItem(LOCK_KEY, JSON.stringify(st)); }

export function isLockEnabled() { return !!loadLock().enabled; }

export async function setPin(pin) {
  if (!isPinValid(pin)) throw new Error('PIN non valido (4-6 cifre)');
  const st = loadLock();
  st.enabled = true;
  st.hash = await sha256hex(pin);
  saveLock(st);
}

export async function verifyPin(pin) {
  const st = loadLock();
  if (!st.enabled || !st.hash) return false;
  return (await sha256hex(pin)) === st.hash;
}

export function disableLock() {
  saveLock({ enabled: false, hash: null, bio: false, credId: null });
}

// ---- modalità pudica ----
export function getPudica() { return localStorage.getItem(PUDICA_KEY) === '1'; }
export function setPudica(on) {
  if (on) localStorage.setItem(PUDICA_KEY, '1');
  else localStorage.removeItem(PUDICA_KEY);
}

// ---- biometrico (WebAuthn) — presence-check locale, vedi Task 8 ----
export function bioSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
export function isBioEnabled() { return !!loadLock().bio; }

export async function enableBio() {
  if (!bioSupported()) throw new Error('Biometria non disponibile su questo dispositivo');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Lussuria' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'lussuria', displayName: 'Lussuria' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    },
  });
  const id = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  const st = loadLock(); st.bio = true; st.credId = id; saveLock(st);
}

export function disableBio() { const st = loadLock(); st.bio = false; st.credId = null; saveLock(st); }

export async function unlockBio() {
  const st = loadLock();
  if (!st.bio || !st.credId) return false;
  const raw = Uint8Array.from(atob(st.credId), c => c.charCodeAt(0));
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: raw }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return true;   // presence-check locale: se la biometria passa, sblocca
  } catch { return false; }
}
```

- [ ] **Step 4: Verde**

Run: `node --test test/lock.test.js`
Expected: PASS (i test biometrici non sono inclusi — solo PIN/pudica).

- [ ] **Step 5: Commit**

```bash
git add js/lib/lock.js test/lock.test.js
git commit -m "feat(lock): PIN hashato per-device + modalità pudica + helper WebAuthn (TDD)"
```

---

## Task 8: Gate PIN/biometrico all'avvio

**Files:**
- Modify: `index.html`, `styles.css`, `js/app.js`

- [ ] **Step 1: Container del gate in index.html**

Subito dopo il gate `#login`, aggiungere:

```html
<div id="lockgate" class="lockgate" style="display:none">
  <div class="candle">🔥</div>
  <div class="lock-title">Lussuria</div>
  <div class="lock-sub">Inserisci il codice</div>
  <div class="pin-dots" id="pinDots"></div>
  <div class="pin-pad" id="pinPad"></div>
  <button class="pin-bio" id="pinBio" style="display:none">👆 Sblocca con Face ID / impronta</button>
  <div id="lockErr" class="login-err"></div>
</div>
```

- [ ] **Step 2: CSS del gate**

In `styles.css` aggiungere (riusa il mood del `#login`):

```css
.lockgate{position:fixed;inset:0;z-index:45;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:16px;padding:32px;
  background:radial-gradient(120% 70% at 50% -5%,#3d0a1a 0,transparent 55%),linear-gradient(170deg,var(--bg),var(--bg2));}
.lock-title{font-size:30px;color:var(--gold);letter-spacing:2px;}
.lock-sub{font-family:Arial;font-size:13px;color:#9d8478;}
.pin-dots{display:flex;gap:14px;margin:8px 0;}
.pin-dots .d{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--gold);opacity:.5;}
.pin-dots .d.on{background:var(--gold);opacity:1;}
.pin-pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px;}
.pin-pad button{font-family:Arial;font-size:24px;color:var(--cream);height:72px;border-radius:50%;
  background:rgba(122,21,51,.25);border:1px solid rgba(212,168,108,.3);cursor:pointer;}
.pin-pad button:active{background:rgba(122,21,51,.5);}
.pin-pad button.empty{background:transparent;border:0;cursor:default;}
.pin-bio{font-family:Arial;font-size:14px;color:var(--gold-soft);background:transparent;
  border:1px solid rgba(212,168,108,.35);border-radius:12px;padding:11px 16px;cursor:pointer;margin-top:6px;}
```

- [ ] **Step 3: Logica del gate in app.js**

Importare le funzioni lock e mostrare il gate all'avvio se attivo, **dopo** che la sessione Supabase è valida. Aggiornare `boot`/`enterApp`:

```js
import { isLockEnabled, verifyPin, getPudica, isBioEnabled, bioSupported, unlockBio } from './lib/lock.js';

// chiamare requireUnlock() dentro enterApp, prima di rivelare #app
async function enterApp() {
  me = await currentProfile();
  if (!me) { location.reload(); return; }
  if (isLockEnabled()) { await requireUnlock(); }
  if (getPudica()) document.body.classList.add('pudica');
  $('login').classList.add('gone');
  $('app').style.display = '';
  $('fab').style.display = '';
  const chip = $('meChip');
  clear(chip);
  add(chip, mk('span', null, me.avatar), mk('span', null, me.display_name));
  chip.onclick = () => openImpostazioni();   // Task 9
  buildNav();
}

function requireUnlock() {
  return new Promise(resolve => {
    const gate = $('lockgate'); gate.style.display = '';
    let pin = '';
    const dots = $('pinDots'); const pad = $('pinPad');
    const draw = () => { clear(dots); for (let i = 0; i < 6; i++) { const d = mk('span', i < pin.length ? 'd on' : 'd'); dots.appendChild(d); } };
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    clear(pad);
    keys.forEach(k => {
      const b = mk('button', k === '' ? 'empty' : null, k);
      if (k === '') { pad.appendChild(b); return; }
      b.onclick = async () => {
        if (k === '⌫') { pin = pin.slice(0, -1); draw(); return; }
        if (pin.length >= 6) return;
        pin += k; draw();
        if (pin.length >= 4) {
          if (await verifyPin(pin)) { gate.style.display = 'none'; resolve(); }
          else if (pin.length === 6) { $('lockErr').textContent = 'Codice errato'; pin = ''; draw(); }
        }
      };
      pad.appendChild(b);
    });
    draw();
    const bio = $('pinBio');
    if (isBioEnabled() && bioSupported()) {
      bio.style.display = '';
      bio.onclick = async () => { if (await unlockBio()) { gate.style.display = 'none'; resolve(); } };
      bio.click();   // tenta subito la biometria all'apertura
    } else { bio.style.display = 'none'; }
  });
}
```

- [ ] **Step 4: Verifica manuale**

Con il lock non ancora attivabile da UI (arriva nel Task 10), testare temporaneamente da console: `localStorage.setItem('lussuria.lock', JSON.stringify({enabled:true, hash: '<hash di 1234>'}))` e ricaricare → deve comparire il tastierino e sbloccare con 1234. Poi `disableLock()` da console. (Hash di '1234' ottenibile dai test.)

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/app.js
git commit -m "feat(lock): gate PIN/biometrico all'avvio dell'app"
```

---

## Task 9: Modulo Impostazioni — scheletro, apertura dal chip, Profilo + Account

**Files:**
- Create: `js/modules/impostazioni.js`
- Modify: `js/app.js`, `styles.css`

- [ ] **Step 1: CSS dello sheet**

In `styles.css` aggiungere il blocco `.set-*` (sheet schermo intero, righe, switch, picker, sotto-schermata, checklist). Portare gli stili dal mockup `mockups/impostazioni-app.html` (classi `.sheet/.head/.body/.sec/.card/.row/.sw/.avatar/.picker/.chips/.check/.confirm`), prefissandoli `set-` per non collidere. Esempio delle chiavi (switch + sheet):

```css
.set-scrim{position:fixed;inset:0;z-index:55;background:rgba(8,2,5,.66);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .3s;}
.set-scrim.show{opacity:1;pointer-events:auto;}
.set-sheet{position:fixed;inset:0;z-index:56;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(175deg,#1d0610,#11040a);transform:translateY(100%);transition:transform .42s var(--spin);}
.set-sheet.show{transform:translateY(0);}
.set-sw{width:46px;height:27px;border-radius:14px;background:rgba(8,2,5,.6);border:1px solid rgba(212,168,108,.3);position:relative;cursor:pointer;transition:.2s;flex:0 0 auto;}
.set-sw.on{background:linear-gradient(180deg,#a8324a,#7a1533);border-color:#a8324a;}
.set-sw .knob{position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:#f3d9b0;transition:.2s;}
.set-sw.on .knob{left:21px;}
```

(Includere anche `.set-head/.set-body/.set-sec/.set-card/.set-row/.set-avatar/.set-picker/.set-check/.set-confirm` e la sotto-schermata `.set-view` con transform translateX, copiando le misure dal mockup.)

- [ ] **Step 2: Modulo impostazioni.js (scheletro + Profilo + Account)**

Create `js/modules/impostazioni.js`. Usa SOLO DOM (mk/add/clear), niente innerHTML. Espone `openImpostazioni(ctx)`.

```js
import { mk, add, clear, toast } from '../ui.js';
import { updateProfile, listTipi, addTipo, updateTipo, deleteTipo, seedTipi,
         wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../store.js';
import { logout } from '../auth.js';
import { isLockEnabled, setPin, disableLock, isPinValid, getPudica, setPudica,
         bioSupported, isBioEnabled, enableBio, disableBio } from '../lib/lock.js';
import { tipiDefaultRows } from '../lib/logic.js';

const EMOJI = ['🐻','🧁','🦊','🦋','🐰','🐱','🐺','🦌','🌹','🍑','🔥','💋','🍒','🌙','⭐','🥃','🍫','🐝','🦢','🕯️','🍓','💎'];

let CTX = null;            // { client, me, onProfileChange }

export function openImpostazioni(ctx) {
  if (ctx) CTX = ctx;
  ensureDom();
  document.getElementById('setScrim').classList.add('show');
  document.getElementById('setSheet').classList.add('show');
  document.body.classList.add('locked');
  renderMain();
}
function closeImpostazioni() {
  document.getElementById('setScrim').classList.remove('show');
  document.getElementById('setSheet').classList.remove('show');
  document.body.classList.remove('locked');
}

function ensureDom() {
  if (document.getElementById('setSheet')) return;
  const scrim = mk('div', 'set-scrim'); scrim.id = 'setScrim'; scrim.onclick = closeImpostazioni;
  const sheet = mk('div', 'set-sheet'); sheet.id = 'setSheet';
  const body = mk('div', 'set-body'); body.id = 'setBody';
  const head = mk('div', 'set-head');
  add(head, mk('h2', null, 'Impostazioni'));
  const x = mk('button', 'set-x', '✕'); x.onclick = closeImpostazioni;
  add(head, x);
  add(sheet, head, body);
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
}

function sec(title) { const s = mk('div', 'set-sec'); add(s, mk('div', 'set-sec-t', title)); return s; }
function card() { return mk('div', 'set-card'); }
function row(emoji, name, sub) {
  const r = mk('div', 'set-row');
  const l = mk('div', 'set-l'); add(l, mk('span', 'set-em', emoji));
  const t = mk('div'); add(t, mk('div', 'set-nm', name)); if (sub) add(t, mk('div', 'set-sub', sub));
  add(l, t); add(r, l);
  return r;
}
function sw(on, onToggle) {
  const s = mk('div', on ? 'set-sw on' : 'set-sw'); add(s, mk('div', 'knob'));
  s.onclick = () => { s.classList.toggle('on'); onToggle(s.classList.contains('on')); };
  return s;
}

function renderMain() {
  const body = document.getElementById('setBody'); clear(body);
  const { client, me } = CTX;

  // PROFILO
  const pSec = sec('Profilo'); const pCard = mk('div', 'set-card pad');
  const prof = mk('div', 'set-prof');
  const av = mk('div', 'set-avatar'); const face = mk('span', null, me.avatar || '❤️');
  add(av, face, mk('div', 'set-pen', '✎'));
  const grow = mk('div', 'set-grow');
  add(grow, mk('label', 'set-lbl', 'Il tuo nome'));
  const inp = mk('input', 'set-fld'); inp.value = me.display_name || '';
  add(grow, inp); add(prof, av, grow);
  const picker = mk('div', 'set-picker');
  EMOJI.forEach(e => { const b = mk('button', null, e); b.onclick = () => { face.textContent = e; picker.classList.remove('show'); save(); }; add(picker, b); });
  av.onclick = () => picker.classList.toggle('show');
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(doSave, 600); };
  inp.oninput = save;
  async function doSave() {
    try {
      await updateProfile(client, me.id, { display_name: inp.value.trim(), avatar: face.textContent });
      me.display_name = inp.value.trim(); me.avatar = face.textContent;
      CTX.onProfileChange && CTX.onProfileChange(me);
      toast('Profilo salvato', 'ok');
    } catch (e) { toast('Errore: ' + e.message, 'err'); }
  }
  add(pCard, prof, picker); add(pSec, pCard); add(body, pSec);

  // PRIVACY & BLOCCO  → Task 10
  add(body, renderPrivacy());
  // PERSONALIZZA      → Task 12
  add(body, renderPersonalizza());
  // DATI              → Task 12
  add(body, renderDati());

  // ACCOUNT
  const aSec = sec('Account'); const aCard = card();
  const pw = row('🔐', 'Cambia password'); add(pw, mk('span', 'set-chev', '›'));
  pw.classList.add('tap'); pw.onclick = openCambiaPassword;   // Task 12 (form)
  add(aCard, pw); add(aSec, aCard);
  const out = mk('button', 'set-logout', 'Esci da Lussuria');
  out.onclick = async () => { try { await logout(); } catch (_) {} location.reload(); };
  add(aSec, out); add(body, aSec);

  // FOOTER
  const info = mk('div', 'set-appinfo');
  add(info, mk('div', 'set-nm', 'LUSSURIA'), mk('div', null, 'il vostro spazio · v1.0'));
  const inst = mk('div', 'set-inst', '📲 Installa sulla Home'); inst.onclick = showInstall;
  add(info, inst); add(body, info);
}

// placeholder reali (implementati nei task seguenti) per evitare riferimenti rotti
function renderPrivacy() { return sec('Privacy & blocco'); }
function renderPersonalizza() { return sec('Personalizza'); }
function renderDati() { return sec('Dati'); }
function openCambiaPassword() {}
function showInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(ios ? 'Condividi → "Aggiungi a Home"' : 'Menu del browser → "Installa app"');
}
```

- [ ] **Step 3: Collegare il chip in app.js**

In `js/app.js` importare e usare il modulo; il chip apre le Impostazioni e l'aggiornamento profilo ridisegna il chip:

```js
import { openImpostazioni } from './modules/impostazioni.js';

function refreshChip() {
  const chip = $('meChip'); clear(chip);
  add(chip, mk('span', null, me.avatar), mk('span', null, me.display_name));
}
// in enterApp, al posto del vecchio onclick logout:
refreshChip();
$('meChip').onclick = () => openImpostazioni({ client, me, onProfileChange: () => refreshChip() });
```

(Rimuovere il vecchio blocco `chip.onclick = async () => { logout... }` e ogni residuo `gear`/`openTipiSettings` in app.js.)

- [ ] **Step 4: Verifica manuale**

Servire e aprire: toccare il chip → si apre lo sheet a schermo intero; cambiare nome/icona → toast "Profilo salvato" e il chip in topbar si aggiorna; "Esci" fa logout; "Installa sulla Home" mostra il suggerimento. Le sezioni Privacy/Personalizza/Dati appaiono come titoli vuoti (riempite nei task dopo).

- [ ] **Step 5: Commit**

```bash
git add js/modules/impostazioni.js js/app.js styles.css
git commit -m "feat(impostazioni): sheet schermo intero, profilo (nome+icona), logout, install hint"
```

---

## Task 10: Impostazioni — Privacy & blocco (PIN + modalità pudica)

**Files:**
- Modify: `js/modules/impostazioni.js`

- [ ] **Step 1: Implementare renderPrivacy + form PIN**

Sostituire lo stub `renderPrivacy()` con:

```js
function renderPrivacy() {
  const s = sec('Privacy & blocco'); const c = card();

  // blocco con codice
  const rLock = row('🔒', 'Blocco con codice', "Chiede un PIN all'apertura");
  add(rLock, sw(isLockEnabled(), on => { if (on) openSetPin(); else { disableLock(); disableBio(); renderMain(); } }));
  add(c, rLock);

  // cambia codice (solo se attivo)
  if (isLockEnabled()) {
    const rCh = row('🔑', 'Cambia codice'); rCh.classList.add('tap');
    add(rCh, mk('span', 'set-chev', '›')); rCh.onclick = openSetPin; add(c, rCh);
  }

  // biometrico (solo se supportato)
  if (bioSupported()) {
    const rBio = row('👆', 'Face ID / impronta', 'Sblocco biometrico del dispositivo');
    add(rBio, sw(isBioEnabled(), async on => {
      try { if (on) { if (!isLockEnabled()) { toast('Attiva prima il PIN'); renderMain(); return; } await enableBio(); } else disableBio(); }
      catch (e) { toast('Errore: ' + e.message, 'err'); renderMain(); }
    }));
    add(c, rBio);
  }

  // modalità pudica
  const rPud = row('🙈', 'Modalità pudica', 'Sfoca foto e contenuti spinti');
  add(rPud, sw(getPudica(), on => { setPudica(on); document.body.classList.toggle('pudica', on); }));
  add(c, rPud);

  add(s, c); return s;
}

function openSetPin() {
  const ov = mk('div', 'set-confirm show');
  const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Imposta codice'));
  add(box, mk('p', null, 'Scegli un PIN di 4-6 cifre. Resta su questo dispositivo.'));
  const inp = mk('input', 'set-fld'); inp.type = 'tel'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.placeholder = '••••';
  add(box, inp);
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => { ov.remove(); renderMain(); };
  const go = mk('button', 'set-go', 'Salva'); go.onclick = async () => {
    if (!isPinValid(inp.value)) { toast('PIN non valido (4-6 cifre)'); return; }
    await setPin(inp.value); ov.remove(); renderMain(); toast('Blocco attivo', 'ok');
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
  inp.focus();
}
```

- [ ] **Step 2: Verifica manuale**

Aprire Impostazioni → attivare "Blocco con codice" → impostare 1234 → ricaricare la pagina → compare il gate PIN, sblocca con 1234. Tornare in Impostazioni → "Cambia codice" funziona; spegnere il toggle disattiva. "Modalità pudica" ON → le foto risultano sfocate (verificato in una sezione con foto). Su iPhone reale: il toggle Face ID compare e, attivato, richiede la biometria; al riavvio il gate prova subito la biometria e in fallback il PIN.

- [ ] **Step 3: Commit**

```bash
git add js/modules/impostazioni.js
git commit -m "feat(impostazioni): blocco PIN, cambio codice, biometrico, modalità pudica"
```

---

## Task 11: Modalità pudica — applicarla ai contenuti

**Files:**
- Modify: `styles.css`, `js/modules/foto.js`

- [ ] **Step 1: CSS pudica**

In `styles.css` aggiungere regole che, quando `body.pudica`, forzano il blur di default sulle miniature foto e su elementi marcati `data-spicy`:

```css
body.pudica .foto-thumb img,
body.pudica [data-spicy]{filter:blur(14px);transition:filter .25s;}
body.pudica .foto-thumb.revealed img,
body.pudica [data-spicy].revealed{filter:none;}
```

(Adeguare i selettori `.foto-thumb`/`.revealed` ai nomi reali usati in `js/modules/foto.js`: verificare con `grep -n "class" js/modules/foto.js` e allineare. Se la classe del reveal è diversa, usare quella.)

- [ ] **Step 2: Assicurare il toggle di reveal**

Verificare in `js/modules/foto.js` che il tap su una miniatura aggiunga una classe di "rivelato" (es. `.revealed`); se usa un meccanismo diverso (es. rimuove direttamente il filtro inline), aggiungere comunque la classe `.revealed` al tap così la regola `body.pudica ... .revealed` la scopre. Nessun cambiamento di comportamento quando `body.pudica` è assente.

- [ ] **Step 3: Verifica manuale**

Con pudica ON: aprire Galleria/una esperienza con foto → miniature sfocate; tap → si rivela; con pudica OFF il comportamento è quello di prima (blur-on-tap esistente). 

- [ ] **Step 4: Commit**

```bash
git add styles.css js/modules/foto.js
git commit -m "feat(pudica): blur globale di default su foto e contenuti spinti"
```

---

## Task 12: Impostazioni — Personalizza (tag + contenuti giochi), Dati (Svuota), Cambia password

**Files:**
- Modify: `js/modules/impostazioni.js`

- [ ] **Step 1: renderPersonalizza (tag + link contenuti giochi)**

Sostituire lo stub. I tag riusano `listTipi/addTipo/updateTipo/deleteTipo`; "Contenuti giochi" emette un evento che il modulo Giochi già gestisce (oppure naviga alla tab giochi + apre l'editor ruota).

```js
async function renderPersonalizza() { /* nota: chiamata sincrona in renderMain; vedi adattamento sotto */ }
```

Poiché `renderMain` aggiunge le sezioni in modo sincrono, rendere `renderPersonalizza` sincrona costruendo prima la sezione e popolando i tag in modo asincrono:

```js
function renderPersonalizza() {
  const s = sec('Personalizza'); const c = card();
  // TAG
  const rTag = mk('div', 'set-row col');
  add(rTag, mk('div', 'set-l', null));   // header
  const head = mk('div', 'set-l'); add(head, mk('span', 'set-em', '🏷️'), mk('span', 'set-nm', 'Tag del calendario'));
  clear(rTag); add(rTag, head);
  const chips = mk('div', 'set-chips'); add(rTag, chips);
  add(c, rTag);
  (async () => {
    try {
      const tipi = await listTipi(CTX.client, CTX.me.couple_id);
      clear(chips);
      tipi.forEach(t => {
        const chip = mk('div', 'set-chip2'); add(chip, document.createTextNode((t.emoji || '') + ' ' + t.label));
        const del = mk('span', 'set-del', '×'); del.onclick = async () => { await deleteTipo(CTX.client, t.id); chip.remove(); };
        add(chip, del); add(chips, chip);
      });
      const addc = mk('div', 'set-chip2 add', '+ aggiungi');
      addc.onclick = async () => {
        const label = prompt('Nome del tag (puoi iniziare con un emoji)'); if (!label) return;
        const m = label.trim().match(/^(\p{Emoji})?\s*(.*)$/u);
        await addTipo(CTX.client, { couple_id: CTX.me.couple_id, emoji: (m && m[1]) || '🌶️', label: (m && m[2]) || label.trim(), ordine: 99 });
        renderMain();
      };
      add(chips, addc);
    } catch (e) { toast('Errore tag: ' + e.message, 'err'); }
  })();

  // CONTENUTI GIOCHI
  const rG = row('🎲', 'Contenuti dei giochi', 'Proposte piccanti · buoni a sorpresa'); rG.classList.add('tap');
  add(rG, mk('span', 'set-chev', '›'));
  rG.onclick = () => { closeImpostazioni(); document.dispatchEvent(new CustomEvent('goto', { detail: 'giochi' })); document.dispatchEvent(new CustomEvent('giochi:contenuti')); };
  add(c, rG);

  add(s, c); return s;
}
```

(Nota: se il modulo Giochi non ascolta ancora `giochi:contenuti`, aggiungere in `js/modules/giochi.js` un listener che apre l'editor `ruota_contenuti` esistente. Se l'editor non è esposto da evento, in alternativa il link naviga solo alla tab giochi e l'utente apre l'editor da lì — comportamento minimo accettabile.)

- [ ] **Step 2: renderDati + sotto-schermata Svuota**

```js
const WIPES = [
  ['🔥', 'Desideri & fantasie', 'desideri', wipeDesideri],
  ['📅', 'Esperienze', 'esperienze', wipeEsperienze],
  ['🎟️', 'Buoni', 'buoni', wipeBuoni],
  ['🎲', 'Giochi', 'giochi', wipeGiochi],
  ['🗺️', 'Luoghi', 'luoghi', wipeLuoghi],
  ['🏷️', 'Tag', 'tag', wipeTipi],
];

function renderDati() {
  const s = sec('Dati'); const c = card();
  const r = row('🗑️', 'Svuota dati', 'Scegli quali sezioni azzerare'); r.classList.add('tap');
  add(r, mk('span', 'set-chev', '›')); r.onclick = openSvuota; add(c, r);
  add(s, c); return s;
}

function openSvuota() {
  const body = document.getElementById('setBody'); clear(body);
  const head = mk('div', 'set-sec'); // intestazione con back
  const back = mk('button', 'set-back', '‹ Indietro'); back.onclick = renderMain;
  add(head, back); add(body, head);
  add(body, mk('div', 'set-sec-t', 'Seleziona cosa azzerare'));
  const c = card(); const selected = new Set();
  WIPES.forEach(([em, nm, key]) => {
    const ck = mk('div', 'set-check'); const box = mk('div', 'set-box');
    const t = mk('div'); add(t, mk('div', 'set-nm', em + ' ' + nm));
    add(ck, box, t);
    ck.onclick = () => { const on = ck.classList.toggle('on'); box.textContent = on ? '✓' : ''; on ? selected.add(key) : selected.delete(key); };
    add(c, ck);
  });
  add(body, c);
  const cta = mk('button', 'set-wipe-cta', 'Svuota le sezioni selezionate');
  cta.onclick = () => confirmWipe(selected);
  add(body, cta);
  add(body, mk('div', 'set-wipe-note', "L'azione è definitiva e vale per tutta la coppia."));
}

function confirmWipe(selected) {
  if (!selected.size) { toast('Seleziona almeno una sezione'); return; }
  const names = WIPES.filter(w => selected.has(w[2])).map(w => w[1]).join(', ');
  const ov = mk('div', 'set-confirm show'); const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Sei sicuro?'));
  add(box, mk('p', null, 'Stai per svuotare: ' + names + '. Non si può annullare.'));
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => ov.remove();
  const go = mk('button', 'set-go', 'Sì, svuota'); go.onclick = async () => {
    go.disabled = true;
    try {
      for (const [, , key, fn] of WIPES) {
        if (!selected.has(key)) continue;
        await fn(CTX.client, CTX.me.couple_id);
        if (key === 'tag') await seedTipi(CTX.client, tipiDefaultRows(CTX.me.couple_id));
      }
      ov.remove(); toast('Fatto', 'ok'); closeImpostazioni();
      document.dispatchEvent(new CustomEvent('goto', { detail: 'desideri' }));
      location.reload();   // ricarica per rinfrescare tutte le sezioni
    } catch (e) { toast('Errore: ' + e.message, 'err'); go.disabled = false; }
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
}
```

(Verificare la firma reale di `tipiDefaultRows` in `js/lib/logic.js`: se accetta `couple_id` e ritorna le righe default, usarla come sopra; altrimenti adattare l'argomento.)

- [ ] **Step 3: openCambiaPassword**

```js
import { client as sb } from '../supabase.js';  // in cima al file, se non già importato via CTX
function openCambiaPassword() {
  const ov = mk('div', 'set-confirm show'); const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Cambia password'));
  const p1 = mk('input', 'set-fld'); p1.type = 'password'; p1.placeholder = 'Nuova password';
  const p2 = mk('input', 'set-fld'); p2.type = 'password'; p2.placeholder = 'Conferma'; p2.style.marginTop = '8px';
  add(box, p1, p2);
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => ov.remove();
  const go = mk('button', 'set-go', 'Salva'); go.onclick = async () => {
    if (p1.value.length < 6) { toast('Almeno 6 caratteri'); return; }
    if (p1.value !== p2.value) { toast('Le password non coincidono'); return; }
    try { const { error } = await CTX.client.auth.updateUser({ password: p1.value }); if (error) throw error; ov.remove(); toast('Password aggiornata', 'ok'); }
    catch (e) { toast('Errore: ' + e.message, 'err'); }
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
}
```

- [ ] **Step 4: Verifica manuale**

Tag: aggiungere/rimuovere un tag → si riflette nel calendario. Contenuti giochi: il link porta a Giochi (ed eventualmente apre l'editor). Svuota dati: spuntare es. "Luoghi" di prova → conferma → la mappa risulta vuota. Cambia password: cambiarla e rifare login con la nuova.

- [ ] **Step 5: Eseguire l'intera suite**

Run: `node --test`
Expected: tutti i test verdi (i precedenti + `lock.test.js` + `store-app-pronta.test.js`).

- [ ] **Step 6: Commit**

```bash
git add js/modules/impostazioni.js js/modules/giochi.js
git commit -m "feat(impostazioni): tag, contenuti giochi, svuota dati, cambia password"
```

---

## Task 13: Smoke checklist + prova da telefono

**Files:**
- Modify: `test/smoke.md`

- [ ] **Step 1: Aggiungere la sezione "App pronta" a test/smoke.md**

```markdown
## App pronta (Lussuria) — 2026-05-27
- [ ] PWA: "Aggiungi a Home" su iOS dà icona fiamma + apertura fullscreen; Android offre install.
- [ ] Nessun overscroll: la pagina non rimbalza quando il contenuto ci sta; scrolla solo l'area centrale.
- [ ] Swipe: il contenuto segue il dito, scatta alla sezione adiacente, rimbalzo ai bordi (no wrap).
- [ ] Swipe verticale = scroll; tally/chips orizzontali scrollano per conto loro.
- [ ] Mappa-isola: dentro la cartina si pana/zooma; si esce dalla dock.
- [ ] Impostazioni dal chip profilo (schermo intero).
- [ ] Profilo: cambio nome/icona si salva e il chip si aggiorna.
- [ ] Blocco PIN: set → reload → gate → sblocco; cambio codice; disattivazione.
- [ ] Biometrico (iPhone): toggle visibile, attiva, sblocca al riavvio (PIN in fallback).
- [ ] Modalità pudica: foto sfocate di default, tap rivela.
- [ ] Tag: add/del si riflette nel calendario.
- [ ] Svuota dati: checklist → conferma → la sezione scelta risulta vuota.
- [ ] Cambia password: aggiornata, login con la nuova.
```

- [ ] **Step 2: Servire per il telefono**

Run: `python -m http.server 8765 --directory .`
Aprire da iPhone (stessa WiFi) `http://<IP-PC>:8765/`, fare login, installare sulla Home, e spuntare la checklist dal vivo. (Serve `config.js` presente e migrazioni Supabase delle fasi precedenti applicate.)

- [ ] **Step 3: Commit**

```bash
git add test/smoke.md
git commit -m "test(smoke): checklist fase app pronta"
```

---

## Self-review (coperto rispetto alla spec)

- §1 Rename → Task 1. §2 PWA → Task 2. §3 Overscroll → Task 3. §4 Swipe pager → Task 4. §5 Impostazioni: profilo+account → Task 9; privacy/PIN/biometrico/pudica → Task 8/10/11; personalizza+dati+password → Task 12. Gate PIN avvio → Task 8. Test → Task 5/6/7 + suite in Task 12. Smoke → Task 13.
- Nomi coerenti tra task: `updateProfile`, `wipeDesideri/Esperienze/Buoni/Giochi/Luoghi/Tipi`, `isLockEnabled/setPin/verifyPin/disableLock/getPudica/setPudica/bioSupported/isBioEnabled/enableBio/disableBio/unlockBio`, `openImpostazioni/renderMain/renderPrivacy/renderPersonalizza/renderDati`.
- Punti da verificare in implementazione (annotati nei task, non placeholder): selettori reali di `foto.js` per la pudica; firma reale di `tipiDefaultRows`; esistenza listener `mappa:resize` e `giochi:contenuti`. Sono adattamenti locali a codice esistente, con fallback indicato.
```
