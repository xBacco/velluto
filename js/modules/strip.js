// Strip Poker (Fase 4c) — port da mockup strip-poker-final3, adattato alle
// convenzioni dell'app: layer puro importato da lib/logic.js, overlay appesi a
// document.body con classe "dadi-scrim strip-ov" (lock scroll centralizzato in
// ui.js), niente innerHTML (solo mk/add/clear).
// 'Lui' = utente loggato (ctx.me); 'Lei' = partner. Sesso avatar: Lui→'lui', Lei→'lei'.

import { mk, add, clear, toast } from '../ui.js';
import {
  mazzo52, mescola, valutaMano, miglioreManoDa7, confronta, CATEGORIE_POKER,
  GUARDAROBA, GUARDAROBA_META, capiIniziali, statoInizialePartita, togliCapo, eNudo,
  risultatoPartita, testaATesta,
} from '../lib/logic.js';
import { listStripPartite, addStripPartita } from '../store.js';

let ctx = null, host = null, partite = [];
let mode = 'holdem';            // 'holdem' | 'draw'
let stato = null;              // { lui:{}, lei:{} } capi residui
let deck = [], board = [], meHole = [], oppHole = [], meSet = [], oppSet = [];
let phase = 'start', discard = [], stripBusy = false;
let els = {};                 // nodi del tavolo creati in drawTavolo()

const SEMI = [{ g: '♠', red: 0 }, { g: '♥', red: 1 }, { g: '♦', red: 1 }, { g: '♣', red: 0 }];
const NOMI_RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function rname(r) { return NOMI_RANK[r] || (r === 10 ? '10' : String(r)); }

// ---------------------------------------------------------------------------
// 7a — helper rendering carte + piega 3D
// ---------------------------------------------------------------------------
function rot(i, n) { return ((i - (n - 1) / 2) * 7) + 'deg'; }
function inSet(card, set) { return set && set.some(x => x.r === card.r && x.s === card.s); }

function cardFace(card, use) {
  const el = mk('div', 'card');
  if (SEMI[card.s].red) el.classList.add('red');
  const rk = mk('div', 'rk');
  rk.appendChild(document.createTextNode(rname(card.r)));
  rk.appendChild(mk('small', null, SEMI[card.s].g));
  add(el, rk, mk('div', 'pip', SEMI[card.s].g));
  if (use) { el.classList.add(inSet(card, use) ? 'win' : 'dim'); }
  return el;
}
function cardBack() {
  const el = mk('div', 'card back');
  el.appendChild(mk('div', 'frame'));
  return el;
}

function renderCovered(node, cards) {
  clear(node); node.className = 'squeeze live';
  cards.forEach((c, i) => {
    const sc = mk('div', 'sqc');
    sc.style.setProperty('--rot', rot(i, cards.length)); sc.style.zIndex = i + 1;
    const back = cardBack(); back.classList.add('layer'); sc.appendChild(back);
    sc.appendChild(mk('div', 'notch'));
    const pb = mk('div', 'peelbox'); const pl = mk('div', 'peel');
    const front = mk('div', 'tri front');
    const face = mk('div', 'tri face' + (SEMI[c.s].red ? ' red' : ''));
    const pk = mk('div', 'pk');
    add(pk, mk('div', 'rkb', rname(c.r)), mk('small', null, SEMI[c.s].g));
    face.appendChild(pk);
    add(pl, front, face); pb.appendChild(pl); sc.appendChild(pb);
    node.appendChild(sc);
  });
  node.appendChild(mk('div', 'peekhint', 'tocca per sbirciare'));
}
function renderShown(node, cards, use) {
  clear(node); node.className = 'squeeze full';
  cards.forEach((c, i) => {
    const sc = mk('div', 'sqc');
    sc.style.setProperty('--rot', rot(i, cards.length)); sc.style.zIndex = i + 1;
    const face = cardFace(c, use); face.classList.add('layer'); sc.appendChild(face);
    node.appendChild(sc);
  });
}
function renderSelect(node, cards) {
  clear(node); node.className = 'squeeze full';
  cards.forEach((c, i) => {
    const sc = mk('div', 'sqc');
    sc.style.setProperty('--rot', rot(i, cards.length)); sc.style.zIndex = i + 1;
    if (discard.indexOf(i) >= 0) sc.classList.add('sel');
    const face = cardFace(c); face.classList.add('layer'); sc.appendChild(face);
    sc.onclick = () => {
      const k = discard.indexOf(i);
      if (k >= 0) discard.splice(k, 1); else if (discard.length < 3) discard.push(i);
      renderSelect(node, cards);
      if (els.hint) els.hint.textContent = discard.length
        ? ('Cambi ' + discard.length + ' cart' + (discard.length > 1 ? 'e' : 'a') + '. Tocca «Cambia».')
        : 'Tocca le carte da cambiare (max 3).';
    };
    node.appendChild(sc);
  });
}

