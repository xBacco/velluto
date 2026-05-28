# Swipe-back unificato — design

**Data:** 2026-05-28
**Stato:** approvato dall'utente, in attesa di piano implementativo
**Branch:** master

## Problema

L'app non si comporta come un'app mobile nativa: dentro al gioco Strip Poker (e in altri overlay/modal) lo swipe laterale dal bordo sinistro — pattern standard iOS — non chiude la schermata in modo affidabile. L'utente deve usare la freccia in topbar.

Esaminando il codice, il problema non è che lo swipe manchi del tutto: esistono **tre** implementazioni separate che si comportano in modo diverso.

| Implementazione | Posizione | Edge zone | Soglia | Animazione close |
|---|---|---|---|---|
| `enableEdgeClose` | `js/app.js:256-310` | 38 px | 18% width | slide-out 240 ms |
| `wireModalSwipe` | `js/modules/giochi.js:153-212` | 24 px | 160 px o v>0.9 | blur dissolve 420 ms (delegato a `closeGameModal`) |
| `wireDragToClose` | `js/modules/yahtzutra.js:368-426` | — (drag su handle) | — | sheet minimize/close |

Le prime due fanno la stessa cosa (back orizzontale da bordo) con codice duplicato e soglie diverse → comportamento incoerente percepito come bug. La terza è una gesture semanticamente diversa (drag verticale su un handle per "dismiss sheet") e non rientra in questo lavoro.

## Obiettivo

Sostituire le due implementazioni back-orizzontale con una sola utility riusabile. Risultato atteso:

- Stessa zona edge, stessa soglia, stesso feedback drag su tutti gli overlay back-eable.
- Edge zone più larga (40 px) per matchare la sensibilità delle app native.
- Codice di chiusura specifico per surface (slide vs blur dissolve) **resta nei moduli** — l'utility delega.
- `wireDragToClose` di Yahtzutra resta com'è (fuori scope).

Out of scope:
- Tasto back hardware Android (`history.pushState` / `popstate`).
- Bottom sheet generico `openSheet` di `js/ui.js`.
- Swipe verso destra (back-forward, non richiesto).

## Architettura

### Nuovo modulo: `js/lib/swipe-back.js`

Vanilla JS, niente dipendenze, stesso stile di `js/lib/logic.js`. Esporta una sola funzione:

```js
attachSwipeBack(element, onComplete, options?) → detach
```

| Parametro | Tipo | Descrizione |
|---|---|---|
| `element` | `HTMLElement` | L'overlay/modal su cui montare il gesto. È l'elemento che riceve il `translateX` durante il drag. |
| `onComplete` | `() => void` | Chiamata **una sola volta** quando il gesto supera la soglia di completamento. Il chiamante esegue qui la sua animazione di chiusura specifica. L'utility non chiude né rimuove `element`. |
| `options` | `object?` | Vedi tabella sotto. |
| **ritorno** | `() => void` | `detach()` — rimuove tutti i listener e ripristina gli stili inline. Va chiamato quando l'elemento viene distrutto, per evitare leak. |

Opzioni con default:

```js
{
  edgePx: 40,              // zona di attivazione dal bordo sinistro
  thresholdRatio: 0.25,    // 25% della larghezza element → trigger close
  velocityThreshold: 0.9,  // px/ms → trigger close anche con drag breve ma veloce
  cancelMs: 200,           // durata snap-back se non si chiude
}
```

### Macchina a stati del gesto

```
idle ─┬─ pointerdown @ clientX > edgePx ─→ idle (ignora)
      └─ pointerdown @ clientX ≤ edgePx ─→ tracking
                                            │
                                            ├─ pointermove dx ≤ 5 ─→ tracking (nessun preventDefault)
                                            ├─ pointermove dx > 5 ─→ dragging (preventDefault attivo, transform applicato)
                                            │                          │
                                            │                          ├─ pointerup dx ≥ width*thresholdRatio O v ≥ velocityThreshold ─→ completing
                                            │                          └─ pointerup altrimenti ─→ cancelling
                                            │                          │
                                            │                          ├─ pointercancel ─→ cancelling
                                            │                          └─ pointercancel ─→ cancelling
                                            ↓
                                          completing → onComplete() chiamata, utility si stacca, element invariato (chiamante anima la chiusura)
                                          cancelling → transform/opacity transizione cancelMs verso 0, poi idle
```

### Feedback drag

Durante lo stato `dragging`, l'utility applica inline:

```
element.style.transform = `translateX(${dx}px)`
element.style.opacity = `${1 - (dx / width) * 0.5}`
element.style.transition = 'none'  // nessuna transizione durante il drag
```

In `cancelling`:

