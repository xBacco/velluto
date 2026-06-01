// Home "stanza": schermata a sé. Niente nav bar (compare solo entrando in
// una sezione). Mostra le notifiche di cosa "ti aspetta stasera" come chip
// fluttuanti nella stanza, con conteggi REALI, e un FAB che apre il menù
// delle sezioni. La navigazione avviene via evento 'goto' (vedi app.js).

import { mk, add, clear } from '../ui.js';
import { listGiri, listSlotMov, listBuoni, listDesideri, listEsperienze, listLuoghi, listFotoGalleria } from '../store.js';
import { saldoGiri, saldoSlot, buoniRicevuti, calcolaCalore, eventiCalore, CALORE, PESI_CALORE } from '../lib/logic.js';

const $ = (id) => document.getElementById(id);

// Ultimo calore calcolato { items, r, now }, per riaprire il pop-up senza rifetch.
let calore = null;

// Etichette/emoji per le righe del pop-up calore (lato utente).
const CALORE_LBL = {
  esperienza: "un'esperienza insieme", desiderio: 'una fantasia', buono: 'un buono',
  foto: 'una foto nuova', luogo: 'un luogo nuovo', gioco: 'un gioco giocato',
};
const CALORE_EMO = { esperienza: '📅', desiderio: '🔥', buono: '🎟️', foto: '🖼️', luogo: '🗺️', gioco: '🎲' };

// Le sezioni del menù (stesse di TABS in app.js).
const SEZIONI = [
  ['desideri',   '🔥', 'Fantasie'],
  ['giochi',     '🎲', 'Giochi'],
  ['calendario', '📅', 'Esperienze'],
  ['mappa',      '🗺️', 'Mappa'],
  ['buoni',      '🎟️', 'Buoni'],
  ['galleria',   '🖼️', 'Galleria'],
];

let wired = false;

function goto(sezione) {
  document.dispatchEvent(new CustomEvent('goto', { detail: sezione }));
}

// "martedì notte · siamo solo noi"
function kicker(now = new Date()) {
  const giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const h = now.getHours();
  const momento = h < 6 ? 'notte' : h < 12 ? 'mattino' : h < 18 ? 'pomeriggio' : h < 23 ? 'sera' : 'notte';
  return giorni[now.getDay()] + ' ' + momento + ' · siamo solo noi';
}

function chip({ emoji, titolo, sotto, count, sezione }) {
  const c = mk('button', 'home-chip');
  const ic = mk('span', 'home-chip-ic', emoji);
  ic.appendChild(mk('span', 'ring'));
  const tx = mk('span', 'home-chip-tx');
  add(tx, mk('b', null, titolo), mk('i', null, sotto));
  add(c, ic, tx);
  if (count > 0) c.appendChild(mk('span', 'home-chip-n', String(count)));
  c.onclick = () => goto(sezione);
  return c;
}

async function caricaNotifiche(client, me) {
  // Best-effort: se una fonte fallisce, lancia (no fallimento silenzioso).
  const [giri, slot, buoni, desideri] = await Promise.all([
    listGiri(client, me.couple_id),
    listSlotMov(client, me.couple_id),
    listBuoni(client, me.couple_id),
    listDesideri(client, me.couple_id),
  ]);

  const nGiri = saldoGiri(giri, me.id);
  const nSlot = saldoSlot(slot, me.id);
  const nBuoni = buoniRicevuti(buoni, me.id).filter(b => b.stato === 'attivo').length;
  // "nuove fantasie" = proposte dalla partner ancora da provare
  const nFantasie = desideri.filter(d => d.autore_id !== me.id && d.stato === 'da_provare').length;

  const out = [];
  if (nGiri > 0)     out.push({ emoji: '🎡', titolo: nGiri > 1 ? 'Giri di ruota' : 'Un giro di ruota', sotto: nGiri > 1 ? 'pronti da girare' : 'pronto da girare', count: nGiri, sezione: 'giochi' });
  if (nSlot > 0)     out.push({ emoji: '🎰', titolo: nSlot > 1 ? 'Giri di slot' : 'Un giro di slot', sotto: nSlot > 1 ? 'pronti da tirare' : 'pronto da tirare', count: nSlot, sezione: 'giochi' });
  if (nFantasie > 0) out.push({ emoji: '🔥', titolo: nFantasie > 1 ? 'Nuove fantasie' : 'Una nuova fantasia', sotto: '«non te l’aspetti…»', count: nFantasie, sezione: 'desideri' });
  if (nBuoni > 0)    out.push({ emoji: '🎟️', titolo: nBuoni > 1 ? 'Buoni per te' : 'Un buono per te', sotto: 'da riscattare', count: nBuoni, sezione: 'buoni' });
  return out;
}

// ---- CALORE di coppia (reale) ----
// Sorgenti → eventi [{tipo, quando}]. QUALI righe e QUALE timestamp sono scelte qui
// (placeholder calibrati a occhio, vedi PESI_CALORE in logic.js — da verificare sui dati reali).
async function caricaItemsCalore(client, coupleId) {
  const [esperienze, desideri, buoni, foto, luoghi, giri, slot] = await Promise.all([
    listEsperienze(client, coupleId),
    listDesideri(client, coupleId),
    listBuoni(client, coupleId),
    listFotoGalleria(client, coupleId),
    listLuoghi(client, coupleId),
    listGiri(client, coupleId),
    listSlotMov(client, coupleId),
  ]);
  return [
    ...esperienze.map(e => ({ tipo: 'esperienza', quando: e.data })),
    ...desideri.map(d => ({ tipo: 'desiderio', quando: d.creato })),
    ...buoni.map(b => ({ tipo: 'buono', quando: b.creato })),
    ...foto.map(f => ({ tipo: 'foto', quando: f.creato })),
    ...luoghi.map(l => ({ tipo: 'luogo', quando: l.data_evento || l.creato })),
    // un "gioco" = un giro di ruota o un tiro di slot effettivamente giocato
    ...giri.filter(m => m.motivo === 'giro').map(m => ({ tipo: 'gioco', quando: m.creato })),
    ...slot.filter(m => m.motivo === 'tiro').map(m => ({ tipo: 'gioco', quando: m.creato })),
  ];
}

