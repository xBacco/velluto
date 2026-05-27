import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meseDi, aggregaPerMese, soloIntimi, totaliLuoghi, luoghiDelMese, cuoriLabel, etichettaData,
} from '../js/lib/logic.js';

const sample = [
  { id: 'a', nome: 'Tropea',  intimo: true,  voto: 5, data_evento: '2025-08-21' },
  { id: 'b', nome: 'Sorrento', intimo: true,  voto: 4, data_evento: '2025-08-12' },
  { id: 'c', nome: 'Uffizi',   intimo: false, voto: 0, data_evento: '2026-01-12' },
  { id: 'd', nome: 'Senza',    intimo: false, voto: 0, data_evento: null },
];

test('meseDi ritorna indice 0-based o null', () => {
  assert.equal(meseDi(sample[0]), 7);   // agosto
  assert.equal(meseDi(sample[2]), 0);   // gennaio
  assert.equal(meseDi(sample[3]), null);
});

test('aggregaPerMese conta vis (tutti) e fat (intimi), salta senza data', () => {
  const { vis, fat } = aggregaPerMese(sample);
  assert.equal(vis[7], 2);  // ago: Tropea + Sorrento
  assert.equal(fat[7], 2);  // entrambi intimi
  assert.equal(vis[0], 1);  // gen: Uffizi
  assert.equal(fat[0], 0);  // non intimo
  assert.equal(vis.reduce((a, b) => a + b, 0), 3); // 'd' senza data esclusa
});

test('soloIntimi filtra il sottoinsieme', () => {
  assert.deepEqual(soloIntimi(sample).map(l => l.id), ['a', 'b']);
});

test('totaliLuoghi conta luoghi, volte (intimi) e mesi attivi', () => {
  const t = totaliLuoghi(sample);
  assert.equal(t.luoghi, 4);
  assert.equal(t.volte, 2);
  assert.equal(t.mesiAttivi, 2); // agosto + gennaio
});

test('luoghiDelMese separa visited e fatto', () => {
  const r = luoghiDelMese(sample, 7);
  assert.deepEqual(r.visited.map(l => l.id), ['a', 'b']);
  assert.deepEqual(r.fatto.map(l => l.id), ['a', 'b']);
  const gen = luoghiDelMese(sample, 0);
  assert.deepEqual(gen.visited.map(l => l.id), ['c']);
  assert.equal(gen.fatto.length, 0);
});

test('cuoriLabel rende cuori pieni/vuoti, clamp 0-5', () => {
  assert.equal(cuoriLabel(3), '❤❤❤♡♡');
  assert.equal(cuoriLabel(0), '♡♡♡♡♡');
  assert.equal(cuoriLabel(9), '❤❤❤❤❤');
});

test('etichettaData: breve capitalizzata e con giorno minuscola', () => {
  assert.equal(etichettaData('2025-08-21'), 'Ago 2025');
  assert.equal(etichettaData('2025-08-21T10:30:00Z', { conGiorno: true }), '21 ago 2025');
  assert.equal(etichettaData(null), '');
});
