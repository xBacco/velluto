import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  fetteRuota, estraiFetta, saldoGiri, puoGirare, giriEleggibile, ultimiPremi,
  ruotaContenutiDefaultRows, proposteDa, buoniSorpresaDa, pescaContenuto,
  segretiDaRivelare, applicaDoppio, LAMPO_TTL_MS, POLAROID_TTL_MS,
} from '../lib/logic.js';
import {
  listGiri, accreditaGiro, spendiGiro,
  listRuotaContenuti, seedRuotaContenuti, addRuotaContenuto, updateRuotaContenuto, deleteRuotaContenuto,
  listBuoni, addBuono, listDesideri,
  getFlagDoppio, setFlagDoppio,
  getPartner,
} from '../store.js';
import { FETTE } from '../lib/logic.js';
import { attachSwipeBack } from '../lib/swipe-back.js';
import { pushBack } from '../lib/back-stack.js';

let ctx = null;        // { client, me, panel }
let state = null;      // { mov, cont, buoni, proposte, buoniS, desideri, saldo, elegg, fette }
let busy = false;
let rot = 0;           // rotazione cumulativa della ruota (gradi)

// Geometria a 13 spicchi UGUALI (360/13 ≈ 27.692°). I pesi di FETTE servono
// solo per la probabilita' di estrazione; la larghezza visiva degli spicchi e'
// costante (vedi spec ridisegno 2026-05-29).

export async function renderRuota(context) {
  ctx = context;
  const { client, me } = ctx;

  let mov = await listGiri(client, me.couple_id);
  const elegg = giriEleggibile(mov, me.id);
  if (elegg.ok) {
    try {
      await accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'settimanale' });
      mov = await listGiri(client, me.couple_id);
    } catch { /* cosmetico: si riprova alla prossima apertura */ }
  }

  let cont = await listRuotaContenuti(client, me.couple_id);
  if (!cont.length) {
    await seedRuotaContenuti(client, ruotaContenutiDefaultRows(me.couple_id));
    cont = await listRuotaContenuti(client, me.couple_id);
  }

  const buoni = await listBuoni(client, me.couple_id);
  const desideri = await listDesideri(client, me.couple_id).catch(() => []);
  const proposte = proposteDa(cont), buoniS = buoniSorpresaDa(cont);
  const fette = fetteRuota({
    haSegreti: segretiDaRivelare(buoni, me.id).length > 0,
    haProposte: proposte.length > 0,
    haFantasie: desideri.filter(d => d.stato === 'da_provare').length > 0,
    haBuoni: buoniS.length > 0,
  });

  state = {
    mov, cont, buoni, proposte, buoniS, desideri,
    saldo: saldoGiri(mov, me.id), elegg: giriEleggibile(mov, me.id), fette,
  };
  draw();

  const flagDoppio = await getFlagDoppio(client, me.couple_id);
  if (flagDoppio) mostraBadgeX2(spinBtnEl);
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎡 Ruota a premi'),
    mk('p', 'psub', 'Spendi un giro, vinci un premio. Tocca ＋ per modificare proposte e buoni.'));

  const card = mk('div', 'giri-card');
  const left = mk('div');
  add(left, mk('p', 'k', 'I tuoi giri'));
  const coins = mk('div', 'coins');
  const n = Math.max(state.saldo, 0);
  if (n === 0) coins.appendChild(mk('span', 'coins-empty', 'nessun giro'));
  else for (let i = 0; i < n; i++) coins.appendChild(mk('span', 'coin full'));
  left.appendChild(coins);
  const right = mk('div', 'right');
  right.textContent = state.elegg.ok ? 'gratis disponibile' : 'gratis tra ' + giorniA(state.elegg.prossimoSblocco);
  add(card, left, right);
  p.appendChild(card);

  // Blocco coeso: ruota + toolbar (GIRA + "i") + storico-link. space-evenly
  // nel CSS distribuisce respiro automatico nei pixel residui, niente attaccati.
  const block = mk('div', 'wheel-block');
  block.appendChild(buildWheel());

  const btn = mk('button', 'btn ghost-gold ruota-spin', 'GIRA LA RUOTA');
  btn.disabled = !puoGirare(state.saldo);
  const cost = mk('span', 'cost'); cost.appendChild(mk('span', 'c'));
  btn.appendChild(cost);
  btn.onclick = spin;
  spinBtnEl = btn;
  const toolbar = mk('div', 'ruota-toolbar');
  toolbar.appendChild(btn);
  const infoBtn = mk('button', 'ruota-info-btn', 'i');
  infoBtn.title = 'Legenda dei premi';
  infoBtn.setAttribute('aria-label', 'Legenda dei premi');
  infoBtn.onclick = openLegenda;
  toolbar.appendChild(infoBtn);
  block.appendChild(toolbar);

  // Storico premi: link compatto che apre overlay con tab per utente
  const storicoLink = mk('button', 'storico-link');
  storicoLink.appendChild(mk('span', 'lab', '📜 Ultimi premi'));
  storicoLink.appendChild(mk('span', 'arr', '›'));
  storicoLink.setAttribute('aria-label', 'Apri lo storico premi');
  storicoLink.onclick = openStorico;
  block.appendChild(storicoLink);

  p.appendChild(block);

  // posizione emoji (translateY adattivo al raggio reale della ruota)
  placeEmojis();
  ensureWheelResizeObserver();
}

