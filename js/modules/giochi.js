import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  DADI_ORDER, DADI_LABEL, DADI_CHIP, raggruppaFacce, facceDefaultRows, tiraDadi, componiFrase,
} from '../lib/logic.js';
import { listDadiFacce, seedDadiFacce, updateDadiFaccia } from '../store.js';
import { renderRuota, openEditorRuota } from './ruota.js';

let giocoCorrente = 'dadi';   // 'dadi' | 'ruota'
let ctx = null;          // { client, me, panel }
let dadiHost = null;     // nodo in cui montare i Dadi (sotto al selettore)
let facce = null;        // { az:[6], co:[6], lu:[6] } dal DB
let attivi = { az: true, co: true, lu: true };
let wired = false;
let busy = false;
const cubes = {};        // dado -> { wrap, cube, spins }

// orientamenti delle 6 facce del cubo (rotX, rotY) per atterrare su una faccia
const ORI = [[0, 0], [0, 180], [0, -90], [0, 90], [-90, 0], [90, 0]];

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
}

function drawSelettore() {
  const p = ctx.panel; clear(p);
  const sel = mk('div', 'gioco-selettore');
  for (const [k, lbl] of [['dadi', '🎲 Dadi'], ['ruota', '🎡 Ruota']]) {
    const b = mk('button', 'gioco-tab' + (giocoCorrente === k ? ' on' : ''), lbl);
    b.onclick = () => { giocoCorrente = k; renderGiochi(ctx); };
    sel.appendChild(b);
  }
  p.appendChild(sel);
  p.appendChild(mk('div', 'gioco-host'));
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
  add(p, mk('h2', 'ptitle', '🎲 Dadi'), mk('p', 'psub', 'Scegli i dadi e tira. Tocca ＋ per cambiare i contenuti.'));

  // picker: una chip per dado, accesa/spenta
  const picker = mk('div', 'dadi-picker');
  for (const k of DADI_ORDER) {
    const chip = mk('div', 'dadi-chip' + (attivi[k] ? ' on' : ''));
    add(chip, mk('span', 'ce', DADI_CHIP[k]), mk('span', 'ct', DADI_LABEL[k]));
    chip.onclick = () => toggleDie(k);
    picker.appendChild(chip);
  }
  p.appendChild(picker);

  const pane = mk('div', 'dadi-pane');
  const field = mk('div', 'dadi-field'); field.id = 'dadi-field';
  const labels = mk('div', 'dadi-labels'); labels.id = 'dadi-labels';
  const btn = mk('button', 'btn gold dadi-roll', 'Tira i dadi');
  btn.onclick = roll;
  add(pane, field, labels, btn);
  p.appendChild(pane);

  buildField();
}

function toggleDie(k) {
  const activeCount = DADI_ORDER.filter(x => attivi[x]).length;
  if (attivi[k] && activeCount === 1) return;   // almeno un dado sempre acceso
  attivi[k] = !attivi[k];
  draw();
}

function buildField() {
  const field = document.getElementById('dadi-field');
  const labels = document.getElementById('dadi-labels');
  clear(field); clear(labels);
  for (const k of Object.keys(cubes)) delete cubes[k];
  DADI_ORDER.filter(k => attivi[k]).forEach((k, idx) => {
    const wrap = makeCube(k);
    if (idx > 0) wrap.classList.add('d' + idx);
    field.appendChild(wrap);
    cubes[k] = { wrap, cube: wrap._cube, spins: 0 };
    labels.appendChild(mk('span', null, DADI_LABEL[k]));
  });
}

function makeCube(k) {
  const wrap = mk('div', 'dadi-cubeWrap');
  const shadow = mk('div', 'dadi-shadow');
  const cube = mk('div', 'dadi-cube ' + k);
  for (let i = 0; i < 6; i++) {
    const f = mk('div', 'dadi-face f' + i, facce[k][i] ? facce[k][i].emoji : '');
    cube.appendChild(f);
  }
  add(wrap, shadow, cube);
  wrap._cube = cube;
  return wrap;
}

function roll() {
  closePop();
  if (busy) return;
  busy = true;
  const picks = tiraDadi(attivi);
  for (const k of Object.keys(picks)) { fling(cubes[k]); land(cubes[k], picks[k]); }
  setTimeout(() => {
    showPop(componiFrase(facce, picks));
    busy = false;
  }, 1150);
}

function land(c, idx) {
  c.spins++;
  c.cube.style.transform = `rotateX(${ORI[idx][0] - 360 * c.spins}deg) rotateY(${ORI[idx][1] + 360 * c.spins}deg)`;
}
function fling(c) { c.wrap.classList.remove('jump'); void c.wrap.offsetWidth; c.wrap.classList.add('jump'); }

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
