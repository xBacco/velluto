// Home "porta-zoom + hub": macchina a 3 stati (#home HUD, #camera hub, sezione/pager).
// #home/#camera vivono qui; #app/pager vive in app.js. Navigazione cross-modulo via
// eventi: 'goto' (entra in sezione) e 'gohub' (torna all'hub). Best-effort: se una
// fonte dati fallisce si logga e quella parte si degrada, ma la stanza resta viva.

import { mk, add, clear, toast } from '../ui.js';
import {
  listGiri, listSlotMov, listBuoni, listDesideri, listEsperienze, listLuoghi, listFotoGalleria, getPartner,
  getInvitoAttivo, regenInvite,
} from '../store.js';
import {
  calcolaCalore, eventiCalore, PESI_CALORE, CALORE, riepilogoSezioni,
} from '../lib/logic.js';
import { isOnline, tempoRelativo, avviaHeartbeat } from '../lib/presence.js';

const $ = (id) => document.getElementById(id);

// Le 6 sezioni reali (key = key di TABS/goto in app.js) + la 7ª placeholder.
const SEZIONI = [
  { key: 'desideri',   em: '🔥', nm: 'fantasie',   c: '#ff6f3c' },
  { key: 'giochi',     em: '🎲', nm: 'giochi',     c: '#f2738f' },
  { key: 'calendario', em: '📅', nm: 'esperienze', c: '#ffb454' },
  { key: 'mappa',      em: '🗺️', nm: 'mappa',      c: '#7ee0a8' },
  { key: 'buoni',      em: '🎟️', nm: 'buoni',      c: '#e8455f' },
  { key: 'galleria',   em: '🖼️', nm: 'galleria',   c: '#9c2150' },
];
const TRAGUARDI = { key: 'traguardi', em: '🏅', nm: 'traguardi', c: '#ffb454' };
const SEC_BY_KEY = Object.fromEntries(SEZIONI.map(s => [s.key, s]));

// teaser per stato (scelto da novita; fallback 'none').
const TEASER = {
  desideri:   { hot: 'qualcosa di bollente ti aspetta…', warn: 'una fantasia in sospeso', none: 'lasciale una fantasia, stasera' },
  giochi:     { warn: 'hai giri da spendere, tenta la sorte', none: 'tira un dado, decide il caso' },
  calendario: { warn: 'qualcosa in arrivo sul calendario', none: 'segnate la prossima volta insieme' },
  mappa:      { hot: 'un posto nuovo da scoprire', none: 'i vostri posti, tutti qui' },
  buoni:      { warn: 'un buono sta per scadere, riscuotilo', hot: 'hai un buono da riscuotere', none: 'regalale un buono a sorpresa' },
  galleria:   { hot: "l'ultima polaroid è ancora calda", none: 'i vostri ricordi, tutti qui' },
};
function teaserDi(key, nov) { const t = TEASER[key] || {}; return t[nov] || t.none || ''; }

// LED novità → classe della logline HUD.
const LED_LOG = { hot: 'r', warn: 'g', none: 'n' };

// Etichette/emoji righe del pop-up calore.
const CALORE_LBL = {
  esperienza: "un'esperienza insieme", desiderio: 'una fantasia', buono: 'un buono',
  foto: 'una foto nuova', luogo: 'un luogo nuovo', gioco: 'un gioco giocato',
};
const CALORE_EMO = { esperienza: '📅', desiderio: '🔥', buono: '🎟️', foto: '🖼️', luogo: '🗺️', gioco: '🎲' };

let wired = false;
let busy = false;
let current = 'desideri';
let calore = null;           // ultimo calcolo { items, r, now }
let stopHeartbeat = null;    // avviato una sola volta
let riepilogo = [];          // ultimo riepilogoSezioni

function dispatch(name, detail) {
  document.dispatchEvent(new CustomEvent(name, detail != null ? { detail } : undefined));
}
function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; }

// ============ TRANSIZIONI HUD <-> CAMERA ============
function enterRoom() {
  if (busy) return; busy = true;
  const home = $('home'), camera = $('camera'), door = $('door'), doorway = $('doorway'), peeknote = $('peeknote');
  peeknote.classList.remove('show');
  door.classList.add('open');
  doorway.classList.add('opening');
  setTimeout(() => home.classList.add('dolly'), 360);
  setTimeout(() => camera.classList.add('in'), 780);
  setTimeout(() => { home.classList.add('hidden'); resetHub(); busy = false; }, 1300);
}
function exitRoom() {
  if (busy) return; busy = true;
  const home = $('home'), camera = $('camera'), door = $('door'), doorway = $('doorway'), peeknote = $('peeknote');
  camera.classList.remove('in');
  camera.classList.add('out');
  home.classList.remove('hidden');
  void home.offsetWidth;
  home.classList.remove('dolly');
  door.classList.remove('open');
  doorway.classList.remove('opening');
  setTimeout(() => { camera.classList.remove('out'); peeknote.classList.add('show'); busy = false; }, 900);
}
// Mostra la camera SENZA dolly (ritorno da una sezione via 'gohub').
function showCamera() {
  const home = $('home'), camera = $('camera');
  home.classList.add('hidden');
  home.classList.remove('dolly');
  camera.classList.remove('out');
  camera.classList.add('in');
  resetHub();
}
// Nasconde la camera (quando si entra in una sezione/pager).
function hideStates() {
  const camera = $('camera');
  camera.classList.remove('in');
  camera.classList.add('out');
}

