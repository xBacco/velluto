import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  DADI_ORDER, DADI_LABEL, DADI_CHIP, raggruppaFacce, facceDefaultRows, tiraDadi, componiFrase,
} from '../lib/logic.js';
import { listDadiFacce, seedDadiFacce, updateDadiFaccia } from '../store.js';
import { renderRuota, openEditorRuota } from './ruota.js';
import { renderStrip, hasActiveGame as stripHasActiveGame } from './strip.js';
import { renderYahtzutra, hasActiveGame as yzHasActiveGame } from './yahtzutra.js';

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
  const existing = ctx.panel.querySelector('.gioco-selettore');
  if (existing) existing.replaceWith(buildSelettore());
}

function buildSelettore() {
  const sel = mk('div', 'gioco-selettore');
  for (const [k, ico, lbl] of [['dadi', '🎰', 'Slot'], ['ruota', '🎡', 'Ruota'], ['yz', '🎲', 'Yahtzutra'], ['strip', '♠️', 'Strip']]) {
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
    sel.appendChild(b);
  }
  return sel;
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

export function openGameModal(title, mount, onClose) {
  closeGameModal({ silent: true });
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
  arrow.onclick = e => { e.stopPropagation(); closeGameModal(); };
  arrow.addEventListener('pointerdown', e => e.stopPropagation());
  topbar.appendChild(arrow);
  topbar.appendChild(mk('div', 'gmt-title', title));
  topbar.appendChild(mk('div', 'gmt-spacer'));
  sheet.appendChild(topbar);
  const body = mk('div', 'game-modal-body');
  sheet.appendChild(body);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  document.body.classList.add('game-modal-open');
  requestAnimationFrame(() => overlay.classList.add('show'));
  wireModalSwipe(sheet, overlay);
  modalEl = overlay;
  modalCloseHandler = onClose;
  mount(body);
}

export function closeGameModal(opts) {
  const silent = opts && opts.silent;
  if (!modalEl) return;
  const m = modalEl;
  const h = modalCloseHandler;
  modalEl = null;
  modalCloseHandler = null;
  m.classList.remove('show');
  document.body.classList.remove('game-modal-open');
  setTimeout(() => { if (m.parentNode) m.remove(); }, 320);
  if (!silent && typeof h === 'function') h();
  document.dispatchEvent(new CustomEvent('giochi:tabs-refresh'));
}

// Swipe laterale (entrambe le direzioni) per chiudere. touch-action:pan-y sul
// sheet lascia lo scroll verticale al browser; orizzontalmente cattura noi.
function wireModalSwipe(sheet, overlay) {
  let start = null, dragging = false;
  const onDown = e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, input, textarea, select, .yz-scrim, .dadi-scrim, .strip-ov, .modal')) return;
    start = { x: e.clientX, y: e.clientY, t: Date.now() };
    dragging = false;
  };
  const onMove = e => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        sheet.classList.add('swiping');
        try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
      } else { return; }
    }
    e.preventDefault();
    sheet.style.transform = 'translateX(' + dx + 'px)';
    const alpha = Math.max(.25, .72 - Math.abs(dx) / 650);
    overlay.style.background = 'rgba(8,2,4,' + alpha + ')';
  };
  const onUp = e => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dt = Math.max(1, Date.now() - start.t);
    const v = Math.abs(dx) / dt;
    const wasDragging = dragging;
    start = null; dragging = false;
    sheet.classList.remove('swiping');
    if (!wasDragging) { sheet.style.transform = ''; overlay.style.background = ''; return; }
    if (Math.abs(dx) > 100 || v > 0.55) {
      sheet.style.transform = 'translateX(' + (dx > 0 ? '110%' : '-110%') + ')';
      overlay.style.opacity = '0';
      setTimeout(() => closeGameModal(), 260);
    } else {
      sheet.style.transform = '';
      overlay.style.background = '';
    }
  };
  sheet.addEventListener('pointerdown', onDown);
  sheet.addEventListener('pointermove', onMove, { passive: false });
  sheet.addEventListener('pointerup', onUp);
  sheet.addEventListener('pointercancel', onUp);
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
  draw();
}

function draw() {
  const p = dadiHost; clear(p);
  add(p, mk('h2', 'ptitle', '🎰 Slot'), mk('p', 'psub', 'Scegli i rulli e premi per tirare. Tocca ＋ per cambiare i contenuti.'));

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

function toggleDie(k) {
  const activeCount = DADI_ORDER.filter(x => attivi[x]).length;
  if (attivi[k] && activeCount === 1) return;   // almeno un rullo sempre acceso
  attivi[k] = !attivi[k];
  draw();
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

function roll() {
  closePop();
  if (busy) return;
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