// ---------------------------------------------------------------------------
// 7b — avatar SVG acquerello (port verbatim del corpo + capi a velatura)
// ---------------------------------------------------------------------------
const COLORI_CAPO = {
  cappello: '#5a1228', giacca: '#3a2a4a', felpa: '#4a5a36', maglietta: '#6e2440',
  gonna: '#6e2440', pantaloncini: '#335a4e', mutande: '#8a1838',
  reggiseno: '#8a1838', canottiera: '#cfc3b0', occhiali: '#241712', sciarpa: '#7a2444',
};
function coloreCapo(k) { return COLORI_CAPO[k] || '#6e1f3a'; }
const ZONE_CAPI = { head: ['cappello'], torso: ['giacca', 'felpa', 'maglietta', 'canottiera', 'reggiseno'], legs: ['gonna', 'pantaloncini'], pelvis: ['mutande'] };
const ZDRAW = ['pelvis', 'legs', 'torso', 'head'];
function outermost(zone, st) { const arr = ZONE_CAPI[zone] || []; for (const k of arr) if (st[k] > 0) return k; return null; }

const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function shade(hex, amt) {
  let h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  function c(i) { let v = parseInt(h.substr(i, 2), 16) + amt; v = v < 0 ? 0 : v > 255 ? 255 : v; return ('0' + v.toString(16)).slice(-2); }
  return '#' + c(0) + c(2) + c(4);
}
const TORSO_F = "M45,66 C39,82 41,105 47,120 C50,128 50,133 47,139 C42,151 38,160 40,170 C48,174 72,174 80,170 C82,160 78,151 73,139 C70,133 70,128 73,120 C79,105 81,82 75,66 C68,59 52,59 45,66 Z";
const TORSO_M = "M42,64 C37,82 40,108 44,126 C46,136 45,146 45,156 C45,164 45,168 46,170 C54,173 66,173 74,170 C75,168 75,164 75,156 C75,146 74,136 76,126 C80,108 83,82 78,64 C70,57 50,57 42,64 Z";
const LEGS_F = "M41,166 C40,196 44,228 45,258 L46,300 L44,320 C44,323 49,324 52,323 L55,321 C56,292 55,262 57,232 L59,176 L60,170 L61,176 L63,232 C65,262 64,292 65,321 L68,323 C71,324 76,323 76,320 L74,300 L75,258 C76,228 80,196 79,166 C72,170 48,170 41,166 Z";
const LEGS_M = "M44,168 C43,198 45,230 46,260 L47,302 L45,322 C45,325 50,326 53,325 L56,323 C57,294 56,264 58,234 L59,176 L60,172 L61,176 L62,234 C64,264 63,294 64,323 L67,325 C70,326 75,325 75,322 L73,302 L74,260 C75,230 77,198 76,168 C70,171 50,171 44,168 Z";
const ARM_F_L = "M45,70 C37,80 33,100 34,124 C34,144 37,160 41,172 L46,170 C42,156 41,140 42,124 C43,104 45,86 49,76 Z";
const ARM_F_R = "M75,70 C83,80 87,100 86,124 C86,144 83,160 79,172 L74,170 C78,156 79,140 78,124 C77,104 75,86 71,76 Z";
const ARM_M_L = "M43,68 C34,78 31,100 32,126 C32,148 35,164 39,176 L45,174 C41,160 40,142 41,126 C42,104 45,84 48,74 Z";
const ARM_M_R = "M77,68 C86,78 89,100 88,126 C88,148 85,164 81,176 L75,174 C79,160 80,142 79,126 C78,104 75,84 72,74 Z";
const HAIR_F = "M40,36 C37,16 50,7 60,7 C70,7 83,16 80,36 C81,56 82,76 78,94 L71,90 C75,70 73,48 69,40 C65,35 55,35 51,40 C47,48 45,70 49,90 L42,94 C38,76 39,56 40,36 Z";
const HAIR_M = "M41,32 C39,16 50,7 60,7 C70,7 81,16 79,32 L79,42 C72,33 48,33 41,42 Z";
const HAT_CROWN = "M50,23 L50,9 C50,5 70,5 70,9 L70,23 Z";
const HAT_BRIM = "M40,23 C40,20 80,20 80,23 C80,27 40,27 40,23 Z";
function topPath(F) { return F
  ? "M43,64 C37,82 40,108 46,128 C48,136 48,146 47,154 L73,154 C72,146 72,136 74,128 C80,108 83,82 77,64 C69,57 51,57 43,64 Z"
  : "M40,62 C35,82 39,112 44,134 C46,144 45,152 45,160 L75,160 C75,152 74,144 76,134 C81,112 85,82 80,62 C71,55 49,55 40,62 Z"; }
