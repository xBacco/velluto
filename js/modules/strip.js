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

export async function renderStrip(context) {
  ctx = context; host = context.panel;
  try { partite = await listStripPartite(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore storico strip: ' + err.message, 'err'); partite = []; }
  drawApertura();
}

// placeholder finché non porto l'apertura (sostituito in 7c)
function drawApertura() { clear(host); }
