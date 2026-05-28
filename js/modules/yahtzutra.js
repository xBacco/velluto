import { mk, add, clear, toast, openSheet } from '../ui.js';
import { accreditaGiro, getPartner } from '../store.js';

// ---------------------------------------------------------------------------
// Yahtzutra — Yahtzee a tema spicy (13 caselle, 2 giocatori pass-the-phone)
// Stato vive in memoria. Le azioni custom delle 13 caselle vivono in
// localStorage per couple_id. La partita NON è persistita su Supabase.
// Al primo Yahtzutra registrato accreditiamo +1 giro alla Ruota (motivo 'gioco').
// ---------------------------------------------------------------------------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const DEFAULT_AZ = {
  n1: 'sfioro lieve col dito', n2: 'bacio leggero', n3: 'bacio profondo',
  n4: 'morso leggero', n5: 'succhiotto', n6: 'morso intenso',
  tris: '30s massaggio dove vuoi', poker: '1 min mani libere',
  full: 'carta a sorpresa', scap: 'spogli un capo a scelta',
  scag: 'scegli la posizione', yz: 'JACKPOT · 1 giro Ruota', ch: 'azione libera',
};

const CASELLE = [
  { key: 'n1', nome: 'Solo 1', val: 'somma degli 1' },
  { key: 'n2', nome: 'Solo 2', val: 'somma dei 2' },
  { key: 'n3', nome: 'Solo 3', val: 'somma dei 3' },
  { key: 'n4', nome: 'Solo 4', val: 'somma dei 4' },
  { key: 'n5', nome: 'Solo 5', val: 'somma dei 5' },
  { key: 'n6', nome: 'Solo 6', val: 'somma dei 6' },
  '--',
  { key: 'tris', nome: 'Tris', val: 'somma totale (3 uguali)' },
  { key: 'poker', nome: 'Poker', val: 'somma totale (4 uguali)' },
  { key: 'full', nome: 'Full', val: '25 pts (3+2)' },
  { key: 'scap', nome: 'Scala piccola', val: '30 pts (4 consec.)' },
  { key: 'scag', nome: 'Scala grande', val: '40 pts (5 consec.)' },
  { key: 'yz', nome: 'Yahtzutra', val: '50 pts (5 uguali)' },
  { key: 'ch', nome: 'Chance', val: 'somma totale' },
];

const NUM_KEYS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
const JOKER_KEYS = ['full', 'scap', 'scag', 'ch'];
const JOKER_PTS = { full: 25, scap: 30, scag: 40 };
const BONUS_SOGLIA = 63;
const BONUS_VALORE = 35;
const YZ_EXTRA = 100;

// stato (in memoria, ricreato a ogni renderYahtzutra)
let ctx = null;
let azioni = { ...DEFAULT_AZ };
let players = null;      // { lui:{key,nome,avatar}, lei:{key,nome,avatar} }
let currentPlayer = null; // 'lui' | 'lei'
let dice = [1, 2, 3, 4, 5];
let held = [false, false, false, false, false];
let tiriUsati = 0;
let filled = null;
let totale = null;
let yzCount = null;
let cadConfermaAttiva = false;
let gameOver = false;
let rolling = false;
let pendingRegistra = null;
let jackpotConcessoGiri = false; // l'accredito al store avviene una volta sola per partita per giocatore

function azKey() { return 'yz-azioni-' + ctx.me.couple_id; }
function loadAzioni() {
  try {
    const raw = localStorage.getItem(azKey());
    if (raw) azioni = { ...DEFAULT_AZ, ...JSON.parse(raw) };
    else azioni = { ...DEFAULT_AZ };
  } catch { azioni = { ...DEFAULT_AZ }; }
}
function saveAzioni() {
  try { localStorage.setItem(azKey(), JSON.stringify(azioni)); } catch { /* quota */ }
}

