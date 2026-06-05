# La Posta — template card + quiet (passo 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modulo puro `js/modules/posta-card.js` (template HTML dei 6 tipi di card + blocco quiet), CSS `.posta` in `home.css`, due micro-modifiche a `logic.js`, pagina di validazione `mockups/valida-posta.html` con dati Supabase veri e seed `supabase/seed-posta.sql`.

**Architecture:** Le funzioni template ritornano **stringhe HTML** (zero DOM, zero import) e si testano con `node --test`. L'`Evento` in input è quello già prodotto da `feedEventi`. L'escape XSS è centralizzato nel modulo. La pagina di validazione è sottile: login reale → fetch via `store.js` → `feedEventi` → render.

**Tech Stack:** Vanilla ES modules, `node:test`, Supabase (CDN), CSS scoped.

**Spec:** `docs/superpowers/specs/2026-06-05-posta-card-templates-design.md`

**Vincoli congelati (CLAUDE.md):** ember `#ff6f3c` solo azione/novità; oro struttura; Fraunces display / Nunito UI; mono solo valori+kicker; Caveat solo voce di lei; copy umano e letterale.

---

### Task 1: `logic.js` — didascalia polaroid da `titolo` a `hand`

La didascalia è voce di lei → campo `hand` (Caveat). Senza didascalia: nessun campo contenuto (decisione 5 della spec).

**Files:**
- Modify: `js/lib/logic.js` (dentro `feedEventi`, ramo `foto`, ~riga 888)
- Test: `test/feed.test.js` (~riga 35)

- [ ] **Step 1: Aggiorna il test esistente e aggiungine uno nuovo**

In `test/feed.test.js`, sostituisci il test `'polaroid: foto della partner entra (galleria), le mie no'` (righe 35–47) con:

```js
test('polaroid: foto della partner entra (galleria), le mie no; didascalia in hand', () => {
  const liste = { foto: [
    { id: 'f1', autore_id: 'lei', didascalia: 'ieri sera', creato: oreFa(3) },
    { id: 'f2', autore_id: 'me', didascalia: 'mia', creato: oreFa(1) },
  ] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].tipo, 'polaroid');
  assert.equal(feed[0].emoji, '🖼️');
  assert.equal(feed[0].sezioneKey, 'galleria');
  assert.equal(feed[0].hand, 'ieri sera');   // voce di lei → hand, non titolo
  assert.equal(feed[0].titolo, '');
  assert.equal(feed[0].refId, 'f1');
});

test('polaroid senza didascalia → niente hand né titolo (nessuna riga morta)', () => {
  const liste = { foto: [{ id: 'f1', autore_id: 'lei', creato: oreFa(3) }] };
  const feed = feedEventi(liste, ME, null, NOW);
  assert.equal(feed[0].hand, undefined);
  assert.equal(feed[0].titolo, '');
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/feed.test.js`
Expected: FAIL — `feed[0].hand` è `undefined` (la didascalia oggi finisce in `titolo`).

- [ ] **Step 3: Implementa in `feedEventi`**

In `js/lib/logic.js`, ramo `foto` (oggi: `kicker: 'una polaroid', titolo: f.didascalia || ''`), sostituisci con:

```js
  for (const f of foto) {
    if (f.autore_id === meId) continue;
    eventi.push(base(f, { tipo: 'polaroid', emoji: '🖼️', sezioneKey: 'galleria',
      kicker: 'una polaroid', ...(f.didascalia ? { hand: f.didascalia } : {}) }));
  }
```

- [ ] **Step 4: Esegui la suite intera**

Run: `node --test`
Expected: tutti pass, 0 fail (276 esistenti +1 nuovo, col test rimpiazzato).

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/feed.test.js
git commit -m "feat(feed): didascalia polaroid in hand (voce di lei), niente fallback"
```

---

### Task 2: `logic.js` — `feedVisibile` (la posta letta si ritira)

**Files:**
- Modify: `js/lib/logic.js` (subito dopo `contaNuovi`)
- Test: `test/feed.test.js` (in fondo)

- [ ] **Step 1: Scrivi i test**

In fondo a `test/feed.test.js`, aggiorna l'import in testa al file:

```js
import { feedEventi, contaNuovi, feedVisibile } from '../js/lib/logic.js';
```

e aggiungi:

```js
// ---- feedVisibile: la posta letta si ritira nelle sezioni ----

