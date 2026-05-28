# Swipe-back unificato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Regola utente (memoria):** Niente commit né push senza OK esplicito. Quando un task arriva allo step "Commit", mostra il diff/`git status` e attendi conferma dell'utente prima di eseguire `git commit`.

**Goal:** Sostituire le due implementazioni di swipe-back orizzontale (`enableEdgeClose` in app.js, `wireModalSwipe` in giochi.js) con una sola utility riusabile `attachSwipeBack` in `js/lib/swipe-back.js`, mantenendo il comportamento esistente di entrambe e standardizzando soglie/edge zone.

**Architecture:** Una funzione `attachSwipeBack(element, onComplete, options?)` che gestisce il riconoscimento del gesto (pointerdown/move/up con cattura del pointer) e applica il feedback drag (translateX + opacity). Quando la soglia di completamento è superata, chiama `onComplete()` e si stacca; la chiusura specifica (slide-out, blur dissolve) resta nel chiamante. Listener sono per-elemento (non globali), gestiti automaticamente dal GC quando il nodo overlay viene rimosso dal DOM.

**Tech Stack:** Vanilla JS ES modules (stile coerente con `js/lib/logic.js`). Nessuna dipendenza. Pointer Events API.

**Riferimento spec:** `docs/superpowers/specs/2026-05-28-swipe-back-design.md`

---

## File structure

- **Crea:** `js/lib/swipe-back.js` — utility self-contained, ~85 righe.
- **Modifica:** `js/app.js` — rimuove `enableEdgeClose` (~50 righe in meno) e la sua chiamata di boot.
- **Modifica:** `js/modules/strip.js` — `openOv` chiama `attachSwipeBack` sull'overlay appena creato.
- **Modifica:** `js/modules/giochi.js` — `wireModalSwipe` ridotto a wrapper di 2 righe.
- **Non toccare:** `js/modules/yahtzutra.js` (`wireDragToClose` è gesture verticale, fuori scope), `styles.css`, `prototipo/index.html`.

---

## Task 1: Creare `js/lib/swipe-back.js`

**Files:**
- Create: `js/lib/swipe-back.js`

- [ ] **Step 1.1: Creare il file con l'implementazione completa**

Crea `js/lib/swipe-back.js` con questo contenuto esatto:

```js
// Swipe-back unificato per overlay/modal back-eable.
//
// Riconosce un drag orizzontale che parte da una zona di edge (sx o dx)
// dell'elemento. Applica feedback live (translateX + opacity). Se il drag
// supera la soglia (per distanza O per velocità), chiama onComplete() e si
// stacca da solo. Se invece il drag rimane sotto soglia, anima uno
// snap-back e resta in attesa di un nuovo gesto.
//
// L'utility NON anima la chiusura: lascia al chiamante (closeOv,
// closeGameModal, ...) il compito di animare e rimuovere l'elemento dopo
// onComplete.
//
// Edge zone, soglia, velocità e durate sono configurabili via options.

const DEFAULTS = {
  edgePx: 40,              // zona di attivazione da bordo sx/dx
  thresholdRatio: 0.25,    // 25% larghezza element → trigger
  velocityThreshold: 0.9,  // px/ms → trigger anche con drag breve e veloce
  cancelMs: 200,           // durata snap-back
  decideDeltaPx: 6,        // soglia per decidere asse orizzontale vs verticale
};

export function attachSwipeBack(element, onComplete, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let startX = 0, startY = 0, startT = 0;
  let edge = null;            // 'l' | 'r' | null
  let tracking = false;       // pointerdown valido, in attesa di decisione
  let dragging = false;       // gesto deciso orizzontale, drag attivo
  let pointerId = -1;
  let originalTouchAction = '';

  const reset = () => {
    tracking = false; dragging = false; edge = null; pointerId = -1;
  };

  const snapBack = () => {
    element.style.transition =
      `transform ${opts.cancelMs}ms ease-out, opacity ${opts.cancelMs}ms ease-out`;
    element.style.transform = '';
    element.style.opacity = '';
    setTimeout(() => { element.style.transition = ''; }, opts.cancelMs);
  };

  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;  // solo primary
    if (!e.isPrimary) return;                              // niente multi-touch
    const rect = element.getBoundingClientRect();
    const fromL = e.clientX - rect.left < opts.edgePx;
    const fromR = rect.right - e.clientX < opts.edgePx;
    if (!fromL && !fromR) return;
    edge = fromL ? 'l' : 'r';
    startX = e.clientX; startY = e.clientY; startT = Date.now();
    tracking = true; dragging = false; pointerId = e.pointerId;
    element.style.transition = 'none';
  };

  const onMove = (e) => {
    if (!tracking) return;
    if (!e.isPrimary || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < opts.decideDeltaPx && Math.abs(dy) < opts.decideDeltaPx) return;
      if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }  // gesto verticale → lascia
      dragging = true;
      try { element.setPointerCapture(pointerId); } catch (_) {}
    }
    e.preventDefault();
    let t = dx;
    // resistenza se trascini "fuori" dall'edge (sx con dx<0, dx con dx>0)
    if (edge === 'l' && t < 0) t = t * 0.25;
    if (edge === 'r' && t > 0) t = t * 0.25;
    const width = element.getBoundingClientRect().width || 1;
    element.style.transform = `translateX(${t}px)`;
    element.style.opacity = String(Math.max(0.3, 1 - Math.abs(t) / width * 0.5));
  };

  const onUp = (e) => {
    if (!tracking) return;
    if (e.pointerId !== pointerId && pointerId !== -1) return;
    const dx = (e && e.clientX != null ? e.clientX - startX : 0);
    const dt = Math.max(1, Date.now() - startT);
    const v = Math.abs(dx) / dt;
    const width = element.getBoundingClientRect().width || 1;
    const wasDragging = dragging;
    reset();
    if (!wasDragging) {
      // gesto annullato pre-decisione: solo reset stili
      element.style.transform = '';
      element.style.opacity = '';
      element.style.transition = '';
      return;
    }
    if (Math.abs(dx) > width * opts.thresholdRatio || v > opts.velocityThreshold) {
      onComplete();
      // gli stili inline restano: il chiamante anima la sua chiusura
      // (slide-out, blur dissolve, ...) e poi rimuove l'elemento.
    } else {
      snapBack();
    }
  };

  const onCancel = (e) => {
    if (!tracking) return;
    reset();
    snapBack();
  };

  // touch-action: pan-y → lo scroll verticale interno continua a funzionare,
  // il browser non interpreta il drag orizzontale come back-gesture nativa.
  originalTouchAction = element.style.touchAction;
  element.style.touchAction = 'pan-y';

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove, { passive: false });
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onCancel);

  // detach() rimuove i listener e ripristina touchAction. Nel pattern attuale
  // (overlay creati fresh e .remove()'d a ogni open/close) non serve chiamarlo,
  // ma l'API lo espone per overlay long-lived.
  return function detach() {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onUp);
    element.removeEventListener('pointercancel', onCancel);
    element.style.touchAction = originalTouchAction;
    element.style.transform = '';
    element.style.opacity = '';
    element.style.transition = '';
  };
}
```

- [ ] **Step 1.2: Verifica sintassi**

Apri `prototipo/index.html` nel browser e controlla la console: il file `swipe-back.js` non viene ancora caricato da nessuno, ma se hai un linter o un syntax-checker locale puoi farlo girare ora.

Run (se hai node disponibile):
```bash
node --check js/lib/swipe-back.js
```
Expected: nessun output (= file valido).

- [ ] **Step 1.3: Mostra `git status` e chiedi OK per commit**

```bash
git status
git diff --stat js/lib/swipe-back.js
```

Mostra il diff all'utente. Se OK:

```bash
git add js/lib/swipe-back.js
git commit -m "feat(lib): swipe-back utility unificata (orizzontale, edge-only)"
```

