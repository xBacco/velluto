// Back-stack — rende il gesto "indietro" del telefono (tasto back o swipe dal
// bordo, che su Android sono la stessa cosa a livello di sistema) chiudere
// l'overlay in cima invece di uscire dall'app.
//
// Perche' serve: su WebView/Chrome Android l'edge-swipe e' intercettato dal
// sistema come navigazione "indietro" PRIMA che il JS lo veda; `touch-action`
// e `preventDefault` non bastano a fermarlo. La soluzione robusta (stessa di
// gym-schedule) e' registrare una voce di history all'apertura: cosi' il back
// fa scattare `popstate` e noi lo intercettiamo per chiudere l'overlay.
//
// Uso:
//   const entry = pushBack(() => realClose());   // all'apertura dell'overlay
//   entry.close();                               // chiusura in-app (bottone/swipe)
//
// `entry.close()` e il gesto back passano ENTRAMBI per `popstate` → la
// callback `onClose` viene eseguita una sola volta (il flag `alive` protegge
// dai doppi trigger, es. OS-back + pointer-swipe insieme).
//
// Lo stack e' LIFO: con overlay annidati, il back chiude sempre il piu'
// interno. L'utility NON anima ne' rimuove il nodo: e' compito di `onClose`.

const stack = [];
let wired = false;

function ensureWired() {
  if (wired) return;
  wired = true;
  window.addEventListener('popstate', () => {
    // Il back ha consumato una voce di history: chiudi l'overlay in cima.
    const entry = stack.pop();
    if (entry && entry.alive) {
      entry.alive = false;
      entry.onClose();
    }
  });
}

export function pushBack(onClose) {
  ensureWired();
  const entry = { onClose, alive: true, close: closeEntry };
  stack.push(entry);
  history.pushState({ backStack: stack.length }, '');
  return entry;
}

function closeEntry() {
  // `this` === entry. Se e' ancora viva ed e' in cima allo stack, torna
  // indietro: sara' `popstate` a eseguire `onClose`. Cosi' tasto-back, swipe e
  // bottone in-app fanno tutti la stessa identica cosa.
  if (!this.alive) return;
  if (stack[stack.length - 1] === this) {
    history.back();                       // → popstate → onClose
  } else {
    // Non in cima (caso non raggiunto nei flussi attuali): smonta diretto
    // senza toccare la history, per non chiudere l'overlay sopra.
    this.alive = false;
    const i = stack.indexOf(this);
    if (i !== -1) stack.splice(i, 1);
    this.onClose();
  }
}