function giorniA(iso) {
  const giorni = Math.ceil((new Date(iso) - new Date()) / 864e5);
  return giorni <= 1 ? '1 giorno' : giorni + ' giorni';
}

// ---- badge ×2 helpers ----
function mostraBadgeX2(btn) {
  if (!btn || btn.querySelector('.ruota-x2-badge')) return;
  const b = document.createElement('span');
  b.className = 'ruota-x2-badge';
  b.textContent = 'PROSSIMO ×2';
  btn.style.position = 'relative';
  btn.appendChild(b);
}

function nascondiBadgeX2(btn) {
  btn?.querySelector('.ruota-x2-badge')?.remove();
}

// ---- ruota (emoji sempre dritte) ----
let wheelEl = null;
let winhiEl = null;
let spinBtnEl = null;

function buildWheel() {
  const wrap = mk('div', 'wheel-wrap');
  wrap.appendChild(mk('div', 'pointer'));
  const wheel = mk('div', 'wheel'); wheel.style.transform = `rotate(${rot}deg)`;
  const N = state.fette.length;
  const step = 360 / N;                                          // 27.692°

  // Solo il rotate dello spicchio qui; translateY lo applica placeEmojis()
  // in base al raggio reale (la ruota è responsive: min(340, 100vw-60)).
  state.fette.forEach((f, i) => {
    const center = i * step;
    const lbl = mk('div', 'slice-lbl');
    const inner = mk('div', 'in');
    inner.dataset.center = center;
    const e = mk('span', 'e' + (f.peso === 0 ? ' spenta' : '') + (f.rare ? ' rare' : ''), f.emoji);
    e.style.transform = `rotate(${-center - rot}deg)`;
    inner.appendChild(e); lbl.appendChild(inner); wheel.appendChild(lbl);
  });
  wrap.appendChild(wheel);
  // spotlight sullo spicchio vincente: overlay separato .winhi (larghezza fissa)
  winhiEl = mk('div', 'winhi');
  wrap.appendChild(winhiEl);
  wrap.appendChild(mk('div', 'hub', '💋'));
  wheelEl = wheel;
  return wrap;
}

// Posiziona ogni emoji al raggio corretto basandosi sulla dimensione reale del
// wheel. Chiamato dopo il mount e a ogni resize. Margine 52px ≈ "translateY
// originale di -98 quando ruota=300" (98+52 = 150 = raggio della ruota da 300).
function placeEmojis() {
  if (!wheelEl) return;
  const r = wheelEl.offsetWidth / 2 - 52;
  if (r <= 0) return;
  wheelEl.querySelectorAll('.slice-lbl .in').forEach(inner => {
    const center = Number(inner.dataset.center) || 0;
    inner.style.transform = `rotate(${center}deg) translateY(-${r}px)`;
  });
}

// ResizeObserver attached once: aggiorna placeEmojis se la ruota cambia size.
let wheelResizeObs = null;
function ensureWheelResizeObserver() {
  if (wheelResizeObs || !wheelEl || typeof ResizeObserver === 'undefined') return;
  wheelResizeObs = new ResizeObserver(() => placeEmojis());
  wheelResizeObs.observe(wheelEl);
}