**Non pushare**: il push avviene dopo Task 4 (verifica manuale completa).

---

## Task 2: Migrare overlay Strip (`enableEdgeClose` → attachSwipeBack)

**Files:**
- Modify: `js/app.js:256-310` (rimuove `enableEdgeClose`), `js/app.js:323` (rimuove la chiamata)
- Modify: `js/modules/strip.js:510-516` (aggiunge import + attach in `openOv`)

- [ ] **Step 2.1: In `js/modules/strip.js`, aggiungere l'import in cima al file**

Apri `js/modules/strip.js`. Subito sotto gli altri `import` esistenti aggiungi:

```js
import { attachSwipeBack } from '../lib/swipe-back.js';
```

- [ ] **Step 2.2: In `js/modules/strip.js`, modificare `openOv` per agganciare lo swipe**

Trova la funzione `openOv` (intorno a riga 510). Sostituisci da:

```js
function openOv() {
  document.querySelectorAll('.strip-ov').forEach(n => n.remove());
  const ov = mk('div', 'dadi-scrim strip-ov');
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  return ov;
}
```

a:

```js
function openOv() {
  document.querySelectorAll('.strip-ov').forEach(n => n.remove());
  const ov = mk('div', 'dadi-scrim strip-ov');
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  attachSwipeBack(ov, () => closeOv());
  return ov;
}
```

(Aggiunta una sola riga: `attachSwipeBack(ov, () => closeOv());`)

- [ ] **Step 2.3: In `js/app.js`, rimuovere `enableEdgeClose` e la sua chiamata**

Apri `js/app.js`. Cancella interamente l'intero blocco da riga ~256 a riga ~310 (commenti + funzione `enableEdgeClose`):

Cerca il commento `// edge-swipe: trascinamento entro EDGE_PX dal bordo` e cancella **tutto** fino alla `}` di chiusura della funzione `enableEdgeClose` inclusa (comprese le due const `EDGE_PX = 38` e `EDGE_CLOSEABLE = '.strip-ov'`).

Poi trova la riga `enableEdgeClose();` (intorno a riga 323) e cancella anche quella.

Risultato: `js/app.js` perde ~55 righe e non ha più riferimenti a `enableEdgeClose`.

- [ ] **Step 2.4: Verifica che il riferimento sia rimosso**

```bash
git grep -n "enableEdgeClose" -- js/
```
Expected: nessun output.

- [ ] **Step 2.5: Verifica manuale sul telefono (Strip overlay)**

Avvia l'app sul telefono. Apri **Strip Poker → Cronaca** (o Regole, o Opzioni — qualsiasi overlay che usa `.strip-ov`).

Verifica:
1. Trascina dal bordo sx verso destra: l'overlay segue il dito.
2. Trascina oltre il 25% della larghezza: l'overlay si chiude (slide-out via `closeOv` esistente).
3. Trascina poco e rilascia: snap-back fluido di 200ms.
4. Stessa cosa dal bordo dx (resistenza inversa, ma stesso pattern).
5. Scroll verticale interno funziona normalmente (non triggera back).

Se qualcosa non funziona: ferma qui, riapri il diff e investiga prima di proseguire.

- [ ] **Step 2.6: Mostra `git status`/`diff` e chiedi OK per commit**

```bash
git status
git diff js/app.js js/modules/strip.js
```

Se OK:

```bash
git add js/app.js js/modules/strip.js
git commit -m "refactor(strip): swipe-back overlay usa attachSwipeBack unificato"
```

---

## Task 3: Migrare game-modal (`wireModalSwipe` → attachSwipeBack)

**Files:**
- Modify: `js/modules/giochi.js:148-212` (sostituisce body di `wireModalSwipe`), aggiunge import

- [ ] **Step 3.1: In `js/modules/giochi.js`, aggiungere l'import**

In cima al file (sotto gli altri import esistenti):

```js
import { attachSwipeBack } from '../lib/swipe-back.js';
```

- [ ] **Step 3.2: Sostituire interamente il corpo di `wireModalSwipe`**

