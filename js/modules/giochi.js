import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  DADI_ORDER, DADI_LABEL, DADI_CHIP, raggruppaFacce, facceDefaultRows, tiraDadi, componiFrase,
} from '../lib/logic.js';
import { listDadiFacce, seedDadiFacce, updateDadiFaccia } from '../store.js';
import { renderRuota, openEditorRuota } from './ruota.js';
import { renderStrip } from './strip.js';
import { renderYahtzutra } from './yahtzutra.js';

let giocoCorrente = 'dadi';   // 'dadi' | 'ruota'
let ctx = null;          // { client, me, panel }
let dadiHost = null;     // nodo in cui montare i Dadi (sotto al selettore)
let facce = null;        // { az:[6], co:[6], lu:[6] } dal DB
let attivi = { az: true, co: true, lu: true };
let wired = false;
let busy = false;
let pendingContenuti = false;   // editor Ruota da aprire dopo il prossimo renderGiochi
const reels = {};        // dado -> { wrap, strip }

// Listener globale: l'opzione "Contenuti giochi" nelle Impostazioni emette `giochi:contenuti`
// dopo `goto giochi`. Se la tab Giochi non è ancora stata renderizzata, segnamo pendingContenuti
// e lo consumiamo alla fine del prossimo renderGiochi.
document.addEventListener('giochi:contenuti', async () => {
  giocoCorrente = 'ruota';
  if (ctx) { await renderGiochi(ctx); openEditorRuota(); }
  else pendingContenuti = true;
});

// altezza in px di una singola faccia del rullo (deve coincidere con .slot-reel-face in styles.css)
const FACE_H = 120;

export async function renderGiochi(context) {
  ctx = context;
  if (!wired) {
    document.addEventListener('fab:giochi', () => {
      if (giocoCorrente === 'dadi') openEditor();
      else if (giocoCorrente === 'ruota') openEditorRuota();
    });
    wired = true;
  }
  drawSelettore();
  await montaGiocoCorrente();
  if (pendingContenuti) { pendingContenuti = false; openEditorRuota(); }
}

function drawSelettore() {
  const p = ctx.panel; clear(p);
  const sel = mk('div', 'gioco-selettore');
  for (const [k, ico, lbl] of [['dadi', '🎰', 'Slot'], ['ruota', '🎡', 'Ruota'], ['yz', '🎲', 'Yahtzutra'], ['strip', '♠️', 'Strip']]) {
    const b = mk('button', 'gioco-tab' + (giocoCorrente === k ? ' on' : ''));
    add(b, mk('span', 'ico', ico), mk('span', 'lab', lbl));
    b.onclick = () => { giocoCorrente = k; renderGiochi(ctx); };
    sel.appendChild(b);
  }
  p.appendChild(sel);
  p.appendChild(mk('div', 'gioco-host'));
}

// ===========================================================================
// FOCUS MODE PAGINA INTERA
// Yahtzutra e Strip occupano tutto lo schermo: nav inferiore e selettore
// vengono nascosti; un header floating con "✕" permette di tornare alla
// vista normale (selettore visibile + nav).
// ===========================================================================
export function enterGameFocus(title) {
  document.body.classList.add('game-focus');
  let header = document.getElementById('game-focus-header');
  if (header) header.remove();
  header = mk('div', 'game-focus-header'); header.id = 'game-focus-header';
  header.appendChild(mk('span', 'gfh-title', title));
  const close = mk('button', 'gfh-close', '✕');
  close.title = 'Esci dal gioco';
  close.onclick = exitGameFocus;
  header.appendChild(close);
  document.body.appendChild(header);
}

export function exitGameFocus() {
  document.body.classList.remove('game-focus');
  const header = document.getElementById('game-focus-header');
  if (header) header.remove();
  // I moduli (yahtzutra, strip) ascoltano questo evento per pulire il
  // proprio stato (dock galleggiante, scrim aperti, body classes, ecc.)
  document.dispatchEvent(new CustomEvent('game-focus:exit'));
  // Torna al selettore con default Slot (gioco non-focus).
  giocoCorrente = 'dadi';
  if (ctx) renderGiochi(ctx);
}

async function montaGiocoCorrente() {
  const host = ctx.panel.querySelector('.gioco-host');
  if (giocoCorrente === 'ruota') {
    await renderRuota({ client: ctx.client, me: ctx.me, panel: host });
  } else if (giocoCorrente === 'strip') {
    await renderStrip({ client: ctx.client, me: ctx.me, panel: host });
  } else if (giocoCorrente === 'yz') {
    await renderYahtzutra({ client: ctx.client, me: ctx.me, panel: host });
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
function openEditor() {
  openSheet('Modifica i dadi', s => {
    add(s, mk('p', 'muted', 'Cambia emoji e testo di ogni faccia. Tre dadi: Azione, Corpo, Dove.'));
    const dirty = new Map();   // id -> { emoji, testo }
    for (const k of DADI_ORDER) {
      s.appendChild(mk('div', 'section-label', DADI_LABEL[k]));
      facce[k].forEach(f => {
        const row = mk('div', 'dadi-edit-row');
        const em = mk('input', 'dadi-em'); em.value = f.emoji; em.maxLength = 4;
        const tx = mk('input'); tx.value = f.testo; tx.placeholder = 'testo';
        const mark = () => dirty.set(f.id, { emoji: em.value.trim() || '✦', testo: tx.value.trim() });
        em.oninput = mark; tx.oninput = mark;
        add(row, em, tx);
        s.appendChild(row);
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
        s.closest('.modal').remove();
        document.body.classList.remove('locked');
        await renderGiochi(ctx);
      } catch (err) { save.disabled = false; toast('Errore salvataggio: ' + err.message, 'err'); }
    };
    s.appendChild(save);
  });
}