async function spin() {
  if (busy || !puoGirare(state.saldo)) return;
  busy = true;
  if (winhiEl) winhiEl.classList.remove('on');

  const pick = estraiFetta(state.fette);
  if (!pick) { busy = false; toast('Nessun premio disponibile', 'err'); return; }
  try {
    await spendiGiro(ctx.client, { couple_id: ctx.me.couple_id, user_id: ctx.me.id, esito: pick.fetta.key });
  } catch (err) { busy = false; toast('Errore: ' + err.message, 'err'); return; }

  // Geometria fissa: tutti gli spicchi a 360/N gradi
  const N = state.fette.length;
  const step = 360 / N;
  const center = pick.indice * step;
  rot += 360 * 5 + ((360 - (rot % 360) - center) % 360 + 360) % 360;
  wheelEl.style.transform = `rotate(${rot}deg)`;
  wheelEl.querySelectorAll('.slice-lbl .e').forEach((e, i) => {
    e.style.transform = `rotate(${-(i * step) - rot}deg)`;
  });

  // Spotlight con larghezza costante (lo spicchio vincente illuminato, gli altri scuriti)
  if (winhiEl) {
    winhiEl.style.setProperty('--slice-w', step + 'deg');
    const half = step / 2;
    winhiEl.style.background =
      `conic-gradient(from ${-half}deg,` +
      `transparent 0 ${step}deg,` +
      `rgba(8,2,5,.74) ${step}deg 360deg)`;
  }

  // Leggi il flag ×2 prima della rotazione, così è già pronto al reveal
  const boostActive = await getFlagDoppio(ctx.client, ctx.me.couple_id);

  // dopo la rotazione (4.2s): accendi lo spotlight, poi mostra il pop-up
  setTimeout(() => {
    if (winhiEl) winhiEl.classList.add('on');
    setTimeout(() => { showPrize(pick.fetta, boostActive); busy = false; }, 600);
  }, 4300);
}

// ---- legenda (info button accanto a GIRA) ----
// Overlay centrato con i 13 premi raggruppati per probabilità (10% / 6,67% /
// 3,33%). Integrato col back-stack + edge-swipe (pattern di strip-ov).
function openLegenda() {
  const ov = mk('div', 'dadi-scrim ruota-legenda-ov');
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const teardown = () => {
    ov.classList.remove('show');
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 300);
  };
  const entry = pushBack(teardown);
  const close = () => { if (entry.alive) entry.close(); else teardown(); };
  attachSwipeBack(ov, close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  const box = mk('div', 'ruota-legenda');
  box.appendChild(mk('h3', null, 'Premi della ruota'));
  box.appendChild(mk('p', 'lg-sub', '13 spicchi · 3 categorie di rarità'));

  // pesi: 1 = comuni, 2/3 = medi, 1/3 = rari (cornice oro)
  const comuni = FETTE.filter(f => f.peso === 1);
  const medi   = FETTE.filter(f => f.peso > 0 && f.peso < 1 && !f.rare);
  const rari   = FETTE.filter(f => f.rare);
  box.appendChild(buildLegendaGroup('10%',   'Comuni', comuni, false));
  box.appendChild(buildLegendaGroup('6,67%', 'Medi',   medi,   false));
  box.appendChild(buildLegendaGroup('3,33%', 'Rari',   rari,   true));

  const closeBtn = mk('button', 'btn ghost-gold lg-close', 'Chiudi');
  closeBtn.onclick = close;
  box.appendChild(closeBtn);
  ov.appendChild(box);
}

function buildLegendaGroup(pct, name, fette, isRari) {
  const group = mk('div', 'lg-group');
  const head = mk('div', 'lg-group-head');
  head.appendChild(mk('span', 'pct', pct));
  head.appendChild(mk('span', 'nm', name));
  head.appendChild(mk('span', 'cnt', fette.length + ' fette'));
  group.appendChild(head);
  const grid = mk('div', 'lg-grid' + (isRari ? ' rari' : ''));
  fette.forEach(f => {
    const item = mk('div', 'lg-item' + (isRari ? ' rare' : ''));
    item.appendChild(mk('span', 'em', f.emoji));
    item.appendChild(mk('span', 'lbl', f.label));
    grid.appendChild(item);
  });
  group.appendChild(grid);
  return group;
}