```
element.style.transition = `transform ${cancelMs}ms ease-out, opacity ${cancelMs}ms ease-out`
element.style.transform = ''
element.style.opacity = ''
```

(dopo `cancelMs` un cleanup rimuove `transition` per non interferire con animazioni future).

In `completing`: l'utility lascia gli stili inline al loro stato corrente (drag mid-transform) e chiama `onComplete()`. È compito del callback rimuovere o nascondere l'elemento — gli stili inline residui non sono un problema perché l'elemento sta per essere smontato.

### `touch-action`

Quando `attachSwipeBack` monta, imposta `element.style.touchAction = 'pan-y'`. Questo serve a far passare correttamente lo scroll verticale interno (il contenuto del modal scrolla normalmente) senza che il browser tenti di interpretare il movimento come gesto orizzontale di sistema (back-swipe del browser). `detach()` ripristina il valore originale.

### Cattura pointer

Su `pointerdown` valido, l'utility chiama `element.setPointerCapture(e.pointerId)`. Questo serve a:
- Garantire di ricevere tutti i `pointermove` successivi anche se il dito esce dai confini dell'elemento.
- Su overlay annidati (es. game-modal con strip-ov dentro), il figlio cattura il pointer e il padre non riceve eventi → gerarchia rispettata automaticamente.

## Migrazione

### `js/app.js:256-310` — `enableEdgeClose`

Sostituire l'intero corpo della funzione con:

```js
function enableEdgeClose(overlay) {
  attachSwipeBack(overlay, () => closeOv(overlay));
}
```

`closeOv` esiste già in `js/modules/strip.js:504-509` e gestisce la slide-out 240 ms. Resta com'è.

`detach()` ritornato non viene memorizzato: nel pattern attuale della codebase ogni overlay è un nodo DOM creato fresco a ogni `openOv` e rimosso con `.remove()` alla chiusura. Quando il nodo esce dal DOM, i listener vengono raccolti automaticamente dal GC. `detach()` esiste comunque nell'API per uso futuro su elementi long-lived (es. una `<main>` sempre presente), ma qui non serve.

### `js/modules/giochi.js:153-212` — `wireModalSwipe`

Stessa cosa:

```js
function wireModalSwipe(sheet) {
  return attachSwipeBack(sheet, () => closeGameModal());
}
```

Edge zone passa implicitamente da 24 → 40 (default). Questo è voluto — 24 px era troppo stretto per il dito medio.

### `js/modules/yahtzutra.js:368-426` — `wireDragToClose`

Non si tocca. È drag verticale su handle, semantica diversa.

## Comportamento atteso (test manuale)

| Scenario | Atteso |
|---|---|
| Dentro Story/Rules/Options di Strip, swipe da bordo sx | Overlay scorre verso destra durante il drag, sopra il 25% width si chiude con slide 240 ms |
| Dentro Strip Poker game-modal, swipe da bordo sx | Sheet scorre, sopra soglia si chiude con blur dissolve 420 ms |
| Dentro game-modal con un overlay strip-ov dentro, swipe da bordo sx | Si chiude **solo** l'overlay strip-ov (innermost), il game-modal resta aperto |
| Drag da bordo ma sotto soglia, rilascio | Snap-back fluido al posto originale (200 ms) |
| Drag verticale con dito che inizia da bordo sx | Niente swipe-back; lo scroll verticale interno funziona normalmente |
| Tap che non parte da edge | Niente: nessuno styles inline applicato, propagazione normale (es. il tap su un bottone funziona) |
| Yahtzutra: drag verticale sull'handle | Funziona come prima (non toccato) |

## Rischi

- **Conflitto con scroll verticale interno**: mitigato da `touch-action: pan-y` + soglia `dx > 5` prima di `preventDefault`.
- **Memory leak listener**: ogni `attachSwipeBack` ritorna `detach()`. Il piano dovrà identificare i punti in cui chiamarlo (al `remove()` dell'overlay).
- **Browser back-swipe di Chrome Android**: alcuni Chromium intercettano il gesto edge per la history. Con `touch-action: pan-y` e `preventDefault` su `pointermove` quando `dx > 5` dovrebbe restare con noi, ma va verificato sul dispositivo reale.

## File toccati

- **Nuovo:** `js/lib/swipe-back.js` (~60-80 righe).
- **Modificato:** `js/app.js` (`enableEdgeClose` ridotto a wrapper di 3 righe), `js/modules/giochi.js` (`wireModalSwipe` ridotto a wrapper di 3 righe).
- **Non modificato:** `js/modules/yahtzutra.js`, `js/ui.js`, `js/modules/strip.js`, `styles.css`.

## Related memories
- [[feedback-mockup-interattivi]] — non applicabile (no UI design)
- [[feedback-auto-push]] — niente commit/push senza OK
