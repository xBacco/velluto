import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtraPeriodo, conteggioPerTipo, conteggiGiornalieri,
  streakAttuale, giornoRecord, relazioniTipi, giornoRecordCombinato, pluralizzaIt,
  mediaSettimanale, perGiornoDelMese, nomeMese,
} from '../js/lib/logic.js';

// Set di esperienze d'esempio. "oggi" fittizio = 2026-05-27.
const TIPI = [
  { id: 't1', emoji: '🌶️', label: 'Scopata' },
  { id: 't2', emoji: '🫦', label: 'Pompino' },
];
const EVENTI = [
  { tipo_id: 't1', data: '2026-05-27' },
  { tipo_id: 't1', data: '2026-05-27' },
  { tipo_id: 't2', data: '2026-05-26' },
  { tipo_id: 't1', data: '2026-05-25' },
  { tipo_id: 't2', data: '2026-04-30' }, // mese precedente
];

test('filtraPeriodo: "sempre" ritorna tutto, "mese" solo il mese di oggi', () => {
  assert.equal(filtraPeriodo(EVENTI, 'sempre', '2026-05-27').length, 5);
  const mese = filtraPeriodo(EVENTI, 'mese', '2026-05-27');
  assert.equal(mese.length, 4);
  assert.ok(mese.every(e => e.data.slice(0, 7) === '2026-05'));
});

test('filtraPeriodo: ignora eventi senza data', () => {
  const evs = [{ tipo_id: 't1', data: '2026-05-10' }, { tipo_id: 't1', data: null }];
  assert.equal(filtraPeriodo(evs, 'mese', '2026-05-27').length, 1);
});

test('conteggioPerTipo: una voce per tipo, nell\'ordine dei tipi', () => {
  const out = conteggioPerTipo(filtraPeriodo(EVENTI, 'mese', '2026-05-27'), TIPI);
  assert.deepEqual(out.map(o => [o.tipo.id, o.n]), [['t1', 3], ['t2', 1]]);
});

test('conteggioPerTipo: tipo senza eventi resta a 0', () => {
  const out = conteggioPerTipo([], TIPI);
  assert.deepEqual(out.map(o => o.n), [0, 0]);
});

test('conteggiGiornalieri: mappa iso -> numero eventi, salta date mancanti', () => {
  const m = conteggiGiornalieri(EVENTI);
  assert.equal(m['2026-05-27'], 2);
  assert.equal(m['2026-05-26'], 1);
  assert.equal(m['2026-05-25'], 1);
  assert.equal(m['2026-04-30'], 1);
});

test('streakAttuale: giorni consecutivi fino a oggi con almeno un evento', () => {
  // 27, 26, 25 consecutivi -> 3. Il 24 manca, si ferma.
  assert.equal(streakAttuale(EVENTI, '2026-05-27'), 3);
});

test('streakAttuale: 0 se oggi non ha eventi', () => {
  assert.equal(streakAttuale(EVENTI, '2026-05-28'), 0);
});

test('streakAttuale: gestisce il salto di mese', () => {
  const evs = [{ data: '2026-05-01' }, { data: '2026-04-30' }, { data: '2026-04-29' }];
  assert.equal(streakAttuale(evs, '2026-05-01'), 3);
});

test('giornoRecord: giorno col massimo di eventi su tutto lo storico', () => {
  const r = giornoRecord(EVENTI);
  assert.equal(r.iso, '2026-05-27');
  assert.equal(r.n, 2);
});

test('giornoRecord: filtrato per prefisso mese', () => {
  const r = giornoRecord(EVENTI, '2026-04');
  assert.equal(r.iso, '2026-04-30');
  assert.equal(r.n, 1);
});

test('giornoRecord: nessun evento -> iso null, n 0', () => {
  const r = giornoRecord([]);
  assert.equal(r.iso, null);
  assert.equal(r.n, 0);
});

test('relazioniTipi: Anale risulta figlia di Scopata (match per etichetta)', () => {
  const tipi = [
    { id: 's', emoji: '🌶️', label: 'Scopata' },
    { id: 'a', emoji: '🍑', label: 'anale' }, // case-insensitive
    { id: 'p', emoji: '🫦', label: 'Pompino' },
  ];
  const { figliDi, figlioIds } = relazioniTipi(tipi);
  assert.deepEqual(figliDi['s'].map(t => t.id), ['a']);
  assert.ok(figlioIds.has('a'));
  assert.equal(figlioIds.has('p'), false);
  assert.equal(figliDi['p'], undefined);
});