test('feedVisibile: nuove restano, lette spariscono, buono e giri restano sempre', () => {
  const vistoAt = giorniFa(2);
  const liste = {
    desideri: [
      { id: 'd-nuova', autore_id: 'lei', stato: 'da_provare', testo: 'a', creato: oreFa(1) },
      { id: 'd-letta', autore_id: 'lei', stato: 'da_provare', testo: 'b', creato: giorniFa(5) },
    ],
    buoni: [{ id: 'b-letto', tipo: 'regalo', stato: 'attivo', da_id: 'lei', a_id: 'me', titolo: 'B', creato: giorniFa(10) }],
    giri: [{ user_id: 'me', delta: 2 }],
  };
  const feed = feedEventi(liste, ME, vistoAt, NOW);
  const visibili = feedVisibile(feed).map(e => e.refId ?? e.tipo);
  assert.ok(visibili.includes('d-nuova'));
  assert.ok(!visibili.includes('d-letta'));
  assert.ok(visibili.includes('b-letto'));   // azionabile: resta anche se letto
  assert.ok(visibili.includes('giri'));      // azionabile: resta sempre
});

test('feedVisibile su feed vuoto/null → []', () => {
  assert.deepEqual(feedVisibile([]), []);
  assert.deepEqual(feedVisibile(null), []);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/feed.test.js`
Expected: FAIL — `feedVisibile is not a function`.

- [ ] **Step 3: Implementa**

In `js/lib/logic.js`, subito dopo `contaNuovi`:

```js
// La posta letta si ritira nelle sezioni (spec 2026-06-05): la home mostra solo
// nuovo + azionabile. Buono attivo e giri restano finché non si esauriscono.
export function feedVisibile(feed) {
  return (feed || []).filter(e => e.nuovo || e.tipo === 'buono' || e.tipo === 'giri');
}
```

- [ ] **Step 4: Esegui la suite intera**

Run: `node --test`
Expected: tutti pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/lib/logic.js test/feed.test.js
git commit -m "feat(feed): feedVisibile - la posta letta si ritira, restano nuovo+azionabile"
```

---

### Task 3: `posta-card.js` — `esc` + `tempoRelativo`

**Files:**
- Create: `js/modules/posta-card.js`
- Create: `test/posta-card.test.js`

- [ ] **Step 1: Scrivi i test**

Crea `test/posta-card.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, tempoRelativo } from '../js/modules/posta-card.js';

const NOW = new Date('2026-06-05T12:00:00Z');
const oreFa = (n) => new Date(NOW.getTime() - n * 3600e3).toISOString();
const giorniFa = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

// ---- esc ----

test('esc: escapa & < > " \'', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('esc: null/undefined → stringa vuota', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

// ---- tempoRelativo ----

test('tempoRelativo: < 60s → "ora"', () => {
  assert.equal(tempoRelativo(new Date(NOW.getTime() - 30e3).toISOString(), NOW), 'ora');
});

test('tempoRelativo: minuti → "Xm"', () => {
  assert.equal(tempoRelativo(new Date(NOW.getTime() - 30 * 60e3).toISOString(), NOW), '30m');
});

test('tempoRelativo: ore → "Xh"', () => {
  assert.equal(tempoRelativo(oreFa(7), NOW), '7h');
});

test('tempoRelativo: ieri (giorno di calendario, oltre 24h) → "ieri"', () => {
  // NOW è il 5 giugno a mezzogiorno: 28 ore fa è il 4 giugno → "ieri"
  assert.equal(tempoRelativo(oreFa(28), NOW), 'ieri');
});

test('tempoRelativo: giorni → "X gg fa"', () => {
  assert.equal(tempoRelativo(giorniFa(3), NOW), '3 gg fa');
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/posta-card.test.js`
Expected: FAIL — modulo inesistente (`Cannot find module`).

- [ ] **Step 3: Crea il modulo con le due funzioni**

Crea `js/modules/posta-card.js`:

```js
// Template HTML delle card de La Posta + blocco quiet (spec 2026-06-05).
// Modulo PURO: zero DOM, zero import — le funzioni ritornano stringhe,
// testabili con node --test. È l'unico punto che produce il markup delle card;
// tutte le stringhe dinamiche passano da esc().

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// Tempo relativo per la meta (valori in mono): ora / Xm / Xh / ieri / X gg fa.
export function tempoRelativo(iso, now) {
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < 60e3) return 'ora';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)}m`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)}h`;
  const ieri = new Date(now); ieri.setDate(ieri.getDate() - 1);
  if (t.toDateString() === ieri.toDateString()) return 'ieri';
  return `${Math.floor(diff / 86400e3)} gg fa`;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `node --test test/posta-card.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add js/modules/posta-card.js test/posta-card.test.js