function buildPlayers(partner) {
  // 'lui' = utente loggato (ctx.me); 'lei' = partner.
  // I label "lui/lei" sono interni: la UI usa avatar + display_name reali del DB.
  const me = ctx.me;
  const a = { key: 'lui', nome: me.display_name || 'Tu', avatar: me.avatar || '🐻' };
  const b = { key: 'lei', nome: (partner && partner.display_name) || 'Partner', avatar: (partner && partner.avatar) || '🧁' };
  players = { lui: a, lei: b };
}

function resetGame() {
  filled = { lui: {}, lei: {} };
  totale = { lui: 0, lei: 0 };
  yzCount = { lui: 0, lei: 0 };
  dice = [1, 2, 3, 4, 5];
  held = [false, false, false, false, false];
  tiriUsati = 0;
  cadConfermaAttiva = false;
  gameOver = false;
  rolling = false;
  pendingRegistra = null;
  jackpotConcessoGiri = false;
  currentPlayer = 'lui';
}

function other(p) { return p === 'lui' ? 'lei' : 'lui'; }
function counts() { const c = [0, 0, 0, 0, 0, 0, 0]; dice.forEach(x => c[x]++); return c; }
function maxRep() { return Math.max(...counts().slice(1)); }
function sumDice() { return dice.reduce((a, b) => a + b, 0); }
function isYahtzeeRoll() { return maxRep() >= 5; }
function isJokerActive(player) {
  return isYahtzeeRoll() && (filled[player].yz !== undefined && filled[player].yz > 0);
}
function totaleNumeriRegistrati(player) {
  return NUM_KEYS.reduce((s, k) => s + (filled[player][k] || 0), 0);
}
function bonus35(player) {
  return totaleNumeriRegistrati(player) >= BONUS_SOGLIA ? BONUS_VALORE : 0;
}
function bonusYzExtra(player) {
  return Math.max(0, yzCount[player] - 1) * YZ_EXTRA;
}

function punteggio(key, player) {
  player = player || currentPlayer;
  const c = counts();
  if (isJokerActive(player) && JOKER_KEYS.includes(key)) {
    if (key === 'ch') return sumDice();
    return JOKER_PTS[key];
  }
  switch (key) {
    case 'n1': return c[1] * 1;
    case 'n2': return c[2] * 2;
    case 'n3': return c[3] * 3;
    case 'n4': return c[4] * 4;
    case 'n5': return c[5] * 5;
    case 'n6': return c[6] * 6;
    case 'tris': return maxRep() >= 3 ? sumDice() : 0;
    case 'poker': return maxRep() >= 4 ? sumDice() : 0;
    case 'full': return (c.includes(3) && c.includes(2)) ? 25 : 0;
    case 'scap': {
      const set = new Set(dice);
      return [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some(s => s.every(n => set.has(n))) ? 30 : 0;
    }
    case 'scag': {
      const set = new Set(dice);
      return [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]].some(s => s.every(n => set.has(n))) ? 40 : 0;
    }
    case 'yz': return maxRep() >= 5 ? 50 : 0;
    case 'ch': return sumDice();
  }
  return 0;
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
export async function renderYahtzutra(context) {
  ctx = context;
  loadAzioni();
  let partner = null;
  try { partner = await getPartner(ctx.client, ctx.me.couple_id, ctx.me.id); } catch { /* tollerante */ }
  buildPlayers(partner);
  if (!filled) resetGame();
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎲 Yahtzutra'),
    mk('p', 'psub', '2 giocatori, pass-the-phone · 13 caselle · 3 tiri per turno'));

  // score row
  const row = mk('div', 'yz-score-row');
  for (const k of ['lui', 'lei']) {
    const card = mk('div', 'yz-score' + (currentPlayer === k ? ' on' : ''));
    const who = mk('span', 'who');
    who.appendChild(document.createTextNode(players[k].avatar + ' ' + players[k].nome));
    const turnL = mk('span', 'turn-label', 'turno');
    who.appendChild(turnL);
    card.appendChild(who);
    card.appendChild(mk('span', 'pts', String(totale[k])));
    row.appendChild(card);
  }
  p.appendChild(row);

  // launch button
  const launchRow = mk('div', 'yz-launch-row');
  const launch = mk('button', 'btn gold yz-launch');
  launch.appendChild(mk('span', 'e', '🎲'));
  launch.appendChild(document.createTextNode(' Lancia i dadi'));
  launch.onclick = openTable;
  launchRow.appendChild(launch);

  // pulsanti utility
  const utils = mk('div', 'yz-utils');
  const cmp = mk('button', 'yz-util-btn', '📊');
  cmp.title = 'Confronto cartelle';
  cmp.onclick = openConfronto;
  const set = mk('button', 'yz-util-btn', '⚙');
  set.title = 'Impostazioni azioni';
  set.onclick = openImpostazioni;
  add(utils, cmp, set);

  p.appendChild(launchRow);
  p.appendChild(utils);

  // strip dadi (solo se cadConfermaAttiva)
  const strip = mk('div', 'yz-strip-wrap'); strip.id = 'yz-strip-wrap';
  p.appendChild(strip);
  renderStrip();

  // scheda
  const scheda = mk('div', 'yz-scheda'); scheda.id = 'yz-scheda';
  p.appendChild(scheda);
  renderScheda();
}

