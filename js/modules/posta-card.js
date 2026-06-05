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
  if (evento.hand) righe.push(`<div class="hand">"${esc(evento.hand)}"</div>`);
  if (evento.pill) righe.push(`<div class="pill">${esc(evento.pill)}</div>`);
  if (evento.daLei && evento.quandoISO) {
    righe.push(`<div class="meta"><span class="who">${esc(autoreLabel)}</span> · ${esc(tempoRelativo(evento.quandoISO, now))}</div>`);
  }
  const dot = evento.nuovo ? '<span class="dot">●</span>' : '';
  return `<article class="fc${evento.nuovo ? ' nuova' : ''}" style="--accent:${ACCENT[evento.tipo]}"` +
    ` data-tipo="${esc(evento.tipo)}" data-sezione="${esc(evento.sezioneKey)}">` +
    `<span class="lead">${esc(evento.emoji)}</span><div class="bx">${righe.join('')}</div>${dot}</article>`;
}