// ---- storico premi (link "📜 Ultimi premi" sotto la toolbar) ----
// Overlay centrato con 2 tab (io / partner), ciascuna con la propria
// cronologia recente. Pattern back-stack + swipe-back come la legenda.
async function openStorico() {
  let partner = null;
  try { partner = await getPartner(ctx.client, ctx.me.couple_id, ctx.me.id); }
  catch { /* tollerante: l'overlay si apre lo stesso con tab partner disabilitata */ }

  const ov = mk('div', 'dadi-scrim ruota-storico-ov');
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const teardown = () => {
    ov.classList.remove('show');
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 300);
  };
  const entry = pushBack(teardown);
  const close = () => { if (entry.alive) entry.close(); else teardown(); };
  attachSwipeBack(ov, close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  const box = mk('div', 'ruota-storico-box');
  box.appendChild(mk('h3', null, 'Ultimi premi'));
  box.appendChild(mk('p', 'lg-sub', 'Cronologia recente · tap per cambiare utente'));

  const meAv = ctx.me.avatar || '🐻';
  const meNm = ctx.me.display_name || 'Io';
  const partnerAv = partner?.avatar || '🧁';
  const partnerNm = partner?.display_name || 'Lei';

  const tabs = mk('div', 'st-tabs');
  const btnMe = mk('button', 'on');
  btnMe.appendChild(mk('span', 'av', meAv));
  btnMe.appendChild(document.createTextNode(' ' + meNm));
  const btnLei = mk('button');
  btnLei.appendChild(mk('span', 'av', partnerAv));
  btnLei.appendChild(document.createTextNode(' ' + partnerNm));
  tabs.appendChild(btnMe); tabs.appendChild(btnLei);
  box.appendChild(tabs);

  const listMe  = buildStoricoList(ultimiPremi(state.mov, ctx.me.id, 8));
  const listLei = partner
    ? buildStoricoList(ultimiPremi(state.mov, partner.id, 8))
    : (function(){ const d = mk('div','st-list'); d.appendChild(mk('div','st-empty','Partner non disponibile')); return d; })();
  listLei.style.display = 'none';
  box.appendChild(listMe);
  box.appendChild(listLei);

  btnMe.onclick = () => {
    btnMe.classList.add('on'); btnLei.classList.remove('on');
    listMe.style.display = ''; listLei.style.display = 'none';
  };
  btnLei.onclick = () => {
    btnLei.classList.add('on'); btnMe.classList.remove('on');
    listMe.style.display = 'none'; listLei.style.display = '';
  };

  const closeBtn = mk('button', 'btn ghost-gold lg-close', 'Chiudi');
  closeBtn.onclick = close;
  box.appendChild(closeBtn);
  ov.appendChild(box);
}

function buildStoricoList(ups) {
  const list = mk('div', 'st-list');
  if (!ups.length) { list.appendChild(mk('div', 'st-empty', 'Nessun premio ancora')); return list; }
  for (const u of ups) {
    const row = mk('div', 'st-row');
    row.appendChild(mk('span', 'em', u.fetta ? u.fetta.emoji : '?'));
    row.appendChild(mk('span', 'lbl', u.fetta ? u.fetta.label : u.esito));
    row.appendChild(mk('span', 'dt', dataRelativa(u.creato)));
    list.appendChild(row);
  }
  return list;
}

function dataRelativa(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 36e5) return 'ora';
  const h = Math.floor(diff / 36e5);
  if (h < 24) return h + 'h fa';
  const g = Math.floor(h / 24);
  if (g === 1) return 'ieri';
  if (g < 7) return g + 'g fa';
  if (g < 30) return Math.floor(g / 7) + 'sett';
  return Math.floor(g / 30) + 'mesi';
}

// ---- pop-up premio (riusa .dadi-scrim per lo scroll-lock automatico) ----
function showPrize(fetta, boostActive) {
  const scrim = mk('div', 'ruota-reveal dadi-scrim');
  const stage = mk('div', 'stage'); stage.appendChild(mk('div', 'beam'));
  const card = mk('div', 'prize');
  add(card, mk('p', 'won', 'Hai vinto'), mk('div', 'big', fetta.emoji), mk('p', 'name', fetta.label));
  const body = mk('p', 'body'); card.appendChild(body);
  const row = mk('div', 'row');
  const azione = mk('button', 'btn solid');
  const chiudi = mk('button', 'btn ghost', 'Chiudi');
  const close = () => { scrim.remove(); if (winhiEl) winhiEl.classList.remove('on'); renderRuota(ctx); };
  chiudi.onclick = close;
  add(row, azione, chiudi); card.appendChild(row);
  stage.appendChild(card); scrim.appendChild(stage);
  scrim.onclick = e => { if (e.target === scrim) close(); };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
  risolvi(fetta, { body, azione, chiudi, scrim }, boostActive);
}