function renderStrip() {
  const wrap = document.getElementById('yz-strip-wrap');
  if (!wrap) return;
  clear(wrap);
  if (!cadConfermaAttiva) return;
  const strip = mk('div', 'yz-strip');
  const mini = mk('div', 'mini');
  for (let i = 0; i < 5; i++) mini.appendChild(makeDie(dice[i], true, false));
  strip.appendChild(mini);
  strip.onclick = openZoom;
  wrap.appendChild(strip);
}

function makeDie(val, tiny, isHeld) {
  const d = mk('div', 'yz-die' + (tiny ? ' tiny' : '') + (isHeld ? ' held' : ''));
  for (let i = 0; i < 9; i++) d.appendChild(mk('div', 'pip' + (PIPS[val].includes(i) ? ' on' : '')));
  return d;
}

function buildBonusBanner(player) {
  const somma = totaleNumeriRegistrati(player);
  const done = somma >= BONUS_SOGLIA;
  const pct = Math.min(100, Math.round(somma / BONUS_SOGLIA * 100));
  const b = mk('div', 'yz-bonus' + (done ? ' done' : ''));
  const lbl = mk('div', 'lbl');
  if (done) {
    lbl.appendChild(document.createTextNode('Bonus sezione numeri · '));
    lbl.appendChild(mk('b', null, '+' + BONUS_VALORE));
  } else {
    lbl.appendChild(document.createTextNode('Bonus numeri: '));
    lbl.appendChild(mk('b', null, somma + '/' + BONUS_SOGLIA));
    lbl.appendChild(document.createTextNode(' → +' + BONUS_VALORE));
  }
  const bar = mk('div', 'bar');
  const fill = mk('i'); fill.style.width = pct + '%';
  bar.appendChild(fill);
  add(b, lbl, bar);
  return b;
}

function renderScheda() {
  const wrap = document.getElementById('yz-scheda');
  if (!wrap) return;
  clear(wrap);
  const fmap = filled[currentPlayer];
  const jokerOn = cadConfermaAttiva && isJokerActive(currentPlayer);
  for (const item of CASELLE) {
    if (item === '--') {
      wrap.appendChild(buildBonusBanner(currentPlayer));
      wrap.appendChild(mk('div', 'yz-divider', '— combinazioni —'));
      continue;
    }
    const isFilled = fmap[item.key] !== undefined;
    const pts = isFilled ? fmap[item.key] : punteggio(item.key);
    const showPoss = !isFilled && cadConfermaAttiva && pts > 0;
    const canClick = !isFilled && cadConfermaAttiva;
    const showJoker = !isFilled && jokerOn && JOKER_KEYS.includes(item.key);
    const div = mk('div', 'yz-casella'
      + (isFilled ? ' filled' : '')
      + (showPoss ? ' poss' : '')
      + (canClick ? ' click' : ''));
    const nome = mk('div', 'nome');
    nome.appendChild(document.createTextNode(item.nome));
    if (showJoker) nome.appendChild(mk('span', 'joker-hint', 'JOKER'));
    const az = mk('div', 'azione', '→ ' + (azioni[item.key] || item.val));
    const p = mk('div', 'pts', (isFilled || showPoss) ? String(pts) : '—');
    add(div, nome, az, p);
    if (canClick) div.onclick = () => registra(item, pts);
    wrap.appendChild(div);
  }
}