function pantsPath(F) { return F
  ? "M40,150 C39,182 44,224 45,258 L46,300 L44,320 C44,323 49,324 52,323 L55,321 C56,288 55,254 57,224 L59,178 L60,172 L61,178 L63,224 C65,254 64,288 65,321 L68,323 C71,324 76,323 76,320 L74,300 L75,258 C76,224 81,182 80,150 C70,156 50,156 40,150 Z"
  : "M43,154 C42,186 45,226 46,260 L47,302 L45,322 C45,325 50,326 53,325 L56,323 C57,290 56,256 58,226 L59,178 L60,172 L61,178 L62,226 C64,256 63,290 64,323 L67,325 C70,326 75,325 75,322 L73,302 L74,260 C75,226 78,186 77,154 C69,160 51,160 43,154 Z"; }
function braL() { return "M43,96 C44,107 50,113 57,109 C58,106 58,100 56,96 C53,90 45,90 43,96 Z"; }
function braR() { return "M77,96 C76,107 70,113 63,109 C62,106 62,100 64,96 C67,90 75,90 77,96 Z"; }
function braBand() { return "M43,97 C50,94 70,94 77,97"; }
function pantyPath() { return "M41,176 C44,176 76,176 79,176 C78,190 70,204 60,204 C50,204 42,190 41,176 Z"; }