async function risolvi(fetta, ui, boostActive) {
  const { client, me } = ctx;
  ui.azione.style.display = 'none';

  // --- Casi idempotenti / deferred: NON consumano il flag ×2 ---

  // 'ancora': concede un giro extra, non consuma flag
  if (fetta.key === 'ancora') {
    ui.body.textContent = 'Giro gratis: ne hai guadagnato un altro!';
    accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'ancora' })
      .catch(err => toast('Errore: ' + err.message, 'err'));
    return;
  }

  // 'doppio': imposta flag, idempotente (Task 15) — non consuma flag
  if (fetta.key === 'doppio') {
    await setFlagDoppio(client, me.couple_id, true);
    mostraBadgeX2(spinBtnEl);
    ui.body.textContent = 'Il tuo prossimo premio sarà raddoppiato.';
    return;
  }

  // 'jackpot': doppio sub-spin — boost gestito alla fine della sequenza
  if (fetta.key === 'jackpot') return risolviJackpot(ui, boostActive);

  // --- Tutti gli altri esiti "veri": applica ×2 se attivo, poi consuma il flag ---
  const boost = boostActive ? applicaDoppio(fetta) : { boosted: false };
  await renderEsitoNormale(fetta, ui, boost);
  if (boostActive) {
    await setFlagDoppio(client, me.couple_id, false);
    nascondiBadgeX2(spinBtnEl);
  }
}

// Aggiorna il reveal DOM con classi/dati boost e delega gli effetti collaterali.
async function renderEsitoNormale(fetta, ui, boost) {
  const prizeEl = ui.body.closest('.prize');

  // Classe .boosted sul card
  prizeEl.classList.toggle('boosted', !!boost.boosted);

  // Banner DOPPIO! ×2 in cima al card
  prizeEl.querySelector('.x2-banner')?.remove();
  if (boost.boosted) {
    const b = document.createElement('div');
    b.className = 'x2-banner';
    b.textContent = 'DOPPIO! ×2';
    prizeEl.prepend(b);
  }

  // Chip ×2 accanto all'emoji nel .big
  const bigEl = prizeEl.querySelector('.big');
  bigEl.querySelector('.x2-chip')?.remove();
  bigEl.textContent = fetta.emoji;
  if (boost.boosted) {
    const c = document.createElement('span');
    c.className = 'x2-chip';
    c.textContent = '×2';
    bigEl.appendChild(c);
  }

  // Nome e body text
  prizeEl.querySelector('.name').textContent = fetta.label;
  ui.body.textContent = bodyText(fetta, boost);

  // Effetti differiti / azioni per-spicchio
  await applicaEffettoEsito(fetta, ui, boost);
  await persistEsito(fetta, boost, { user_id: ctx.me.id });
}

// Testo descrittivo del premio in funzione dello spicchio e del boost.
function bodyText(esito, boost) {
  if (esito.key === 'massaggio') return boost.boosted ? `${boost.minuti} minuti, dove preferisce chi ha vinto.` : '10 minuti, dove preferisce chi ha vinto.';
  if (esito.key === 'wild')      return boost.boosted ? `L'altro/a decide cosa farti per ${boost.ore} ore.`         : "L'altro/a decide cosa farti per 24h.";
  if (esito.key === 'orale')     return boost.boosted ? boost.testoExtra                                            : 'Quando vuole chi ha vinto.';
  if (esito.key === 'bendare')   return boost.boosted ? "Il doppio del tempo che decide l'altro/a."                 : "Lasciati bendare — l'altro/a decide quando finisce.";
  if (esito.key === 'lampo')     return boost.boosted ? '2 buoni a sorpresa, ciascuno vale 24h.'                    : 'Un buono pescato a sorpresa, vale 24h.';
  if (esito.key === 'polaroid')  return boost.boosted ? '2 foto osè da inviare entro 24h.'                          : 'Inviane una al partner entro 24 ore.';
  if (esito.key === 'segreto')   return boost.boosted ? 'Apri 2 buste segrete consecutive.'                         : 'Apri una busta segreta.';
  if (esito.key === 'piccante')  return boost.boosted ? '2 proposte piccanti da provare.'                           : 'Una proposta piccante da provare stasera.';
  if (esito.key === 'desiderio') return boost.boosted ? 'Pesca 2 fantasie dalla bacheca.'                           : 'Dalla bacheca delle cose da provare.';
  if (esito.key === 'jolly')     return 'Scegli tu il premio.';
  return '';
}

