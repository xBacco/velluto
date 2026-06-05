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
// (formato distinto da presence.tempoRelativo, voluto dalla spec; iso assente/invalido → '')
export function tempoRelativo(iso, now) {
  const t = new Date(iso);
  if (!iso || Number.isNaN(t.getTime())) return '';
  const diff = now.getTime() - t.getTime();
  if (diff < 60e3) return 'ora';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)}m`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)}h`;
  const ieri = new Date(now); ieri.setDate(ieri.getDate() - 1);
  if (t.toDateString() === ieri.toDateString()) return 'ieri';
  return `${Math.floor(diff / 86400e3)} gg fa`;
}
