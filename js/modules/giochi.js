import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  DADI_ORDER, DADI_LABEL, DADI_CHIP, raggruppaFacce, facceDefaultRows, tiraDadi, componiFrase,
  ECONOMIA_SLOT, saldoSlot, slotEleggibile,
} from '../lib/logic.js';
import { listDadiFacce, seedDadiFacce, updateDadiFaccia, listSlotMov, accreditaSlot, spendiSlot } from '../store.js';
import { renderRuota, openEditorRuota } from './ruota.js';
import { renderStrip, hasActiveGame as stripHasActiveGame, closeOv as closeStripOv } from './strip.js';
import { renderYahtzutra, hasActiveGame as yzHasActiveGame } from './yahtzutra.js';
import { attachSwipeBack } from '../lib/swipe-back.js';
import { pushBack } from '../lib/back-stack.js';

let giocoCorrente = 'dadi';   // 'dadi' | 'ruota'
let ctx = null;          // { client, me, panel }
let dadiHost = null;     // nodo in cui montare i Dadi (sotto al selettore)
let facce = null;        // { az:[6], co:[6], lu:[6] } dal DB
let attivi = { az: true, co: true, lu: true };
let wired = false;
let busy = false;
const reels = {};        // dado -> { wrap, strip }

// altezza in px di una singola faccia del rullo (deve coincidere con .slot-reel-face in styles.css)
const FACE_H = 120;

export async function renderGiochi(context) {
  ctx = context;
  if (!wired) {
    document.addEventListener('fab:giochi', () => {
      if (giocoCorrente === 'dadi') openEditor();
      else if (giocoCorrente === 'ruota') openEditorRuota();
    });
    document.addEventListener('giochi:tabs-refresh', refreshSelettore);
    wired = true;
  }
  drawSelettore();
  await montaGiocoCorrente();
}

function drawSelettore() {
  const p = ctx.panel; clear(p);
  p.appendChild(buildSelettore());
  p.appendChild(mk('div', 'gioco-host'));
}

function refreshSelettore() {
  if (!ctx) return;
  const existing = ctx.panel.querySelector('.giochi-nav');
  if (existing) existing.replaceWith(buildSelettore());
}

function makeTab(k, ico, lbl) {
  const b = mk('button', 'gioco-tab' + (giocoCorrente === k ? ' on' : ''));
  add(b, mk('span', 'ico', ico), mk('span', 'lab', lbl));
  if (k === 'yz' && yzHasActiveGame()) b.appendChild(mk('span', 'gt-badge'));
  if (k === 'strip' && stripHasActiveGame()) b.appendChild(mk('span', 'gt-badge'));
  b.onclick = () => {
    if (k === 'yz') { renderYahtzutra({ client: ctx.client, me: ctx.me }); return; }
    if (k === 'strip') { renderStrip({ client: ctx.client, me: ctx.me }); return; }
    giocoCorrente = k;
    renderGiochi(ctx);
  };
  return b;
}

function buildSelettore() {
  const wrap = mk('div', 'giochi-nav');

  const labTempo = mk('p', 'gruppo-lab', 'Giochi a tempo');
  const dockTempo = mk('div', 'gioco-selettore'); dockTempo.dataset.gruppo = 'tempo';
  dockTempo.appendChild(makeTab('ruota', '🎡', 'Ruota'));
  dockTempo.appendChild(makeTab('dadi',  '🎰', 'Slot'));

  const labLiberi = mk('p', 'gruppo-lab', 'Giochi liberi');
  const dockLiberi = mk('div', 'gioco-selettore'); dockLiberi.dataset.gruppo = 'liberi';
  dockLiberi.appendChild(makeTab('yz',    '🎲', 'Yahtzutra'));
  dockLiberi.appendChild(makeTab('strip', '♠️', 'Strip'));

  add(wrap, labTempo, dockTempo, labLiberi, dockLiberi);
  return wrap;
}

// ===========================================================================
// GAME MODAL
// Pop-up full-screen per Yahtzutra e Strip. Lo stato del gioco vive nei
// moduli e NON si resetta quando il modal si chiude — la chiusura emette
// solo onClose() per il cleanup ephemeral (overlay residui, body classes).
// Riapertura: tap sul tab → renderYahtzutra/renderStrip aprono di nuovo il
// modal con la partita esattamente dov'era rimasta.
// ===========================================================================
let modalEl = null;
let modalCloseHandler = null;
let modalBackEntry = null;   // voce di history del game-modal (back-stack)

