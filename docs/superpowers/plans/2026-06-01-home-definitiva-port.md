# Port HOME DEFINITIVA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare nell'app vera la HOME DEFINITIVA a porte (porta-zoom HUD → hub 7 porte → sezioni esistenti), con dati reali e presenza del partner via heartbeat, sostituendo la home vecchia.

**Architecture:** Macchina a 3 stati. `#home` (HUD porta) e `#camera` (hub 7 porte) vivono dentro un wrapper isolato `#homeRoot` e sono governati da `js/modules/home.js`; `#app` (pager 6 sezioni) resta governato da `js/app.js`. La navigazione cross-modulo passa per due eventi DOM: `goto` (entra in una sezione) e `gohub` (torna all'hub). Logica pura (riepilogo sezioni, presenza) in `js/lib/`, testata con `node --test`. La home è best-effort: se una fonte dati fallisce, la stanza resta viva.

**Tech Stack:** Vanilla ESM (no framework), Supabase JS client, CSS custom, Service Worker cache, `node --test` per la logica pura.

**Sorgenti di verità visiva (già approvate, non ri-esplorare):**
- `mockups/new-h17-home-DEFINITIVA.html` — markup + CSS dei 2 stati + pop-up calore.
- Navigazione Modello A confermata dall'utente.

**Riuso (già esistente):**
- Calore: `calcolaCalore`, `eventiCalore`, `CALORE`, `PESI_CALORE` in `js/lib/logic.js` (test verdi). `renderHeatPop` + `caricaItemsCalore` da riportare dalla home.js attuale.
- Pager: `enablePager`/`go`/`layout`/`renderNear`/`enterSection` + evento `goto` in `js/app.js`.
- Lettura partner della coppia: `getPartner(client, coupleId, meId)` in `js/store.js:300` (fa `select('*')` su `profiles`, ritorna l'altro profilo → include `last_seen`).
- Store dati: `listGiri/listSlotMov/listBuoni/listDesideri/listEsperienze/listLuoghi/listFotoGalleria`; `saldoGiri/saldoSlot/buoniRicevuti`.

---

## File structure

| File | Responsabilità | Azione |
|---|---|---|
| `supabase/presence.sql` | Migrazione `profiles.last_seen` | Create |
| `js/store.js` | `updateLastSeen` (battito heartbeat) | Modify |
| `js/lib/presence.js` | `isOnline`, `tempoRelativo` (puri) + `avviaHeartbeat` | Create |
| `js/lib/logic.js` | `riepilogoSezioni` (puro) | Modify |
| `test/presence.test.js` | Test di `isOnline`/`tempoRelativo` | Create |
| `test/riepilogo.test.js` | Test di `riepilogoSezioni` | Create |
| `home.css` | Stili DEFINITIVA, isolati sotto `#homeRoot` | Create |
| `index.html` | Sostituisce il blocco `#home` con `#homeRoot` (HUD+camera+pop-up); link a `home.css` | Modify |
| `js/modules/home.js` | Riscrittura `renderHome`: 3 stati, transizioni, dati, presenza, nav | Rewrite |
| `js/app.js` | `goHub`, `enterSection` su `#homeRoot`, rebind chip coppia | Modify |
| `sw.js` | Bump cache `v26→v27`, aggiunge `home.css`, toglie `assets/camera.jpg` | Modify |
| `styles.css` | Rimozione stili home vecchia (cleanup) | Modify |
| `assets/camera.jpg` | Sfondo home vecchia, non più usato | Delete |

**Contratto navigazione (eventi DOM):**
- `goto` (detail = section key): `app.js` → `enterSection(k)` mostra il pager; `home.js` → `hideStates()` nasconde la camera. (Già usato dalla Galleria — mantenere compat.)
- `gohub` (no detail): `app.js` → mostra `#homeRoot`, `home.js` → `showCamera()` riapre l'hub.
- `enterRoom`/`exitRoom` (HUD↔camera) sono interni a `home.js`, nessun coinvolgimento di `app.js`.

---

## Task 1: Migrazione `profiles.last_seen` + `store.updateLastSeen`

**Files:**
- Create: `supabase/presence.sql`
- Modify: `js/store.js` (dopo `updateProfile`, ~riga 313)
- Test: `test/store.test.js` (aggiungere in coda)

- [ ] **Step 1: Creare la migrazione SQL**

Create `supabase/presence.sql`:

```sql
-- Presenza (heartbeat). Eseguire nel SQL Editor di Supabase.
-- last_seen aggiornato ogni ~30s mentre l'app è in foreground (vedi js/lib/presence.js).
-- Nullable: i profili esistenti partono senza presenza (offline finché non battono).
alter table profiles
  add column if not exists last_seen timestamptz;
```

- [ ] **Step 2: Scrivere il test di `updateLastSeen`**

In `test/store.test.js`, aggiungere l'import e il test (il fake client già supporta `update`/`eq`):

```js
import { updateLastSeen } from '../js/store.js';

test('updateLastSeen scrive last_seen sul profilo per id', async () => {
  const c = fakeClient();
  await updateLastSeen(c, 'u1', '2026-06-01T12:00:00.000Z');
  const upd = c._calls.find(x => x.op === 'update');
  assert.equal(upd.table, 'profiles');
  assert.equal(upd.filters.id, 'u1');
  assert.equal(upd.payload.last_seen, '2026-06-01T12:00:00.000Z');
});
```

Aggiungere `updateLastSeen` all'import esistente in cima al file invece di duplicarlo, se preferito.

- [ ] **Step 3: Eseguire il test → deve fallire**

Run: `node --test test/store.test.js`
Expected: FAIL — `updateLastSeen is not a function` / import undefined.

- [ ] **Step 4: Implementare `updateLastSeen`**

In `js/store.js`, subito dopo `updateProfile` (riga ~313):

```js
// Battito di presenza: aggiorna last_seen del profilo (vedi js/lib/presence.js).
export async function updateLastSeen(client, id, nowISO) {
  const res = await client.from('profiles').update({ last_seen: nowISO }).eq('id', id);
  return check(res);
}
```

- [ ] **Step 5: Eseguire i test → devono passare**

Run: `node --test test/store.test.js`
Expected: PASS (tutti i test dello store, incluso il nuovo).

- [ ] **Step 6: Commit**

```bash
git add supabase/presence.sql js/store.js test/store.test.js
git commit -m "feat(presence): migrazione profiles.last_seen + store.updateLastSeen"
```

---

## Task 2: `js/lib/presence.js` — helper puri + heartbeat

**Files:**
- Create: `js/lib/presence.js`
- Test: `test/presence.test.js`

- [ ] **Step 1: Scrivere i test dei due helper puri**

Create `test/presence.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOnline, tempoRelativo } from '../js/lib/presence.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const secFa = (s) => new Date(NOW.getTime() - s * 1000).toISOString();

test('isOnline: entro la soglia → true', () => {
  assert.equal(isOnline(secFa(30), NOW), true);   // soglia default 60s
});
test('isOnline: oltre la soglia → false', () => {
  assert.equal(isOnline(secFa(120), NOW), false);
});
test('isOnline: last_seen mancante → false', () => {
  assert.equal(isOnline(null, NOW), false);
  assert.equal(isOnline(undefined, NOW), false);
});
test('isOnline: soglia personalizzabile', () => {
  assert.equal(isOnline(secFa(120), NOW, 300), true);
});

test('tempoRelativo: mancante → "mai"', () => {
  assert.equal(tempoRelativo(null, NOW), 'mai');
});
test('tempoRelativo: pochi secondi → "ora"', () => {
  assert.equal(tempoRelativo(secFa(20), NOW), 'ora');
});
test('tempoRelativo: minuti → "N′ fa"', () => {
  assert.equal(tempoRelativo(secFa(120), NOW), '2′ fa');
});
test('tempoRelativo: ore → "Nh fa"', () => {
  assert.equal(tempoRelativo(secFa(2 * 3600), NOW), '2h fa');
});
test('tempoRelativo: un giorno → "ieri"', () => {
  assert.equal(tempoRelativo(secFa(26 * 3600), NOW), 'ieri');
});
test('tempoRelativo: più giorni → "Ng fa"', () => {
  assert.equal(tempoRelativo(secFa(3 * 86400), NOW), '3g fa');
});
```

- [ ] **Step 2: Eseguire → deve fallire**

Run: `node --test test/presence.test.js`
Expected: FAIL — modulo `js/lib/presence.js` inesistente.

- [ ] **Step 3: Implementare `js/lib/presence.js`**

Create `js/lib/presence.js`:

```js
// Presenza del partner. isOnline/tempoRelativo sono PURI (testabili).
// avviaHeartbeat ha effetti (timer + rete) e NON è unit-testato: verifica sul device.

import { updateLastSeen } from '../store.js';

// Online se l'ultimo battito è entro `sogliaSec` secondi da `now`.
export function isOnline(lastSeenISO, now = new Date(), sogliaSec = 60) {
  if (!lastSeenISO) return false;
  const diff = now.getTime() - new Date(lastSeenISO).getTime();
  return diff >= 0 && diff <= sogliaSec * 1000;
}

// Stringa relativa italiana compatta: "ora" | "2′ fa" | "2h fa" | "ieri" | "3g fa" | "mai".
export function tempoRelativo(lastSeenISO, now = new Date()) {
  if (!lastSeenISO) return 'mai';
  let sec = (now.getTime() - new Date(lastSeenISO).getTime()) / 1000;
  if (sec < 0) sec = 0;
  if (sec < 45) return 'ora';
  const min = Math.round(sec / 60);
  if (min < 60) return min + '′ fa';
  const ore = Math.round(sec / 3600);
  if (ore < 24) return ore + 'h fa';
  const giorni = Math.floor(sec / 86400);
  return giorni === 1 ? 'ieri' : giorni + 'g fa';
}

// Aggiorna profiles.last_seen di `me` a intervalli mentre l'app è in foreground.
// Stop su visibilitychange→hidden, ripartenza su visible. Ritorna stop().
export function avviaHeartbeat({ client, me, intervalloSec = 30 }) {
  let timer = null;
  const battito = () => {
    updateLastSeen(client, me.id, new Date().toISOString())
      .catch(e => console.error('[presence] battito fallito:', e));
  };
  const start = () => { if (timer) return; battito(); timer = setInterval(battito, intervalloSec * 1000); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const onVis = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVis);
  start();
  return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
}
```

- [ ] **Step 4: Eseguire → devono passare**

Run: `node --test test/presence.test.js`
Expected: PASS (10 test).

- [ ] **Step 5: Commit**

```bash
git add js/lib/presence.js test/presence.test.js
git commit -m "feat(presence): isOnline + tempoRelativo (puri) + avviaHeartbeat"
```

---

## Task 3: `riepilogoSezioni` in `js/lib/logic.js`

**Files:**
- Modify: `js/lib/logic.js` (aggiungere dopo il blocco CALORE, ~riga 804)
- Test: `test/riepilogo.test.js`

- [ ] **Step 1: Scrivere i test**

Create `test/riepilogo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riepilogoSezioni } from '../js/lib/logic.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();
const ME = { id: 'me' };
const get = (out, key) => out.find(r => r.key === key);

test('ritorna esattamente le 6 sezioni reali in ordine', () => {
  const out = riepilogoSezioni({}, ME, NOW);
  assert.deepEqual(out.map(r => r.key),
    ['desideri', 'giochi', 'calendario', 'mappa', 'buoni', 'galleria']);
});

test('fantasie: proposta recente della partner → hot', () => {
  const liste = { desideri: [{ autore_id: 'lei', stato: 'da_provare', creato: giorniFa(0) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'desideri');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'hot');
});

test('fantasie: le mie non contano', () => {
  const liste = { desideri: [{ autore_id: 'me', stato: 'da_provare', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(liste, ME, NOW), 'desideri').count, 0);
});

test('fantasie: proposta vecchia (non recente) → warn', () => {
  const liste = { desideri: [{ autore_id: 'lei', stato: 'da_provare', creato: giorniFa(10) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'desideri');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'warn');
});

test('giochi: somma giri + tiri disponibili → warn se > 0', () => {
  const liste = {
    giri: [{ user_id: 'me', delta: 2 }],
    slot: [{ user_id: 'me', delta: 1 }],
  };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'giochi');
  assert.equal(r.count, 3);
  assert.equal(r.novita, 'warn');
});

test('esperienze: solo quelle con data >= oggi sono "in arrivo"', () => {
  const liste = { esperienze: [{ data: '2026-06-05' }, { data: '2026-05-20' }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'calendario');
  assert.equal(r.count, 1);
  assert.equal(r.novita, 'warn');
});

test('buoni: regalo attivo ricevuto → hot; in scadenza → warn', () => {
  const base = { a_id: 'me', tipo: 'regalo', stato: 'attivo', creato: giorniFa(10) };
  const hot = get(riepilogoSezioni({ buoni: [base] }, ME, NOW), 'buoni');
  assert.equal(hot.count, 1);
  assert.equal(hot.novita, 'hot');
  const conScadenza = { ...base, scadenza_iso: new Date(NOW.getTime() + 86400e3).toISOString() };
  const warn = get(riepilogoSezioni({ buoni: [conScadenza] }, ME, NOW), 'buoni');
  assert.equal(warn.novita, 'warn');
});

test('mappa: luogo aggiunto di recente → hot; conta tutti i luoghi', () => {
  const liste = { luoghi: [{ creato: giorniFa(0) }, { creato: giorniFa(40) }] };
  const r = get(riepilogoSezioni(liste, ME, NOW), 'mappa');
  assert.equal(r.count, 2);
  assert.equal(r.novita, 'hot');
});

test('galleria: foto recente della partner → hot; le mie no', () => {
  const lei = { foto: [{ autore_id: 'lei', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(lei, ME, NOW), 'galleria').novita, 'hot');
  const mie = { foto: [{ autore_id: 'me', creato: giorniFa(0) }] };
  assert.equal(get(riepilogoSezioni(mie, ME, NOW), 'galleria').novita, 'none');
});

test('liste mancanti → tutto a count 0, novita none', () => {
  const out = riepilogoSezioni({}, ME, NOW);
  assert.ok(out.every(r => r.count === 0 && r.novita === 'none'));
});
```

- [ ] **Step 2: Eseguire → deve fallire**

Run: `node --test test/riepilogo.test.js`
Expected: FAIL — `riepilogoSezioni is not exported`.

- [ ] **Step 3: Implementare `riepilogoSezioni`**

In `js/lib/logic.js`, in coda al file (dopo `etichettaData`, riga ~814). Usa `saldoGiri`/`saldoSlot` già definiti nello stesso file:

```js
// ---- RIEPILOGO SEZIONI (home/hub) — puro ----
// Da liste già fetchate → array delle 6 sezioni reali { key, count, novita }.
// novita: 'hot' (novità per te) | 'warn' (da agire/scadenza) | 'none'.
// Il teaser narrativo è scelto dal chiamante (home.js). `me` = profilo { id }.
const SEZIONI_KEYS = ['desideri', 'giochi', 'calendario', 'mappa', 'buoni', 'galleria'];

function eRecente(iso, now, giorni = 3) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t <= now.getTime() && (now.getTime() - t) < giorni * 864e5;
}

export function riepilogoSezioni(liste, me, now = new Date()) {
  const { desideri = [], esperienze = [], luoghi = [], buoni = [], foto = [], giri = [], slot = [] } = liste || {};
  const meId = me && me.id;
  const todayISO = now.toISOString().slice(0, 10);

  const nuoveFant = desideri.filter(d => d.autore_id !== meId && d.stato === 'da_provare');
  const desideriR = { key: 'desideri', count: nuoveFant.length,
    novita: nuoveFant.some(d => eRecente(d.creato, now)) ? 'hot' : (nuoveFant.length ? 'warn' : 'none') };

  const nGiochi = saldoGiri(giri, meId) + saldoSlot(slot, meId);
  const giochiR = { key: 'giochi', count: Math.max(0, nGiochi), novita: nGiochi > 0 ? 'warn' : 'none' };

  const inArrivo = esperienze.filter(e => e.data && e.data >= todayISO);
  const calR = { key: 'calendario', count: inArrivo.length, novita: inArrivo.length ? 'warn' : 'none' };

  const mappaR = { key: 'mappa', count: luoghi.length,
    novita: luoghi.some(l => eRecente(l.creato, now)) ? 'hot' : 'none' };

  const attivi = buoni.filter(b => b.a_id === meId && b.tipo === 'regalo' && b.stato === 'attivo');
  const inScadenza = attivi.some(b => b.scadenza_iso && (new Date(b.scadenza_iso).getTime() - now.getTime()) < 3 * 864e5);
  const buoniR = { key: 'buoni', count: attivi.length,
    novita: attivi.length === 0 ? 'none' : (inScadenza ? 'warn' : 'hot') };

  const galR = { key: 'galleria', count: foto.length,
    novita: foto.some(f => f.autore_id !== meId && eRecente(f.creato, now)) ? 'hot' : 'none' };

  const byKey = { desideri: desideriR, giochi: giochiR, calendario: calR, mappa: mappaR, buoni: buoniR, galleria: galR };
  return SEZIONI_KEYS.map(k => byKey[k]);
}
```

- [ ] **Step 4: Eseguire → devono passare**

Run: `node --test test/riepilogo.test.js`
Expected: PASS (10 test).

- [ ] **Step 5: Suite completa verde**

Run: `node --test`
Expected: PASS — tutta la suite (era 211; ora 211 + nuovi test di store/presence/riepilogo).

- [ ] **Step 6: Commit**

```bash
git add js/lib/logic.js test/riepilogo.test.js
git commit -m "feat(home): riepilogoSezioni — conteggi + novità per le 6 sezioni"
```

---

## Task 4: Stili DEFINITIVA isolati — `home.css`

La logica è pura (Task 1-3); questa task è puramente visiva. La verifica è manuale (browser) e arriva alla fine della Task 6.

**Files:**
- Create: `home.css` (root del progetto, accanto a `styles.css`)
- Modify: `index.html` (link allo stylesheet)

**Regola di isolamento (CRITICA):** il mockup ridefinisce selettori e variabili che esistono già nell'app-shell (`.topbar`, `.brand`, `:root` custom properties, `@keyframes blink/halo/...`). Per non rompere login/sezioni, **tutto** va isolato sotto `#homeRoot`.

- [ ] **Step 1: Creare `home.css` portando il `<style>` del mockup, con queste trasformazioni meccaniche**

Sorgente: `mockups/new-h17-home-DEFINITIVA.html`, blocco `<style>` righe **11–393**. Applicare:

1. **Variabili:** la regola `:root{ --bg:...; ... }` (riga 11) diventa `#homeRoot{ ...stesse vars... }`. Le custom property inheritano ai discendenti: così non toccano l'app fuori dalla home.
2. **Selettori:** prefissare **ogni** regola con `#homeRoot ` (es. `.topbar{...}` → `#homeRoot .topbar{...}`; `.home.dolly{...}` → `#homeRoot .home.dolly{...}`). Le `@media (...)` restano, ma le regole interne vengono prefissate.
3. **Keyframes:** rinominare ogni `@keyframes X` in `@keyframes hh-X` e aggiornare i riferimenti `animation:` corrispondenti. Lista da rinominare: `homeDolly, halo, flick, knobPulse, bob, breathe, rise, emberlift, blink, beat, heatInvite`. (Evita la collisione con eventuali keyframe omonimi in `styles.css`, p.es. `blink`.)
4. **Non duplicare** il pop-up calore: le regole `.heat-pop`/`.hp-*` esistono già in `styles.css` per la home vecchia, ma vengono rimosse nella Task 8; qui le porti scoped (`#homeRoot .heat-pop`, ecc.) come da mockup righe 375–393.

- [ ] **Step 2: Aggiungere in coda a `home.css` le regole strutturali del wrapper (non presenti nel mockup, che usava `body`/`.frame`)**

```css
/* Wrapper isolante: overlay a tutta pagina sopra #app, frame centrato come il mockup. */
#homeRoot{position:fixed;inset:0;z-index:60;background:#0a0309;color:var(--ink);
  font-family:'Nunito',sans-serif;}
#homeRoot .frame{position:relative;width:100%;max-width:430px;height:100%;margin:0 auto;
  background:radial-gradient(140% 90% at 50% -10%,var(--bg2),var(--bg) 60%);
  display:flex;flex-direction:column;overflow:hidden;perspective:1100px;perspective-origin:50% 46%;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}
#homeRoot .mono{font-family:var(--mono);}
/* le logline dell'HUD sono <button>: reset per sembrare righe di log */
#homeRoot button.logline{border:none;background:none;width:100%;text-align:left;font:inherit;cursor:pointer;}
```

- [ ] **Step 3: Caricare il font del mockup e linkare `home.css` in `index.html`**

Nel `<head>` di `index.html`, dopo il link a `styles.css`, aggiungere il preconnect/font del mockup (righe 7–9 del mockup: Fraunces + Nunito + JetBrains Mono — verificare quali non sono già caricati e aggiungere solo i mancanti) e:

```html
<link rel="stylesheet" href="home.css">
```

- [ ] **Step 4: Commit**

```bash
git add home.css index.html
git commit -m "feat(home): home.css — stili DEFINITIVA isolati sotto #homeRoot"
```

> Nota: a questo punto l'app NON è ancora coerente (il markup `#homeRoot` arriva nella Task 5). Nessuna verifica visiva qui.

---

## Task 5: Markup `#homeRoot` in `index.html`

**Files:**
- Modify: `index.html` (sostituire il blocco `#home`, righe 60–118)

- [ ] **Step 1: Sostituire l'intero blocco `<div class="home" id="home">…</div>` (righe 60–118) con il nuovo `#homeRoot`**

```html
<!-- HOME DEFINITIVA · porta-zoom (HUD) → hub 7 porte → sezioni -->
<div id="homeRoot" style="display:none">
 <div class="frame">

  <!-- STATO 1 · HUD porta -->
  <div class="home" id="home">
    <div class="topbar chrome up">
      <div class="brand">brace<span class="dot">.</span></div>
      <div class="presence">
        <button class="couple" id="coupleHome" title="noi">
          <span class="cav b" id="homeMeAv">🐻</span><span class="cav c" id="homePartnerAv">🧁</span>
          <span class="nm">noi</span><span class="cled" id="homeCled"></span>
        </button>
        <button class="chip-q" id="homeHelp">?</button>
      </div>
    </div>

    <div class="notif chrome up">
      <div class="notif-head">
        <span class="cmd mono">$ notifiche <b>--tail 3</b></span>
        <span class="badge" id="notifBadge" style="display:none"></span>
      </div>
      <div class="logbox" id="notifLog"></div>
    </div>

    <div class="door-wrap">
      <div class="doorway" id="doorway">
        <div class="jamb">
          <div class="peeplight"></div>
          <div class="door" id="door">
            <div class="panel top"></div>
            <div class="panel bot"></div>
            <div class="knob"><span class="plate"></span></div>
            <div class="seam"></div>
          </div>
          <div class="threshold"></div>
        </div>
        <div class="peeknote" id="peeknote">c'è qualcosa per te 🔥</div>
        <div class="enter-cta">
          <div class="hint mono">uno spiraglio di luce filtra dalla porta…</div>
          <button class="btn mono" id="enterBtn">❯ entra nella stanza</button>
        </div>
      </div>
    </div>

    <button class="heat chrome down" id="heatBtn" style="display:none">
      <span class="label mono">calore</span>
      <div class="gauge"><div class="fill" id="heatFill"></div></div>
      <span class="val mono" id="heatVal">—°</span>
      <span class="up mono" id="heatUp"></span>
      <span class="heat-more mono">dettagli ›</span>
    </button>

    <div class="promptbar chrome down">
      <span class="add mono">+fantasia</span>
      <span class="ph mono">lasciale qualcosa al volo…<span class="cur"></span></span>
      <button class="send" id="promptSend">↑</button>
    </div>
  </div><!-- /home -->

  <!-- STATO 2 · CAMERA hub 7 porte -->
  <div class="camera" id="camera">
    <div class="amb"></div><div class="embers"></div><div class="floor"></div>

    <div class="cam-top">
      <button class="backbtn mono" id="backBtn">↩ home</button>
      <div class="cam-title">
        <div class="ttl">la nostra stanza</div>
        <div class="sub mono">~/la_nostra_stanza <b>❯</b> un soffio · cambia stanza</div>
      </div>
      <div class="cam-presence">
        <button class="couple sm" id="coupleCam" title="noi">
          <span class="cav b">🐻</span><span class="cav c">🧁</span><span class="cled" id="camCled"></span>
        </button>
      </div>
    </div>

    <div class="statusbar mono">
      <span class="seg"><span class="dot" id="camDot"></span> <span id="camPresLabel">—</span></span>
      <span class="spacer"></span>
      <span class="seg">ult. <b id="camLastSeen">—</b></span>
      <span class="seg heatmini">calore <span id="camHeatVal">—°</span> <span class="up" id="camHeatUp"></span></span>
    </div>

    <div class="stage">
      <div class="hero" id="hero" style="--accent:#ff6f3c">
        <span class="halo"></span>
        <div class="jamb2"><div class="inside2"></div><div class="leaf2"></div><span class="sill2"></span></div>
        <div class="sign" id="hSign">🔥</div>
        <div class="teaser2" id="hTeaser"></div>
      </div>
      <div class="herometa" id="heroMeta">
        <div class="h-nm" id="hNm">fantasie</div>
        <div class="h-sub mono" id="hSub"></div>
      </div>
      <button class="hero-cta mono" id="heroEnter">❯ entra nel varco</button>
    </div>

    <div class="cam-console">
      <div class="focus mono" id="focusLine">
        <span class="prompt">❯</span>
        <span class="nm" id="fNm">in evidenza</span><span class="cur"></span>
        <span class="meta" id="fMeta">tocca il dock per cambiare</span>
      </div>
    </div>

    <nav class="dock" id="dock"><div class="dock-rail" id="dockRail"></div></nav>
  </div><!-- /camera -->

  <!-- POP-UP CALORE -->
  <div class="heat-pop" id="heatPop">
    <div class="hp-backdrop"></div>
    <div class="hp-card">
      <div class="hp-top">
        <button class="hp-x" id="heatClose">✕</button>
        <div class="hp-kicker">la vostra brace</div>
        <div class="hp-h" id="hpH">è calda, e resta accesa</div>
        <div class="hp-big" id="hpBig">—°<small></small></div>
      </div>
      <div class="hp-rule"></div>
      <div class="hp-body" id="hpBody"></div>
    </div>
  </div>

  <!-- POP-UP TRAGUARDI (7ª porta · placeholder) -->
  <div class="heat-pop" id="traguardiPop">
    <div class="hp-backdrop"></div>
    <div class="hp-card">
      <div class="hp-top">
        <button class="hp-x" id="traguardiClose">✕</button>
        <div class="hp-kicker">traguardi</div>
        <div class="hp-h">presto, insieme</div>
      </div>
      <div class="hp-rule"></div>
      <div class="hp-body">&gt; piccoli traguardi di coppia
&gt; <span class="dim">in arrivo… nessuna fretta</span></div>
    </div>
  </div>

 </div><!-- /frame -->
</div><!-- /homeRoot -->
```

- [ ] **Step 2: Verificare che il pager `#app` (righe ~121–140) resti INTATTO**

Run: `git diff index.html`
Expected: cambia solo il blocco `#home`→`#homeRoot`; `<div class="wrap" id="app">…</div>` invariato.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(home): markup #homeRoot (HUD + camera hub + pop-up)"
```

---

## Task 6: Riscrittura `js/modules/home.js`

Cuore del port: monta i 3 stati, le transizioni, i dati reali, la presenza e la navigazione.

**Files:**
- Rewrite: `js/modules/home.js`

- [ ] **Step 1: Sostituire l'intero contenuto di `js/modules/home.js`**

```js
// Home "porta-zoom + hub": macchina a 3 stati (#home HUD, #camera hub, sezione/pager).
// #home/#camera vivono qui; #app/pager vive in app.js. Navigazione cross-modulo via
// eventi: 'goto' (entra in sezione) e 'gohub' (torna all'hub). Best-effort: se una
// fonte dati fallisce si logga e quella parte si degrada, ma la stanza resta viva.

import { mk, add, clear } from '../ui.js';
import {
  listGiri, listSlotMov, listBuoni, listDesideri, listEsperienze, listLuoghi, listFotoGalleria, getPartner,
} from '../store.js';
import {
  calcolaCalore, eventiCalore, PESI_CALORE, CALORE, riepilogoSezioni,
} from '../lib/logic.js';
import { isOnline, tempoRelativo, avviaHeartbeat } from '../lib/presence.js';

const $ = (id) => document.getElementById(id);

// Le 6 sezioni reali (key = key di TABS/goto in app.js) + la 7ª placeholder.
const SEZIONI = [
  { key: 'desideri',   em: '🔥', nm: 'fantasie',   c: '#ff6f3c' },
  { key: 'giochi',     em: '🎲', nm: 'giochi',     c: '#f2738f' },
  { key: 'calendario', em: '📅', nm: 'esperienze', c: '#ffb454' },
  { key: 'mappa',      em: '🗺️', nm: 'mappa',      c: '#7ee0a8' },
  { key: 'buoni',      em: '🎟️', nm: 'buoni',      c: '#e8455f' },
  { key: 'galleria',   em: '🖼️', nm: 'galleria',   c: '#9c2150' },
];
const TRAGUARDI = { key: 'traguardi', em: '🏅', nm: 'traguardi', c: '#ffb454' };
const SEC_BY_KEY = Object.fromEntries(SEZIONI.map(s => [s.key, s]));

// teaser per stato (scelto da novita; fallback 'none').
const TEASER = {
  desideri:   { hot: 'qualcosa di bollente ti aspetta…', warn: 'una fantasia in sospeso', none: 'lasciale una fantasia, stasera' },
  giochi:     { warn: 'hai giri da spendere, tenta la sorte', none: 'tira un dado, decide il caso' },
  calendario: { warn: 'qualcosa in arrivo sul calendario', none: 'segnate la prossima volta insieme' },
  mappa:      { hot: 'un posto nuovo da scoprire', none: 'i vostri posti, tutti qui' },
  buoni:      { warn: 'un buono sta per scadere, riscuotilo', hot: 'hai un buono da riscuotere', none: 'regalale un buono a sorpresa' },
  galleria:   { hot: "l'ultima polaroid è ancora calda", none: 'i vostri ricordi, tutti qui' },
};
function teaserDi(key, nov) { const t = TEASER[key] || {}; return t[nov] || t.none || ''; }

// LED novità → classe della logline HUD.
const LED_LOG = { hot: 'r', warn: 'g', none: 'n' };

// Etichette/emoji righe del pop-up calore.
const CALORE_LBL = {
  esperienza: "un'esperienza insieme", desiderio: 'una fantasia', buono: 'un buono',
  foto: 'una foto nuova', luogo: 'un luogo nuovo', gioco: 'un gioco giocato',
};
const CALORE_EMO = { esperienza: '📅', desiderio: '🔥', buono: '🎟️', foto: '🖼️', luogo: '🗺️', gioco: '🎲' };

let wired = false;
let busy = false;
let current = 'desideri';
let calore = null;           // ultimo calcolo { items, r, now }
let stopHeartbeat = null;    // avviato una sola volta
let riepilogo = [];          // ultimo riepilogoSezioni

function dispatch(name, detail) {
  document.dispatchEvent(new CustomEvent(name, detail != null ? { detail } : undefined));
}
function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; }

// ============ TRANSIZIONI HUD <-> CAMERA ============
function enterRoom() {
  if (busy) return; busy = true;
  const home = $('home'), camera = $('camera'), door = $('door'), doorway = $('doorway'), peeknote = $('peeknote');
  peeknote.classList.remove('show');
  door.classList.add('open');
  doorway.classList.add('opening');
  setTimeout(() => home.classList.add('dolly'), 360);
  setTimeout(() => camera.classList.add('in'), 780);
  setTimeout(() => { home.classList.add('hidden'); resetHub(); busy = false; }, 1300);
}
function exitRoom() {
  if (busy) return; busy = true;
  const home = $('home'), camera = $('camera'), door = $('door'), doorway = $('doorway'), peeknote = $('peeknote');
  camera.classList.remove('in');
  camera.classList.add('out');
  home.classList.remove('hidden');
  void home.offsetWidth;
  home.classList.remove('dolly');
  door.classList.remove('open');
  doorway.classList.remove('opening');
  setTimeout(() => { camera.classList.remove('out'); peeknote.classList.add('show'); busy = false; }, 900);
}
// Mostra la camera SENZA dolly (ritorno da una sezione via 'gohub').
function showCamera() {
  const home = $('home'), camera = $('camera');
  home.classList.add('hidden');
  home.classList.remove('dolly');
  camera.classList.remove('out');
  camera.classList.add('in');
  resetHub();
}
// Nasconde la camera (quando si entra in una sezione/pager).
function hideStates() {
  const camera = $('camera');
  camera.classList.remove('in');
  camera.classList.add('out');
}

// ============ HUB: porta in evidenza ============
function spawnEmbers() {
  if (reduceMotion()) return;
  const hero = $('hero'); const hr = hero.getBoundingClientRect();
  const ox = hr.left + hr.width * 0.5, oy = hr.top + hr.height * 0.82;
  for (let i = 0; i < 4; i++) {
    const p = mk('div', 'ember');
    p.style.left = ox + 'px'; p.style.top = oy + 'px';
    p.style.setProperty('--dx', ((i % 2 ? 1 : -1) * (10 + i * 8)) + 'px');
    p.style.setProperty('--dy', (-(20 + i * 8)) + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 620);
  }
}
function etichettaCount(key, n) {
  if (key === 'giochi')     return n > 0 ? n + ' da giocare' : 'nessun giro';
  if (key === 'desideri')   return n > 0 ? n + (n > 1 ? ' nuove' : ' nuova') : 'nessuna nuova';
  if (key === 'buoni')      return n > 0 ? n + ' attivi' : 'nessuno attivo';
  if (key === 'calendario') return n > 0 ? n + ' in arrivo' : 'niente in agenda';
  if (key === 'mappa')      return n > 0 ? n + ' luoghi' : 'nessun luogo';
  if (key === 'galleria')   return n > 0 ? n + ' ricordi' : 'nessun ricordo';
  return String(n);
}
function paintHero(key) {
  const s = SEC_BY_KEY[key]; if (!s) return;
  const info = riepilogo.find(r => r.key === key) || { count: 0, novita: 'none' };
  const hero = $('hero');
  hero.classList.add('swap');
  spawnEmbers();
  setTimeout(() => {
    hero.style.setProperty('--accent', s.c);
    $('hSign').textContent = s.em;
    $('hTeaser').innerHTML = '<i>» ' + teaserDi(key, info.novita) + '</i>';
    $('hNm').textContent = s.nm;
    $('hSub').innerHTML = '<b>' + etichettaCount(key, info.count) + '</b>';
    $('heroEnter').style.setProperty('--accent', s.c);
    $('fNm').textContent = 'in evidenza · ' + s.em + ' ' + s.nm;
    $('fMeta').textContent = 'tocca il dock per cambiare';
    hero.classList.remove('swap');
  }, 150);
}
function selectSlot(key) {
  current = key;
  document.querySelectorAll('#dock .slot').forEach(x => x.classList.toggle('on', x.dataset.sec === key));
  paintHero(key);
}
function resetHub() { selectSlot('desideri'); }

// ============ DOCK ============
function buildDock() {
  const rail = $('dockRail'); clear(rail);
  [...SEZIONI, TRAGUARDI].forEach(s => {
    const b = mk('button', 'slot'); b.dataset.sec = s.key; b.style.setProperty('--accent', s.c);
    const ct = mk('span', 'ct zero', '·');
    const nv = mk('span', 'nv none');
    const arch = mk('span', 'arch'); arch.appendChild(mk('span', 'ico', s.em));
    add(b, ct, nv, arch, mk('span', 'lab', s.nm));
    b.onclick = () => onSlot(s.key);
    rail.appendChild(b);
  });
}
function onSlot(key) {
  if (key === 'traguardi') { apriTraguardi(); return; }
  if (key === current) { apriSezione(key); return; }   // 2ª toccata sulla porta attiva = entra
  selectSlot(key);
  const el = document.querySelector('#dock .slot[data-sec="' + key + '"]');
  if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function apriSezione(key) {
  if (key === 'traguardi') { apriTraguardi(); return; }
  const s = SEC_BY_KEY[key];
  $('fNm').textContent = 'apertura · ' + (s ? s.nm : key) + '…';
  $('fMeta').textContent = '';
  hideStates();
  dispatch('goto', key);
}
function apriTraguardi() { const pop = $('traguardiPop'); if (pop) pop.classList.add('open'); }

function applicaRiepilogoAlDock() {
  riepilogo.forEach(info => {
    const slot = document.querySelector('#dock .slot[data-sec="' + info.key + '"]');
    if (!slot) return;
    const ct = slot.querySelector('.ct'), nv = slot.querySelector('.nv');
    ct.textContent = info.count > 0 ? String(info.count) : '·';
    ct.classList.toggle('zero', info.count <= 0);
    nv.className = 'nv ' + info.novita;
  });
}
function buildNotifLog() {
  const box = $('notifLog'); clear(box);
  const badge = $('notifBadge');
  const attive = riepilogo.filter(r => r.novita !== 'none');
  if (!attive.length) {
    box.appendChild(mk('div', 'logline', '> tutto tranquillo, per ora'));
    badge.style.display = 'none';
    return;
  }
  badge.style.display = ''; badge.textContent = attive.length + (attive.length > 1 ? ' nuove' : ' nuova');
  const ORD = { hot: 0, warn: 1, none: 2 };
  attive.sort((a, b) => ORD[a.novita] - ORD[b.novita]).slice(0, 3).forEach(info => {
    const s = SEC_BY_KEY[info.key];
    const line = mk('button', 'logline');
    add(line,
      mk('span', 'led ' + LED_LOG[info.novita]),
      mk('span', 'txt', teaserDi(info.key, info.novita) + ' ' + s.em),
      mk('span', 'src', '~/' + s.nm));
    line.onclick = () => apriSezione(info.key);
    box.appendChild(line);
  });
}

// ============ PRESENZA ============
function aggiornaPresenza(partner) {
  const now = new Date();
  const online = !!partner && isOnline(partner.last_seen, now);
  const coupleHome = $('coupleHome'); if (coupleHome) coupleHome.classList.toggle('solo', !online);
  const coupleCam = $('coupleCam'); if (coupleCam) coupleCam.classList.toggle('solo', !online);
  $('camPresLabel').textContent = online ? 'online · insieme' : 'lei non c’è ora';
  $('camLastSeen').textContent = partner ? tempoRelativo(partner.last_seen, now) : '—';
  const dot = $('camDot'); if (dot) dot.style.background = online ? 'var(--green)' : 'var(--off)';
}

// ============ CALORE (gauge HUD + statusbar + pop-up) ============
async function caricaItemsCalore(client, coupleId) {
  const [esperienze, desideri, buoni, foto, luoghi, giri, slot] = await Promise.all([
    listEsperienze(client, coupleId), listDesideri(client, coupleId), listBuoni(client, coupleId),
    listFotoGalleria(client, coupleId), listLuoghi(client, coupleId),
    listGiri(client, coupleId), listSlotMov(client, coupleId),
  ]);
  return [
    ...esperienze.map(e => ({ tipo: 'esperienza', quando: e.data })),
    ...desideri.map(d => ({ tipo: 'desiderio', quando: d.creato })),
    ...buoni.map(b => ({ tipo: 'buono', quando: b.creato })),
    ...foto.map(f => ({ tipo: 'foto', quando: f.creato })),
    ...luoghi.map(l => ({ tipo: 'luogo', quando: l.data_evento || l.creato })),
    ...giri.filter(m => m.motivo === 'giro').map(m => ({ tipo: 'gioco', quando: m.creato })),
    ...slot.filter(m => m.motivo === 'tiro').map(m => ({ tipo: 'gioco', quando: m.creato })),
  ];
}
function contributiRecenti(items, now) {
  const ora = now.getTime();
  return items
    .filter(it => it.quando && PESI_CALORE[it.tipo] != null)
    .map(it => ({ tipo: it.tipo, t: new Date(it.quando).getTime() }))
    .filter(x => x.t <= ora && (ora - x.t) / 864e5 < CALORE.finestraGiorni)
    .sort((a, b) => b.t - a.t);
}
function fmtDelta(el, delta) {
  if (!el) return;
  const d = Math.round(delta);
  el.classList.remove('dn', 'fl');
  if (d > 0) el.textContent = '▲ +' + d;
  else if (d < 0) { el.classList.add('dn'); el.textContent = '▼ ' + d; }
  else { el.classList.add('fl'); el.textContent = '· stabile'; }
}
function renderHeatGauge(r) {
  const g = Math.round(r.gradi);
  $('heatFill').style.width = g + '%';
  $('heatVal').textContent = g + '°';
  fmtDelta($('heatUp'), r.delta);
  $('heatBtn').style.display = '';
  $('camHeatVal').textContent = g + '°';
  fmtDelta($('camHeatUp'), r.delta);
}
function buildHeatLines(items, r, now) {
  const contrib = contributiRecenti(items, now);
  const lines = [];
  if (contrib.length) {
    lines.push('<span class="dim"># cos\'ha acceso la brace</span>');
    contrib.slice(0, 4).forEach(c =>
      lines.push('> ' + CALORE_EMO[c.tipo] + ' <span class="g">+' + PESI_CALORE[c.tipo] + '</span>  ' + CALORE_LBL[c.tipo]));
  } else {
    lines.push('<span class="dim"># la brace riposa</span>');
    lines.push('> niente di recente… <span class="dim">ma il fondo tiene</span>');
  }
  lines.push('');
  lines.push('> brace di fondo <span class="y">' + Math.round(r.pavimento) + '°</span> — non si spegne, si alza piano');
  lines.push('> <span class="o">invito</span>: una serata insieme <span class="g">+6</span> <span class="nw">(se vi va)</span>');
  return lines;
}
let heatTimer = null;
function renderHeatPop(items, r, now) {
  const big = $('hpBig'), body = $('hpBody'), h = $('hpH');
  const g = Math.round(r.gradi), d = Math.round(r.delta);
  const sm = d > 0 ? '<small>▲ +' + d + ' oggi</small>'
    : d < 0 ? '<small class="dn">▼ ' + d + ' oggi</small>'
    : '<small class="fl">· stabile</small>';
  big.innerHTML = g + '°' + sm;
  h.textContent = r.braci > 4 ? 'è calda, e resta accesa' : r.braci > 0 ? 'tiepida, ma viva' : 'riposa, ma non si spegne';
  const lines = buildHeatLines(items, r, now);
  if (heatTimer) { clearTimeout(heatTimer); heatTimer = null; }
  if (reduceMotion()) { body.innerHTML = lines.join('\n') + '<span class="hp-cur"></span>'; return; }
  let i = 0; body.innerHTML = '';
  (function step() {
    if (i >= lines.length) { body.innerHTML = lines.join('\n') + '<span class="hp-cur"></span>'; return; }
    body.innerHTML = lines.slice(0, i + 1).join('\n') + '<span class="hp-cur"></span>';
    i++; heatTimer = setTimeout(step, 110);
  })();
}
async function aggiornaCalore(client, me) {
  try {
    const now = new Date();
    const itemsCal = await caricaItemsCalore(client, me.couple_id);
    const eventi = eventiCalore(itemsCal);
    const r = calcolaCalore(eventi, now);
    const rIeri = calcolaCalore(eventi, new Date(now.getTime() - 864e5));
    calore = { items: itemsCal, r: { ...r, delta: r.gradi - rIeri.gradi }, now };
    renderHeatGauge(calore.r);
  } catch (e) {
    console.error('[home] calore non disponibile:', e);
    const h = $('heatBtn'); if (h) h.style.display = 'none';
  }
}

// ============ WIRING (una volta) ============
function wireOnce() {
  if (wired) return; wired = true;
  $('enterBtn').onclick = enterRoom;
  $('door').onclick = enterRoom;
  $('backBtn').onclick = exitRoom;
  $('heroEnter').onclick = () => apriSezione(current);
  $('hero').onclick = () => apriSezione(current);

  // pop-up calore (riapre l'ultimo calcolo, niente rifetch)
  const heatBtn = $('heatBtn'), heatPop = $('heatPop'), heatClose = $('heatClose');
  const openHeat = () => { if (!calore) return; heatPop.classList.add('open'); renderHeatPop(calore.items, calore.r, calore.now); };
  const closeHeat = () => heatPop.classList.remove('open');
  if (heatBtn) heatBtn.onclick = openHeat;
  if (heatClose) heatClose.onclick = closeHeat;
  const bd = heatPop.querySelector('.hp-backdrop'); if (bd) bd.onclick = closeHeat;

  // pop-up traguardi (placeholder)
  const tPop = $('traguardiPop'), tClose = $('traguardiClose');
  if (tClose) tClose.onclick = () => tPop.classList.remove('open');
  if (tPop) { const tb = tPop.querySelector('.hp-backdrop'); if (tb) tb.onclick = () => tPop.classList.remove('open'); }

  // navigazione cross-modulo
  document.addEventListener('gohub', showCamera);
  document.addEventListener('goto', hideStates);
}

export async function renderHome({ client, me }) {
  wireOnce();
  buildDock();

  $('homeMeAv').textContent = me.avatar || '🐻';
  $('peeknote').classList.add('show');

  // dati reali in parallelo (best-effort)
  let liste = null, partner = null;
  try {
    const [desideri, esperienze, buoni, foto, luoghi, giri, slot, p] = await Promise.all([
      listDesideri(client, me.couple_id),
      listEsperienze(client, me.couple_id),
      listBuoni(client, me.couple_id),
      listFotoGalleria(client, me.couple_id),
      listLuoghi(client, me.couple_id),
      listGiri(client, me.couple_id),
      listSlotMov(client, me.couple_id),
      getPartner(client, me.couple_id, me.id).catch(() => null),
    ]);
    liste = { desideri, esperienze, buoni, foto, luoghi, giri, slot };
    partner = p;
  } catch (e) {
    console.error('[home] dati non disponibili:', e);
  }

  riepilogo = liste ? riepilogoSezioni(liste, me, new Date()) : [];
  applicaRiepilogoAlDock();
  buildNotifLog();

  if (partner) $('homePartnerAv').textContent = partner.avatar || '🧁';
  aggiornaPresenza(partner);

  await aggiornaCalore(client, me);

  selectSlot('desideri');

  if (!stopHeartbeat) {
    try { stopHeartbeat = avviaHeartbeat({ client, me }); }
    catch (e) { console.error('[home] heartbeat non avviato:', e); }
  }
}
```

- [ ] **Step 2: Sintassi OK**

Run: `node --check js/modules/home.js`
Expected: nessun output.

- [ ] **Step 3: Commit (parziale — la nav completa arriva con app.js, Task 7)**

```bash
git add js/modules/home.js
git commit -m "feat(home): renderHome riscritta — 3 stati, dati reali, presenza, calore"
```

---

## Task 7: Wiring navigazione in `js/app.js`

**Files:**
- Modify: `js/app.js` (`enterApp`, `showHome`, `enterSection`, nuovo `goHub`, binding `homeBtn` e chip coppia)

- [ ] **Step 1: Rimpiazzare `showHome` ed `enterSection` (righe 104–115) e aggiungere `goHub`**

```js
// La home (porta-zoom) è un overlay a sé: nav e FAB di sezione spariscono (body.on-home).
function showHome() {
  document.body.classList.add('on-home');
  $('homeRoot').style.display = '';
  renderHome({ client, me }).catch(err => toast('Errore home: ' + err.message, 'err'));
}

// Entra in una sezione: nasconde la home/hub e mostra il pager con la nav.
function enterSection(k) {
  document.body.classList.remove('on-home');
  $('homeRoot').style.display = 'none';
  go(k);
}

// Torna dall'interno di una sezione all'hub (⌂): riapre l'overlay sulla camera.
function goHub() {
  document.body.classList.add('on-home');
  $('homeRoot').style.display = '';
  document.dispatchEvent(new CustomEvent('gohub'));
}
```

- [ ] **Step 2: In `enterApp`, ricablare i bottoni che riferivano gli id vecchi**

Sostituire le righe 96–97:

```js
  $('homeMeChip').onclick = () => openImpostazioni({ client, me, onProfileChange: () => { refreshChip(); showHome(); } });
  $('homeBtn').onclick = () => showHome();
```

con:

```js
  $('coupleHome').onclick = () => openImpostazioni({ client, me, onProfileChange: () => { refreshChip(); showHome(); } });
  $('homeBtn').onclick = () => goHub();
```

(`#homeMeChip` non esiste più nel nuovo markup; `⌂` ora torna all'hub, non alla HUD.)

- [ ] **Step 3: Sintassi OK**

Run: `node --check js/app.js`
Expected: nessun output.

- [ ] **Step 4: Verifica funzionale in browser (manuale)**

Avviare il preview server e aprire la app (login Supabase richiesto sul device; in locale almeno verificare che la HUD compaia e non ci siano errori in console prima del login). Controllare il flusso completo sul device:
1. Boot → HUD porta visibile, gauge calore popolata, log notifiche con conteggi reali.
2. Tap porta / "entra nella stanza" → dolly → hub 7 porte; dock con count + LED reali.
3. Tap slot dock → cambia hero (swap + braci); 2ª toccata o "entra nel varco" → entra nella sezione (pager).
4. Dentro la sezione: swipe fra le 6 sezioni + barra `#nav` come prima.
5. `⌂` → torna all'hub (camera), non alla HUD.
6. `↩ home` nell'hub → torna alla HUD porta.
7. Tap gauge calore → pop-up "la vostra brace" con il typing terminale.

Expected: tutti i passaggi fluidi, nessun errore in console.

- [ ] **Step 5: Suite verde (nessuna regressione logica)**

Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(home): nav Modello A — goto/gohub, ⌂ all'hub, chip coppia → impostazioni"
```

---

## Task 8: 7ª porta "traguardi" — rifinitura placeholder

Il markup (`#traguardiPop`) e il wiring (`apriTraguardi`, `onSlot`/`apriSezione` che intercettano `traguardi`) sono già in place dalle Task 5–6. Questa task verifica solo il comportamento e rifinisce la copy.

**Files:**
- Verify: `js/modules/home.js`, `index.html`

- [ ] **Step 1: Verifica comportamento**

Sul device: tap sulla 7ª porta 🏅 nel dock → si apre il pop-up "presto, insieme"; NON entra in nessun pager. La 7ª porta NON compare nello swipe del pager (il pager usa solo `TABS`, 6 sezioni — invariato).

Expected: confermato.

- [ ] **Step 2 (se serve rifinire la copy): aggiornare il corpo del pop-up traguardi in `index.html`**

(Già impostato in Task 5; modificare solo se l'utente vuole un testo diverso.)

- [ ] **Step 3: Commit (solo se ci sono modifiche)**

```bash
git add index.html
git commit -m "chore(home): copy 7ª porta traguardi (placeholder)"
```

---

## Task 9: Bump SW + cleanup home vecchia

**Files:**
- Modify: `sw.js` (versione cache + SHELL)
- Modify: `styles.css` (rimozione stili home vecchia)
- Delete: `assets/camera.jpg` (se non più referenziato)

- [ ] **Step 1: Bump cache e aggiornare lo SHELL in `sw.js`**

In `sw.js`:
- `const CACHE = 'brace-v26';` → `const CACHE = 'brace-v27';`
- Nell'array `SHELL`: aggiungere `'home.css'`; rimuovere `'assets/camera.jpg'` se presente.

Run (per ispezionare lo SHELL prima di editare): aprire `sw.js` e localizzare l'array `SHELL`.

- [ ] **Step 2: Rimuovere gli stili della home vecchia da `styles.css`**

Rimuovere i blocchi obsoleti (la home vecchia non esiste più nel markup). Cercare e cancellare le regole di:
`.home-bg, .home-duo, .home-lit, .home-deepen, .home-vig, .home-topbar, .home-greet, .home-h, .home-kick, .home-wlab, .home-pins, .home-pin-*, .home-calmo, .home-chip*, .home-radial, .home-ritem, .home-fab, .home-help, .home-scrim, .home-coach*, .home-heat, .hh-*` e le vecchie `.heat-pop`/`.hp-*` non scoped (ora vivono scoped in `home.css`).

Run (per individuarle): `Grep` su `styles.css` con pattern `^\.home-|\.hh-|^\.heat-pop|^\.hp-`.

ATTENZIONE: NON rimuovere classi usate dall'app-shell o da altre sezioni. Verificare con un grep nel markup/JS che la classe non sia usata altrove prima di cancellarla.

- [ ] **Step 3: Eliminare `assets/camera.jpg` se non più referenziato**

Run: `Grep` su `camera.jpg` in tutto il repo.
Se l'unico riferimento era la home vecchia + lo SHELL del SW (ora rimosso): eliminare `assets/camera.jpg`.
Se è referenziato altrove: NON eliminare, e nota il riferimento.

- [ ] **Step 4: Verifica finale**

Run: `node --test`
Expected: PASS (suite verde).

Run: `node --check js/app.js js/modules/home.js js/lib/presence.js js/lib/logic.js js/store.js`
Expected: nessun output.

Verifica device: ricaricare la PWA → il nuovo SW (`brace-v27`) prende il controllo, le cache vecchie vengono pulite, la home a porte è quella servita. Calore, conteggi e presenza dal vivo OK.

- [ ] **Step 5: Commit**

```bash
git add sw.js styles.css
git rm assets/camera.jpg   # solo se eliminato allo Step 3
git commit -m "chore(home): bump SW v27 + pulizia stili/asset home vecchia"
```

---

## Testing

- **Logica pura** (`node --test`): `presence` (isOnline, tempoRelativo), `riepilogoSezioni`, `store.updateLastSeen`, calore (già coperto). Mantenere la suite verde.
- **UI / transizioni / presenza dal vivo:** verifica manuale sul device (login Supabase richiesto, l'agente non può autenticarsi). Coperta in Task 7 Step 4 e Task 9 Step 4.
- Le scelte di gesto/feel sono già decise sui mockup approvati: non si re-esplorano.

## Note / rischi

- **Migrazione DB:** `supabase/presence.sql` va eseguita a mano nel SQL Editor di Supabase prima del test della presenza dal vivo. Finché `last_seen` non esiste, `getPartner` ritorna comunque il profilo (senza la colonna) e la presenza si degrada a "offline" senza crash.
- **Collisioni CSS:** il rischio principale è la home.css che clobbera l'app-shell. L'isolamento sotto `#homeRoot` + il rename dei keyframes lo previene. Verificare in Task 7 Step 4 che login e sezioni interne siano visivamente intatti.
- **Compat evento `goto`:** la Galleria dispatcha già `goto`. `enterSection` resta il consumer; `home.js` aggiunge solo un listener idempotente (`hideStates`). Nessuna rottura.
- **Heartbeat & batteria:** intervallo ~30s solo in foreground; stop su `visibilitychange→hidden`. Trascurabile.
- **Promptbar `+fantasia` e log:** il log porta alla sezione (routing); la promptbar è decorativa nel v1 (niente quick-add inline).