// Gesti dentro la finestra, dal più recente: alimentano "cos'ha acceso la brace".
function contributiRecenti(items, now) {
  const ora = now.getTime();
  return items
    .filter(it => it.quando && PESI_CALORE[it.tipo] != null)
    .map(it => ({ tipo: it.tipo, t: new Date(it.quando).getTime() }))
    .filter(x => x.t <= ora && (ora - x.t) / 864e5 < CALORE.finestraGiorni)
    .sort((a, b) => b.t - a.t);
}

function fmtDelta(el, delta, { conOggi = false } = {}) {
  const d = Math.round(delta);
  const suff = conOggi ? ' oggi' : '';
  if (d > 0) { el.className = el.className.replace(/\b(dn|fl)\b/g, '').trim(); el.textContent = '▲ +' + d + suff; }
  else if (d < 0) { el.classList.add('dn'); el.textContent = '▼ ' + d + suff; }
  else { el.classList.add('fl'); el.textContent = '· stabile'; }
}

function renderHeatGauge(r) {
  const g = Math.round(r.gradi);
  $('homeHeatFill').style.width = g + '%';
  $('homeHeatVal').textContent = g + '°';
  const up = $('homeHeatUp'); up.className = 'hh-up'; fmtDelta(up, r.delta);
  $('homeHeat').style.display = '';
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
function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; }
function renderHeatPop(items, r, now) {
  const big = $('homeHpBig'), body = $('homeHpBody'), h = $('homeHpH');
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

function buildRadial(radial) {
  clear(radial);
  SEZIONI.forEach(([k, e, l]) => {
    const item = mk('button', 'home-ritem');
    add(item, mk('span', 'nm', l), mk('span', 'ic', e));
    item.onclick = () => goto(k);
    radial.appendChild(item);
  });
}

function wireOnce() {
  if (wired) return; wired = true;
  const fab = $('homeFab'), radial = $('homeRadial'), scrim = $('homeScrim');
  const coach = $('homeCoach'), help = $('homeHelp'), pins = $('homePins'), wlab = $('homeWlab'), heat = $('homeHeat');
  const openMenu = () => { fab.classList.add('open'); radial.classList.add('on'); scrim.classList.add('on'); pins.classList.add('dim'); if (wlab) wlab.classList.add('dim'); if (heat) heat.classList.add('dim'); };
  const closeMenu = () => { fab.classList.remove('open'); radial.classList.remove('on'); scrim.classList.remove('on'); pins.classList.remove('dim'); if (wlab) wlab.classList.remove('dim'); if (heat) heat.classList.remove('dim'); };
  fab.onclick = () => fab.classList.contains('open') ? closeMenu() : openMenu();
  scrim.onclick = closeMenu;
  if (coach && help) {
    help.onclick = () => coach.classList.remove('hide');
    coach.onclick = () => { coach.classList.add('hide'); try { localStorage.setItem('brace:home-coach-visto', '1'); } catch (_) {} };
  }

  // pop-up calore: si riapre dall'ultimo calcolo (`calore`), niente rifetch
  const heatPop = $('homeHeatPop'), heatClose = $('homeHeatClose');
  if (heat && heatPop) {
    const openHeat = () => { if (!calore) return; heatPop.classList.add('open'); renderHeatPop(calore.items, calore.r, calore.now); };
    const closeHeat = () => heatPop.classList.remove('open');
    heat.onclick = openHeat;
    if (heatClose) heatClose.onclick = closeHeat;
    const backdrop = heatPop.querySelector('.hp-backdrop');
    if (backdrop) backdrop.onclick = closeHeat;
  }
}

export async function renderHome({ client, me }) {
  wireOnce();
  buildRadial($('homeRadial'));

  // saluto + profilo
  $('homeKick').textContent = kicker();
  const meChip = $('homeMeChip'); clear(meChip);
  add(meChip, mk('span', null, me.avatar || '🐻'), mk('span', null, me.display_name || 'Tu'));

  // coach: solo al primo avvio
  const coach = $('homeCoach');
  let visto = false;
  try { visto = localStorage.getItem('brace:home-coach-visto') === '1'; } catch (_) {}
  if (coach) coach.classList.toggle('hide', visto);

  // calore di coppia (reale). Best-effort: se una fonte fallisce, log + niente gauge,
  // ma la home resta viva (il calore è un di più, non deve bloccare la stanza).
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
    const heat = $('homeHeat'); if (heat) heat.style.display = 'none';
  }

  // notifiche reali
  const pins = $('homePins'); clear(pins);
  const wlab = $('homeWlab');
  const items = await caricaNotifiche(client, me);
  if (!items.length) {
    if (wlab) wlab.style.display = 'none';
    pins.appendChild(mk('div', 'home-calmo', 'Tutto tranquillo, per ora.\nApri una stanza con ＋'));
    return;
  }
  if (wlab) wlab.style.display = '';
  items.forEach((it, i) => {
    const wrap = mk('div', 'home-pin home-pin-' + (i % 4));
    wrap.appendChild(chip(it));
    pins.appendChild(wrap);
  });
}