// ---------------------------------------------------------------------------
// TAVOLO (popup dadi)
// ---------------------------------------------------------------------------
let tableScrim = null;

function openTable() {
  if (gameOver) { toast('Partita finita: tocca Nuova partita.', 'info'); return; }
  closeTable();
  const scrim = mk('div', 'yz-scrim yz-table-scrim dadi-scrim');
  const sheet = mk('div', 'yz-table');
  const handle = mk('div', 'yz-handle');
  handle.appendChild(mk('div', 'line'));
  handle.appendChild(mk('div', 'txt', '🎲 Tavolo · ' + players[currentPlayer].avatar + ' ' + players[currentPlayer].nome));
  const close = mk('span', 'close', '✕');
  close.onclick = closeTable;
  handle.appendChild(close);
  sheet.appendChild(handle);

  sheet.appendChild(mk('p', 'yz-tiri', 'Tiro 1 di 3'));
  const felt = mk('div', 'yz-felt');
  felt.appendChild(mk('div', 'rim'));
  const stage = mk('div', 'stage'); stage.id = 'yz-stage';
  felt.appendChild(stage);
  sheet.appendChild(felt);

  sheet.appendChild(mk('p', 'yz-hint', 'Tappa i dadi per tenerli prima del prossimo tiro'));
  const ctrls = mk('div', 'yz-ctrls');
  const reroll = mk('button', 'btn ghost yz-reroll', 'Ri-tira');
  const confirm = mk('button', 'btn gold yz-confirm', 'Fermati e segna');
  reroll.onclick = roll;
  confirm.onclick = () => { closeTable(); cadConfermaAttiva = true; renderScheda(); renderStrip(); };
  add(ctrls, reroll, confirm);
  sheet.appendChild(ctrls);

  scrim.appendChild(sheet);
  scrim.onclick = e => { if (e.target === scrim) closeTable(); };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
  tableScrim = scrim;

  renderStage(false);
  updateCtrls();
  setTimeout(roll, 380);
}

function closeTable() {
  if (tableScrim) { tableScrim.remove(); tableScrim = null; }
}

function renderStage(animate) {
  const stage = document.getElementById('yz-stage');
  if (!stage) return;
  clear(stage);
  for (let i = 0; i < 5; i++) {
    const d = makeDie(dice[i], false, held[i]);
    if (animate && !held[i]) {
      d.classList.add('rolling');
      d.style.setProperty('--from-x', ((Math.random() * 180 - 90) | 0) + 'px');
      d.style.setProperty('--from-r', ((Math.random() * 720 - 360) | 0) + 'deg');
    }
    d.onclick = () => {
      if (rolling) return;
      if (tiriUsati === 0) return;
      if (tiriUsati >= 3) return;
      held[i] = !held[i];
      renderStage(false);
      updateCtrls();
    };
    stage.appendChild(d);
  }
}

function updateCtrls() {
  if (!tableScrim) return;
  const reroll = tableScrim.querySelector('.yz-reroll');
  const confirm = tableScrim.querySelector('.yz-confirm');
  const label = tableScrim.querySelector('.yz-tiri');
  const hint = tableScrim.querySelector('.yz-hint');
  if (!reroll) return;
  label.textContent = 'Tiro ' + tiriUsati + ' di 3';
  const heldN = held.filter(Boolean).length;
  const toRoll = 5 - heldN;
  if (tiriUsati >= 3) {
    reroll.disabled = true;
    reroll.textContent = 'Ri-tira';
    hint.textContent = 'Tiri esauriti — Fermati e segna';
  } else {
    reroll.disabled = (toRoll === 0) || rolling;
    reroll.textContent = 'Ri-tira (' + toRoll + ')';
    hint.textContent = heldN === 0
      ? 'Tieni i dadi che ti piacciono · ' + (3 - tiriUsati) + ' tiri rimasti'
      : heldN + ' dad' + (heldN === 1 ? 'o' : 'i') + ' tenut' + (heldN === 1 ? 'o' : 'i') + ' · ' + (3 - tiriUsati) + ' rimasti';
  }
  confirm.disabled = (tiriUsati === 0) || rolling;
  confirm.textContent = (tiriUsati === 3) ? 'Vai a segnare' : 'Fermati e segna';
}

