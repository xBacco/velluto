# Porta — guscio d'ingresso (lucchetto + biometria) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il gate `requireUnlock` piatto con il guscio d'ingresso "porta" (anta Sartoriale + spioncino + tastierino notturno + gesto), aggiungere l'attivazione biometrica al primo ingresso (bottom sheet) e la frequenza di sblocco configurabile — riusando il motore `js/lib/lock.js`.

**Architecture:** Il motore del lucchetto resta `js/lib/lock.js` (PIN SHA-256 locale + WebAuthn). Si estende con stato puro/testabile (`bioPrompted`, `freq`, `graceMin`, `lastUnlockAt`, `touchUnlock`, `shouldLock`). La logica del tastierino diventa un riduttore puro (`js/lib/porta-reducer.js`). La UI della porta è CSS scoped sotto `#lockgate` (nuovo `porta.css`, portato dai mockup) + markup statico in `index.html` + `requireUnlock()` riscritta in `js/app.js`. Bottom sheet biometrico e trigger di re-lock al rientro vivono in `js/app.js`. La frequenza si sceglie da `js/modules/impostazioni.js`. Niente tocca Supabase: il lucchetto è per-dispositivo (localStorage).

**Tech Stack:** Vanilla ES modules, `node --test` (test runner nativo), localStorage, WebAuthn platform authenticator, CSS con token `--ds-*` (`tokens.css`).

**Fonte di verità della spec:** `docs/superpowers/specs/2026-06-11-home-posta-porta-design.md`. Verità visiva: `mockups/lib/porta.css` + `mockups/lib/porta.js` + `mockups/porta-rifinita.html` + `mockups/porta-estetica-lab.html` (anta **Sartoriale**/est-1 + spioncino piccolo).

**Decisione di struttura file:** il repo tiene i CSS in radice (`home.css`, `styles.css`, `tokens.css`) — niente cartella `css/`. Quindi il nuovo foglio è `porta.css` in radice (non `css/porta.css` come ipotizzato nella spec), linkato dopo `home.css`. Le classi-porta (`.lock`, `.panel`, `.pip`, `.plate`, `.jamb`, `.hint`) **collidono** con CSS d'app esistenti: per questo `porta.css` è interamente **scoped sotto `#lockgate`**.

**Cambio di comportamento intenzionale (dal mockup approvato):** il tastierino nuovo conferma con **✓** esplicito (oggi `requireUnlock` verifica in automatico a 4–6 cifre). È la scelta congelata del brainstorming, non un bug.

---

### Task 1: `lock.js` — stato frequenza + bioPrompted + touchUnlock

Aggiunge al record `lussuria.lock` i campi `bioPrompted`, `freq`, `graceMin`, `lastUnlockAt` con get/set puri e default. Nessuna UI.

**Files:**
- Modify: `js/lib/lock.js` (append in fondo, dopo `unlockBio`)
- Test: `test/lock.test.js` (estende l'import di riga 14 e aggiunge test)

- [ ] **Step 1: Scrivi i test che falliscono**

In `test/lock.test.js`, sostituisci la riga di import (riga 14):

```js
const { isPinValid, setPin, verifyPin, isLockEnabled, disableLock, getPudica, setPudica,
        isBioPrompted, setBioPrompted, getFreq, setFreq, getGraceMin, getLastUnlockAt,
        touchUnlock } = await import('../js/lib/lock.js');
```

Aggiungi in fondo al file:

```js
test('bioPrompted: default false, persiste', () => {
  assert.equal(isBioPrompted(), false);
  setBioPrompted(true);
  assert.equal(isBioPrompted(), true);
  setBioPrompted(false);
  assert.equal(isBioPrompted(), false);
});

test('freq: default "apertura", persiste i 3 valori', () => {
  assert.equal(getFreq(), 'apertura');
  setFreq('grazia'); assert.equal(getFreq(), 'grazia');
  setFreq('avvio');  assert.equal(getFreq(), 'avvio');
  setFreq('apertura'); assert.equal(getFreq(), 'apertura');
});

test('graceMin: default 5', () => {
  assert.equal(getGraceMin(), 5);
});

test('lastUnlockAt: default 0, touchUnlock lo scrive', () => {
  assert.equal(getLastUnlockAt(), 0);
  touchUnlock(1700000000000);
  assert.equal(getLastUnlockAt(), 1700000000000);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/lock.test.js`
Expected: FAIL — `isBioPrompted is not a function` (e simili) / `SyntaxError` sull'import dei nomi mancanti.

- [ ] **Step 3: Implementa lo stato in `lock.js`**

Aggiungi in fondo a `js/lib/lock.js` (dopo la funzione `unlockBio`, riga 86):

```js
// ---- bioPrompted: il bottom sheet biometrico è già stato proposto? ----
export function isBioPrompted() { return !!loadLock().bioPrompted; }
export function setBioPrompted(v) { const st = loadLock(); st.bioPrompted = !!v; saveLock(st); }

// ---- frequenza di sblocco ----
export function getFreq() { const f = loadLock().freq; return f === 'grazia' || f === 'avvio' ? f : 'apertura'; }
export function setFreq(freq) { const st = loadLock(); st.freq = freq; saveLock(st); }
export function getGraceMin() { const g = loadLock().graceMin; return Number.isFinite(g) ? g : 5; }
export function setGraceMin(n) { const st = loadLock(); st.graceMin = n; saveLock(st); }
export function getLastUnlockAt() { return loadLock().lastUnlockAt || 0; }
export function touchUnlock(now) { const st = loadLock(); st.lastUnlockAt = now; saveLock(st); }
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `node --test test/lock.test.js`
Expected: PASS (tutti, vecchi + 4 nuovi).

- [ ] **Step 5: Commit**

```bash
git add js/lib/lock.js test/lock.test.js
git commit -m "feat(lock): stato frequenza sblocco + bioPrompted + touchUnlock"
```

---

### Task 2: `lock.js` — `shouldLock()` (funzione pura)

Decide se mostrare il gate, in base a frequenza scelta, ultimo sblocco e cold-start.

**Files:**
- Modify: `js/lib/lock.js` (append)
- Test: `test/lock.test.js` (estende import + test)

- [ ] **Step 1: Scrivi i test che falliscono**

Estendi l'import in `test/lock.test.js` aggiungendo `shouldLock`:

```js
const { isPinValid, setPin, verifyPin, isLockEnabled, disableLock, getPudica, setPudica,
        isBioPrompted, setBioPrompted, getFreq, setFreq, getGraceMin, getLastUnlockAt,
        touchUnlock, shouldLock } = await import('../js/lib/lock.js');
```

Aggiungi in fondo:

```js
test('shouldLock: lock disattivo → sempre false', () => {
  assert.equal(shouldLock({ enabled: false, freq: 'apertura', coldStart: true, now: 1000 }), false);
  assert.equal(shouldLock({ enabled: false, freq: 'avvio', coldStart: true, now: 1000 }), false);
});

test('shouldLock: "apertura" → sempre true se attivo', () => {
  assert.equal(shouldLock({ enabled: true, freq: 'apertura', coldStart: false, now: 1000 }), true);
  assert.equal(shouldLock({ enabled: true, freq: 'apertura', coldStart: true, now: 1000 }), true);
});

test('shouldLock: default (freq mancante) si comporta come "apertura"', () => {
  assert.equal(shouldLock({ enabled: true, coldStart: false, now: 1000 }), true);
});

test('shouldLock: "avvio" → true solo a cold start', () => {
  assert.equal(shouldLock({ enabled: true, freq: 'avvio', coldStart: true, now: 1000 }), true);
  assert.equal(shouldLock({ enabled: true, freq: 'avvio', coldStart: false, now: 1000 }), false);
});

test('shouldLock: "grazia" → entro N min false, oltre true, senza lastUnlock true', () => {
  const T = 10 * 60 * 1000; // "adesso" = 10 min in ms
  const min = 60 * 1000;
  // sbloccato 4 min fa (entro la grazia di 5) → non riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: T - 4 * min, now: T }), false);
  // sbloccato 6 min fa (oltre la grazia) → riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: T - 6 * min, now: T }), true);
  // mai sbloccato (lastUnlockAt falsy) → riblocca
  assert.equal(shouldLock({ enabled: true, freq: 'grazia', graceMin: 5, lastUnlockAt: 0, now: T }), true);
});
```

> Convenzione del ramo "grazia": `lastUnlockAt` falsy (0/assente) significa "mai sbloccato" → riblocca; per simulare uno sblocco recente si passa un timestamp vicino a `now`.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/lock.test.js`
Expected: FAIL — `shouldLock is not a function`.

- [ ] **Step 3: Implementa `shouldLock` in `lock.js`**

Aggiungi in fondo a `js/lib/lock.js`:

```js
// ---- shouldLock: il gate va mostrato adesso? (pura, testabile) ----
// opts: { enabled, freq, lastUnlockAt, graceMin, coldStart, now }
export function shouldLock({ enabled, freq, lastUnlockAt = 0, graceMin = 5, coldStart = false, now = 0 } = {}) {
  if (!enabled) return false;
  if (freq === 'avvio') return !!coldStart;
  if (freq === 'grazia') {
    if (!lastUnlockAt) return true;
    return (now - lastUnlockAt) > graceMin * 60 * 1000;
  }
  return true; // 'apertura' e default
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `node --test test/lock.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/lock.js test/lock.test.js
git commit -m "feat(lock): shouldLock() — politica di blocco pura e testabile"
```

---

### Task 3: `porta-reducer.js` — riduttore puro del tastierino

Estrae la logica del codice (aggiunta cifra, cap a 6, cancella, ✺↔⌫, "pronto" a 4+) come funzione pura, così è testabile fuori dal DOM.

**Files:**
- Create: `js/lib/porta-reducer.js`
- Test: `test/porta-reducer.test.js`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `test/porta-reducer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padReduce, padView, PIN_MIN, PIN_MAX } from '../js/lib/porta-reducer.js';