export function openGameModal(title, mount, onClose) {
  teardownGameModal({ silent: true });
  const overlay = mk('div', 'game-modal');
  const sheet = mk('div', 'game-modal-sheet');
  sheet.appendChild(mk('div', 'game-modal-edge'));
  const topbar = mk('div', 'game-modal-topbar');
  const arrow = mk('button', 'gmt-arrow');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M14.5 5.5 8 12l6.5 6.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  arrow.appendChild(svg);
  arrow.title = 'Esci dal gioco';
  arrow.setAttribute('aria-label', 'Esci dal gioco');
  arrow.onclick = e => {
    e.stopPropagation();
    // Back gerarchico: se c'è un overlay Strip aperto (Regole/Opzioni/Storia),
    // la freccia torna al palco (chiude l'overlay con fade) invece di uscire
    // di colpo dal gioco. Solo dal palco l'arrow chiude davvero il modal.
    // closeStripOv passa per il back-stack (history.back → popstate → teardown),
    // evitando entry stale che consumerebbero un back-press fantasma dopo.
    if (document.querySelector('.strip-ov')) { closeStripOv(); return; }
    closeGameModal();
  };
  arrow.addEventListener('pointerdown', e => e.stopPropagation());
  topbar.appendChild(arrow);
  topbar.appendChild(mk('div', 'gmt-title', title));
  topbar.appendChild(mk('div', 'gmt-spacer'));
  sheet.appendChild(topbar);
  const body = mk('div', 'game-modal-body');
  sheet.appendChild(body);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  modalEl = overlay;
  modalCloseHandler = onClose;
  mount(body);                    // riempi il corpo PRIMA del reveal
  wireModalSwipe(sheet);
  // Forza il commit dello stato iniziale (overlay nascosto, contenuti
  // opacity:0) PRIMA di attivare le classi. Senza questo, quando openGameModal
  // e' chiamata da una continuazione async (Strip awaita la rete a OGNI
  // apertura; Yahtzutra solo alla prima), un singolo requestAnimationFrame non
  // basta a far partire la transizione → l'apertura "non si anima".
  void overlay.offsetWidth;
  document.body.classList.add('game-modal-open');
  overlay.classList.add('show');
  // Registra il game-modal nel back-stack: il tasto-back / edge-swipe del
  // telefono chiude il modal invece di uscire dall'app.
  modalBackEntry = pushBack(() => teardownGameModal({}));
}

// Chiusura richiesta da utente/codice (freccia dal palco, swipe, abbandona
// partita). Passa SEMPRE per la history (entry.close → history.back →
// popstate) cosi' tasto-back del telefono, edge-swipe e bottoni fanno la stessa
// identica cosa e il modal si chiude una sola volta.
export function closeGameModal() {
  if (modalBackEntry && modalBackEntry.alive) modalBackEntry.close();
  else teardownGameModal({});
}

// Smontaggio vero del modal: eseguito da popstate (via back-stack) o
// direttamente nel caso silent (sostituzione di un modal residuo). Anima la
// chiusura morbida (Morbida+) e rimuove il nodo.
function teardownGameModal(opts) {
  const silent = opts && opts.silent;
  if (!modalEl) return;
  const m = modalEl;
  const h = modalCloseHandler;
  modalEl = null;
  modalCloseHandler = null;
  modalBackEntry = null;
  // Lo sheet SCIVOLA giù mentre scrim e blur si dissolvono e #app torna in
  // primo piano. Rimozione del nodo solo a slide completato (640ms > .6s).
  m.classList.add('closing');
  m.classList.remove('show');
  document.body.classList.remove('game-modal-open');
  setTimeout(() => { if (m.parentNode) m.remove(); }, 640);
  if (!silent && typeof h === 'function') h();
  document.dispatchEvent(new CustomEvent('giochi:tabs-refresh'));
}

// Swipe laterale per chiudere il game modal. Delega a attachSwipeBack la
// gesture detection (edge 40px, soglia 25% width o velocità > 0.9). La
// chiusura specifica (sheet slide-out + blur dissolve dello scrim) resta
// in closeGameModal().
function wireModalSwipe(sheet) {
  attachSwipeBack(sheet, () => closeGameModal());
}

async function montaGiocoCorrente() {
  const host = ctx.panel.querySelector('.gioco-host');
  if (giocoCorrente === 'ruota') {
    await renderRuota({ client: ctx.client, me: ctx.me, panel: host });
  } else {
    await montaDadi(host);
  }
}