function roll() {
  if (rolling || tiriUsati >= 3) return;
  rolling = true;
  for (let i = 0; i < 5; i++) if (!held[i]) dice[i] = 1 + Math.floor(Math.random() * 6);
  tiriUsati++;
  renderStage(true);
  updateCtrls();
  setTimeout(() => {
    rolling = false;
    updateCtrls();
    cadConfermaAttiva = true;
    renderScheda();
    renderStrip();
    if (tiriUsati >= 3) setTimeout(closeTable, 600);
  }, 1000);
}

// ---------------------------------------------------------------------------
// REGISTRA + SACRIFICIO + JACKPOT + FINE PARTITA
// ---------------------------------------------------------------------------
function hasAltreOpzioniPositive(item) {
  return CASELLE.some(it => {
    if (it === '--') return false;
    if (it.key === item.key) return false;
    if (filled[currentPlayer][it.key] !== undefined) return false;
    return punteggio(it.key) > 0;
  });
}

function registra(item, pts) {
  if (pts === 0 && hasAltreOpzioniPositive(item)) {
    pendingRegistra = { item, pts };
    openSacrificio(item);
    return;
  }
  doRegistra(item, pts);
}

function openSacrificio(item) {
  const scrim = mk('div', 'yz-scrim yz-sac-scrim dadi-scrim');
  const card = mk('div', 'yz-sac');
  add(card,
    mk('div', 'em', '⚠'),
    mk('h3', 'tit', 'Sacrifica ' + item.nome + '?'));
  const sub = mk('p', 'sub');
  sub.appendChild(document.createTextNode('Registrerai '));
  sub.appendChild(mk('b', null, '0 punti'));
  sub.appendChild(document.createTextNode(' su questa casella.'));
  sub.appendChild(mk('br'));
  sub.appendChild(document.createTextNode('Hai altre caselle dove faresti punti.'));
  card.appendChild(sub);
  const btns = mk('div', 'btns');
  const cancel = mk('button', 'btn ghost sm', 'Annulla');
  const ok = mk('button', 'btn sm yz-danger', 'Sacrifica');
  cancel.onclick = () => { scrim.remove(); pendingRegistra = null; };
  ok.onclick = () => {
    scrim.remove();
    if (pendingRegistra) {
      const { item: it, pts: p } = pendingRegistra;
      pendingRegistra = null;
      doRegistra(it, p);
    }
  };
  add(btns, cancel, ok);
  card.appendChild(btns);
  scrim.appendChild(card);
  scrim.onclick = e => { if (e.target === scrim) { scrim.remove(); pendingRegistra = null; } };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
}