// Salva i premi differiti (polaroid, lampo) nel DB con scadenza_iso.
async function persistEsito(esito, boost, { user_id }) {
  const { client, me } = ctx;
  const coupleId = me.couple_id;
  const partnerUserId = await partnerId();

  if (esito.key === 'polaroid') {
    const quantita = boost.boosted ? 2 : 1;
    const scadenza_iso = new Date(Date.now() + POLAROID_TTL_MS).toISOString();
    for (let i = 0; i < quantita; i++) {
      await addBuono(client, {
        couple_id: coupleId, da_id: user_id, a_id: partnerUserId,
        emoji: '📸', titolo: 'Foto osè', descrizione: 'Inviane una al partner entro 24h',
        tipo: 'regalo', stato: 'attivo', scadenza_iso,
      });
    }
    return;
  }

  if (esito.key === 'lampo') {
    const quantita = boost.boosted ? 2 : 1;
    const scadenza_iso = new Date(Date.now() + LAMPO_TTL_MS).toISOString();
    const lista = state.cont.filter(c => c.categoria === 'buono');
    for (let i = 0; i < quantita; i++) {
      const pesca = lista[Math.floor(Math.random() * lista.length)];
      if (!pesca) continue;
      await addBuono(client, {
        couple_id: coupleId, da_id: user_id, a_id: partnerUserId,
        emoji: pesca.emoji || '🎟️', titolo: pesca.testo, descrizione: pesca.descrizione,
        tipo: 'regalo', stato: 'attivo', scadenza_iso,
      });
    }
    return;
  }
}

// Effetti collaterali per-spicchio (DB writes, bottoni azione).
async function applicaEffettoEsito(fetta, ui, boost) {
  const { client, me } = ctx;
  switch (fetta.key) {
    case 'piccante': {
      // bodyText già impostato da renderEsitoNormale; mostra la proposta pescata nel testo
      const pr = pescaContenuto(state.proposte);
      if (!boost.boosted) {
        ui.body.textContent = pr ? pr.testo : '—';
      } else {
        // boost.quantita === 2: pesca una seconda proposta
        const pr2 = pescaContenuto(state.proposte.filter(p => p !== pr));
        ui.body.textContent = pr && pr2 ? `${pr.testo} / ${pr2.testo}` : (pr ? pr.testo : '—');
      }
      break;
    }
    case 'desiderio': {
      const dp = (state.desideri || []).filter(d => d.stato === 'da_provare');
      if (!boost.boosted) {
        const d = pescaContenuto(dp);
        ui.body.textContent = d ? `Stasera: "${d.testo}".` : 'Aggiungi qualche desiderio da provare!';
      } else {
        // boost.quantita === 2: pesca due fantasie
        const d1 = pescaContenuto(dp);
        const d2 = pescaContenuto(dp.filter(d => d !== d1));
        if (d1 && d2) ui.body.textContent = `Stasera: "${d1.testo}" e "${d2.testo}".`;
        else if (d1)  ui.body.textContent = `Stasera: "${d1.testo}".`;
        else          ui.body.textContent = 'Aggiungi qualche desiderio da provare!';
      }
      break;
    }
    case 'dadi':
      ui.body.textContent = 'Tira i dadi! (vai al gioco Dadi)';
      break;
    case 'segreto':
      ui.azione.textContent = 'Scegli quale busta →';
      ui.azione.style.display = '';
      ui.azione.onclick = () => { ui.scrim.remove(); if (winhiEl) winhiEl.classList.remove('on'); apriSceltaSegreto(); };
      break;
    // 'massaggio', 'wild', 'orale', 'bendare', 'lampo', 'polaroid', 'jolly':
    // solo testo (già impostato da bodyText) — persistEsito gestisce i DB write
    default:
      break;
  }
}

// ---- jackpot: doppio sub-spin + summary ----

// Mostra il titolo "Jackpot — uno a testa" nel card esistente, poi risolve.
// STUB: nessuna animazione extra, solo aggiorna il testo del card.
// TODO: se in futuro si vorrà una transizione animate (fade/pulse), implementarla qui.
async function revealJackpotHeader(ui) {
  const prizeEl = ui.body.closest('.prize');
  prizeEl.querySelector('.won').textContent  = '💎 Jackpot!';
  prizeEl.querySelector('.big').textContent  = '💎';
  prizeEl.querySelector('.name').textContent = 'Uno a testa';
  ui.body.textContent = 'Due premi in arrivo…';
  // Breve pausa perché l'utente legga l'header prima dei sub-spin
  await new Promise(r => setTimeout(r, 900));
}

// Simula l'effetto di "spin verso uno spicchio" — STUB (la ruota vera è già ferma).
// TODO: se si vorrà ri-animare la ruota durante il jackpot, estrarre la logica da spin().
async function animaSpinVerso(_indice) {
  // Stub: piccola pausa che dà il senso di "estrazione in corso"
  await new Promise(r => setTimeout(r, 700));
}

