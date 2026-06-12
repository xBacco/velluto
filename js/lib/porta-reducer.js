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