function doRegistra(item, pts) {
  closeTable();

  let extra = 0, jackpot = false, jokerUsed = false;
  if (item.key === 'yz' && pts > 0) {
    yzCount[currentPlayer]++;
    if (yzCount[currentPlayer] === 1) jackpot = true;
    else extra = YZ_EXTRA;
  } else if (isJokerActive(currentPlayer) && JOKER_KEYS.includes(item.key)) {
    jokerUsed = true;
  }

  const beforeNum = totaleNumeriRegistrati(currentPlayer);
  filled[currentPlayer][item.key] = pts;
  const afterNum = totaleNumeriRegistrati(currentPlayer);
  const bonusJustEarned = beforeNum < BONUS_SOGLIA && afterNum >= BONUS_SOGLIA;

  totale[currentPlayer] += pts + extra;
  if (bonusJustEarned) totale[currentPlayer] += BONUS_VALORE;

  cadConfermaAttiva = false;
  held = [false, false, false, false, false];
  tiriUsati = 0;

  if (jackpot) {
    flashJackpot();
    concediGiroAllaRuota(currentPlayer); // chiama store
    toast('🎡 JACKPOT! 1 giro Ruota concesso a ' + players[currentPlayer].nome, 'info');
  }
  if (extra > 0) toast('🔥 Secondo Yahtzutra · +' + extra + ' bonus!', 'info');
  if (bonusJustEarned) setTimeout(() => toast('🏅 Bonus +' + BONUS_VALORE + ' sezione numeri raggiunto!', 'info'), jackpot ? 1400 : 0);

  // re-render scheda/score subito (mostra il nuovo totale)
  updateTotalsInDom();

  if (isGameOver()) {
    setTimeout(openFinePartita, 700 + (jackpot ? 1200 : 0));
    return;
  }

  const showPass = () => openPass(item, pts, extra, jokerUsed);
  if (jackpot) setTimeout(showPass, 1500);
  else showPass();
}

function updateTotalsInDom() {
  const scoreCards = ctx.panel.querySelectorAll('.yz-score');
  if (scoreCards.length === 2) {
    scoreCards[0].querySelector('.pts').textContent = String(totale.lui);
    scoreCards[1].querySelector('.pts').textContent = String(totale.lei);
  }
  renderStrip();
  renderScheda();
}

function isGameOver() {
  const count = p => CASELLE.filter(it => it !== '--' && filled[p][it.key] !== undefined).length;
  return count('lui') === 13 && count('lei') === 13;
}

async function concediGiroAllaRuota(playerKey) {
  if (jackpotConcessoGiri) return;
  // chi sta giocando ora = ctx.me (chi ha il telefono). Per ora accreditiamo a chi vince
  // il yahtzutra "lato giocatore corrente". Nel pass-the-phone è sempre ctx.me.
  try {
    await accreditaGiro(ctx.client, {
      couple_id: ctx.me.couple_id,
      user_id: ctx.me.id,
      motivo: 'gioco',
    });
    jackpotConcessoGiri = true;
  } catch (err) {
    toast('Giro non accreditato: ' + err.message, 'err');
  }
}

function flashJackpot() {
  let f = document.getElementById('yz-jackpot-flash');
  if (!f) {
    f = mk('div', 'yz-jackpot-flash');
    f.id = 'yz-jackpot-flash';
    document.body.appendChild(f);
  }
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 1500);
}

// ---------------------------------------------------------------------------
// PASS-THE-PHONE
// ---------------------------------------------------------------------------
function openPass(item, pts, extra, jokerUsed) {
  const next = other(currentPlayer);
  const scrim = mk('div', 'yz-scrim yz-pass-scrim dadi-scrim');
  const card = mk('div', 'yz-pass');
  add(card,
    mk('div', 'em', players[next].avatar),
    mk('h3', 'tit', 'Passa il telefono'),
    mk('p', 'sub', 'a ' + players[next].nome));
  const recap = mk('div', 'recap');
  recap.appendChild(document.createTextNode('Hai segnato '));
  recap.appendChild(mk('b', null, item.nome));
  if (jokerUsed) {
    const j = mk('b', null, ' (joker)');
    j.style.color = 'var(--gold)';
    recap.appendChild(j);
  }
  recap.appendChild(document.createTextNode(' · '));
  recap.appendChild(mk('b', null, (pts + extra) + ' pts'));
  recap.appendChild(mk('br'));
  const sp = mk('span', 'az', azioni[item.key] || '');
  recap.appendChild(sp);
  card.appendChild(recap);
  const btn = mk('button', 'btn gold', 'Inizia turno');
  btn.onclick = () => {
    scrim.remove();
    currentPlayer = next;
    draw();
  };
  card.appendChild(btn);
  scrim.appendChild(card);
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
}