// ============ HUB: porta in evidenza ============
function spawnEmbers() {
  if (reduceMotion()) return;
  const hero = $('hero'); const hr = hero.getBoundingClientRect();
  const ox = hr.left + hr.width * 0.5, oy = hr.top + hr.height * 0.82;
  for (let i = 0; i < 4; i++) {
    const p = mk('div', 'ember');
    p.style.left = ox + 'px'; p.style.top = oy + 'px';
    p.style.setProperty('--dx', ((i % 2 ? 1 : -1) * (10 + i * 8)) + 'px');
    p.style.setProperty('--dy', (-(20 + i * 8)) + 'px');
    document.getElementById('homeRoot').appendChild(p);
    setTimeout(() => p.remove(), 620);
  }
}
function etichettaCount(key, n) {
  if (key === 'giochi')     return n > 0 ? n + ' da giocare' : 'nessun giro';
  if (key === 'desideri')   return n > 0 ? n + (n > 1 ? ' nuove' : ' nuova') : 'nessuna nuova';
  if (key === 'buoni')      return n > 0 ? n + ' attivi' : 'nessuno attivo';
  if (key === 'calendario') return n > 0 ? n + ' in arrivo' : 'niente in agenda';
  if (key === 'mappa')      return n > 0 ? n + ' luoghi' : 'nessun luogo';
  if (key === 'galleria')   return n > 0 ? n + ' ricordi' : 'nessun ricordo';
  return String(n);
}
function paintHero(key) {
  const s = SEC_BY_KEY[key]; if (!s) return;
  const info = riepilogo.find(r => r.key === key) || { count: 0, novita: 'none' };
  const hero = $('hero');
  hero.classList.add('swap');
  spawnEmbers();
  setTimeout(() => {
    hero.style.setProperty('--accent', s.c);
    $('hSign').textContent = s.em;
    $('hTeaser').innerHTML = '<i>» ' + teaserDi(key, info.novita) + '</i>';
    $('hNm').textContent = s.nm;
    $('hSub').innerHTML = '<b>' + etichettaCount(key, info.count) + '</b>';
    $('heroEnter').style.setProperty('--accent', s.c);
    $('fNm').textContent = 'in evidenza · ' + s.em + ' ' + s.nm;
    $('fMeta').textContent = 'tocca il dock per cambiare';
    hero.classList.remove('swap');
  }, 150);
}
function selectSlot(key) {
  current = key;
  document.querySelectorAll('#dock .slot').forEach(x => x.classList.toggle('on', x.dataset.sec === key));
  paintHero(key);
}
function resetHub() { selectSlot('desideri'); }