test('padReduce digit: accoda, ignora non-cifre, cap a PIN_MAX', () => {
  assert.equal(padReduce('', { type: 'digit', n: '1' }), '1');
  assert.equal(padReduce('12', { type: 'digit', n: '3' }), '123');
  assert.equal(padReduce('12', { type: 'digit', n: 'a' }), '12');   // non-cifra ignorata
  assert.equal(padReduce('123456', { type: 'digit', n: '7' }), '123456'); // cap a 6
});

test('padReduce del: toglie l\'ultima, su vuoto resta vuoto', () => {
  assert.equal(padReduce('123', { type: 'del' }), '12');
  assert.equal(padReduce('', { type: 'del' }), '');
});

test('padReduce clear: azzera', () => {
  assert.equal(padReduce('1234', { type: 'clear' }), '');
});

test('padReduce: azione sconosciuta o entry non-stringa → entry pulita', () => {
  assert.equal(padReduce('12', { type: 'boh' }), '12');
  assert.equal(padReduce(undefined, { type: 'digit', n: '5' }), '5');
});

test('padView: mode bio a vuoto, del con cifre', () => {
  assert.equal(padView('').mode, 'bio');
  assert.equal(padView('1').mode, 'del');
});

test('padView: ready a >= PIN_MIN, full a PIN_MAX, len corretta', () => {
  assert.equal(padView('123').ready, false);
  assert.equal(padView('1234').ready, true);
  assert.equal(padView('123456').full, true);
  assert.equal(padView('12345').full, false);
  assert.equal(padView('12').len, 2);
  assert.equal(PIN_MIN, 4);
  assert.equal(PIN_MAX, 6);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `node --test test/porta-reducer.test.js`
Expected: FAIL — `Cannot find module '../js/lib/porta-reducer.js'`.

- [ ] **Step 3: Implementa il riduttore**

Crea `js/lib/porta-reducer.js`:

```js
// Riduttore puro del tastierino della porta. Niente DOM, niente storage.
// entry = stringa di cifre (0..PIN_MAX). Verifica reale del PIN: js/lib/lock.js.
export const PIN_MIN = 4;
export const PIN_MAX = 6;

const isDigit = c => typeof c === 'string' && c.length === 1 && c >= '0' && c <= '9';

// padReduce(entry, action) -> nuova entry
//   { type: 'digit', n }  aggiunge una cifra (se valida e sotto il cap)
//   { type: 'del' }       toglie l'ultima cifra
//   { type: 'clear' }     azzera
export function padReduce(entry, action) {
  const e = typeof entry === 'string' ? entry : '';
  switch (action && action.type) {
    case 'digit': return (isDigit(action.n) && e.length < PIN_MAX) ? e + action.n : e;
    case 'del':   return e.slice(0, -1);
    case 'clear': return '';
    default:      return e;
  }
}

// padView(entry) -> stato derivato per la UI
//   len: lunghezza · ready: ✓ confermabile (>=PIN_MIN) · full: cap raggiunto
//   mode: 'bio' (tasto ✺ a vuoto) | 'del' (tasto ⌫ con cifre)
export function padView(entry) {
  const e = typeof entry === 'string' ? entry : '';
  return {
    len: e.length,
    ready: e.length >= PIN_MIN,
    full: e.length >= PIN_MAX,
    mode: e.length > 0 ? 'del' : 'bio',
  };
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `node --test test/porta-reducer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/porta-reducer.js test/porta-reducer.test.js
git commit -m "feat(porta): riduttore puro del tastierino (cifre, cap 6, bio/del, ready)"
```

---

### Task 4: `porta.css` — stili della porta scoped sotto `#lockgate`

Nuovo foglio in radice, portato da `mockups/lib/porta.css` (sole parti porta) + estetica Sartoriale (est-1) + spioncino piccolo + bottom sheet biometrico. Tutto scoped sotto `#lockgate` per non collidere con `.lock/.panel/.pip/.plate/.jamb/.hint` dell'app. Token `--ds-*`. Degrado reduce-motion.

**Files:**
- Create: `porta.css`
- Modify: `index.html` (aggiungi il `<link>` dopo `home.css`, riga 23)

- [ ] **Step 1: Crea `porta.css`**

Crea `porta.css` con questo contenuto esatto:

```css
/* porta.css — guscio d'ingresso (lucchetto). UI della porta per #lockgate.
   Portato da mockups/lib/porta.css (sole parti porta) + estetica Sartoriale (est-1)
   + spioncino piccolo, tutto scoped sotto #lockgate. Token: --ds-* (tokens.css) + --brass-*.
   Vincolo WebView noto: niente calc() negli angoli dei conic-gradient (qui non se ne usano). */

#lockgate{
  --brass-hi:#f3d896; --brass:#cda64f; --brass-mid:#9c7c33; --brass-lo:#5d4318;
  --brass-face:linear-gradient(150deg,var(--brass-hi) 0%,var(--brass) 28%,var(--brass-mid) 60%,var(--brass-lo) 100%);
  --brass-radial:radial-gradient(circle at 38% 30%,var(--brass-hi),var(--brass) 36%,var(--brass-mid) 68%,var(--brass-lo) 100%);
  --wood:linear-gradient(98deg,#5c1b32,#451228 46%,#350f1f);
  position:fixed;inset:0;z-index:60;overflow:hidden;
  display:grid;place-items:center;perspective:1200px;perspective-origin:50% 45%;
  background:radial-gradient(120% 72% at 72% 48%,#2a0c18,#160409 70%,#0c0207);
}

#lockgate .scene{position:relative;width:166px;height:362px;transform-origin:76% 47%;cursor:zoom-in;
  will-change:transform,filter;transition:transform 1.55s cubic-bezier(.25,.5,.15,1),filter 1.55s cubic-bezier(.25,.5,.15,1);}
#lockgate .scene::before{content:"";position:absolute;left:50%;top:50%;width:160%;height:124%;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(255,140,60,.20),rgba(156,33,80,.07) 55%,transparent 78%);filter:blur(9px);animation:peep-halo 4.4s ease-in-out infinite;}
@keyframes peep-halo{0%,100%{opacity:.42}50%{opacity:.82}}
#lockgate.zoom .scene{transform:translateX(-34px) scale(2.45);filter:blur(2.4px) brightness(.55);cursor:default;}

/* telaio + battuta + soglia */
#lockgate .jamb{position:absolute;inset:0;border-radius:11px 11px 4px 4px;padding:8px;background:linear-gradient(180deg,#3a1226,#2a0c18 60%,#1a0610);
  border:1px solid var(--ds-line);box-shadow:0 28px 56px rgba(0,0,0,.6),inset 0 0 0 5px rgba(16,5,14,.62),inset 0 0 40px rgba(0,0,0,.55);}
#lockgate .strike{position:absolute;right:2px;top:48%;transform:translateY(-50%);width:6px;height:40px;border-radius:2px;background:var(--brass-face);box-shadow:inset 0 0 0 1px rgba(46,32,8,.4),0 1px 3px rgba(0,0,0,.5);z-index:1;}
#lockgate .strike::after{content:"";position:absolute;left:1px;top:50%;transform:translateY(-50%);width:4px;height:14px;border-radius:2px;background:#180e05;}
#lockgate .threshold{position:absolute;left:8px;right:8px;bottom:8px;height:14px;border-radius:0 0 3px 3px;background:linear-gradient(0deg,rgba(255,150,70,.5),rgba(255,120,60,.10) 60%,transparent);filter:blur(2px);opacity:.5;transition:opacity .4s,height .9s;}

/* anta — Sartoriale (est-1): saturazione calda */
#lockgate .leaf{position:relative;width:100%;height:100%;border-radius:6px 6px 3px 3px;transform-origin:left center;transform-style:preserve-3d;
  background:repeating-linear-gradient(91deg,rgba(0,0,0,.08) 0 2px,transparent 2px 9px),linear-gradient(180deg,rgba(255,180,84,.10),transparent 22%),var(--wood);
  border:1px solid rgba(255,140,110,.30);box-shadow:inset 0 0 0 1px rgba(255,180,84,.08),inset 0 14px 30px rgba(0,0,0,.42),inset 0 -8px 18px rgba(0,0,0,.4);
  filter:saturate(1.06) brightness(1.02);}
#lockgate .panel{position:absolute;left:13px;right:24px;border-radius:4px;background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(255,180,84,.04));
  box-shadow:inset 0 2px 7px rgba(0,0,0,.55),inset 0 -1px 0 rgba(255,180,84,.08),inset 0 0 0 1px rgba(0,0,0,.25);}
#lockgate .panel.up{top:13px;height:152px;} #lockgate .panel.lo{bottom:13px;height:132px;}
#lockgate .hinge{position:absolute;left:-2px;width:8px;height:22px;border-radius:2px;background:var(--brass-face);box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.35);z-index:3;}
#lockgate .hinge.t{top:34px;} #lockgate .hinge.m{top:50%;transform:translateY(-50%);} #lockgate .hinge.b{bottom:34px;}

/* spioncino A, piccolo (in scala con l'anta) */
#lockgate .peep{position:absolute;left:50%;top:23%;transform:translateX(-50%);width:15px;height:15px;border-radius:50%;z-index:2;animation:peepwarm 3.6s ease-in-out infinite;
  background:radial-gradient(circle at 50% 45%,rgba(255,224,172,.98) 0 12%,rgba(255,150,80,.72) 28%,rgba(120,45,22,.6) 54%,#160a06 82%),var(--brass-radial);
  box-shadow:0 1px 2px rgba(0,0,0,.55),inset 0 0 0 1px rgba(40,28,8,.85),inset 0 0 0 2px rgba(255,222,150,.22),inset 0 1px 3px rgba(0,0,0,.6),0 0 8px var(--ds-ember-glow);}
#lockgate .peep::before{content:"";position:absolute;inset:2px;border-radius:50%;box-shadow:inset 0 0 3px 1px rgba(0,0,0,.6);}
#lockgate .peep::after{content:"";position:absolute;left:26%;top:18%;width:30%;height:24%;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.75),transparent 70%);}
@keyframes peepwarm{0%,100%{filter:brightness(.92)}50%{filter:brightness(1.14)}}

/* zona serratura */
#lockgate .lockzone{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:4;}
#lockgate .lever{position:relative;width:24px;height:7px;border-radius:4px;background:var(--brass-face);box-shadow:0 2px 4px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.4);transform-origin:right center;transition:transform .35s;}
#lockgate .lever::after{content:"";position:absolute;right:-2px;top:50%;transform:translate(0,-50%);width:8px;height:11px;border-radius:3px;background:var(--brass-radial);box-shadow:inset 0 1px 0 rgba(255,255,255,.4);}
#lockgate .bolt{position:absolute;right:-6px;top:46%;transform:translateY(-50%);width:11px;height:7px;border-radius:1px;background:var(--brass-face);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.5);z-index:2;transition:transform .4s cubic-bezier(.5,0,.3,1);}
#lockgate .leaf.unlocked .bolt{transform:translate(-10px,-50%);}
#lockgate .leaf.unlocked .lever{transform:rotate(22deg);}

/* mini smart-lock (vista da lontano) */
#lockgate .lockbadge{width:27px;border-radius:5px;padding:5px 3px;background:linear-gradient(160deg,#241019,#0c0509);box-shadow:inset 0 0 0 1px rgba(255,180,84,.18),0 2px 6px rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;gap:4px;transition:opacity .4s,transform .4s;}
#lockgate .lb-led{width:5px;height:5px;border-radius:50%;background:var(--ds-ember);box-shadow:0 0 6px var(--ds-ember-glow);animation:breathe 2.6s ease-in-out infinite;}
#lockgate .lb-keys{width:17px;height:15px;border-radius:2px;opacity:.55;background:repeating-linear-gradient(0deg,rgba(255,180,84,.30) 0 1px,transparent 1px 5px),repeating-linear-gradient(90deg,rgba(255,180,84,.30) 0 1px,transparent 1px 5px);}
#lockgate.zoom .lockbadge{opacity:0;}
@keyframes breathe{0%,100%{opacity:.4;transform:scale(.85)}50%{opacity:1;transform:scale(1.1)}}

/* close-up: la placca */
#lockgate .closeup{position:absolute;inset:0;display:grid;place-items:center;z-index:6;opacity:0;pointer-events:none;
  will-change:transform,opacity;transform:translate(40px,2px) scale(.55);transition:opacity .55s ease .15s,transform 1.55s cubic-bezier(.25,.5,.15,1);}
#lockgate.zoom .closeup{opacity:1;pointer-events:auto;transform:translate(0,0) scale(1);}
#lockgate.solved .closeup{opacity:0;transform:scale(1.05);transition:opacity .42s,transform .42s;}
#lockgate .recess{position:relative;border-radius:20px;box-shadow:0 2px 0 rgba(255,180,84,.10),0 18px 34px rgba(0,0,0,.6),inset 0 0 0 1px rgba(0,0,0,.4);}
#lockgate .plate{position:relative;border-radius:18px;padding:14px 13px 15px;display:flex;flex-direction:column;align-items:center;gap:9px;-webkit-tap-highlight-color:transparent;}
#lockgate .vit{position:absolute;width:6px;height:6px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffe9b0,#7a5a22 75%,#3a2a0c);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.4),0 1px 1px rgba(0,0,0,.5);}
#lockgate .vit::after{content:"";position:absolute;left:1px;top:2.4px;width:4px;height:1px;background:rgba(40,28,8,.8);}
#lockgate .vit.tl{left:7px;top:7px;} #lockgate .vit.tr{right:7px;top:7px;} #lockgate .vit.bl{left:7px;bottom:7px;} #lockgate .vit.br{right:7px;bottom:7px;}
#lockgate .head{display:flex;flex-direction:column;align-items:center;gap:5px;}
#lockgate .pips{display:flex;gap:6px;}
#lockgate .pip{width:7px;height:7px;border-radius:50%;transition:all .18s;}
#lockgate .keys{display:grid;grid-template-columns:repeat(3,42px);gap:7px;}
#lockgate .key{height:42px;border-radius:50%;display:grid;place-items:center;cursor:pointer;position:relative;font-family:var(--ds-font-mono);font-weight:500;font-size:18px;user-select:none;transition:transform .08s,box-shadow .12s,color .12s,background .12s;}
#lockgate .key:active{transform:scale(.93);}
#lockgate .key.fn{font-size:15px;}
#lockgate .key.dual .g-del{display:none;}
#lockgate .plate.has-entry .key.dual .g-bio{display:none;}
#lockgate .plate.has-entry .key.dual .g-del{display:block;font-size:17px;}

/* placca notturna (stealth) */
#lockgate .plate.stealth{background:linear-gradient(100deg,#4a142a,#3a0f22 50%,#2c0c1a);box-shadow:inset 0 1px 0 rgba(255,180,84,.06),inset 0 0 0 1px rgba(0,0,0,.4),0 8px 22px rgba(0,0,0,.5);}
#lockgate .plate.stealth .seed{width:7px;height:7px;border-radius:50%;background:var(--ds-ember);box-shadow:0 0 10px var(--ds-ember-glow);animation:breathe 2.6s ease-in-out infinite;}
#lockgate .plate.stealth .pip{background:rgba(255,180,84,.10);} #lockgate .plate.stealth .pip.on{background:var(--ds-ember);box-shadow:0 0 8px var(--ds-ember-glow);}
#lockgate .plate.stealth .key{background:rgba(0,0,0,.16);color:rgba(247,231,226,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04);font-weight:400;transition:all .25s;}
#lockgate .plate.stealth.awake .key{color:rgba(247,231,226,.5);}
#lockgate .plate.stealth .key.lit{color:#fff;text-shadow:0 0 16px var(--ds-ember);background:radial-gradient(circle,rgba(255,111,60,.30),rgba(0,0,0,.16) 70%);box-shadow:inset 0 0 0 1px rgba(255,111,60,.5),0 0 20px var(--ds-ember-glow);}
#lockgate .plate.stealth.ok .key{color:var(--ds-green);} #lockgate .plate.stealth.ok .pip.on{background:var(--ds-green);box-shadow:0 0 8px var(--ds-green);}
#lockgate .plate.stealth.ready .key.fn[data-fn="ok"]{color:var(--ds-ember);text-shadow:0 0 12px var(--ds-ember-glow);animation:okpulse 1.15s ease-in-out infinite;}
@keyframes okpulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(255,111,60,.30)}50%{box-shadow:inset 0 0 0 1px rgba(255,111,60,.75),0 0 13px var(--ds-ember-glow)}}
#lockgate .plate.shake{animation:shk .42s;} @keyframes shk{0%,100%{transform:translateX(0)}18%,58%{transform:translateX(-6px)}38%,78%{transform:translateX(6px)}}
#lockgate .plate.no .pip.on{background:var(--ds-red)!important;box-shadow:0 0 8px var(--ds-red)!important;}

/* pannello UI in basso */
#lockgate .panelui{position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 14px 18px;background:linear-gradient(0deg,rgba(12,4,8,.93),rgba(12,4,8,.55) 60%,transparent);}
#lockgate .seal{font-family:var(--ds-font-display);font-weight:600;font-size:17px;color:var(--ds-ink);} #lockgate .seal .d{color:var(--ds-ember);text-shadow:0 0 12px var(--ds-ember-glow);}
#lockgate .hint{font-size:12px;color:var(--ds-ink-soft);text-align:center;min-height:15px;line-height:1.4;}
#lockgate .hint .casa{font-family:var(--ds-font-display);font-weight:600;font-size:15px;color:var(--ds-ember);}

/* apertura a battente + dolly verso la home */
#lockgate.opening .leaf{transform:rotateY(-92deg);transition:transform 1s cubic-bezier(.6,0,.22,1);}
#lockgate.opening .threshold{opacity:1;height:54px;}
#lockgate.dolly{animation:dolly 1.05s cubic-bezier(.55,0,.3,1) forwards;}
@keyframes dolly{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(2.6) translateZ(420px)}}

/* reduce-motion: degrada zoom/battente/dolly e spegne i loop decorativi */
@media (prefers-reduced-motion: reduce){
  #lockgate .scene,#lockgate .closeup{transition-duration:.2s;}
  #lockgate.opening .leaf{transition-duration:.2s;}
  #lockgate.dolly{animation-duration:.2s;}
  #lockgate .peep,#lockgate .lb-led,#lockgate .plate.stealth .seed,#lockgate .scene::before{animation:none;}
}

/* ===== bottom sheet biometria (primo ingresso) ===== */
#bioSheetScrim{position:fixed;inset:0;z-index:70;background:rgba(8,3,6,.6);opacity:0;pointer-events:none;transition:opacity .3s;}
#bioSheetScrim.show{opacity:1;pointer-events:auto;}
#bioSheet{position:fixed;left:0;right:0;bottom:0;z-index:71;transform:translateY(100%);transition:transform .34s cubic-bezier(.17,.67,.18,1);
  background:linear-gradient(180deg,var(--ds-surface),var(--ds-bg-2));border-top:1px solid var(--ds-line);border-radius:18px 18px 0 0;
  padding:20px 18px 24px;padding-bottom:calc(24px + env(safe-area-inset-bottom));}
#bioSheet.show{transform:translateY(0);}
#bioSheet .bs-ttl{font-family:var(--ds-font-display);font-weight:600;font-size:19px;color:var(--ds-ink);margin:0 0 6px;}
#bioSheet .bs-sub{font-family:var(--ds-font-ui);font-size:13.5px;color:var(--ds-ink-soft);line-height:1.5;margin:0 0 4px;}
#bioSheet .bs-priv{font-family:var(--ds-font-ui);font-size:12px;color:var(--ds-ink-soft);margin:8px 0 16px;}
#bioSheet .bs-row{display:flex;gap:10px;}
#bioSheet .bs-go{flex:1;font-family:var(--ds-font-ui);font-weight:800;font-size:14px;color:#1a0b06;background:var(--ds-ember);border:none;border-radius:12px;padding:13px;cursor:pointer;}
#bioSheet .bs-go:disabled{opacity:.7;}
#bioSheet .bs-no{font-family:var(--ds-font-ui);font-weight:700;font-size:14px;color:var(--ds-ink-soft);background:transparent;border:1px solid var(--ds-line);border-radius:12px;padding:13px 18px;cursor:pointer;}
```

> Nota su `calc()`: il vincolo WebView del progetto vieta `calc()` **solo negli angoli dei conic-gradient**; qui non ci sono conic-gradient. Il `calc()` nel padding del bottom sheet (safe-area) è lecito.

- [ ] **Step 2: Linka `porta.css` in `index.html`**

In `index.html`, dopo la riga 23 (`<link rel="stylesheet" href="home.css">`), aggiungi:

```html
<link rel="stylesheet" href="porta.css">
```

- [ ] **Step 3: Verifica che la suite resti verde (CSS non rompe i test)**

Run: `node --test`
Expected: PASS (tutti i test esistenti + i nuovi dei Task 1–3). Nessuna regressione.

- [ ] **Step 4: Commit**

```bash
git add porta.css index.html
git commit -m "feat(porta): porta.css — anta Sartoriale + tastierino notturno (scoped #lockgate)"
```

---

### Task 5: Markup `#lockgate` + `requireUnlock()` riscritta (lo switchover)

Sostituisce il markup piatto del gate con la struttura porta E riscrive `requireUnlock()` per pilotarla (riduttore + `verifyPin` + `unlockBio` + `touchUnlock`). Markup e JS cambiano **insieme**: il commit è un'unità funzionante.

**Files:**
- Modify: `index.html:61-69` (markup `#lockgate`)
- Modify: `js/app.js:13` (import), `js/app.js:173-204` (`requireUnlock`)

- [ ] **Step 1: Sostituisci il markup `#lockgate`**

In `index.html`, sostituisci le righe 61–69 (dal `<div id="lockgate" ...>` al `</div>` di chiusura del gate) con:

```html
  <!-- GATE LOCK — guscio d'ingresso (porta Sartoriale + tastierino notturno) -->
  <div id="lockgate" style="display:none">
    <div class="scene" id="lockScene">
      <div class="jamb">
        <div class="strike"></div><div class="threshold"></div>
        <div class="leaf" id="lockLeaf">
          <span class="hinge t"></span><span class="hinge m"></span><span class="hinge b"></span>
          <div class="panel up"></div><div class="panel lo"></div>
          <div class="peep"></div>
          <div class="lockzone">
            <div class="lockbadge"><span class="lb-led"></span><span class="lb-keys"></span></div>
            <div class="lever"></div>
          </div>
          <div class="bolt"></div>
        </div>
      </div>
    </div>
    <div class="closeup">
      <div class="recess">
        <div class="plate stealth" id="lockPlate">
          <span class="vit tl"></span><span class="vit tr"></span><span class="vit bl"></span><span class="vit br"></span>
          <div class="head"><div class="seed"></div><div class="pips" id="lockPips"></div></div>
          <div class="keys" id="lockKeys"></div>
        </div>
      </div>
    </div>
    <div class="panelui">
      <div class="seal">brace<span class="d">.</span></div>
      <div class="hint" id="lockHint">Tocca la porta per avvicinarti</div>
    </div>
  </div>
```

> La classe `lockgate` viene rimossa di proposito: le vecchie regole `.lockgate`/`.lock-title`/`.lock-sub` di `styles.css` non si applicano più (e `#lockgate` di `porta.css`, selettore id, vince comunque per specificità). Gli id `pinDots`/`pinPad`/`pinBio`/`lockErr` spariscono: nessun altro li referenzia dopo questo task.

- [ ] **Step 2: Aggiorna gli import in `js/app.js`**

Sostituisci la riga 13 di `js/app.js`:

```js
import { isLockEnabled, verifyPin, getPudica, isBioEnabled, bioSupported, unlockBio } from './lib/lock.js';
```

con (importa tutto ciò che serve a questo task e ai Task 6–8):

```js
import { isLockEnabled, verifyPin, getPudica, isBioEnabled, bioSupported, unlockBio,
         enableBio, isBioPrompted, setBioPrompted,
         getFreq, getGraceMin, getLastUnlockAt, touchUnlock, shouldLock } from './lib/lock.js';
import { padReduce, padView } from './lib/porta-reducer.js';
```

- [ ] **Step 3: Riscrivi `requireUnlock()`**

In `js/app.js`, sostituisci l'intera funzione `requireUnlock` (righe 173–204) con:

```js
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

// Guscio d'ingresso: mostra la porta, risolve la Promise allo sblocco (PIN o biometria).
// Stessa logica del motore (verifyPin/unlockBio); UI a stati portata dai mockup.
function requireUnlock() {
  return new Promise(resolve => {
    const gate = $('lockgate');
    gate.style.display = '';
    gate.classList.remove('zoom', 'solved', 'opening', 'dolly');
    $('lockLeaf').classList.remove('unlocked');

    const scene = $('lockScene');
    const plate = $('lockPlate');
    const hint  = $('lockHint');
    const pips  = $('lockPips');
    const keys  = $('lockKeys');
    let entry = '';
    let busy = false;

    // costruisci il tastierino: 1-9, tasto duale ✺/⌫, 0, ✓
    clear(keys);
    ['1','2','3','4','5','6','7','8','9'].forEach(n => {
      const k = mk('div', 'key', n); k.dataset.n = n; keys.appendChild(k);
    });
    const dual = mk('div', 'key fn dual'); dual.dataset.fn = 'bio';
    dual.innerHTML = '<span class="g g-bio">✺</span><span class="g g-del">⌫</span>';
    keys.appendChild(dual);
    const zero = mk('div', 'key', '0'); zero.dataset.n = '0'; keys.appendChild(zero);
    const ok = mk('div', 'key fn', '✓'); ok.dataset.fn = 'ok'; keys.appendChild(ok);

    const drawPips = () => {
      clear(pips);
      for (let i = 0; i < 6; i++) pips.appendChild(mk('span', i < entry.length ? 'pip on' : 'pip'));
      const v = padView(entry);
      plate.classList.toggle('ready', v.ready);
      plate.classList.toggle('has-entry', v.len > 0);
    };
    drawPips();

    const flash = el => { el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), 180); };

    const finish = () => {
      touchUnlock(Date.now());
      const done = () => { gate.style.display = 'none'; gate.classList.remove('zoom','solved','opening','dolly'); resolve(); };
      if (prefersReducedMotion()) { done(); return; }
      gate.classList.add('solved');
      setTimeout(() => $('lockLeaf').classList.add('unlocked'), 360);
      setTimeout(() => { gate.classList.remove('zoom'); gate.classList.add('opening'); }, 360 + 480);
      setTimeout(() => gate.classList.add('dolly'), 360 + 480 + 520);
      setTimeout(done, 360 + 480 + 520 + 1000);
    };

    const tryBio = async () => {
      if (busy || !(isBioEnabled() && bioSupported())) return;
      if (await unlockBio()) { busy = true; plate.classList.add('ok'); hint.textContent = ''; finish(); }
    };

    const approach = () => {
      if (gate.classList.contains('zoom') || busy) return;
      gate.classList.add('zoom');
      plate.classList.add('awake');
      hint.textContent = 'Tocca un numero, poi ✓';
      tryBio();                       // biometria automatica all'avvicinamento (se attiva)
    };
    scene.addEventListener('pointerdown', approach);

    plate.addEventListener('pointerdown', async e => {
      if (busy) return;
      const k = e.target.closest('.key'); if (!k) return;
      e.preventDefault();
      plate.classList.add('awake');

      if (k.dataset.fn === 'bio') {
        if (entry.length > 0) {       // ⌫ : cancella l'ultima
          entry = padReduce(entry, { type: 'del' }); drawPips(); flash(k);
          hint.textContent = 'Tocca un numero, poi ✓';
        } else {                      // ✺ : scorciatoia biometrica
          tryBio();
        }
        return;
      }
      if (k.dataset.fn === 'ok') {    // ✓ : conferma
        if (entry.length < 4) { hint.textContent = 'Prima il codice, poi ✓'; return; }
        busy = true;
        if (await verifyPin(entry)) {
          plate.classList.add('ok'); hint.innerHTML = '<span class="casa">sei a casa</span>';
          setTimeout(finish, 520);
        } else {
          plate.classList.add('no', 'shake'); hint.textContent = 'Codice errato';
          setTimeout(() => {
            entry = padReduce(entry, { type: 'clear' }); drawPips();
            plate.classList.remove('no', 'shake'); busy = false;
            hint.textContent = 'Tocca un numero, poi ✓';
          }, 760);
        }
        return;
      }
      if (k.dataset.n === undefined) return;   // cifra
      const before = entry;
      entry = padReduce(entry, { type: 'digit', n: k.dataset.n });
      if (entry !== before) flash(k);
      drawPips();
      hint.textContent = padView(entry).ready ? 'Premi ✓ per confermare' : 'Tocca un numero, poi ✓';
    });
  });
}
```

> `enterApp` (riga 122) resta `if (isLockEnabled()) { await requireUnlock(); }` per ora: funziona con la nuova porta. Lo `shouldLock` arriva al Task 7. La funzione `mk(tag, cls, text)` di `js/ui.js` accetta un terzo argomento testo (vedi usi esistenti in `app.js`).

- [ ] **Step 4: Verifica che la suite resti verde**

Run: `node --test`
Expected: PASS (nessun test tocca il DOM; la logica del tastierino è già coperta da `porta-reducer.test.js`). La verifica visiva/funzionale del gate è nello smoke su device (Task 9).

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js
git commit -m "feat(porta): markup porta + requireUnlock ridisegnata (gesto, tastierino ✓)"
```

---

### Task 6: Bottom sheet biometrico al primo ingresso

Dopo il primo sblocco, se la biometria è supportata ma non attiva e non già proposta, mostra il bottom sheet "Entra con un tocco". Su **Attiva** → `enableBio()` (scansione OS) → «Fatto». Su **Non ora** → ricorda di non re-insistere.

**Files:**
- Modify: `js/app.js` (nuova `maybeOfferBio()` accanto a `requireUnlock`; chiamata in `enterApp`)

- [ ] **Step 1: Aggiungi `maybeOfferBio()`**

In `js/app.js`, subito **dopo** la funzione `requireUnlock` (definita al Task 5), aggiungi:

```js
// Bottom sheet di attivazione biometrica — secondo punto d'ingresso a enableBio().
// Mostrato solo al primo ingresso utile; non re-insiste se l'utente sceglie "Non ora".
function maybeOfferBio() {
  return new Promise(resolve => {
    if (!(isLockEnabled() && bioSupported() && !isBioEnabled() && !isBioPrompted())) { resolve(); return; }
    const scrim = mk('div'); scrim.id = 'bioSheetScrim';
    const sheet = mk('div'); sheet.id = 'bioSheet';
    sheet.innerHTML =
      '<div class="bs-ttl">Entra con un tocco</div>' +
      '<div class="bs-sub">La prossima volta sblocca con il viso o l\'impronta. Il codice resta la tua riserva.</div>' +
      '<div class="bs-priv">🔒 Il riconoscimento resta sul tuo telefono.</div>' +
      '<div class="bs-row"><button class="bs-go" id="bsGo">Attiva</button><button class="bs-no" id="bsNo">Non ora</button></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { scrim.classList.add('show'); sheet.classList.add('show'); });

    const close = () => {
      scrim.classList.remove('show'); sheet.classList.remove('show');
      setTimeout(() => { scrim.remove(); sheet.remove(); resolve(); }, 340);
    };
    scrim.onclick = () => { setBioPrompted(true); close(); };
    sheet.querySelector('#bsNo').onclick = () => { setBioPrompted(true); close(); };
    sheet.querySelector('#bsGo').onclick = async () => {
      const go = sheet.querySelector('#bsGo');
      go.disabled = true; go.textContent = 'Attendi…';
      try {
        await enableBio();                       // l'OS disegna la scansione (Face ID / impronta)
        go.textContent = 'Fatto ✓'; setBioPrompted(true);
        setTimeout(close, 700);
      } catch (_) {
        go.disabled = false; go.textContent = 'Attiva';   // annullata: resta l'invito, niente «Fatto»
        toast('Riconoscimento annullato');
      }
    };
  });
}
```

> Su annullamento NON si setta `bioPrompted`: l'invito potrà riapparire (coerente con la spec, edge "il bottom sheet mostra di nuovo l'invito").

- [ ] **Step 2: Chiama `maybeOfferBio` dopo lo sblocco in `enterApp`**

In `js/app.js`, riga 122, sostituisci:

```js
  if (isLockEnabled()) { await requireUnlock(); }
```

con:

```js
  if (isLockEnabled()) { await requireUnlock(); await maybeOfferBio(); }
```

- [ ] **Step 3: Verifica che la suite resti verde**

Run: `node --test`
Expected: PASS. (Il bottom sheet è DOM/WebAuthn → verificato su device al Task 9.)

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(porta): bottom sheet biometrico al primo ingresso (enableBio)"
```

---

### Task 7: `shouldLock` in `enterApp` + cold-start + re-lock al rientro

Sostituisce il check `isLockEnabled()` con `shouldLock(...)` (frequenza configurata), distingue il cold-start via `sessionStorage`, e aggiunge il trigger di re-lock al rientro in foreground — ciò che dà senso alle 3 frequenze.

**Files:**
- Modify: `js/app.js` (let di modulo; blocco in `enterApp`; helper `isColdStart`/`onVisibleMaybeLock`)

- [ ] **Step 1: Aggiungi i flag di modulo**

In `js/app.js`, vicino agli altri `let` di modulo (righe 24–25, dove c'è `let me = null;`), aggiungi:

```js
let appReady = false;       // true quando la home è mostrata: abilita il re-lock al rientro
let resumeWired = false;    // il listener visibilitychange si registra una volta sola
```

- [ ] **Step 2: Aggiungi gli helper cold-start e re-lock**

In `js/app.js`, subito dopo `maybeOfferBio` (Task 6), aggiungi:

```js
// Cold start = primo load del runtime di sessione (per la frequenza 'avvio').
function isColdStart() {
  try {
    if (sessionStorage.getItem('brace.runtime')) return false;
    sessionStorage.setItem('brace.runtime', '1');
    return true;
  } catch { return true; }
}

function lockPolicy(coldStart) {
  return shouldLock({
    enabled: isLockEnabled(), freq: getFreq(),
    lastUnlockAt: getLastUnlockAt(), graceMin: getGraceMin(),
    coldStart, now: Date.now(),
  });
}

// Rientro in foreground: riblocca se la frequenza lo richiede (coldStart=false al rientro).
let gateBusy = false;
async function onVisibleMaybeLock() {
  if (document.visibilityState !== 'visible' || !appReady || gateBusy) return;
  if (!lockPolicy(false)) return;
  gateBusy = true;
  try { await requireUnlock(); await maybeOfferBio(); }
  finally { gateBusy = false; }
}
```

- [ ] **Step 3: Usa `lockPolicy` in `enterApp` e registra il re-lock**

In `js/app.js`, riga 122 (quella aggiornata al Task 6), sostituisci:

```js
  if (isLockEnabled()) { await requireUnlock(); await maybeOfferBio(); }
```

con:

```js
  if (lockPolicy(isColdStart())) { await requireUnlock(); await maybeOfferBio(); }
```

Poi, in fondo a `enterApp` (dopo `showHome();`, riga 134), aggiungi:

```js
  appReady = true;
  if (!resumeWired) { document.addEventListener('visibilitychange', onVisibleMaybeLock); resumeWired = true; }
```

- [ ] **Step 4: Verifica che la suite resti verde**

Run: `node --test`
Expected: PASS. (`shouldLock` è già coperta al Task 2; il wiring foreground è da smoke su device, Task 9.)

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(porta): shouldLock in enterApp + cold-start + re-lock al rientro"
```

---

### Task 8: Impostazioni — "Quando chiedere il codice" (3 opzioni)

Aggiunge la riga di scelta frequenza sotto il blocco PIN in `renderPrivacy()`, visibile solo a lock attivo. Tre opzioni: A ogni apertura · Dopo 5 min · Solo all'avvio. UI self-contained (stili inline, nessuna dipendenza CSS nuova).

**Files:**
- Modify: `js/modules/impostazioni.js` (import; `renderPrivacy`)

- [ ] **Step 1: Importa freq get/set**

In `js/modules/impostazioni.js`, riga 5–6, estendi l'import da `../lib/lock.js` aggiungendo `getFreq, setFreq`:

```js
import { isLockEnabled, setPin, disableLock, isPinValid, getPudica, setPudica,
         bioSupported, isBioEnabled, enableBio, disableBio, getFreq, setFreq } from '../lib/lock.js';
```

- [ ] **Step 2: Aggiungi la riga frequenza in `renderPrivacy`**

In `js/modules/impostazioni.js`, dentro `renderPrivacy()`, nel blocco `if (isLockEnabled()) { ... }` che oggi contiene solo "Cambia codice" (righe 124–127), aggiungi la riga frequenza subito dopo aver appeso `rCh`. Il blocco diventa:

```js
  // cambia codice (solo se attivo)
  if (isLockEnabled()) {
    const rCh = row('🔑', 'Cambia codice'); rCh.classList.add('tap');
    add(rCh, mk('span', 'set-chev', '›')); rCh.onclick = openSetPin; add(c, rCh);

    // quando richiedere il codice (3 opzioni)
    const FREQ_OPTS = [
      ['apertura', 'A ogni apertura'],
      ['grazia',   'Dopo 5 min'],
      ['avvio',    'Solo all’avvio'],
    ];
    const rFreq = mk('div', 'set-row col');
    const headF = mk('div', 'set-l');
    add(headF, mk('span', 'set-em', '⏱️'), mk('span', 'set-nm', 'Quando chiedere il codice'));
    add(rFreq, headF);
    const seg = mk('div'); seg.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;width:100%;';
    const curFreq = getFreq();
    FREQ_OPTS.forEach(([val, lab]) => {
      const b = mk('button', null, lab);
      const on = val === curFreq;
      b.style.cssText = 'flex:1;min-width:84px;font-family:var(--ds-font-ui);font-weight:700;font-size:12px;padding:9px 8px;border-radius:10px;cursor:pointer;'
        + (on ? 'color:#1a0b06;background:var(--ds-ember);border:1px solid var(--ds-ember);'
              : 'color:var(--ds-ink-soft);background:transparent;border:1px solid var(--ds-line);');
      b.onclick = () => { setFreq(val); renderMain(); };
      add(seg, b);
    });
    add(rFreq, seg);
    add(c, rFreq);
  }
```

> `graceMin` resta fisso a 5 (default del motore); l'etichetta "Dopo 5 min" è onesta con quel valore. Un selettore dei minuti è una rifinitura deferita (vedi Fuori scope).

- [ ] **Step 3: Verifica che la suite resti verde**

Run: `node --test`
Expected: PASS. (La sezione Impostazioni è DOM → verifica su device al Task 9.)

- [ ] **Step 4: Commit**

```bash
git add js/modules/impostazioni.js
git commit -m "feat(impostazioni): scelta frequenza di sblocco (3 opzioni)"
```

---

### Task 9: Smoke su device + Definition of Done

La DoD della spec = commit + suite verde **poi** smoke su device. Questo task esegue lo smoke e ne registra l'esito in `test/smoke.md`. È un gate manuale: spunta solo ciò che hai verificato davvero.

**Files:**
- Modify: `test/smoke.md` (append della sezione esito)

- [ ] **Step 1: Suite verde completa**

Run: `node --test`
Expected: PASS, tutti i file (≥ i 4 nuovi blocchi: lock-state, shouldLock, porta-reducer ×6, più i pre-esistenti). Annota il conteggio `pass/fail`.

- [ ] **Step 2: Avvia il server statico e apri l'app**

Run (PowerShell, dalla root repo): `python -m http.server 5500 --bind 127.0.0.1`
Apri `http://127.0.0.1:5500` su device reale (la biometria richiede contesto sicuro: usa `localhost` o un tunnel https come negli smoke precedenti).

- [ ] **Step 3: Esegui lo smoke della porta e spunta gli esiti**

Verifica, in app loggata con PIN attivo:
- Porta a riposo: anta Sartoriale + spioncino caldo + hint «Tocca la porta per avvicinarti».
- Tocco porta → zoom alla serratura (1.55s) + la placca arriva al centro + tastierino acceso.
- Cifre: restano grigie, si accende **solo** il tasto premuto; `✺` diventa `⌫` appena c'è ≥1 cifra.
- Codice errato → shake + pip rossi → reset.
- Codice giusto → `✓` → «sei a casa» (ember) → l'anta gira a battente → home.
- Reduce-motion attivo (impostazioni OS) → gesto degradato a transizione breve, niente crash.
- Biometria già attiva → tentata in automatico all'avvicinamento (sblocco senza toccare i numeri); fallback sempre il codice.
- Primo ingresso (bio supportata, non attiva): dopo lo sblocco compare il bottom sheet «Entra con un tocco» → **Attiva** → scansione OS → «Fatto»; **Non ora** → non re-insiste; annulla scansione → resta sul codice, nessun crash.
- Frequenza (Impostazioni → Privacy & blocco → "Quando chiedere il codice"):
  - "A ogni apertura" → riblocca al rientro in foreground.
  - "Dopo 5 min" → non riblocca entro 5 min dall'ultimo sblocco, riblocca oltre.
  - "Solo all’avvio" → riblocca solo a cold start, non al rientro.
- `bioSupported()` false (device senza biometria) → niente `✺` biometrico, niente bottom sheet; solo codice.

- [ ] **Step 4: Registra l'esito in `test/smoke.md`**

Appendi in fondo a `test/smoke.md` una sezione con la data (2026-06-11 o successiva), browser/device, conteggio `node --test`, e la checklist dello Step 3 con `[x]/[ ]` reali. Modello (adatta agli esiti veri):

```markdown
## Porta — guscio d'ingresso (lucchetto + biometria) — 2026-06-1X

> Server: `python -m http.server 5500`. Device: <device reale>. Suite: node --test → <N> pass / 0 fail.

- [ ] Porta a riposo: anta Sartoriale + spioncino + hint
- [ ] Avvicinamento (zoom) + placca al centro + tastierino acceso
- [ ] Tasto singolo si accende · ✺→⌫ con cifre
- [ ] Codice errato → shake/reset · giusto → «sei a casa» → battente → home
- [ ] Reduce-motion: gesto degradato, nessun crash
- [ ] Biometria auto all'avvicinamento (se attiva) · fallback codice
- [ ] Primo ingresso: bottom sheet → Attiva → scansione OS → «Fatto» · Non ora · annulla
- [ ] Frequenze: apertura / 5 min / avvio si comportano come atteso
- [ ] Device senza biometria: solo codice, nessun bottom sheet
```

- [ ] **Step 5: Commit**

```bash
git add test/smoke.md
git commit -m "test(porta): smoke su device del guscio d'ingresso (DoD)"
```

---

## Fuori scope (YAGNI — dalla spec)

- Port della home "La Posta" dietro la porta (passi 6–7): qui la porta apre su `showHome()` così com'è.
- Porta decorativa senza PIN (soglia "tocca per entrare" a lock off): default lock off → nessuna porta, ingresso diretto.
- Selettore dei minuti per la grazia (resta fisso a 5).
- Audio del tastierino dei mockup (blip/motor/clunk): non portato in app (evita le policy di autoplay; nessun requisito nella spec).
- Recupero PIN dimenticato, sync del lock tra device, multi-credenziale biometrica.

## Self-review (eseguita in fase di scrittura)

**Copertura spec → task:**
- Estensioni `lock.js` (`bioPrompted`, `freq`/`graceMin`/`lastUnlockAt`/`touchUnlock`) → Task 1. `shouldLock` → Task 2.
- Riduttore puro del tastierino (cifre, cap 6, ✺↔⌫, ready 4+) → Task 3.
- `porta.css` su `--ds-*`, anta Sartoriale, spioncino piccolo, reduce-motion → Task 4.
- Markup `#lockgate` + `requireUnlock` ridisegnata (gesto, tastierino ✓, verifyPin/unlockBio, biometria auto all'avvicinamento) → Task 5.
- Bottom sheet biometrico (condizione di comparsa, Attiva/Non ora, scansione OS, edge annullamento) → Task 6.
- Frequenza in `enterApp` via `shouldLock` + cold-start + re-lock al rientro → Task 7.
- Riga frequenza in Impostazioni (3 opzioni) → Task 8.
- DoD: suite verde + smoke su device + registrazione in `smoke.md` → Task 9.

**Coerenza tipi/firme:** `padReduce(entry, action)`/`padView(entry)` (Task 3) usate identiche nel Task 5. `shouldLock({enabled,freq,lastUnlockAt,graceMin,coldStart,now})` (Task 2) chiamata via `lockPolicy()` con gli stessi campi (Task 7). `touchUnlock(now)` (Task 1) chiamata in `finish()` (Task 5). Id markup (`lockScene/lockLeaf/lockPlate/lockPips/lockKeys/lockHint`, Task 5) = quelli letti da `requireUnlock` (Task 5) e stilizzati in `porta.css` (Task 4). `enableBio/isBioPrompted/setBioPrompted` importate al Task 5, usate al Task 6.

**Edge dalla spec coperti:** bio non supportata (no ✺/sheet) · annulla scansione (resta codice) · lock off (`shouldLock`→false) · `lastUnlockAt` assente in grazia (riblocca) · reduce-motion (CSS + JS). Pudica resta gestita com'è (non toccata).