// ---------------------------------------------------------------------------
// ZOOM DADI
// ---------------------------------------------------------------------------
function openZoom() {
  const scrim = mk('div', 'yz-scrim yz-zoom-scrim dadi-scrim');
  const card = mk('div', 'yz-zoom');
  add(card, mk('h3', 'tit', 'I tuoi dadi'));
  const row = mk('div', 'dice');
  for (let i = 0; i < 5; i++) row.appendChild(makeDie(dice[i], false, false));
  card.appendChild(row);
  const close = mk('button', 'btn ghost sm', 'Chiudi');
  close.onclick = () => scrim.remove();
  card.appendChild(close);
  scrim.appendChild(card);
  scrim.onclick = e => { if (e.target === scrim) scrim.remove(); };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
}

// ---------------------------------------------------------------------------
// CONFRONTO CARTELLE
// ---------------------------------------------------------------------------
function openConfronto() {
  openSheet('📊 Confronto cartelle', s => {
    const totals = mk('div', 'yz-cmp-totals');
    for (const k of ['lui', 'lei']) {
      const t = mk('div', 'yz-cmp-total' + (totale[k] > totale[other(k)] ? ' win' : ''));
      t.appendChild(mk('div', 'nm', players[k].avatar + ' ' + players[k].nome));
      t.appendChild(mk('div', 'pt', String(totale[k])));
      totals.appendChild(t);
    }
    s.appendChild(totals);

    const grid = mk('div', 'yz-cmp-grid');
    for (const t of ['Casella', players.lui.avatar + ' ' + players.lui.nome, players.lei.avatar + ' ' + players.lei.nome]) {
      grid.appendChild(mk('div', 'cell head', t));
    }
    for (const item of CASELLE) {
      if (item === '--') {
        grid.appendChild(mk('div', 'cell sep', 'combinazioni'));
        continue;
      }
      grid.appendChild(mk('div', 'cell lab', item.nome));
      for (const k of ['lui', 'lei']) {
        const v = filled[k][item.key];
        const c = mk('div', 'cell' + (v === undefined ? ' empty' : ''));
        c.textContent = v === undefined ? '—' : String(v);
        grid.appendChild(c);
      }
    }
    s.appendChild(grid);
  });
}

// ---------------------------------------------------------------------------
// IMPOSTAZIONI AZIONI
// ---------------------------------------------------------------------------
function openImpostazioni() {
  openSheet('⚙ Impostazioni Yahtzutra', s => {
    s.appendChild(mk('p', 'muted', 'Personalizza l\'azione abbinata a ogni casella. Le modifiche valgono per la prossima partita.'));
    const dirty = {};
    for (const item of CASELLE) {
      if (item === '--') {
        s.appendChild(mk('div', 'section-label', '— combinazioni —'));
        continue;
      }
      const row = mk('div', 'yz-set-row');
      const head = mk('div', 'h');
      head.appendChild(mk('div', 'nm', item.nome));
      head.appendChild(mk('div', 'val', item.val));
      const ta = mk('textarea');
      ta.value = azioni[item.key] || '';
      ta.placeholder = 'Azione abbinata...';
      ta.oninput = () => { dirty[item.key] = ta.value.trim(); };
      add(row, head, ta);
      s.appendChild(row);
    }
    const btns = mk('div', 'yz-set-btns');
    const reset = mk('button', 'btn ghost sm', 'Ripristina default');
    const save = mk('button', 'btn gold sm', 'Salva');
    reset.onclick = () => {
      azioni = { ...DEFAULT_AZ };
      saveAzioni();
      s.closest('.modal').remove();
      openImpostazioni();
      toast('Ripristinate le azioni di default', 'info');
    };
    save.onclick = () => {
      Object.assign(azioni, dirty);
      saveAzioni();
      s.closest('.modal').remove();
      renderScheda();
      toast('Salvato · le azioni sono aggiornate', 'info');
    };
    add(btns, reset, save);
    s.appendChild(btns);
  });
}