async function risolviJackpot(ui, boostActive) {
  const { client, me } = ctx;

  // Prepara fette senza jackpot per i sub-spin
  const fetteBase = state.fette.map(f => f.key === 'jackpot' ? { ...f, peso: 0 } : f);

  // 1. Header jackpot
  await revealJackpotHeader(ui);

  // 2. Sub-spin per chi sta girando (Tomas 🐻)
  const sub1 = estraiFetta(fetteBase);
  await animaSpinVerso(sub1.indice);
  const boost1 = boostActive ? applicaDoppio(sub1.fetta) : { boosted: false };
  renderEsitoJackpot(sub1.fetta, boost1, { avatar: '🐻', name: 'Tomas' }, ui);
  await persistEsito(sub1.fetta, boost1, { user_id: me.id });
  await applicaEffettoEsito(sub1.fetta, ui, boost1);
  // Pausa perché l'utente legga il primo esito
  await new Promise(r => setTimeout(r, 1200));

  // 3. Sub-spin per il partner (morosa 🧁)
  // Eredita boost se il sub-spin 1 ha estratto 'doppio' (spec § 3.3)
  const boost2carry = sub1.fetta.key === 'doppio';
  const sub2 = estraiFetta(fetteBase);
  await animaSpinVerso(sub2.indice);
  const boost2 = (boostActive || boost2carry) ? applicaDoppio(sub2.fetta) : { boosted: false };
  renderEsitoJackpot(sub2.fetta, boost2, { avatar: '🧁', name: 'morosa' }, ui);
  await persistEsito(sub2.fetta, boost2, { user_id: await partnerId() });
  await applicaEffettoEsito(sub2.fetta, ui, boost2);

  // 4. Summary card
  renderJackpotSummary([
    { avatar: '🐻', who: 'Tomas',  esito: sub1.fetta },
    { avatar: '🧁', who: 'morosa', esito: sub2.fetta },
  ]);

  // 5. Consuma il flag ×2 (se attivo) dopo il secondo reveal
  if (boostActive) {
    await setFlagDoppio(client, me.couple_id, false);
    nascondiBadgeX2(spinBtnEl);
  }
}

// Aggiorna il card del reveal per mostrare l'esito di un sub-spin jackpot,
// indicando a chi spetta il premio (avatar + name).
// XSS-safety: avatar e name sono valori hardcoded ('🐻'/'🧁', 'Tomas'/'morosa') — safe per innerHTML.
function renderEsitoJackpot(esito, boost, partner, ui) {
  const prizeEl = ui.body.closest('.prize');
  prizeEl.classList.add('jackpot');
  prizeEl.classList.toggle('boosted', !!boost.boosted);

  // Striscia "Premio di <name>"
  prizeEl.querySelector('.turn-strip')?.remove();
  const strip = document.createElement('div');
  strip.className = 'turn-strip';
  strip.innerHTML = `<span class="av">${partner.avatar}</span><span>Premio di ${partner.name}</span>`;
  prizeEl.prepend(strip);

  // Aggiorna emoji, label e body text (riusa lo stesso pattern di renderEsitoNormale)
  prizeEl.querySelector('.x2-banner')?.remove();
  if (boost.boosted) {
    const b = document.createElement('div');
    b.className = 'x2-banner';
    b.textContent = 'DOPPIO! ×2';
    // Inserisci dopo .turn-strip
    strip.insertAdjacentElement('afterend', b);
  }
  const bigEl = prizeEl.querySelector('.big');
  bigEl.querySelector('.x2-chip')?.remove();
  bigEl.textContent = esito.emoji;
  if (boost.boosted) {
    const c = document.createElement('span');
    c.className = 'x2-chip';
    c.textContent = '×2';
    bigEl.appendChild(c);
  }
  prizeEl.querySelector('.name').textContent = esito.label;
  ui.body.textContent = bodyText(esito, boost);
}

// Aggiunge una summary card sotto il reveal con i due premi estratti.
// XSS-safety: avatar, who e esito.emoji/label sono tutti valori hardcoded/da FETTE — safe per innerHTML.
function renderJackpotSummary(pairs) {
  // Evita duplicati se chiamata più volte
  document.querySelector('.ruota-jackpot-summary')?.remove();
  const el = document.createElement('div');
  el.className = 'ruota-jackpot-summary';
  el.innerHTML = `
    <div class="ti">💎 Jackpot — riepilogo</div>
    ${pairs.map(p => `
      <div class="pair">
        <div class="av">${p.avatar}</div>
        <div class="who">${p.who}</div>
        <div class="prz"><span class="em">${p.esito.emoji}</span><span>${p.esito.label}</span></div>
      </div>
    `).join('')}
  `;
  // Aggiungi dopo la .stage (dentro lo scrim del reveal)
  const stage = document.querySelector('.ruota-reveal .stage');
  if (stage) stage.appendChild(el);
  else document.querySelector('.ruota-page')?.appendChild(el);
}

