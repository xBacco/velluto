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