Trova la funzione `wireModalSwipe(sheet, overlay)` (riga ~153) e sostituisci **dall'intero commento di testa fino alla `}` finale** con:

```js
// Swipe laterale per chiudere il game modal. Delega a attachSwipeBack la
// gesture detection (edge 40px, soglia 25% width o velocità > 0.9). La
// chiusura specifica (sheet slide-out + blur dissolve dello scrim) resta
// in closeGameModal().
function wireModalSwipe(sheet) {
  attachSwipeBack(sheet, () => closeGameModal());
}
```

Nota: il secondo parametro `overlay` (scrim background animation) viene rimosso perché l'unificazione drop-pa il feedback dinamico dello scrim opacity durante il drag — la chiusura finale anima comunque il dissolve. Se in test il fade durante il drag risulta troppo mancante, possiamo aggiungerlo con un'option `onDrag(dx)` in futuro.

- [ ] **Step 3.3: Aggiornare il sito di chiamata in `openGameModal`**

Cerca la riga `wireModalSwipe(sheet, overlay);` (riga ~124). Modificala in:

```js
wireModalSwipe(sheet);
```

- [ ] **Step 3.4: Verifica nessun riferimento residuo**

```bash
git grep -n "wireModalSwipe" -- js/
```
Expected: solo le 2 occorrenze in `js/modules/giochi.js` (definizione + chiamata in `openGameModal`).

- [ ] **Step 3.5: Verifica manuale sul telefono (game-modal)**

Sul telefono:
1. Apri **Giochi → Ruota** (o un qualsiasi gioco che apre game-modal).
2. Trascina dal bordo sx verso destra: il sheet segue il dito.
3. Oltre soglia: il modal si chiude con il blur dissolve esistente (420 ms).
4. Sotto soglia + rilascio: snap-back.
5. Apri **Strip Poker** e dentro il game-modal apri un overlay (Cronaca/Regole/Opzioni).
6. Swipe dal bordo sx: deve chiudersi **solo** l'overlay (innermost), il game-modal resta aperto.
7. Continua a swipare dal bordo sx (con solo game-modal aperto): si chiude il game-modal.

Se qualcosa non funziona: ferma qui, investiga.

- [ ] **Step 3.6: Mostra `git status`/`diff` e chiedi OK per commit**

```bash
git status
git diff js/modules/giochi.js
```

Se OK:

```bash
git add js/modules/giochi.js
git commit -m "refactor(giochi): swipe-back modal usa attachSwipeBack unificato"
```

---

## Task 4: Verifica integrata + push

**Files:** nessuna modifica.

- [ ] **Step 4.1: Verifica integrata sul telefono — checklist completa**

Sul telefono, scorri questa checklist e confronta con la sezione "Comportamento atteso" della spec:

- [ ] Strip → Cronaca → swipe sx-dx chiude
- [ ] Strip → Regole → swipe sx-dx chiude
- [ ] Strip → Opzioni → swipe sx-dx chiude
- [ ] Ruota (game-modal) → swipe sx-dx chiude
- [ ] Strip Poker (game-modal) → swipe sx-dx chiude
- [ ] Strip Poker game-modal con Cronaca aperta dentro → swipe chiude solo Cronaca, NON il game-modal
- [ ] Yahtzutra → drag verticale handle funziona ancora come prima (non toccato)
- [ ] Bottom sheet (es. impostazioni) → X/click-fuori ancora funziona come prima (non toccato)
- [ ] Snap-back se rilasci sotto soglia, fluido in 200 ms
- [ ] Scroll verticale dentro un overlay non triggera swipe-back
- [ ] Tap su bottoni dentro un overlay funziona normalmente

Se anche solo uno fallisce: NON pushare, segnala all'utente quale.

- [ ] **Step 4.2: Mostra il riepilogo dei commit**

```bash
git log --oneline origin/master..HEAD
```