async function montaDadi(host) {
  dadiHost = host;
  try {
    let rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    if (!rows.length) {                       // prima volta per la coppia → semina i default
      await seedDadiFacce(ctx.client, facceDefaultRows(ctx.me.couple_id));
      rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    }
    facce = raggruppaFacce(rows);
  } catch (err) { toast('Errore caricamento dadi: ' + err.message, 'err'); return; }

  // accredita tiri settimanali se eligible
  try {
    const movs = await listSlotMov(ctx.client, ctx.me.couple_id);
    const elig = slotEleggibile(movs, ctx.me.id);
    if (elig.ok) {
      await accreditaSlot(ctx.client, {
        couple_id: ctx.me.couple_id,
        user_id: ctx.me.id,
        motivo: 'settimanale',
        delta: ECONOMIA_SLOT.TIRI_SETTIMANALI,
      });
    }
  } catch (err) { /* non bloccare l'UI se il ledger slot fallisce */ }

  draw();
  await renderTopbarSlot();
}

function draw() {
  const p = dadiHost; clear(p);
  add(p, mk('h2', 'ptitle', '🎰 Slot'), mk('p', 'psub', 'Scegli i rulli e premi per tirare. Tocca ＋ per cambiare i contenuti.'));

  // topbar saldo + countdown (aggiornata da renderTopbarSlot)
  p.appendChild(mk('div', 'slot-topbar'));

  // picker: una chip per rullo, accesa/spenta
  const picker = mk('div', 'dadi-picker');
  for (const k of DADI_ORDER) {
    const chip = mk('div', 'dadi-chip' + (attivi[k] ? ' on' : ''));
    add(chip, mk('span', 'ce', DADI_CHIP[k]), mk('span', 'ct', DADI_LABEL[k]));
    chip.onclick = () => toggleDie(k);
    picker.appendChild(chip);
  }
  p.appendChild(picker);

  // cabinet della slot: 4 viti + arco con rosone + rulli + tasto Tira
  const cabinet = mk('div', 'slot-cabinet');
  add(cabinet,
    mk('div', 'slot-screw tl'), mk('div', 'slot-screw tr'),
    mk('div', 'slot-screw bl'), mk('div', 'slot-screw br'),
    mk('div', 'slot-arch'));
  const reelsHost = mk('div', 'slot-reels'); reelsHost.id = 'slot-reels';
  cabinet.appendChild(reelsHost);
  const cons = mk('div', 'slot-console');
  const btn = mk('button', 'slot-tira', 'Tira');
  btn.onclick = roll;
  cons.appendChild(btn);
  cabinet.appendChild(cons);
  p.appendChild(cabinet);

  buildField();
}

async function renderTopbarSlot() {
  const bar = dadiHost && dadiHost.querySelector('.slot-topbar');
  if (!bar) return;
  let saldo = 0;
  let elig = { ok: false, prossimoSblocco: null };
  try {
    const movs = await listSlotMov(ctx.client, ctx.me.couple_id);
    saldo = saldoSlot(movs, ctx.me.id);
    elig = slotEleggibile(movs, ctx.me.id);
  } catch (_) { /* mostra saldo 0 se DB irraggiungibile */ }
  clear(bar);
  const saldoEl = mk('span', 'slot-saldo', `🎰 ${saldo} tir${saldo === 1 ? 'o' : 'i'}`);
  const cdEl    = mk('span', 'slot-countdown', countdownText(elig));
  add(bar, saldoEl, cdEl);
  const btn = dadiHost.querySelector('.slot-tira');
  if (btn) btn.disabled = saldo === 0;
}

function countdownText(elig) {
  if (elig.ok) return 'gratis disponibile';
  const giorni = Math.ceil((new Date(elig.prossimoSblocco) - Date.now()) / 864e5);
  return `gratis tra ${giorni}g`;
}

function toggleDie(k) {
  const activeCount = DADI_ORDER.filter(x => attivi[x]).length;
  if (attivi[k] && activeCount === 1) return;   // almeno un rullo sempre acceso
  attivi[k] = !attivi[k];
  draw();
  renderTopbarSlot();   // ripristina saldo/countdown dopo il redraw (fire-and-forget)
}

function buildField() {
  const host = document.getElementById('slot-reels');
  clear(host);
  for (const k of Object.keys(reels)) delete reels[k];
  DADI_ORDER.filter(k => attivi[k]).forEach((k) => {
    const reel = makeReel(k);
    host.appendChild(reel);
    reels[k] = { wrap: reel, strip: reel._strip };
  });
}

function makeReel(k) {
  const reel = mk('div', 'slot-reel ' + k);
  const strip = mk('div', 'slot-reel-strip');
  for (let i = 0; i < 6; i++) {
    const face = mk('div', 'slot-reel-face');
    const f = facce[k][i];
    add(face, mk('div', 'e', f ? f.emoji : ''), mk('div', 't', f ? f.testo : ''));
    strip.appendChild(face);
  }
  reel.appendChild(strip);
  reel._strip = strip;
  return reel;
}