async function partnerId() {
  const { data, error } = await ctx.client.from('couples')
    .select('membro_a,membro_b').eq('id', ctx.me.couple_id).single();
  if (error) throw new Error(error.message);
  return data.membro_a === ctx.me.id ? data.membro_b : data.membro_a;
}

function apriSceltaSegreto() {
  document.dispatchEvent(new CustomEvent('goto', { detail: 'buoni' }));
}

// ---- editor contenuti (stesso pattern dei Dadi) ----
// Monta l'editor dei contenuti Ruota dentro a `host`.
// Usato sia dal FAB + in pagina Giochi (via openEditorRuota) sia dall'hub
// "Contenuti dei giochi" in Impostazioni. onSaved: callback opzionale.
// La Ruota salva on-blur (rigaEditor) — onSaved è qui per uniformità API.
export async function renderRuotaEditorInto(host, context, onSaved) {
  if (!ctx || ctx.client !== context.client) ctx = context;
  if (!state) state = {};                                       // hub Impostazioni può aprire l'editor senza essere passato per renderRuota
  state.cont = await listRuotaContenuti(ctx.client, ctx.me.couple_id);

  clear(host);
  add(host, mk('p', 'muted', 'Proposte piccanti (🔥) e buoni a sorpresa (🎁). Modificabili in qualsiasi momento.'));
  sezioneEditor(host, 'piccante', '🔥 Proposte piccanti');
  sezioneEditor(host, 'buono', '🎁 Buoni a sorpresa');

  if (onSaved) host._onSaved = onSaved;
}

export function openEditorRuota() {
  openSheet('Modifica i contenuti della Ruota', async s => {
    await renderRuotaEditorInto(s, ctx);
  });
}

function sezioneEditor(s, categoria, titolo) {
  s.appendChild(mk('div', 'section-label', titolo));
  const items = state.cont.filter(c => c.categoria === categoria).sort((a, b) => a.ordine - b.ordine);
  for (const it of items) s.appendChild(rigaEditor(it, categoria));
  const addBtn = mk('button', 'btn', '＋ Aggiungi');
  addBtn.onclick = async () => {
    try {
      const ordine = items.length;
      await addRuotaContenuto(ctx.client, {
        couple_id: ctx.me.couple_id, categoria,
        emoji: categoria === 'buono' ? '🎁' : null,
        testo: categoria === 'buono' ? 'Nuovo buono' : 'Nuova proposta',
        descrizione: categoria === 'buono' ? '' : null, ordine,
      });
      await refreshEditor(s);
    } catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  s.appendChild(addBtn);
}

function rigaEditor(it, categoria) {
  const row = mk('div', 'ruota-edit-row');
  let emInput = null;
  if (categoria === 'buono') { emInput = mk('input', 'em'); emInput.value = it.emoji || ''; emInput.maxLength = 4; row.appendChild(emInput); }
  const tx = mk('input'); tx.value = it.testo; tx.placeholder = categoria === 'buono' ? 'titolo' : 'proposta';
  row.appendChild(tx);
  let dsInput = null;
  if (categoria === 'buono') { dsInput = mk('input'); dsInput.value = it.descrizione || ''; dsInput.placeholder = 'descrizione'; row.appendChild(dsInput); }
  const save = async () => {
    if (!tx.value.trim()) { toast('Il testo non può essere vuoto', 'err'); return; }
    try {
      await updateRuotaContenuto(ctx.client, it.id, {
        emoji: emInput ? emInput.value.trim() : null,
        testo: tx.value.trim(),
        descrizione: dsInput ? dsInput.value.trim() : null,
      });
    } catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  tx.onchange = save; if (emInput) emInput.onchange = save; if (dsInput) dsInput.onchange = save;
  const del = mk('button', 'icon-del', '🗑'); del.onclick = async () => {
    try { await deleteRuotaContenuto(ctx.client, it.id); row.remove(); state.cont = state.cont.filter(c => c.id !== it.id); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  row.appendChild(del);
  return row;
}

async function refreshEditor(host) {
  // Se siamo dentro un modal (FAB +), chiudilo e riapri il sheet.
  // Se siamo inline (hub Impostazioni), re-renderizza nello stesso host.
  const modal = host.closest && host.closest('.modal');
  if (modal) {
    modal.remove();
    openEditorRuota();
  } else {
    await renderRuotaEditorInto(host, ctx);
  }
}