// ============ DOCK ============
function buildDock() {
  const rail = $('dockRail'); clear(rail);
  [...SEZIONI, TRAGUARDI].forEach(s => {
    const b = mk('button', 'slot'); b.dataset.sec = s.key; b.style.setProperty('--accent', s.c);
    const ct = mk('span', 'ct zero', '·');
    const nv = mk('span', 'nv none');
    const arch = mk('span', 'arch'); arch.appendChild(mk('span', 'ico', s.em));
    add(b, ct, nv, arch, mk('span', 'lab', s.nm));
    b.onclick = () => onSlot(s.key);
    rail.appendChild(b);
  });
}
function onSlot(key) {
  if (key === 'traguardi') { apriTraguardi(); return; }
  if (key === current) { apriSezione(key); return; }   // 2ª toccata sulla porta attiva = entra
  selectSlot(key);
  const el = document.querySelector('#dock .slot[data-sec="' + key + '"]');
  if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function apriSezione(key) {
  if (key === 'traguardi') { apriTraguardi(); return; }
  const s = SEC_BY_KEY[key];
  $('fNm').textContent = 'apertura · ' + (s ? s.nm : key) + '…';
  $('fMeta').textContent = '';
  hideStates();
  dispatch('goto', key);
}
function apriTraguardi() { const pop = $('traguardiPop'); if (pop) pop.classList.add('open'); }

function applicaRiepilogoAlDock() {
  riepilogo.forEach(info => {
    const slot = document.querySelector('#dock .slot[data-sec="' + info.key + '"]');
    if (!slot) return;
    const ct = slot.querySelector('.ct'), nv = slot.querySelector('.nv');
    ct.textContent = info.count > 0 ? String(info.count) : '·';
    ct.classList.toggle('zero', info.count <= 0);
    nv.className = 'nv ' + info.novita;
  });
}
function buildNotifLog() {
  const box = $('notifLog'); clear(box);
  const badge = $('notifBadge');
  const attive = riepilogo.filter(r => r.novita !== 'none');
  if (!attive.length) {
    box.appendChild(mk('div', 'logline', '> tutto tranquillo, per ora'));
    badge.style.display = 'none';
    return;
  }
  badge.style.display = ''; badge.textContent = attive.length + (attive.length > 1 ? ' nuove' : ' nuova');
  const ORD = { hot: 0, warn: 1, none: 2 };
  attive.sort((a, b) => ORD[a.novita] - ORD[b.novita]).slice(0, 3).forEach(info => {
    const s = SEC_BY_KEY[info.key];
    const line = mk('button', 'logline');
    add(line,
      mk('span', 'led ' + LED_LOG[info.novita]),
      mk('span', 'txt', teaserDi(info.key, info.novita) + ' ' + s.em),
      mk('span', 'src', '~/' + s.nm));
    line.onclick = () => apriSezione(info.key);
    box.appendChild(line);
  });
}

// ============ PRESENZA ============
function aggiornaPresenza(partner) {
  const now = new Date();
  const online = !!partner && isOnline(partner.last_seen, now);
  const coupleHome = $('coupleHome'); if (coupleHome) coupleHome.classList.toggle('solo', !online);
  const coupleCam = $('coupleCam'); if (coupleCam) coupleCam.classList.toggle('solo', !online);
  $('camPresLabel').textContent = online ? 'online · insieme' : "lei non c'è ora";
  $('camLastSeen').textContent = partner ? tempoRelativo(partner.last_seen, now) : '—';
  const dot = $('camDot'); if (dot) dot.style.background = online ? 'var(--green)' : 'var(--off)';
}

// ============ ATTESA PARTNER (coppia non ancora completa) ============
// Banner discreto nella HUD: visibile solo finché esiste un codice invito attivo
// (non ancora usato) → cioè finché il partner non si è unito. Best-effort: un errore
// qui non deve rompere la home. `getInvitoAttivo` è il gate autoritativo (il codice
// attivo sparisce al pairing), quindi è più affidabile del solo `partner`.
async function renderAttesaPartner(client, me, partner) {
  const wrap = $('attesaWrap'), box = $('attesaBox');
  if (!wrap || !box) return;
  if (partner) { wrap.style.display = 'none'; clear(box); return; } // coppia completa
  let invito = null;
  try { invito = await getInvitoAttivo(client, me.couple_id); }
  catch (e) { console.error('[home] codice invito non disponibile:', e); }
  if (!invito) { wrap.style.display = 'none'; clear(box); return; }

  clear(box);
  wrap.style.display = '';
  const riga = mk('div', 'attesa-riga');
  add(riga, mk('span', 'led g'), mk('span', 'attesa-txt mono', 'condividi il codice per unire il partner'));
  const cod = mk('div', 'attesa-cod');
  add(cod, mk('code', 'attesa-code', invito.codice));
  const rig = mk('button', 'attesa-rig mono', '↻ rigenera');
  rig.onclick = async () => {
    rig.disabled = true;
    try {
      const nuovo = await regenInvite(client);
      toast('Nuovo codice: ' + nuovo, 'ok');
      await renderAttesaPartner(client, me, partner);
    } catch (e) { toast(e.message, 'err'); rig.disabled = false; }
  };
  add(cod, rig);
  add(box, riga, cod);
}

// ============ CALORE (gauge HUD + statusbar + pop-up) ============
async function caricaItemsCalore(client, coupleId) {
  const [esperienze, desideri, buoni, foto, luoghi, giri, slot] = await Promise.all([
    listEsperienze(client, coupleId), listDesideri(client, coupleId), listBuoni(client, coupleId),
    listFotoGalleria(client, coupleId), listLuoghi(client, coupleId),
    listGiri(client, coupleId), listSlotMov(client, coupleId),
  ]);
  return [
    ...esperienze.map(e => ({ tipo: 'esperienza', quando: e.data })),
    ...desideri.map(d => ({ tipo: 'desiderio', quando: d.creato })),
    ...buoni.map(b => ({ tipo: 'buono', quando: b.creato })),
    ...foto.map(f => ({ tipo: 'foto', quando: f.creato })),
    ...luoghi.map(l => ({ tipo: 'luogo', quando: l.data_evento || l.creato })),
    ...giri.filter(m => m.motivo === 'giro').map(m => ({ tipo: 'gioco', quando: m.creato })),
    ...slot.filter(m => m.motivo === 'tiro').map(m => ({ tipo: 'gioco', quando: m.creato })),
  ];
}
function contributiRecenti(items, now) {
  const ora = now.getTime();
  return items
    .filter(it => it.quando && PESI_CALORE[it.tipo] != null)
    .map(it => ({ tipo: it.tipo, t: new Date(it.quando).getTime() }))
    .filter(x => x.t <= ora && (ora - x.t) / 864e5 < CALORE.finestraGiorni)
    .sort((a, b) => b.t - a.t);
}
function fmtDelta(el, delta) {
  if (!el) return;
  const d = Math.round(delta);
  el.classList.remove('dn', 'fl');
  if (d > 0) el.textContent = '▲ +' + d;
  else if (d < 0) { el.classList.add('dn'); el.textContent = '▼ ' + d; }
  else { el.classList.add('fl'); el.textContent = '· stabile'; }
}
function renderHeatGauge(r) {
  const g = Math.round(r.gradi);
  $('heatFill').style.width = g + '%';
  $('heatVal').textContent = g + '°';
  fmtDelta($('heatUp'), r.delta);
  $('heatBtn').style.display = '';
  $('camHeatVal').textContent = g + '°';
  fmtDelta($('camHeatUp'), r.delta);
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
function renderHeatPop(items, r, now) {
  const big = $('hpBig'), body = $('hpBody'), h = $('hpH');
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
async function aggiornaCalore(client, me) {
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
    const h = $('heatBtn'); if (h) h.style.display = 'none';
  }
}

// ============ WIRING (una volta) ============
function wireOnce() {
  if (wired) return; wired = true;
  $('enterBtn').onclick = enterRoom;
  $('door').onclick = enterRoom;
  $('backBtn').onclick = exitRoom;
  $('heroEnter').onclick = () => apriSezione(current);
  $('hero').onclick = () => apriSezione(current);

  // pop-up calore (riapre l'ultimo calcolo, niente rifetch)
  const heatBtn = $('heatBtn'), heatPop = $('heatPop'), heatClose = $('heatClose');
  const openHeat = () => { if (!calore) return; heatPop.classList.add('open'); renderHeatPop(calore.items, calore.r, calore.now); };
  const closeHeat = () => heatPop.classList.remove('open');
  if (heatBtn) heatBtn.onclick = openHeat;
  if (heatClose) heatClose.onclick = closeHeat;
  const bd = heatPop.querySelector('.hp-backdrop'); if (bd) bd.onclick = closeHeat;

  // pop-up traguardi (placeholder)
  const tPop = $('traguardiPop'), tClose = $('traguardiClose');
  if (tClose) tClose.onclick = () => tPop.classList.remove('open');
  if (tPop) { const tb = tPop.querySelector('.hp-backdrop'); if (tb) tb.onclick = () => tPop.classList.remove('open'); }

  // navigazione cross-modulo
  document.addEventListener('gohub', showCamera);
  document.addEventListener('goto', hideStates);
}

export async function renderHome({ client, me }) {
  wireOnce();
  buildDock();

  $('homeMeAv').textContent = me.avatar || '🐻';
  $('peeknote').classList.add('show');

  // dati reali in parallelo (best-effort)
  let liste = null, partner = null;
  try {
    const [desideri, esperienze, buoni, foto, luoghi, giri, slot, p] = await Promise.all([
      listDesideri(client, me.couple_id),
      listEsperienze(client, me.couple_id),
      listBuoni(client, me.couple_id),
      listFotoGalleria(client, me.couple_id),
      listLuoghi(client, me.couple_id),
      listGiri(client, me.couple_id),
      listSlotMov(client, me.couple_id),
      getPartner(client, me.couple_id, me.id).catch(() => null),
    ]);
    liste = { desideri, esperienze, buoni, foto, luoghi, giri, slot };
    partner = p;
  } catch (e) {
    console.error('[home] dati non disponibili:', e);
  }

  riepilogo = liste ? riepilogoSezioni(liste, me, new Date()) : [];
  applicaRiepilogoAlDock();
  buildNotifLog();

  if (partner) $('homePartnerAv').textContent = partner.avatar || '🧁';
  aggiornaPresenza(partner);
  await renderAttesaPartner(client, me, partner);

  await aggiornaCalore(client, me);

  selectSlot('desideri');

  if (!stopHeartbeat) {
    try { stopHeartbeat = avviaHeartbeat({ client, me }); }
    catch (e) { console.error('[home] heartbeat non avviato:', e); }
  }
}