async function roll() {
  closePop();
  if (busy) return;
  try {
    await spendiSlot(ctx.client, { couple_id: ctx.me.couple_id, user_id: ctx.me.id });
  } catch (e) {
    console.error('spendiSlot failed', e);
    toast('Tiri esauriti — torna tra qualche giorno 🎰', 'err');
    return;
  }
  busy = true;
  const picks = tiraDadi(attivi);
  const keys = Object.keys(picks);
  // start spin
  for (const k of keys) {
    const r = reels[k];
    r.wrap.classList.add('spinning');
    r.strip.style.transform = 'translateY(0)';
  }
  // stop scaglionati: ogni rullo si ferma 240ms dopo il precedente
  keys.forEach((k, idx) => {
    setTimeout(() => {
      const r = reels[k];
      r.wrap.classList.remove('spinning');
      r.strip.style.transform = `translateY(${-picks[k] * FACE_H}px)`;
    }, 500 + idx * 240);
  });
  // popup risultato dopo l'ultimo atterraggio + tempo di settling
  const settleMs = 500 + (keys.length - 1) * 240 + 1300;
  setTimeout(() => {
    showPop(componiFrase(facce, picks));
    busy = false;
    renderTopbarSlot();   // aggiorna saldo dopo il tiro (fire-and-forget)
  }, settleMs);
}

// ---- popup risultato (scrim centrato + lock sfondo) ----
function showPop({ emos, act, rest }) {
  closePop();
  const scrim = mk('div', 'dadi-scrim');
  const card = mk('div', 'dadi-pop');
  add(card,
    mk('div', 'emos', emos.join(' ')),
    mk('p', 'act', act),
    rest.length ? mk('p', 'rest', rest.join(', ')) : null,
    mk('div', 'line'));
  const again = mk('button', 'again', 'Tira ancora');
  again.onclick = roll;
  card.appendChild(again);
  scrim.appendChild(card);
  scrim.onclick = e => { if (e.target === scrim) closePop(); };
  document.body.appendChild(scrim);
  document.body.classList.add('locked');
  requestAnimationFrame(() => scrim.classList.add('show'));
}
function closePop() {
  const old = document.querySelector('.dadi-scrim');
  if (old) old.remove();
  if (!document.querySelector('.modal')) document.body.classList.remove('locked');
}

// ---- editor contenuti (modifica emoji + testo delle facce) ----
// Monta l'editor dei contenuti Slot dentro a `host` (qualsiasi container DOM).
// Usato sia dal FAB + in pagina Giochi (via openEditor) sia dall'hub
// "Contenuti dei giochi" in Impostazioni. onSaved: callback opzionale.
export async function renderSlotEditorInto(host, context, onSaved) {
  if (!facce || !ctx || ctx.client !== context.client) {
    ctx = context;
    let rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    if (!rows.length) {
      await seedDadiFacce(ctx.client, facceDefaultRows(ctx.me.couple_id));
      rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    }
    facce = raggruppaFacce(rows);
  }

  clear(host);
  add(host, mk('p', 'muted', 'Cambia emoji e testo di ogni faccia. Tre dadi: Azione, Corpo, Dove.'));
  const dirty = new Map();   // id -> { emoji, testo }
  for (const k of DADI_ORDER) {
    host.appendChild(mk('div', 'section-label', DADI_LABEL[k]));
    facce[k].forEach(f => {
      const row = mk('div', 'dadi-edit-row');
      const em = mk('input', 'dadi-em'); em.value = f.emoji; em.maxLength = 4;
      const tx = mk('input'); tx.value = f.testo; tx.placeholder = 'testo';
      const mark = () => dirty.set(f.id, { emoji: em.value.trim() || '✦', testo: tx.value.trim() });
      em.oninput = mark; tx.oninput = mark;
      add(row, em, tx);
      host.appendChild(row);
    });
  }
  const save = mk('button', 'btn', 'Salva'); save.style.cssText = 'width:100%;margin-top:8px;';
  save.onclick = async () => {
    save.disabled = true;
    try {
      for (const [id, patch] of dirty) {
        if (!patch.testo) { toast('Il testo non può essere vuoto', 'err'); save.disabled = false; return; }
        await updateDadiFaccia(ctx.client, id, patch);
      }
      toast('Slot salvato', 'ok');
      onSaved && onSaved();
    } catch (err) { save.disabled = false; toast('Errore salvataggio: ' + err.message, 'err'); }
  };
  host.appendChild(save);
}

// Wrapper FAB + in pagina Giochi: apre il sheet e monta l'editor inline.
function openEditor() {
  openSheet('Modifica i dadi', async s => {
    await renderSlotEditorInto(s, ctx, async () => {
      const modal = s.closest('.modal');
      if (modal) modal.remove();
      document.body.classList.remove('locked');
      await renderGiochi(ctx);
    });
  });
}