Aspettato: 3 commit:
- `feat(lib): swipe-back utility unificata (orizzontale, edge-only)`
- `refactor(strip): swipe-back overlay usa attachSwipeBack unificato`
- `refactor(giochi): swipe-back modal usa attachSwipeBack unificato`

- [ ] **Step 4.3: Chiedi OK per push e push**

Chiedi conferma all'utente. Se OK:

```bash
git push origin master
```

- [ ] **Step 4.4: Aggiornare la memoria di progetto**

Aggiungi una riga a `C:\Users\TomasCoro\.claude\projects\C--Users-TomasCoro-Desktop-PERSONAL-siti-app-nostro-spazio\memory\MEMORY.md`:

```
- [Swipe back unificato](project_swipe_back.md) — utility in js/lib/swipe-back.js per overlay/modal; usare attachSwipeBack(el, onComplete) invece di scrivere gesture custom
```

E crea `project_swipe_back.md` con:

```markdown
---
name: swipe-back
description: Utility unificata per gesto swipe-back orizzontale su overlay/modal — usare sempre questa, non scrivere gesture custom
metadata:
  type: project
---

Il gesto swipe-back orizzontale (chiudi overlay/modal con drag da bordo) è gestito da un'unica utility:

`import { attachSwipeBack } from '../lib/swipe-back.js'`

`attachSwipeBack(element, onComplete, options?)` — gestisce gesture detection + drag feedback (translateX + opacity). Chiama `onComplete()` quando soglia superata; il chiamante anima la chiusura specifica.

Default: edge 40 px sx/dx, soglia 25% width O velocità > 0.9, snap-back 200 ms.

Usato da:
- `js/modules/strip.js` → openOv (Cronaca/Regole/Opzioni)
- `js/modules/giochi.js` → wireModalSwipe (game-modal)

**Why:** prima esistevano 2 implementazioni separate (enableEdgeClose in app.js a 38px e wireModalSwipe in giochi.js a 24px) con soglie diverse, comportamento incoerente. Unificate il 2026-05-28.

**How to apply:** quando aggiungi un nuovo overlay/modal back-eable orizzontale, usa `attachSwipeBack`, non scrivere logica pointerdown/move/up custom. Per gesture verticali (drag-to-dismiss handle stile Yahtzutra) NON usare questa — è semantica diversa, lascia `wireDragToClose` o scrivi una primitiva separata.

Related: [[feedback-auto-push]]
```

- [ ] **Step 4.5: Commit della memoria? NO**

La memoria sta fuori dal repo del progetto (è in `~/.claude/...`), quindi non è git-tracked. Niente commit qui.

---

## Self-review summary

Spec coverage controllata sezione per sezione:
- ✅ Modulo nuovo `js/lib/swipe-back.js` → Task 1
- ✅ API `attachSwipeBack` con default e ritorno `detach` → Task 1.1
- ✅ State machine pointerdown→move→up/cancel → Task 1.1 onDown/onMove/onUp/onCancel
- ✅ Drag feedback translateX + opacity → Task 1.1 (onMove)
- ✅ Snap-back animato cancelMs → Task 1.1 (snapBack)
- ✅ touch-action: pan-y → Task 1.1 (originalTouchAction)
- ✅ setPointerCapture → Task 1.1 (onMove, prima volta dragging)
- ✅ Migrazione enableEdgeClose → Task 2
- ✅ Migrazione wireModalSwipe → Task 3
- ✅ Yahtzutra non toccato → ribadito in file structure
- ✅ Comportamento atteso (test manuale) → Task 4.1 checklist
- ✅ Rischi mitigati: scroll verticale via pan-y + decideDeltaPx; memory leak non-issue per pattern fresh/remove; back-swipe browser via preventDefault — verificato in Task 4

Type/signature consistency:
- `attachSwipeBack(el, onComplete, opts)` usato consistentemente in Task 1, 2, 3.
- Opzioni con stessi nomi (`edgePx`, `thresholdRatio`, `velocityThreshold`, `cancelMs`, `decideDeltaPx`) sempre.

Niente placeholder, niente "TBD", niente "similar to".
