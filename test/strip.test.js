import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mazzo52, mescola, valutaMano, miglioreManoDa7, confronta,
} from '../js/lib/logic.js';

// helper: costruisce una carta {r,s}. r 2..14, s 0..3 (0=picche,1=cuori,2=quadri,3=fiori)
const C = (r, s) => ({ r, s });

test('mazzo52 ha 52 carte uniche', () => {
  const d = mazzo52();
  assert.equal(d.length, 52);
  const chiavi = new Set(d.map(c => c.r + '-' + c.s));
  assert.equal(chiavi.size, 52);
});

test('mescola non muta il mazzo originale ed è deterministico con rnd iniettato', () => {
  const d = mazzo52();
  const copia = [...d];
  const rnd = () => 0; // sceglie sempre l'indice 0 in Fisher-Yates
  const m = mescola(d, rnd);
  assert.deepEqual(d, copia, 'originale non mutato');
  assert.equal(m.length, 52);
  assert.deepEqual(mescola(mazzo52(), rnd), m);
});

test('valutaMano riconosce le categorie', () => {
  assert.equal(valutaMano([C(14,0),C(13,0),C(12,0),C(11,0),C(10,0)]).categoria, 8);
  assert.equal(valutaMano([C(13,0),C(13,1),C(13,2),C(13,3),C(2,0)]).categoria, 7);
  assert.equal(valutaMano([C(13,0),C(13,1),C(13,2),C(12,0),C(12,1)]).categoria, 6);
  assert.equal(valutaMano([C(2,0),C(5,0),C(9,0),C(11,0),C(13,0)]).categoria, 5);
  assert.equal(valutaMano([C(14,0),C(5,1),C(4,2),C(3,3),C(2,0)]).categoria, 4);
  assert.equal(valutaMano([C(7,0),C(7,1),C(7,2),C(2,3),C(9,0)]).categoria, 3);
  assert.equal(valutaMano([C(7,0),C(7,1),C(9,2),C(9,3),C(2,0)]).categoria, 2);
  assert.equal(valutaMano([C(7,0),C(7,1),C(3,2),C(9,3),C(2,0)]).categoria, 1);
  assert.equal(valutaMano([C(2,0),C(5,1),C(9,2),C(11,3),C(13,0)]).categoria, 0);
});

test('confronta: scala batte tris; full batte colore; poker batte full', () => {
  const scala = valutaMano([C(6,0),C(5,1),C(4,2),C(3,3),C(2,0)]);
  const tris = valutaMano([C(14,0),C(14,1),C(14,2),C(2,3),C(3,0)]);
  assert.ok(confronta(scala, tris) > 0);
  const full = valutaMano([C(13,0),C(13,1),C(13,2),C(12,0),C(12,1)]);
  const colore = valutaMano([C(2,0),C(5,0),C(9,0),C(11,0),C(14,0)]);
  assert.ok(confronta(full, colore) > 0);
  const poker = valutaMano([C(13,0),C(13,1),C(13,2),C(13,3),C(2,0)]);
  assert.ok(confronta(poker, full) > 0);
});

test('confronta: coppia più alta vince; tie-break sui kicker; parità reale = 0', () => {
  const coppiaK = valutaMano([C(13,0),C(13,1),C(3,2),C(9,3),C(2,0)]);
  const coppia7 = valutaMano([C(7,0),C(7,1),C(3,2),C(9,3),C(2,0)]);
  assert.ok(confronta(coppiaK, coppia7) > 0);
  const a = valutaMano([C(7,0),C(7,1),C(13,2),C(9,3),C(2,0)]);
  const b = valutaMano([C(7,2),C(7,3),C(12,2),C(9,0),C(2,1)]);
  assert.ok(confronta(a, b) > 0);
  const x = valutaMano([C(7,0),C(7,1),C(13,2),C(9,3),C(2,0)]);
  const y = valutaMano([C(7,2),C(7,3),C(13,0),C(9,1),C(2,2)]);
  assert.equal(confronta(x, y), 0);
});

test('miglioreManoDa7 sceglie la migliore mano da 5 su 7 (Hold\'em)', () => {
  const sette = [C(14,1),C(13,1),C(2,0),C(9,1),C(4,1),C(7,1),C(3,3)];
  const best = miglioreManoDa7(sette);
  assert.equal(best.categoria, 5);
  assert.equal(best.carte.length, 5);
  assert.ok(best.carte.every(c => c.s === 1));
});

import {
  GUARDAROBA, capiIniziali, statoInizialePartita, togliCapo, eNudo, risultatoPartita,
} from '../js/lib/logic.js';

test('capiIniziali: 13 capi a testa, simmetrici per conteggio', () => {
  const conta = lista => lista.reduce((n, c) => n + c.qty, 0);
  assert.equal(conta(capiIniziali('lui')), 13);
  assert.equal(conta(capiIniziali('lei')), 13);
});

test('capiIniziali: Lei ha gonna+reggiseno, Lui ha pantaloncini+canottiera; niente autoreggenti', () => {
  const lei = capiIniziali('lei').map(c => c.k);
  const lui = capiIniziali('lui').map(c => c.k);
  assert.ok(lei.includes('gonna') && lei.includes('reggiseno'));
  assert.ok(!lei.includes('pantaloncini') && !lei.includes('canottiera'));
  assert.ok(lui.includes('pantaloncini') && lui.includes('canottiera'));
  assert.ok(!lui.includes('gonna') && !lui.includes('reggiseno'));
  assert.ok(!lei.includes('autoreggenti') && !lui.includes('autoreggenti'));
});

test('capiIniziali: ordine dal più esterno (cappello) al più intimo (intimo)', () => {
  const lui = capiIniziali('lui').map(c => c.k);
  assert.equal(lui[0], 'cappello');
  assert.equal(lui[lui.length - 1], 'canottiera');
});

test('scarpe e calzini hanno qty 2', () => {
  const m = Object.fromEntries(capiIniziali('lui').map(c => [c.k, c.qty]));
  assert.equal(m.scarpe, 2);
  assert.equal(m.calzini, 2);
  assert.equal(m.cappello, 1);
});

test('togliCapo decrementa la quantità e non muta lo stato in ingresso', () => {
  const s0 = statoInizialePartita();
  const s1 = togliCapo(s0, 'lui', 'scarpe');
  assert.equal(s0.lui.scarpe, 2, 'originale intatto');
  assert.equal(s1.lui.scarpe, 1);
  const s2 = togliCapo(s1, 'lui', 'scarpe');
  assert.equal(s2.lui.scarpe, undefined, 'a 0 la chiave sparisce');
});

test('eNudo vero solo quando tutti i capi sono stati tolti', () => {
  let s = statoInizialePartita();
  assert.equal(eNudo(s, 'lei'), false);
  for (const c of capiIniziali('lei')) {
    for (let i = 0; i < c.qty; i++) s = togliCapo(s, 'lei', c.k);
  }
  assert.equal(eNudo(s, 'lei'), true);
  assert.equal(eNudo(s, 'lui'), false);
});

test('risultatoPartita: chi resta nudo perde, l\'altro vince; null se nessuno è nudo', () => {
  let s = statoInizialePartita();
  assert.equal(risultatoPartita(s), null);
  for (const c of capiIniziali('lui')) {
    for (let i = 0; i < c.qty; i++) s = togliCapo(s, 'lui', c.k);
  }
  assert.deepEqual(risultatoPartita(s), { vincitore: 'lei', perdente: 'lui' });
});