git commit -m "feat(posta): esc + tempoRelativo - fondamenta del modulo card"
```

---

### Task 4: `posta-card.js` — `cardHTML`

**Files:**
- Modify: `js/modules/posta-card.js`
- Modify: `test/posta-card.test.js`

- [ ] **Step 1: Scrivi i test**

In `test/posta-card.test.js`, aggiorna l'import:

```js
import { esc, tempoRelativo, cardHTML } from '../js/modules/posta-card.js';
```

e aggiungi in fondo:

```js
// ---- cardHTML ----

const CTX = { autoreLabel: '🧁 lei', now: NOW };

const fantasiaNuova = { tipo: 'fantasia', emoji: '🔥', sezioneKey: 'desideri',
  kicker: 'una fantasia nuova', titolo: '', hand: 'stasera scegli tu',
  autoreId: 'lei', daLei: true, quandoISO: oreFa(2), nuovo: true, refId: 'd1' };

test('cardHTML fantasia nuova: classe nuova, pallino, accent ember, hand tra virgolette, meta', () => {
  const out = cardHTML(fantasiaNuova, CTX);
  assert.ok(out.includes('class="fc nuova"'));
  assert.ok(out.includes('<span class="dot">●</span>'));
  assert.ok(out.includes('--accent:var(--ember)'));
  assert.ok(out.includes('data-sezione="desideri"'));
  assert.ok(out.includes('una fantasia nuova'));
  assert.ok(out.includes('“stasera scegli tu”'));        // virgolette tipografiche
  assert.ok(out.includes('🧁 lei'));
  assert.ok(out.includes('2h'));
  assert.ok(!out.includes('class="ttl"'));               // titolo vuoto → nessuna riga
});

test('cardHTML non nuova: niente classe nuova né pallino', () => {
  const out = cardHTML({ ...fantasiaNuova, nuovo: false }, CTX);
  assert.ok(out.includes('class="fc"'));
  assert.ok(!out.includes('fc nuova'));   // il kicker contiene "nuova": si testa la classe
  assert.ok(!out.includes('class="dot"'));
});

test('cardHTML esperienza: kicker letterale e titolo', () => {
  const out = cardHTML({ tipo: 'esperienza', emoji: '📅', sezioneKey: 'calendario',
    kicker: 'una nuova esperienza', titolo: 'Weekend alle terme',
    autoreId: 'lei', daLei: true, quandoISO: oreFa(28), nuovo: true, refId: 'e1' }, CTX);
  assert.ok(out.includes('una nuova esperienza'));
  assert.ok(out.includes('Weekend alle terme'));
  assert.ok(out.includes('ieri'));
  assert.ok(out.includes('data-sezione="calendario"'));
});

test('cardHTML polaroid senza didascalia: solo kicker + meta, nessuna riga contenuto', () => {
  const out = cardHTML({ tipo: 'polaroid', emoji: '🖼️', sezioneKey: 'galleria',
    kicker: 'una polaroid', titolo: '', autoreId: 'lei', daLei: true,
    quandoISO: oreFa(5), nuovo: true, refId: 'f1' }, CTX);
  assert.ok(out.includes('una polaroid'));
  assert.ok(!out.includes('class="ttl"'));
  assert.ok(!out.includes('class="hand"'));
  assert.ok(out.includes('class="meta"'));
});

test('cardHTML buono: accent oro, pill scadenza e meta chi·quando', () => {
  const out = cardHTML({ tipo: 'buono', emoji: '🎟️', sezioneKey: 'buoni',
    kicker: 'un buono sta per scadere', titolo: 'Cena al buio',
    pill: '⏳ domani · riscuoti', autoreId: 'lei', daLei: true,
    quandoISO: giorniFa(3), nuovo: true, refId: 'b1' }, CTX);
  assert.ok(out.includes('--accent:var(--gold)'));
  assert.ok(out.includes('Cena al buio'));
  assert.ok(out.includes('⏳ domani · riscuoti'));
  assert.ok(out.includes('🧁 lei'));
  assert.ok(out.includes('3 gg fa'));
});