test('relazioniTipi: se manca il padre o il figlio, nessuna relazione', () => {
  const { figliDi, figlioIds } = relazioniTipi([{ id: 'a', label: 'Anale' }]);
  assert.deepEqual(figliDi, {});
  assert.equal(figlioIds.size, 0);
});

test('giornoRecordCombinato: somma padre+figli, breakdown dei figli nel giorno record', () => {
  const evs = [
    { tipo_id: 's', data: '2026-05-27' }, { tipo_id: 's', data: '2026-05-27' }, { tipo_id: 's', data: '2026-05-27' },
    { tipo_id: 'a', data: '2026-05-27' }, { tipo_id: 'a', data: '2026-05-27' }, // 27: 3 scopate + 2 anali = 5
    { tipo_id: 'a', data: '2026-05-21' }, { tipo_id: 'a', data: '2026-05-21' }, { tipo_id: 'a', data: '2026-05-21' }, // 21: 3 anali
  ];
  const rc = giornoRecordCombinato(evs, 's', ['a']);
  assert.equal(rc.iso, '2026-05-27');
  assert.equal(rc.n, 5);
  assert.deepEqual(rc.perFiglio, { a: 2 });
});

test('giornoRecordCombinato: nessun evento -> iso null, n 0, perFiglio vuoto', () => {
  const rc = giornoRecordCombinato([], 's', ['a']);
  assert.equal(rc.iso, null);
  assert.equal(rc.n, 0);
  assert.deepEqual(rc.perFiglio, {});
});

test('giornoRecord del solo figlio resta separato (record anale a parte)', () => {
  const evs = [
    { tipo_id: 'a', data: '2026-05-27' }, { tipo_id: 'a', data: '2026-05-27' },
    { tipo_id: 'a', data: '2026-05-21' }, { tipo_id: 'a', data: '2026-05-21' }, { tipo_id: 'a', data: '2026-05-21' },
  ];
  const rp = giornoRecord(evs.filter(e => e.tipo_id === 'a'));
  assert.equal(rp.iso, '2026-05-21');
  assert.equal(rp.n, 3);
});

test('pluralizzaIt: plurale italiano basilare', () => {
  assert.equal(pluralizzaIt('anale'), 'anali');
  assert.equal(pluralizzaIt('scopata'), 'scopate');
  assert.equal(pluralizzaIt('pompino'), 'pompini');
  assert.equal(pluralizzaIt('leccata'), 'leccate');
});

test('mediaSettimanale: "mese" usa i giorni trascorsi del mese', () => {
  // 4 eventi nel mese, oggi = giorno 27 -> 27/7 settimane.
  const mese = filtraPeriodo(EVENTI, 'mese', '2026-05-27');
  const m = mediaSettimanale(mese, EVENTI, 'mese', '2026-05-27');
  assert.ok(Math.abs(m - (4 / (27 / 7))) < 1e-9);
});

test('mediaSettimanale: "sempre" usa lo span dal primo evento a oggi', () => {
  // primo evento 2026-04-30, oggi 2026-05-27 -> 27 giorni di span.
  const m = mediaSettimanale(EVENTI, EVENTI, 'sempre', '2026-05-27');
  const settimane = Math.max(27 / 7, 1);
  assert.ok(Math.abs(m - (5 / settimane)) < 1e-9);
});

test('mediaSettimanale: nessun evento -> 0', () => {
  assert.equal(mediaSettimanale([], [], 'sempre', '2026-05-27'), 0);
});

test('perGiornoDelMese: array lungo i giorni del mese, conteggio per giorno', () => {
  const arr = perGiornoDelMese(EVENTI, '2026-05-27');
  assert.equal(arr.length, 31);       // Maggio ha 31 giorni
  assert.equal(arr[26], 2);           // giorno 27 -> indice 26
  assert.equal(arr[25], 1);           // giorno 26
  assert.equal(arr[24], 1);           // giorno 25
  assert.equal(arr[0], 0);            // giorno 1, nessun evento
});

test('perGiornoDelMese: febbraio non bisestile ha 28 giorni', () => {
  assert.equal(perGiornoDelMese([], '2026-02-15').length, 28);
});

test('nomeMese: nome italiano del mese (0-based)', () => {
  assert.equal(nomeMese(4), 'Maggio');
  assert.equal(nomeMese(0), 'Gennaio');
  assert.equal(nomeMese(11), 'Dicembre');
});