// ---------------------------------------------------------------------------
// FINE PARTITA
// ---------------------------------------------------------------------------
function openFinePartita() {
  gameOver = true;
  const tt = totale.lui, tg = totale.lei;
  let winner = null;
  if (tt > tg) winner = 'lui';
  else if (tg > tt) winner = 'lei';

  const scrim = mk('div', 'yz-scrim yz-end-scrim dadi-scrim');
  const sheet = mk('div', 'yz-end');
  add(sheet,
    mk('div', 'crown', winner ? '👑' : '🤝'),
    mk('h3', 'tit', winner ? 'Vince ' + players[winner].nome : 'Pareggio!'));
  const sub = mk('p', 'sub');
  if (winner) {
    sub.appendChild(document.createTextNode('con '));
    sub.appendChild(mk('b', null, totale[winner] + ' punti'));
  } else {
    sub.appendChild(document.createTextNode('entrambi a '));
    sub.appendChild(mk('b', null, tt + ' punti'));
  }
  sheet.appendChild(sub);

  const totals = mk('div', 'yz-end-totals');
  for (const k of ['lui', 'lei']) {
    const c = mk('div', 'yz-end-total' + (winner === k ? ' win' : ''));
    c.appendChild(mk('div', 'nm', players[k].avatar + ' ' + players[k].nome));
    c.appendChild(mk('div', 'pt', String(totale[k])));
    totals.appendChild(c);
  }
  sheet.appendChild(totals);

  // breakdown
  const br = mk('div', 'yz-end-break');
  const sezioni = [
    ['Sezione numeri (1-6)',
      NUM_KEYS.reduce((s, k) => s + (filled.lui[k] || 0), 0),
      NUM_KEYS.reduce((s, k) => s + (filled.lei[k] || 0), 0),
      false],
    ['Bonus +35', bonus35('lui'), bonus35('lei'), true],
    ['Combinazioni',
      CASELLE.filter(it => it !== '--' && !NUM_KEYS.includes(it.key) && it.key !== 'yz')
        .reduce((s, it) => s + (filled.lui[it.key] || 0), 0),
      CASELLE.filter(it => it !== '--' && !NUM_KEYS.includes(it.key) && it.key !== 'yz')
        .reduce((s, it) => s + (filled.lei[it.key] || 0), 0),
      false],
    ['Yahtzutra (×' + yzCount.lui + ' / ×' + yzCount.lei + ')',
      (filled.lui.yz || 0) + bonusYzExtra('lui'),
      (filled.lei.yz || 0) + bonusYzExtra('lei'),
      yzCount.lui > 1 || yzCount.lei > 1],
  ];
  for (const [lab, vL, vR, gold] of sezioni) {
    const row = mk('div', 'row');
    row.appendChild(mk('span', 'lab', lab));
    const v = mk('span', 'vs');
    v.appendChild(mk('span', 'v' + (gold ? ' bn' : ''), String(vL)));
    v.appendChild(mk('span', 'v' + (gold ? ' bn' : ''), String(vR)));
    row.appendChild(v);
    br.appendChild(row);
  }
  const totRow = mk('div', 'row tot');
  totRow.appendChild(mk('span', 'lab', 'Totale'));
  const vTot = mk('span', 'vs');
  vTot.appendChild(mk('span', 'v', String(tt)));
  vTot.appendChild(mk('span', 'v', String(tg)));
  totRow.appendChild(vTot);
  br.appendChild(totRow);
  sheet.appendChild(br);

  const btns = mk('div', 'yz-end-btns');
  const close = mk('button', 'btn ghost', 'Solo guardare');
  const nuova = mk('button', 'btn gold', 'Nuova partita');
  close.onclick = () => scrim.remove();
  nuova.onclick = () => {
    scrim.remove();
    resetGame();
    draw();
    toast('Nuova partita · tocca a ' + players.lui.avatar + ' ' + players.lui.nome, 'info');
  };
  add(btns, close, nuova);
  sheet.appendChild(btns);
  scrim.appendChild(sheet);
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
}