test('cardHTML giri: accent rosa, mai meta (non è di lei)', () => {
  const out = cardHTML({ tipo: 'giri', emoji: '🎲', sezioneKey: 'giochi',
    kicker: 'la brace di stasera', titolo: 'Hai 2 giri da spendere',
    pill: 'gira la ruota →', autoreId: null, daLei: false,
    quandoISO: null, nuovo: false, refId: null }, CTX);
  assert.ok(out.includes('--accent:var(--rose)'));
  assert.ok(out.includes('Hai 2 giri da spendere'));
  assert.ok(out.includes('gira la ruota →'));
  assert.ok(!out.includes('class="meta"'));
});

test('cardHTML luogo: titolo + descrizione in hand', () => {
  const out = cardHTML({ tipo: 'luogo', emoji: '🗺️', sezioneKey: 'mappa',
    kicker: 'ha segnato un posto', titolo: 'B&B sul lago', hand: 'weekend lungo',
    autoreId: 'lei', daLei: true, quandoISO: oreFa(4), nuovo: true, refId: 'l1' }, CTX);
  assert.ok(out.includes('B&amp;B sul lago'));            // titolo escapato
  assert.ok(out.includes('“weekend lungo”'));
});

test('cardHTML: XSS nel testo esce escapato', () => {
  const out = cardHTML({ ...fantasiaNuova, hand: '<script>alert(1)</script>' }, CTX);
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('cardHTML: tipo ignoto o evento nullo → stringa vuota', () => {
  assert.equal(cardHTML({ ...fantasiaNuova, tipo: 'boh' }, CTX), '');
  assert.equal(cardHTML(null, CTX), '');
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/posta-card.test.js`
Expected: FAIL — `cardHTML is not a function` (i 9 nuovi; i 7 di Task 3 restano verdi).

- [ ] **Step 3: Implementa `cardHTML`**

In `js/modules/posta-card.js`, aggiungi dopo `tempoRelativo`:

```js
// Accent per tipo (direzione congelata: ember=novità/azione, oro=buoni, rosa=giochi).
const ACCENT = {
  fantasia: 'var(--ember)', polaroid: 'var(--ember)', esperienza: 'var(--ember)',
  luogo: 'var(--ember)', buono: 'var(--gold)', giri: 'var(--rose)',
};

// Card "biglietto" (riga unica). Consuma l'Evento di feedEventi così com'è.
// ctx = { autoreLabel: '🧁 lei', now: Date }. Tipo ignoto → '' (il feed non si rompe).
export function cardHTML(evento, ctx) {
  if (!evento || !ACCENT[evento.tipo]) return '';
  const { autoreLabel = '', now = new Date() } = ctx || {};
  const righe = [`<div class="kick">${esc(evento.kicker)}</div>`];
  if (evento.titolo) righe.push(`<div class="ttl">${esc(evento.titolo)}</div>`);
  if (evento.hand) righe.push(`<div class="hand">“${esc(evento.hand)}”</div>`);
  if (evento.pill) righe.push(`<div class="pill">${esc(evento.pill)}</div>`);
  if (evento.daLei && evento.quandoISO) {
    righe.push(`<div class="meta"><span class="who">${esc(autoreLabel)}</span> · ${esc(tempoRelativo(evento.quandoISO, now))}</div>`);
  }
  const dot = evento.nuovo ? '<span class="dot">●</span>' : '';
  return `<article class="fc${evento.nuovo ? ' nuova' : ''}" style="--accent:${ACCENT[evento.tipo]}"` +
    ` data-tipo="${esc(evento.tipo)}" data-sezione="${esc(evento.sezioneKey)}">` +
    `<span class="lead">${esc(evento.emoji)}</span><div class="bx">${righe.join('')}</div>${dot}</article>`;
}
```

- [ ] **Step 4: Esegui la suite intera**

Run: `node --test`
Expected: tutti pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/modules/posta-card.js test/posta-card.test.js
git commit -m "feat(posta): cardHTML - i 6 template biglietto con escape centralizzato"
```

---

### Task 5: `posta-card.js` — `quietHTML`

**Files:**
- Modify: `js/modules/posta-card.js`
- Modify: `test/posta-card.test.js`

- [ ] **Step 1: Scrivi i test**

Aggiorna l'import in `test/posta-card.test.js`:

```js
import { esc, tempoRelativo, cardHTML, quietHTML } from '../js/modules/posta-card.js';
```

e aggiungi in fondo:

```js
// ---- quietHTML ----

test('quietHTML con gradi: titolo neutro, gradi arrotondati in <b>', () => {
  const out = quietHTML({ gradi: 71.6 });
  assert.ok(out.includes('Tutto tranquillo, per ora.'));
  assert.ok(out.includes('<b>72°</b>'));
  assert.ok(out.includes('il fondo non si spegne'));
  assert.ok(out.includes('class="emb"'));
});

test('quietHTML senza gradi: frase ridotta, nessun grado', () => {
  const out = quietHTML({});
  assert.ok(out.includes('Tutto tranquillo, per ora.'));
  assert.ok(!out.includes('°'));
  assert.ok(out.includes('Nessuna nuova traccia'));
});

test('quietHTML senza argomento → come senza gradi', () => {
  assert.ok(quietHTML().includes('Tutto tranquillo, per ora.'));
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/posta-card.test.js`
Expected: FAIL — `quietHTML is not a function`.

- [ ] **Step 3: Implementa `quietHTML`**

In `js/modules/posta-card.js`, aggiungi in fondo:

```js
// Blocco quiet "brace + cose vive": il chiamante renderizza sotto le card azionabili.
// Copy umano (Nunito), SOLO i gradi in mono via <b> (stile .posta .quiet p b).
export function quietHTML({ gradi } = {}) {
  const frase = Number.isFinite(gradi)
    ? `La brace tiene <b>${Math.round(gradi)}°</b>. Nessuna nuova traccia — ma il fondo non si spegne.`
    : 'Nessuna nuova traccia — ma il fondo non si spegne.';
  return '<div class="quiet"><div class="emb">🔥</div>' +
    '<h3>Tutto tranquillo, per ora.</h3>' +
    `<p>${frase}</p></div>`;
}
```

- [ ] **Step 4: Esegui la suite intera**

Run: `node --test`
Expected: tutti pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/modules/posta-card.js test/posta-card.test.js
git commit -m "feat(posta): quietHTML - blocco quieto brace+cose vive, copy de-terminalizzato"
```

---

### Task 6: CSS `.posta` in `home.css`

Stili additivi scoped `.posta`, token propri (non dipendono da `#homeRoot`): li riusano sia `mockups/valida-posta.html` sia il futuro port della home. Keyframe con prefisso `posta-` per non collidere con gli `hh-*` esistenti.

**Files:**
- Modify: `home.css` (append in fondo al file)

- [ ] **Step 1: Aggiungi il blocco CSS in fondo a `home.css`**

```css
/* ============================================================
   LA POSTA — card del feed + stato quieto (spec 2026-06-05)
   Scoped sotto .posta; token propri (non dipende da #homeRoot).
   Riusato da mockups/valida-posta.html e dal port della home.
   ============================================================ */
.posta{--card:#1f0c18;--burgundy:#300d1c;--ink:#f7e7e2;--ink-soft:#c79aa6;--ink-dim:#8a5d6a;
  --ember:#ff6f3c;--gold:#ffb454;--rose:#f2738f;--ivory:#f0e4d8;--line:rgba(255,140,110,.18);
  --display:'Fraunces',serif;--ui:'Nunito',sans-serif;--mono:'JetBrains Mono',monospace;--corsiva:'Caveat',cursive;
  font-family:var(--ui);color:var(--ink);display:flex;flex-direction:column;gap:8px;}
.posta .fc{position:relative;border-radius:13px;padding:11px 13px;background:linear-gradient(165deg,var(--burgundy),var(--card));border:1px solid var(--line);display:flex;align-items:center;gap:11px;}
.posta .fc.nuova::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:13px 0 0 13px;background:var(--accent,var(--ember));box-shadow:0 0 10px var(--accent,var(--ember));}
.posta .fc .dot{font-size:12px;color:var(--accent,var(--ember));flex:0 0 auto;}
.posta .lead{font-size:21px;flex:0 0 auto;}
.posta .bx{flex:1;min-width:0;}
.posta .kick{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent,var(--gold));}
.posta .ttl{font-family:var(--display);font-weight:600;font-size:15px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.posta .hand{font-family:var(--corsiva);font-weight:600;font-size:19px;color:var(--ivory);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.posta .meta{font-family:var(--mono);font-size:10px;color:var(--ink-dim);margin-top:2px;}
.posta .meta .who{color:var(--rose);}
.posta .pill{display:inline-flex;gap:4px;margin-top:4px;font-family:var(--mono);font-size:10px;font-weight:700;color:#120610;background:var(--accent,var(--gold));border-radius:999px;padding:2px 8px;}

/* stato quieto */
.posta .quiet{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:28px 24px 16px;}
.posta .quiet .emb{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:30px;background:radial-gradient(circle at 40% 35%,rgba(255,140,60,.3),rgba(48,13,28,.9));border:1px solid var(--line);box-shadow:0 0 30px rgba(255,111,60,.25);animation:posta-breathe 5s ease-in-out infinite;}
@keyframes posta-breathe{0%,100%{transform:scale(1);opacity:.85;}50%{transform:scale(1.06);opacity:1;}}
.posta .quiet h3{font-family:var(--display);font-weight:600;font-size:20px;margin:0;}
.posta .quiet p{font-family:var(--ui);font-size:13px;color:var(--ink-soft);line-height:1.65;max-width:240px;margin:0;}
.posta .quiet p b{font-family:var(--mono);color:var(--gold);font-weight:700;}
@media (prefers-reduced-motion:reduce){.posta .quiet .emb{animation:none;}}
```

Nota: nessun `calc()` dentro angoli di `conic-gradient` (vincolo WebView Android — qui non ce ne sono).

- [ ] **Step 2: Verifica che la suite resti verde (il CSS non la tocca, è un sanity check)**

Run: `node --test`
Expected: tutti pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add home.css
git commit -m "feat(posta): stili card biglietto + quiet scoped .posta in home.css"
```

---

### Task 7: `mockups/valida-posta.html` — pagina di validazione

Pagina sottile: login Supabase reale → fetch liste → `feedEventi` → `feedVisibile` → render con `posta-card.js`. Toggle per forzare la vista quieto. **Solo card + quiet** (niente dock/porta/calore-UI).

Nota sicurezza: supabase-js dal CDN è **pinnato a 2.107.0 con SRI** (`integrity` + `crossorigin`) — l'hash vale solo per l'URL pinnato, non per l'alias `@2`. `index.html` ha lo stesso gap (alias senza SRI): fuori scope qui, da sistemare quando lo si tocca.

**Files:**
- Create: `mockups/valida-posta.html`

- [ ] **Step 1: Crea la pagina**

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>brace · valida La Posta (card + quiet, dati veri)</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&family=Caveat:wght@600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../home.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.107.0"
        integrity="sha384-o+Hkm/usHFhCEWo1Ae1cLsOLiQQNrD2UfI424QDAaiZR7URnC8v35ey7s2sbGZHB"
        crossorigin="anonymous"></script>
<style>
  html,body{margin:0;min-height:100%;background:#120610;font-family:'Nunito',sans-serif;}
  .wrap{max-width:420px;margin:0 auto;padding:18px 14px 40px;}
  .gate{display:flex;flex-direction:column;gap:10px;padding-top:60px;}
  .gate input{background:#1f0c18;border:1px solid rgba(255,140,110,.18);border-radius:10px;padding:12px;color:#f7e7e2;font-family:inherit;font-size:15px;}
  .gate button,.bar button{background:#ff6f3c;border:0;border-radius:10px;padding:12px;color:#120610;font-weight:800;font-family:inherit;font-size:15px;cursor:pointer;}
  .gate .err{color:#f2738f;font-size:13px;min-height:1em;}
  .bar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:14px;color:#c79aa6;font-size:13px;}
  .bar button{padding:8px 12px;font-size:13px;}
  .hidden{display:none;}
</style>
</head>
<body>
<div class="wrap">
  <div id="gate" class="gate">
    <input id="email" type="email" placeholder="email" autocomplete="username">
    <input id="password" type="password" placeholder="password" autocomplete="current-password">
    <button id="entra">Entra</button>
    <div id="err" class="err"></div>
  </div>
  <div id="vista" class="hidden">
    <div class="bar"><span id="chi"></span><button id="toggle">◐ pieno / quieto</button></div>
    <div id="posta" class="posta"></div>
  </div>
</div>
<script type="module">
import { client } from '../js/supabase.js';
import { login, currentProfile } from '../js/auth.js';
import { getPartner, getHomeVistoAt, listDesideri, listFotoGalleria, listEsperienze, listLuoghi, listBuoni, listGiri } from '../js/store.js';
import { feedEventi, contaNuovi, feedVisibile, calcolaCalore, eventiCalore } from '../js/lib/logic.js';
import { cardHTML, quietHTML } from '../js/modules/posta-card.js';

const $ = (id) => document.getElementById(id);
let stato = null;       // { feed, gradi, autoreLabel }
let forzaQuieto = false;

async function carica() {
  const me = await currentProfile();
  if (!me) return null;
  const cid = me.couple_id;
  const [desideri, foto, esperienze, luoghi, buoni, giri, partner, vistoAt] = await Promise.all([
    listDesideri(client, cid), listFotoGalleria(client, cid),
    listEsperienze(client, cid), listLuoghi(client, cid),
    listBuoni(client, cid), listGiri(client, cid),
    getPartner(client, cid, me.id),
    getHomeVistoAt(client, me.id).catch(() => null),  // best-effort: mai falsi pallini
  ]);
  const feed = feedEventi({ desideri, foto, esperienze, luoghi, buoni, giri }, me, vistoAt);
  // stessi item del calore della home (home.js caricaItemsCalore, senza slot)
  const items = [
    ...esperienze.map(e => ({ tipo: 'esperienza', quando: e.data })),
    ...desideri.map(d => ({ tipo: 'desiderio', quando: d.creato })),
    ...buoni.map(b => ({ tipo: 'buono', quando: b.creato })),
    ...foto.map(f => ({ tipo: 'foto', quando: f.creato })),
    ...luoghi.map(l => ({ tipo: 'luogo', quando: l.data_evento || l.creato })),
    ...giri.filter(m => m.motivo === 'giro').map(m => ({ tipo: 'gioco', quando: m.creato })),
  ];
  const gradi = calcolaCalore(eventiCalore(items)).gradi;  // eventiCalore: {tipo,quando}→{quando,peso} (fix 2026-06-05: senza, gradi=NaN)
  const autoreLabel = partner ? `${partner.avatar || ''} ${partner.display_name || ''}`.trim() : 'partner';
  return { feed, gradi, autoreLabel, chi: `${me.avatar || ''} ${me.display_name || ''}`.trim() };
}

function render() {
  const ctx = { autoreLabel: stato.autoreLabel, now: new Date() };
  const quieto = forzaQuieto || contaNuovi(stato.feed) === 0;
  const cards = feedVisibile(stato.feed)
    .filter(e => !quieto || e.tipo === 'buono' || e.tipo === 'giri');
  $('posta').innerHTML =
    (quieto ? quietHTML({ gradi: stato.gradi }) : '') +
    cards.map(e => cardHTML(e, ctx)).join('');
}

async function avvia() {
  stato = await carica();
  if (!stato) return;                 // nessuna sessione → resta il gate
  $('gate').classList.add('hidden');
  $('vista').classList.remove('hidden');
  $('chi').textContent = stato.chi;
  render();
}

$('entra').onclick = async () => {
  $('err').textContent = '';
  try { await login($('email').value.trim(), $('password').value); await avvia(); }
  catch (e) { $('err').textContent = e.message; }
};
$('toggle').onclick = () => { forzaQuieto = !forzaQuieto; render(); };
avvia();
</script>
</body>
</html>
```

- [ ] **Step 2: Verifica locale (smoke a mano)**

Run (dalla root del repo): `python -m http.server 5500`
Apri `http://localhost:5500/mockups/valida-posta.html`, fai login con l'account primario.
Expected: gate sparisce; con DB vuoto compare il **quieto** ("Tutto tranquillo, per ora." + gradi); il toggle `◐` alterna pieno/quieto senza errori in console.

- [ ] **Step 3: Commit**

```bash
git add mockups/valida-posta.html
git commit -m "feat(posta): pagina di validazione card+quiet con dati Supabase veri"
```

---

### Task 8: `supabase/seed-posta.sql` + validazione su device

Eventi di prova ad autore **seconda2** (lei). **Prima di scrivere il file: chiedi all'utente i testi veri** (1 fantasia, 1 titolo esperienza, 1 luogo nome+descrizione, 1 titolo buono). Le email restano segnaposto: si sostituiscono solo nel SQL Editor, non si committano.

**Files:**
- Create: `supabase/seed-posta.sql`

- [ ] **Step 1: Chiedi all'utente i testi veri**

Servono: testo fantasia, titolo esperienza, nome+descrizione luogo, titolo buono. Inseriscili nel file al posto dei valori d'esempio qui sotto.

- [ ] **Step 2: Crea il file**

```sql
-- seed-posta.sql — eventi di prova per mockups/valida-posta.html (passo 4, spec 2026-06-05)
-- Eseguire nel SQL Editor Supabase DOPO aver sostituito le DUE email (non si committano).
-- Autore eventi: account "seconda2" (lei). Destinatario buono/giri: account primario.
-- La polaroid NON si semina qui: si carica dall'app (passa dallo Storage).

-- 🔥 fantasia (desideri, stato da_provare)
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into desideri (couple_id, autore_id, testo, stato)
select couple_id, id, 'TESTO_FANTASIA_QUI', 'da_provare' from lei;

-- 📅 esperienza
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into esperienze (couple_id, autore_id, titolo, data, voto)
select couple_id, id, 'TITOLO_ESPERIENZA_QUI', current_date, 0 from lei;

-- 🗺️ luogo (con descrizione → riga in Caveat sulla card)
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into luoghi (couple_id, autore_id, nome, lat, lng, data_evento, intimo, voto, descrizione)
select couple_id, id, 'NOME_LUOGO_QUI', 45.605, 10.640, current_date, false, 0, 'DESCRIZIONE_LUOGO_QUI' from lei;

-- 🎟️ buono regalo attivo che scade tra 2 giorni (pill + meta)
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
), io as (
  select p.id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_PRIMARIO_QUI'
)
insert into buoni (couple_id, da_id, a_id, emoji, titolo, tipo, stato, scadenza_iso)
select lei.couple_id, lei.id, io.id, '🎟️', 'TITOLO_BUONO_QUI', 'regalo', 'attivo',
       now() + interval '2 days'
from lei, io;

-- 🎲 due giri per l'account primario (card "la brace di stasera")
with lei as (
  select p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
), io as (
  select p.id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_PRIMARIO_QUI'
)
insert into giri_movimenti (couple_id, user_id, delta, motivo)
select lei.couple_id, io.id, 2, 'gioco' from lei, io;
```

- [ ] **Step 3: L'utente applica il seed e valida su device**

1. L'utente sostituisce le email nel SQL Editor ed esegue il seed.
2. Carica una foto dall'app con l'account seconda2 (per la card polaroid; una con didascalia o senza, a scelta).
3. Apre `mockups/valida-posta.html` (serve il server locale o il deploy), login con l'account primario.

Expected su device: feed pieno con le card seminate (fantasia col testo in Caveat, esperienza, luogo con descrizione in Caveat, buono con pill `⏳ …· riscuoti` e meta, polaroid, giri); toggle `◐` mostra il quieto con i gradi; nessun errore in console.

- [ ] **Step 4: Annota l'esito in `test/smoke.md`** (sezione nuova "Smoke La Posta — card + quiet", checklist di cosa è stato verificato, eventuali note).

- [ ] **Step 5: Commit**

```bash
git add supabase/seed-posta.sql test/smoke.md
git commit -m "feat(posta): seed eventi di prova + smoke card/quiet su device"
```

---

## Verifica finale

- `node --test` → tutti pass, 0 fail (≈290 test: 276 di partenza + ~15 nuovi, 1 sostituito).
- `git log --oneline` → 7 commit nuovi (Task 1–8, Task 6 e 7 separati).
- Su device: card e quieto renderizzati con dati veri, direzione visiva rispettata
  (ember solo novità/azione, mono solo valori/kicker, Caveat solo voce di lei).