const FIG_W = 96, FIG_H = 266, VB_W = 120, VB_H = 332;
function bodySVG(F) {
  const uid = 'b' + Math.random().toString(36).slice(2, 6);
  const svg = sv('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, width: FIG_W, height: FIG_H, 'class': 'figbody' });
  const defs = sv('defs', null, svg);
  const sg = sv('linearGradient', { id: 'sk' + uid, x1: '0', y1: '0', x2: '.9', y2: '1' }, defs);
  sv('stop', { offset: '0', 'stop-color': '#f0cdb2' }, sg); sv('stop', { offset: '1', 'stop-color': '#dca98a' }, sg);
  const skin = 'url(#sk' + uid + ')';
  const sh = sv('filter', { id: 'sh' + uid, x: '-30%', y: '-15%', width: '160%', height: '130%' }, defs);
  sv('feDropShadow', { dx: '0', dy: '3', 'stdDeviation': '3.5', 'flood-color': '#000', 'flood-opacity': '.45' }, sh);
  const bl = sv('filter', { id: 'bl' + uid, x: '-40%', y: '-40%', width: '180%', height: '180%' }, defs);
  sv('feGaussianBlur', { stdDeviation: '3.2' }, bl);
  const clip = sv('clipPath', { id: 'cl' + uid }, defs);
  [F ? ARM_F_L : ARM_M_L, F ? ARM_F_R : ARM_M_R, F ? LEGS_F : LEGS_M, F ? TORSO_F : TORSO_M].forEach(d => { sv('path', { d }, clip); });
  sv('ellipse', { cx: '60', cy: '35', rx: '15', ry: '18' }, clip);
  const root = sv('g', { filter: 'url(#sh' + uid + ')' }, svg);
  function P(d) { sv('path', { d, fill: skin, stroke: '#7a4a30', 'stroke-width': '1', 'stroke-linejoin': 'round' }, root); }
  sv('path', { d: F ? HAIR_F : HAIR_M, fill: '#5a3a26', stroke: '#3a2416', 'stroke-width': '1' }, root);
  P(F ? ARM_F_L : ARM_M_L); P(F ? ARM_F_R : ARM_M_R); P(F ? LEGS_F : LEGS_M);
  sv('rect', { x: '55', y: '48', width: '10', height: '20', rx: '5', fill: skin }, root);
  P(F ? TORSO_F : TORSO_M);
  sv('ellipse', { cx: '60', cy: '35', rx: '15', ry: '18', fill: skin, stroke: '#7a4a30', 'stroke-width': '1' }, root);
  const shadeG = sv('g', { 'clip-path': 'url(#cl' + uid + ')' }, root);
  sv('ellipse', { cx: '72', cy: '130', rx: '16', ry: '60', fill: '#b07a5c', opacity: '.45', filter: 'url(#bl' + uid + ')' }, shadeG);
  sv('ellipse', { cx: '70', cy: '250', rx: '12', ry: '60', fill: '#b07a5c', opacity: '.4', filter: 'url(#bl' + uid + ')' }, shadeG);
  sv('ellipse', { cx: '52', cy: '90', rx: '14', ry: '30', fill: '#ffe6cf', opacity: '.5', filter: 'url(#bl' + uid + ')' }, shadeG);
  return svg;
}
function garmentSVG(zone, k, F) {
  const uid = 'g' + Math.random().toString(36).slice(2, 6);
  const svg = sv('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, width: FIG_W, height: FIG_H });
  const defs = sv('defs', null, svg); const col = coloreCapo(k);
  const fg = sv('linearGradient', { id: 'fb' + uid, x1: '0', y1: '0', x2: '.8', y2: '1' }, defs);
  sv('stop', { offset: '0', 'stop-color': shade(col, 28) }, fg); sv('stop', { offset: '.55', 'stop-color': col }, fg); sv('stop', { offset: '1', 'stop-color': shade(col, -34) }, fg);
  const fab = 'url(#fb' + uid + ')';
  function Gar(d) { sv('path', { d, fill: fab, 'fill-opacity': '.85', stroke: '#5a2438', 'stroke-width': '1', 'stroke-linejoin': 'round' }, svg); }
  if (zone === 'head') { Gar(HAT_BRIM); Gar(HAT_CROWN); }
  else if (zone === 'torso') { if (k === 'reggiseno') { Gar(braL()); Gar(braR()); sv('path', { d: braBand(), fill: 'none', stroke: 'rgba(232,196,131,.55)', 'stroke-width': '1.3' }, svg); } else Gar(topPath(F)); }
  else if (zone === 'legs') Gar(pantsPath(F));
  else if (zone === 'pelvis') Gar(pantyPath());
  return svg;
}
function accSVG(k, F) {
  const uid = 'a' + Math.random().toString(36).slice(2, 6);
  const svg = sv('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, width: FIG_W, height: FIG_H });
  const defs = sv('defs', null, svg); const col = coloreCapo(k);
  const fg = sv('linearGradient', { id: 'fa' + uid, x1: '0', y1: '0', x2: '.8', y2: '1' }, defs);
  sv('stop', { offset: '0', 'stop-color': shade(col, 30) }, fg); sv('stop', { offset: '1', 'stop-color': shade(col, -28) }, fg);
  const fab = 'url(#fa' + uid + ')';
  function Pa(d, extra) { const a = { d, fill: fab, stroke: '#3a2012', 'stroke-width': '1', 'stroke-linejoin': 'round' }; if (extra) for (const x in extra) a[x] = extra[x]; sv('path', a, svg); }
  if (k === 'occhiali') {
    Pa('M50,32 C50,28 58,28 58,33 C58,38 50,38 50,32 Z', { 'fill-opacity': '.9' });
    Pa('M62,32 C62,28 70,28 70,33 C70,38 62,38 62,32 Z', { 'fill-opacity': '.9' });
    sv('path', { d: 'M58,31 L62,31', fill: 'none', stroke: shade(col, 40), 'stroke-width': '1.4' }, svg);
    sv('path', { d: 'M50,31 L46,30 M70,31 L74,30', fill: 'none', stroke: shade(col, 20), 'stroke-width': '1.2', 'stroke-linecap': 'round' }, svg);
  } else if (k === 'sciarpa') {
    Pa('M50,50 C54,58 66,58 70,50 C72,56 71,62 67,66 C61,68 59,68 53,66 C49,62 48,56 50,50 Z');
    Pa('M54,64 L51,98 L58,98 L59,66 Z'); Pa('M61,66 L62,94 L69,94 L65,64 Z');
  }
  return svg;
}
const ACCDRAW = ['sciarpa', 'occhiali'];
const LBLTOP = { head: '6px', torso: '92px', legs: '182px', pelvis: '150px' };
const ACCTOP = { occhiali: '8px', sciarpa: '42px' };
function buildFig(box, F, st) {
  clear(box);
  box.appendChild(bodySVG(F));
  ZDRAW.forEach(z => {
    const k = outermost(z, st); if (!k) return;
    const w = mk('div', 'robe'); w.dataset.zone = z;
    w.appendChild(garmentSVG(z, k, F));
    const lb = mk('div', 'lbl', GUARDAROBA_META[k].n); lb.style.top = LBLTOP[z] || '90px';
    add(w, lb); box.appendChild(w);
  });
  ACCDRAW.forEach(k => {
    if (!st[k]) return;
    const w = mk('div', 'robe'); w.dataset.acc = k;
    w.appendChild(accSVG(k, F));
    const lb = mk('div', 'lbl', GUARDAROBA_META[k].n); lb.style.top = ACCTOP[k] || '40px';
    add(w, lb); box.appendChild(w);
  });
}

export async function renderStrip(context) {
  ctx = context; host = context.panel;
  try { partite = await listStripPartite(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore storico strip: ' + err.message, 'err'); partite = []; }
  drawApertura();
}

// ---------------------------------------------------------------------------
// 7c — apertura + testa-a-testa + scelta modalità
// ---------------------------------------------------------------------------
// `me` (profilo) ha id, couple_id, display_name, avatar — NESSUN partner_id.
// Il partner si deduce dallo storico delle partite (l'altro id coinvolto).
function partnerId() {
  for (const p of partite) {
    if (p.vincitore_id && p.vincitore_id !== ctx.me.id) return p.vincitore_id;
    if (p.perdente_id && p.perdente_id !== ctx.me.id) return p.perdente_id;
  }
  return null;
}

function drawApertura() {
  clear(host);
  const root = mk('div', 'strip-root');
  add(root, mk('h2', 'ptitle', '♠️ Strip Poker'), mk('p', 'psub', 'Mano più bassa = si toglie un capo.'));
  const tt = testaATesta(partite, ctx.me.id, partnerId());
  add(root, mk('div', 'strip-score', `🐻 Tu ${tt.mie} — ${tt.sue} Lei 🧁`));
  const pick = mk('div', 'pick-modes');
  const card = (m, titolo, sub) => {
    const c = mk('div', 'pm');
    add(c, mk('div', 'pm-t', titolo), mk('div', 'pm-s', sub));
    c.onclick = () => chooseMode(m);
    return c;
  };
  add(pick,
    card('holdem', '♣ Texas Hold\'em', '2 carte coperte a testa + 5 comuni sul tavolo.'),
    card('draw', '♦ Draw poker', '5 carte a testa, uno scambio fino a 3, poi showdown.'));
  add(root, pick);
  host.appendChild(root);
}
function chooseMode(m) { mode = m; drawSetup(); }

// ---------------------------------------------------------------------------
// overlay helper: nodo appeso a document.body con classe "dadi-scrim strip-ov"
// (ui.js blocca lo scroll finché esiste). Ritorna il nodo radice.
// ---------------------------------------------------------------------------
function closeOv() { const o = document.querySelector('.strip-ov'); if (o) o.remove(); }
function openOv() {
  closeOv();
  const ov = mk('div', 'dadi-scrim strip-ov');
  document.body.appendChild(ov);
  return ov;
}

// ---------------------------------------------------------------------------
// 7d — setup guardaroba (checklist Lui/Lei)
// ---------------------------------------------------------------------------
let selLui = {}, selLei = {};
function initSel() {
  selLui = {}; selLei = {};
  for (const c of capiIniziali('lui')) selLui[c.k] = true;   // default: tutto selezionato
  for (const c of capiIniziali('lei')) selLei[c.k] = true;
}

function totCapi(sel) {
  let n = 0;
  for (const k in sel) if (sel[k]) n += GUARDAROBA_META[k].qty;
  return n;
}

function renderList(box, who, sel, onChange) {
  clear(box); let lastG = null;
  GUARDAROBA.filter(c => !c.sesso || c.sesso === who).forEach(c => {
    if (c.gruppo !== lastG) { box.appendChild(mk('div', 'grp', c.gruppo)); lastG = c.gruppo; }
    const row = mk('div', 'it' + (sel[c.k] ? ' on' : ''));
    add(row, mk('span', 'em', GUARDAROBA_META[c.k].e), mk('span', null, c.n));
    if (c.qty > 1) row.appendChild(mk('span', 'qty', '×' + c.qty));
    row.appendChild(mk('span', 'ck'));
    row.onclick = () => { sel[c.k] = !sel[c.k]; onChange(); };
    box.appendChild(row);
  });
}

function drawSetup() {
  initSel();
  const ov = openOv();
  const head = mk('div', 'setHead');
  const h3 = mk('h3'); h3.appendChild(document.createTextNode('Cosa avete '));
  h3.appendChild(mk('b', null, 'addosso')); h3.appendChild(document.createTextNode('?'));
  add(head, h3, mk('div', 'sub', 'Spunta quello che indossate adesso. Scarpe e calzini contano 2 e si tolgono uno alla volta.'));
  ov.appendChild(head);

  const cols = mk('div', 'cols');
  const cardLui = mk('div', 'who-card'); const totLui = mk('div', 'tot', '0 capi'); const listLui = mk('div', 'list');
  add(cardLui, mk('h4', null, '🐻 Lui'), totLui, listLui);
  const cardLei = mk('div', 'who-card'); const totLei = mk('div', 'tot', '0 capi'); const listLei = mk('div', 'list');
  add(cardLei, mk('h4', null, '🧁 Lei'), totLei, listLei);
  add(cols, cardLui, cardLei);
  ov.appendChild(cols);

  const eqNote = mk('div', 'eqNote', 'Consiglio: stesso numero di capi per una partita equilibrata.');
  ov.appendChild(eqNote);

  const go = mk('button', 'btn', 'Inizia a giocare →'); go.disabled = true;
  const refresh = () => {
    renderList(listLui, 'lui', selLui, refresh);
    renderList(listLei, 'lei', selLei, refresh);
    const nL = totCapi(selLui), nF = totCapi(selLei);
    totLui.textContent = nL + ' capi'; totLei.textContent = nF + ' capi';
    go.disabled = !(nL > 0 && nF > 0);
    eqNote.textContent = (nL && nF && nL !== nF)
      ? ('Sbilanciata: Lui ' + nL + ' · Lei ' + nF + ' (ok lo stesso).')
      : 'Consiglio: stesso numero di capi per una partita equilibrata.';
  };
  go.onclick = () => { closeOv(); startGame(selLui, selLei); };
  ov.appendChild(go);
  refresh();
}

function startGame(sLui, sLei) {
  stato = { lui: {}, lei: {} };
  for (const c of capiIniziali('lui')) if (sLui[c.k]) stato.lui[c.k] = c.qty;
  for (const c of capiIniziali('lei')) if (sLei[c.k]) stato.lei[c.k] = c.qty;
  drawTavolo(); resetMano();
  if (mode === 'holdem') dealHold(); else dealDraw();
}

// placeholder (sostituiti in 7e/7f)
function drawTavolo() { clear(host); }
function resetMano() {}
function dealHold() {}
function dealDraw() {}
